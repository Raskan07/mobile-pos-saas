/**
 * app/api/promotions/[promotionId]/route.ts
 *
 *   PUT   /api/promotions/:id   edit promotion (manage permission)
 *   PATCH /api/promotions/:id   { action: pause | resume | archive | restore | publish }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveRequestActor } from "@/lib/auth/requestAuth";
import {
  applyPromotionAction,
  updatePromotion,
  type PromotionAction,
} from "@/lib/services/promotionServerService";
import { promotionErrorResponse } from "@/lib/api/promotionRoute";
import type { PromotionInput } from "@/lib/types/promotion";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ promotionId: string }> };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { promotionId } = await params;
    const body = (await request.json()) as { shopId?: string; promotion: PromotionInput };
    const actor = await resolveRequestActor(request, body.shopId, { requireManage: true });
    const promotion = await updatePromotion(actor, promotionId, body.promotion);
    return NextResponse.json({ promotion });
  } catch (err) {
    return promotionErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { promotionId } = await params;
    const body = (await request.json()) as { shopId?: string; action: PromotionAction };
    const actor = await resolveRequestActor(request, body.shopId, { requireManage: true });
    const promotion = await applyPromotionAction(actor, promotionId, body.action);
    return NextResponse.json({ promotion });
  } catch (err) {
    return promotionErrorResponse(err);
  }
}
