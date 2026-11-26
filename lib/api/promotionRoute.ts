/**
 * lib/api/promotionRoute.ts
 *
 * Shared error → JSON mapping for the /api/promotions/* route handlers.
 */

import { NextResponse } from "next/server";
import { ApiAuthError } from "../auth/requestAuth";
import { PromotionApiError } from "../services/promotionServerService";

export function promotionErrorResponse(err: unknown) {
  if (err instanceof ApiAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof PromotionApiError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  // Tenant-guard violations thrown by assertPromotionBelongsToShop
  if (message.startsWith("Security violation")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  console.error("[promotions-api]", err);
  return NextResponse.json({ error: message }, { status: 500 });
}
