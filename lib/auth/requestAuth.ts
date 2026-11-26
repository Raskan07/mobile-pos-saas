/**
 * lib/auth/requestAuth.ts
 *
 * Server-side authorization for promotion APIs.
 *
 * `shopId` is NEVER taken from the client body/query as an identity claim:
 *   - A shop user's shopId comes from the signed, HttpOnly `skyfox_shop_session` cookie.
 *   - A client-supplied shopId is only honoured when it equals that cookie's shopId,
 *     or when the request carries a valid Super Admin cookie.
 */

import { NextRequest } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  SHOP_SESSION_COOKIE_NAME,
  SUPER_ADMIN_COOKIE_NAME,
  verifyShopServerSessionToken,
  verifySuperAdminSessionToken,
} from "./serverSession";
import { canManagePromotionsForRole } from "../promotions/engine";
import { isFeatureEnabledForShop } from "../services/subscriptionService";
import { normalizeShopId } from "../services/shopAuthService";
import type { Shop } from "../types/shop";

export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export interface PromotionActor {
  kind: "shop" | "super_admin";
  shopId: string;
  shopName: string;
  userId: string;
  username: string;
  displayName: string;
  role: string;
  branchId: string;
  canManage: boolean;
}

export async function resolveRequestActor(
  request: NextRequest,
  requestedShopId?: string | null,
  options: { requireManage?: boolean } = {}
): Promise<PromotionActor> {
  const [shopSession, superAdmin] = await Promise.all([
    verifyShopServerSessionToken(request.cookies.get(SHOP_SESSION_COOKIE_NAME)?.value),
    verifySuperAdminSessionToken(request.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value),
  ]);

  const requested = normalizeShopId(requestedShopId || "");

  // ── Shop user acting on their own shop ──────────────────────────────────────
  if (shopSession && (!requested || requested === normalizeShopId(shopSession.shopId))) {
    const shopId = normalizeShopId(shopSession.shopId);
    const shopSnap = await getDoc(doc(db, "shops", shopId));
    if (!shopSnap.exists()) throw new ApiAuthError("Shop not found.", 404);
    const shop = { id: shopSnap.id, ...(shopSnap.data() as Omit<Shop, "id">) } as Shop;

    if (shop.status === "suspended" || shop.subscription?.status === "suspended") {
      throw new ApiAuthError("This shop's subscription is suspended.", 403);
    }

    const roleId = (shopSession.role || "cashier").trim().toLowerCase();
    let permissions: Record<string, boolean> | null = null;
    try {
      const roleSnap = await getDoc(doc(db, "shops", shopId, "rolePermissions", roleId));
      if (roleSnap.exists()) {
        permissions = (roleSnap.data().permissions as Record<string, boolean>) || null;
      }
    } catch {
      permissions = null;
    }

    let canManage = canManagePromotionsForRole(roleId, permissions);
    if (!isFeatureEnabledForShop(shop, "promotions")) canManage = false;

    if (options.requireManage && !canManage) {
      throw new ApiAuthError(
        "Your role does not have permission to manage promotions for this shop.",
        403
      );
    }

    return {
      kind: "shop",
      shopId,
      shopName: shop.shopName || shopId,
      userId: shopSession.uid,
      username: shopSession.username,
      displayName: shopSession.displayName || shopSession.username,
      role: roleId,
      branchId: shopSession.branchId || "main",
      canManage,
    };
  }

  // ── Super Admin acting on an explicitly requested shop ─────────────────────
  if (superAdmin && requested) {
    const shopSnap = await getDoc(doc(db, "shops", requested));
    if (!shopSnap.exists()) throw new ApiAuthError("Shop not found.", 404);
    const shop = shopSnap.data() as Shop;
    return {
      kind: "super_admin",
      shopId: requested,
      shopName: shop.shopName || requested,
      userId: superAdmin.sub,
      username: superAdmin.username,
      displayName: superAdmin.displayName || superAdmin.username,
      role: "super_admin",
      branchId: "main",
      canManage: true,
    };
  }

  if (shopSession && requested && requested !== normalizeShopId(shopSession.shopId)) {
    throw new ApiAuthError(
      "Cross-shop access denied: you can only access your own shop's promotions.",
      403
    );
  }

  throw new ApiAuthError("Authentication required. Please sign in again.", 401);
}
