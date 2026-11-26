/**
 * app/api/promotions/route.ts
 *
 *   GET  /api/promotions[?shopId=]   list promotions (any authenticated shop user may read; also syncs status)
 *   POST /api/promotions             create promotion (requires manage permission)
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveRequestActor } from "@/lib/auth/requestAuth";
import { createPromotion, listShopPromotions } from "@/lib/services/promotionServerService";
import { promotionErrorResponse } from "@/lib/api/promotionRoute";
import type { PromotionInput } from "@/lib/types/promotion";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const shopId = request.nextUrl.searchParams.get("shopId");
    const actor = await resolveRequestActor(request, shopId);
    const promotions = await listShopPromotions(actor.shopId);
    return NextResponse.json({
      shopId: actor.shopId,
      canManage: actor.canManage,
      serverTime: Date.now(),
      promotions,
    });
  } catch (err) {
    return promotionErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { shopId?: string; promotion: PromotionInput };
    const actor = await resolveRequestActor(request, body.shopId, { requireManage: true });
    const promotion = await createPromotion(actor, body.promotion);
    return NextResponse.json({ promotion }, { status: 201 });
  } catch (err) {
    return promotionErrorResponse(err);
  }
}
