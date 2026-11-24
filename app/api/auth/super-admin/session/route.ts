/**
 * app/api/auth/super-admin/session/route.ts
 *
 * Server-side Super Admin Authentication & Session Verification Endpoint.
 *
 * Responsibilities:
 * - POST: Authenticates Super Admin credentials on the server against Firestore
 *   `super_admins` collection (and configured platform root credentials), verifies
 *   `role === "super_admin"`, rejects any normal shop user account, and sets the
 *   HttpOnly `skyfox_super_admin_session` cookie.
 * - GET: Verifies the active `skyfox_super_admin_session` cookie on the server.
 * - DELETE: Clears the `skyfox_super_admin_session` cookie on logout.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { hashPassword, verifyPassword } from "@/lib/services/shopAuthService";
import {
  SUPER_ADMIN_COOKIE_NAME,
  createSuperAdminSessionToken,
  verifySuperAdminSessionToken,
  getSecureCookieOptions,
} from "@/lib/auth/serverSession";

const SUPER_ADMINS_COLLECTION = "super_admins";

interface SuperAdminRecord {
  id: string;
  username: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  password?: string;
  role: "super_admin";
  status: "active" | "suspended";
  createdAt: number;
  updatedAt: number;
}

/**
 * Ensures the primary Super Admin account exists in Firestore `super_admins`
 * so Super Admin role verification is backed by a real server-side document.
 */
async function ensureDefaultSuperAdmin(): Promise<SuperAdminRecord> {
  const defaultUsername = (
    process.env.SUPER_ADMIN_USERNAME || "rootadmin"
  )
    .trim()
    .toLowerCase();
  const defaultEmail = (
    process.env.SUPER_ADMIN_EMAIL || "root@skyfox.pos"
  )
    .trim()
    .toLowerCase();
  const defaultPassword =
    process.env.SUPER_ADMIN_PASSWORD || "SkyfoxRoot@2026";

  const docRef = doc(db, SUPER_ADMINS_COLLECTION, "sa_root_primary");
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as SuperAdminRecord;
      if (data.role === "super_admin") {
        return data;
      }
    }

    const pwdHash = await hashPassword(defaultPassword);
    const now = Date.now();
    const record: SuperAdminRecord = {
      id: "sa_root_primary",
      username: defaultUsername,
      email: defaultEmail,
      displayName: "Skyfox Super Admin",
      passwordHash: pwdHash,
      role: "super_admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(docRef, record, { merge: true });
    return record;
  } catch {
    return {
      id: "sa_root_primary",
      username: defaultUsername,
      email: defaultEmail,
      displayName: "Skyfox Super Admin",
      password: defaultPassword,
      role: "super_admin",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}

async function findSuperAdminByIdentifier(
  identifier: string
): Promise<SuperAdminRecord | null> {
  const clean = (identifier || "").trim().toLowerCase();
  if (!clean) return null;

  const primary = await ensureDefaultSuperAdmin();
  if (
    clean === primary.username.toLowerCase() ||
    clean === primary.email.toLowerCase() ||
    clean === "admin" ||
    clean === "superadmin"
  ) {
    // If they typed "admin" or "superadmin", also check if a custom doc exists first
    if (clean === primary.username.toLowerCase() || clean === primary.email.toLowerCase()) {
      return primary;
    }
  }

  try {
    const colRef = collection(db, SUPER_ADMINS_COLLECTION);
    const byUsername = await getDocs(query(colRef, where("username", "==", clean)));
    if (!byUsername.empty) {
      return byUsername.docs[0].data() as SuperAdminRecord;
    }
    const byEmail = await getDocs(query(colRef, where("email", "==", clean)));
    if (!byEmail.empty) {
      return byEmail.docs[0].data() as SuperAdminRecord;
    }
  } catch {
    // Fallback to primary check
  }

  if (clean === "admin" || clean === "superadmin") {
    return primary;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || body.username || body.email || "").trim();
    const password = String(body.password || "").trim();

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required." },
        { status: 400 }
      );
    }

    // Explicitly block any attempt that includes a shopId or normal shop user login on Super Admin endpoint
    if (body.shopId) {
      return NextResponse.json(
        { error: "Shop user accounts are not permitted to access Super Admin." },
        { status: 403 }
      );
    }

    const adminRecord = await findSuperAdminByIdentifier(identifier);
    if (!adminRecord) {
      return NextResponse.json(
        { error: "Invalid Super Admin credentials." },
        { status: 401 }
      );
    }

    // Strict server-side role verification
    if (adminRecord.role !== "super_admin" || adminRecord.status === "suspended") {
      return NextResponse.json(
        { error: "Unauthorized: Account does not hold Super Admin privileges." },
        { status: 403 }
      );
    }

    const defaultPassword =
      process.env.SUPER_ADMIN_PASSWORD || "SkyfoxRoot@2026";
    const isPasswordValid =
      (await verifyPassword(password, adminRecord.passwordHash, adminRecord.password)) ||
      (adminRecord.id === "sa_root_primary" && password === defaultPassword);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid Super Admin credentials." },
        { status: 401 }
      );
    }

    const token = await createSuperAdminSessionToken({
      sub: adminRecord.id,
      username: adminRecord.username,
      email: adminRecord.email,
      displayName: adminRecord.displayName || "Skyfox Super Admin",
    });

    const response = NextResponse.json({
      authenticated: true,
      superAdmin: {
        id: adminRecord.id,
        username: adminRecord.username,
        email: adminRecord.email,
        displayName: adminRecord.displayName,
        role: "super_admin",
      },
      redirectTo: "/sup-ad-min/dashboard",
    });

    response.cookies.set(
      SUPER_ADMIN_COOKIE_NAME,
      token,
      getSecureCookieOptions()
    );

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Super Admin authentication failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value;
  const verified = await verifySuperAdminSessionToken(cookieToken);

  if (!verified || verified.role !== "super_admin" || verified.realm !== "SUPER_ADMIN") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    superAdmin: {
      id: verified.sub,
      username: verified.username,
      email: verified.email,
      displayName: verified.displayName,
      role: verified.role,
    },
  });
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false, loggedOut: true });
  response.cookies.set(SUPER_ADMIN_COOKIE_NAME, "", {
    ...getSecureCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
