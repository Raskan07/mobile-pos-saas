/**
 * app/api/auth/shop/session/route.ts
 *
 * Server-side Shop User Authentication & HttpOnly Cookie Endpoint.
 *
 * Responsibilities:
 * - POST: Verifies `shopId`, `username`, and `password` on the server using the
 *   existing `authenticateShopUser` multi-tenant service (`shops/{shopId}/users`),
 *   and issues an HttpOnly, Secure (in prod), SameSite=Lax `skyfox_shop_session` cookie.
 * - GET: Verifies the active `skyfox_shop_session` cookie on the server.
 * - DELETE: Clears the `skyfox_shop_session` cookie on logout.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateShopUser, normalizeShopId } from "@/lib/services/shopAuthService";
import {
  SHOP_SESSION_COOKIE_NAME,
  createShopServerSessionToken,
  verifyShopServerSessionToken,
  getSecureCookieOptions,
} from "@/lib/auth/serverSession";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const shopId = normalizeShopId(String(body.shopId || ""));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const selectedBranchId = String(body.selectedBranchId || "main").trim();
    const selectedBranchName = String(body.selectedBranchName || "Main Branch").trim();

    if (!shopId || !username || !password) {
      return NextResponse.json(
        { error: "Shop ID, username, and password are required." },
        { status: 400 }
      );
    }

    // Verify shop, user credentials, suspension state, and branch assignment on the server
    const { user, shop, session } = await authenticateShopUser(
      shopId,
      username,
      password,
      selectedBranchId,
      selectedBranchName
    );

    const token = await createShopServerSessionToken({
      uid: user.uid,
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role || "cashier",
      shopId: shop.shopId,
      shopName: shop.shopName,
      branchId: selectedBranchId,
      branchName: selectedBranchName,
    });

    const response = NextResponse.json({
      authenticated: true,
      user,
      shop,
      session,
    });

    response.cookies.set(
      SHOP_SESSION_COOKIE_NAME,
      token,
      getSecureCookieOptions()
    );

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Invalid shop credentials." },
      { status: 401 }
    );
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SHOP_SESSION_COOKIE_NAME)?.value;
  const verified = await verifyShopServerSessionToken(token);

  if (!verified || verified.realm !== "SHOP_USER") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    session: verified,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false, loggedOut: true });
  response.cookies.set(SHOP_SESSION_COOKIE_NAME, "", {
    ...getSecureCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
