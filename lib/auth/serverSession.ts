/**
 * lib/auth/serverSession.ts
 *
 * Server-side cryptographic session token signing & verification for Skyfox POS.
 *
 * Security & Separation Guarantees:
 * 1. Complete Realm Isolation:
 *    - Super Admin sessions (`skyfox_super_admin_session`) and Shop User sessions
 *      (`skyfox_shop_session`) use separate cookie names, separate cryptographic
 *      HMAC-SHA256 signing keys, and distinct `realm` claims (`"SUPER_ADMIN"` vs `"SHOP_USER"`).
 *    - A Shop User cookie can NEVER authenticate a Super Admin route, and a Super Admin
 *      cookie can NEVER automatically authenticate a Shop User route.
 * 2. Cookie Security Flags:
 *    - `httpOnly: true`
 *    - `secure: process.env.NODE_ENV === "production"`
 *    - `sameSite: "lax"`
 *    - `path: "/"`
 *    - Explicit `maxAge` & server-verified `exp` timestamp.
 * 3. Runtime Compatibility:
 *    - Uses the standard Web Crypto API (`crypto.subtle`) so verification runs natively
 *      on the server in both Next.js 16 `proxy.ts` and App Router API Route Handlers.
 */

export const SUPER_ADMIN_COOKIE_NAME = "skyfox_super_admin_session";
export const SHOP_SESSION_COOKIE_NAME = "skyfox_shop_session";

export const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 hours
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

export interface SuperAdminSessionPayload {
  sub: string;
  username: string;
  email: string;
  displayName: string;
  role: "super_admin";
  realm: "SUPER_ADMIN";
  iat: number;
  exp: number;
  jti: string;
}

export interface ShopServerSessionPayload {
  uid: string;
  username: string;
  displayName: string;
  role: string;
  shopId: string;
  shopName: string;
  branchId: string;
  branchName: string;
  realm: "SHOP_USER";
  iat: number;
  exp: number;
  jti: string;
}

const BASE_SECRET =
  process.env.SKYFOX_SESSION_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "skyfox_pos_enterprise_hmac_secret_2026_v1_9x8f2k";

const SUPER_ADMIN_SIGNING_SECRET = `${BASE_SECRET}::REALM_SUPER_ADMIN_ONLY`;
const SHOP_USER_SIGNING_SECRET = `${BASE_SECRET}::REALM_SHOP_TENANT_ONLY`;

function base64UrlEncodeString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToString(b64url: string): string {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payloadJson: string, secret: string): Promise<string> {
  const encodedPayload = base64UrlEncodeString(payloadJson);
  const key = await getHmacKey(secret);
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  const encodedSig = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
  return `${encodedPayload}.${encodedSig}`;
}

async function verifySignedToken<T>(
  token: string | undefined | null,
  secret: string
): Promise<T | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  try {
    const key = await getHmacKey(secret);
    const expectedSigBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(encodedPayload)
    );
    const expectedSig = base64UrlEncodeBytes(new Uint8Array(expectedSigBuffer));

    // Constant-time string comparison
    if (expectedSig.length !== encodedSig.length) return null;
    let diff = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      diff |= expectedSig.charCodeAt(i) ^ encodedSig.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const jsonStr = base64UrlDecodeToString(encodedPayload);
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

/**
 * Issues a signed Super Admin session token.
 */
export async function createSuperAdminSessionToken(params: {
  sub: string;
  username: string;
  email: string;
  displayName: string;
}): Promise<string> {
  const now = Date.now();
  const payload: SuperAdminSessionPayload = {
    sub: params.sub,
    username: params.username,
    email: params.email,
    displayName: params.displayName,
    role: "super_admin",
    realm: "SUPER_ADMIN",
    iat: now,
    exp: now + SESSION_DURATION_MS,
    jti: `sa_${now}_${Math.random().toString(36).substring(2, 10)}`,
  };
  return signPayload(JSON.stringify(payload), SUPER_ADMIN_SIGNING_SECRET);
}

/**
 * Verifies a Super Admin session token on the server.
 * Guarantees `realm === "SUPER_ADMIN"` and `role === "super_admin"`.
 */
export async function verifySuperAdminSessionToken(
  token: string | undefined | null
): Promise<SuperAdminSessionPayload | null> {
  const payload = await verifySignedToken<SuperAdminSessionPayload>(
    token,
    SUPER_ADMIN_SIGNING_SECRET
  );
  if (!payload) return null;
  if (payload.realm !== "SUPER_ADMIN" || payload.role !== "super_admin") {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp <= Date.now()) {
    return null;
  }
  return payload;
}

/**
 * Issues a signed Shop User session token strictly scoped to a single `shopId`.
 */
export async function createShopServerSessionToken(params: {
  uid: string;
  username: string;
  displayName: string;
  role: string;
  shopId: string;
  shopName: string;
  branchId: string;
  branchName: string;
}): Promise<string> {
  const now = Date.now();
  const payload: ShopServerSessionPayload = {
    uid: params.uid,
    username: params.username,
    displayName: params.displayName,
    role: params.role,
    shopId: params.shopId.trim().toUpperCase(),
    shopName: params.shopName,
    branchId: params.branchId || "main",
    branchName: params.branchName || "Main Branch",
    realm: "SHOP_USER",
    iat: now,
    exp: now + SESSION_DURATION_MS,
    jti: `shp_${now}_${Math.random().toString(36).substring(2, 10)}`,
  };
  return signPayload(JSON.stringify(payload), SHOP_USER_SIGNING_SECRET);
}

/**
 * Verifies a Shop User session token on the server.
 * Guarantees `realm === "SHOP_USER"` and a valid `shopId`.
 */
export async function verifyShopServerSessionToken(
  token: string | undefined | null
): Promise<ShopServerSessionPayload | null> {
  const payload = await verifySignedToken<ShopServerSessionPayload>(
    token,
    SHOP_USER_SIGNING_SECRET
  );
  if (!payload) return null;
  if (payload.realm !== "SHOP_USER" || !payload.shopId || !payload.uid) {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp <= Date.now()) {
    return null;
  }
  return payload;
}

/**
 * Standard secure HttpOnly cookie options for server responses.
 */
export function getSecureCookieOptions(maxAgeSeconds = SESSION_DURATION_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
