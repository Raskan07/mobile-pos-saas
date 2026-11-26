/**
 * app/api/promotions/validate-checkout/route.ts
 *
 *   POST /api/promotions/validate-checkout
 *   body: { lines: [{ lineKey, productId, variantId?, quantity, hasManualPrice? }] }
 *
 * Recomputes promotional pricing on the SERVER using server time (Asia/Colombo schedule rules),
 * server-read product prices and the shop's live promotions. Any authenticated shop user
 * (including cashiers) may call it; the shopId always comes from the signed session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveRequestActor } from "@/lib/auth/requestAuth";
import { validateCheckoutLines, type CheckoutLineInput } from "@/lib/services/promotionServerService";
import { promotionErrorResponse } from "@/lib/api/promotionRoute";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { lines: CheckoutLineInput[] };
    // shopId is intentionally NOT read from the body.
    const actor = await resolveRequestActor(request, null);
    const result = await validateCheckoutLines(actor, body.lines);
    return NextResponse.json(result);
  } catch (err) {
    return promotionErrorResponse(err);
  }
}
