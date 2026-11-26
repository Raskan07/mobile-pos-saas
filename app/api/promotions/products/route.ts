/**
 * app/api/promotions/products/route.ts
 *
 *   GET /api/promotions/products?q=&categoryId=&brandKey=&shopId=
 *
 * Returns ONLY products belonging to the authorised shop (requires manage permission).
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveRequestActor } from "@/lib/auth/requestAuth";
import { searchShopProducts } from "@/lib/services/promotionServerService";
import { promotionErrorResponse } from "@/lib/api/promotionRoute";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const actor = await resolveRequestActor(request, sp.get("shopId"), { requireManage: true });
    const result = await searchShopProducts(actor.shopId, {
      q: sp.get("q") || undefined,
      categoryId: sp.get("categoryId") || undefined,
      brandKey: sp.get("brandKey") || undefined,
      limit: Number(sp.get("limit")) || undefined,
    });
    return NextResponse.json({ shopId: actor.shopId, ...result });
  } catch (err) {
    return promotionErrorResponse(err);
  }
}
