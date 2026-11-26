/**
 * proxy.ts
 *
 * Next.js 16 Server Proxy (formerly middleware.ts) for Skyfox POS Routing,
 * Authentication & Strict Realm Separation.
 *
 * Rules Enforced:
 * 1. Public Routes:
 *    - `/` (Minimal public landing page with Skyfox company logo only)
 *    - `/sup-ad-min` (Super Admin login page)
 *    - `/v1-shop` & `/shop` (Shop login page)
 *    - `/r/*` (Public customer digital e-receipt links)
 *    - `/unauthorized`
 *    - `/api/auth/*` and public static assets
 * 2. Strict Realm Separation:
 *    - Super Admin sessions (`skyfox_super_admin_session`) and Shop sessions
 *      (`skyfox_shop_session`) use separate cryptographic keys and realms.
 *    - A Shop user can NEVER access `/sup-ad-min/*` or `/sa-9x8f2k/*` (redirected to `/unauthorized`).
 *    - A Super Admin cookie NEVER automatically authenticates a Shop user on `/v1-shop/*` or `/shop/*`.
 * 3. Super Admin Route Rules:
 *    - Visiting `/sup-ad-min` with a valid Super Admin session redirects to `/sup-ad-min/dashboard`.
 *    - Visiting any protected `/sup-ad-min/*` or `/sa-9x8f2k/*` route verifies the Super Admin
 *      session and role on the server; if unauthenticated, redirects to `/sup-ad-min`; if
 *      authenticated as a non-Super-Admin (e.g. shop user), redirects to `/unauthorized`.
 * 4. Shop Route Rules:
 *    - Visiting any protected `/v1-shop/*` or `/shop/*` route verifies the Shop session cookie
 *      on the server; if unauthenticated, redirects to `/v1-shop` (or `/shop`).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SUPER_ADMIN_COOKIE_NAME,
  SHOP_SESSION_COOKIE_NAME,
  verifySuperAdminSessionToken,
  verifyShopServerSessionToken,
} from "@/lib/auth/serverSession";

const EXPLICIT_SUP_ADMIN_SUBPATHS = new Set([
  "dashboard",
  "shops",
  "shops/list",
  "users",
  "staff",
  "settings",
  "subscriptions",
  "promotions",
]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Allow static assets, Next.js internals, and auth API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2|ttf|map)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Public routes always accessible without authentication
  if (
    pathname === "/" ||
    pathname === "/unauthorized" ||
    pathname.startsWith("/r/")
  ) {
    return NextResponse.next();
  }

  // Verify both cookies independently on the server
  const rawSuperAdminCookie = request.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value;
  const rawShopCookie = request.cookies.get(SHOP_SESSION_COOKIE_NAME)?.value;

  const [superAdminSession, shopSession] = await Promise.all([
    verifySuperAdminSessionToken(rawSuperAdminCookie),
    verifyShopServerSessionToken(rawShopCookie),
  ]);

  const hasValidSuperAdmin =
    Boolean(superAdminSession) &&
    superAdminSession?.realm === "SUPER_ADMIN" &&
    superAdminSession?.role === "super_admin";

  const hasValidShopUser =
    Boolean(shopSession) &&
    shopSession?.realm === "SHOP_USER" &&
    Boolean(shopSession?.shopId);

  // ==========================================================================
  // 3. SUPER ADMIN LOGIN & PROTECTED ROUTES (/sup-ad-min, /sa-9x8f2k, /admin-sup)
  // ==========================================================================

  if (pathname === "/sup-ad-min") {
    if (hasValidSuperAdmin) {
      return NextResponse.redirect(new URL("/sup-ad-min/dashboard", request.url));
    }
    return NextResponse.next();
  }

  const isSuperAdminProtectedRoute =
    pathname.startsWith("/sup-ad-min/") ||
    pathname === "/sa-9x8f2k" ||
    pathname.startsWith("/sa-9x8f2k/") ||
    pathname === "/admin-sup" ||
    pathname.startsWith("/admin-sup/");

  if (isSuperAdminProtectedRoute) {
    if (!hasValidSuperAdmin) {
      // If an authenticated normal shop user attempts to access Super Admin routes -> /unauthorized
      if (hasValidShopUser) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
      // Otherwise unauthenticated -> redirect to /sup-ad-min login
      const loginUrl = new URL("/sup-ad-min", request.url);
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }

    // If visiting a /sup-ad-min/<subpath> that maps to an existing /sa-9x8f2k/<subpath> page
    if (pathname.startsWith("/sup-ad-min/")) {
      const subPath = pathname.slice("/sup-ad-min/".length).replace(/\/+$/, "");
      if (subPath && !EXPLICIT_SUP_ADMIN_SUBPATHS.has(subPath)) {
        const mappedPath =
          subPath === "users" ? "/sa-9x8f2k/staff" : `/sa-9x8f2k/${subPath}`;
        return NextResponse.rewrite(new URL(`${mappedPath}${search}`, request.url));
      }
    }

    return NextResponse.next();
  }

  // ==========================================================================
  // 4. SHOP LOGIN & PROTECTED ROUTES (/v1-shop and /shop)
  // ==========================================================================

  const isV1ShopLogin = pathname === "/v1-shop" || pathname === "/v1-shop/login";
  const isLegacyShopLogin = pathname === "/shop" || pathname === "/shop/login";

  if (isV1ShopLogin || isLegacyShopLogin) {
    // Note: Super Admin session does NOT authenticate a shop user
    const wantsSwitch = request.nextUrl.searchParams.has("shopId");
    if (hasValidShopUser && !wantsSwitch) {
      const targetDashboard = isV1ShopLogin ? "/v1-shop/dashboard" : "/shop/dashboard";
      return NextResponse.redirect(new URL(targetDashboard, request.url));
    }
    return NextResponse.next();
  }

  const isV1ShopProtected = pathname.startsWith("/v1-shop/");
  const isLegacyShopProtected = pathname.startsWith("/shop/");

  if (isV1ShopProtected || isLegacyShopProtected) {
    if (!hasValidShopUser) {
      const targetLogin = isV1ShopProtected ? "/v1-shop" : "/v1-shop";
      return NextResponse.redirect(new URL(targetLogin, request.url));
    }

    // Map /v1-shop/* subroutes to existing /shop/* implementation without breaking existing features
    if (isV1ShopProtected) {
      const subPath = pathname.slice("/v1-shop/".length).replace(/\/+$/, "");
      if (subPath === "pos") {
        return NextResponse.rewrite(new URL(`/shop/dashboard${search}`, request.url));
      }
      if (subPath === "repairs") {
        return NextResponse.rewrite(new URL(`/shop/repair${search}`, request.url));
      }
      return NextResponse.rewrite(new URL(`/shop/${subPath}${search}`, request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets/).*)",
  ],
};
