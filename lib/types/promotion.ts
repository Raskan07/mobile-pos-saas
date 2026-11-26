/**
 * lib/types/promotion.ts
 *
 * Types for the Promotion & Discount Management module.
 *
 * Firestore layout (strict shop isolation, every document carries `shopId`):
 *   shops/{shopId}/promotions/{promotionId}                  <- promotion definitions
 *   shops/{shopId}/promotion_stats/{promotionId}             <- atomic analytics counters
 *   shops/{shopId}/promotion_usages/{saleId}__{promotionId}  <- one idempotent record per sale+promotion
 */

export type PromotionStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "expired"
  | "archived";

export type PromotionType =
  | "general"
  | "seasonal"
  | "clearance"
  | "flash_sale"
  | "category_offer"
  | "brand_offer";

export type PromotionDiscountType = "percentage" | "fixed_amount" | "special_price";

export const PROMOTION_TIMEZONE = "Asia/Colombo";

export interface PromotionVariantRef {
  productId: string;
  variantId: string;
  /** Display snapshot, e.g. "Black / 128GB" */
  label?: string;
}

export interface PromotionProductRef {
  productId: string;
  name: string;
  sku?: string;
}

export interface PromotionCategoryRef {
  categoryId: string;
  name: string;
}

export interface PromotionBrandRef {
  /** Stable match key: brandId when available, otherwise lowercase trimmed brand name. */
  brandKey: string;
  name: string;
}

export interface PromotionTargets {
  productIds: string[];
  variants: PromotionVariantRef[];
  categoryIds: string[];
  brandKeys: string[];
}

export interface PromotionTargetLabels {
  products: PromotionProductRef[];
  categories: PromotionCategoryRef[];
  brands: PromotionBrandRef[];
}

export interface Promotion {
  id: string;
  shopId: string;
  name: string;
  description: string;
  promotionType: PromotionType;
  discountType: PromotionDiscountType;
  /** percentage: 0-100 | fixed_amount: LKR off per unit | special_price: LKR selling price per unit */
  discountValue: number;
  /** Higher number wins when two promotions give an equal discount. */
  priority: number;
  /** Admin intent. `scheduled`/`active`/`expired` are re-derived from time on every evaluation. */
  status: PromotionStatus;

  // Schedule — interpreted in Asia/Colombo
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm (optional, default 00:00)
  endDate: string; // YYYY-MM-DD
  endTime?: string; // HH:mm (optional, default 23:59:59.999)
  /** Pre-computed UTC epoch ms for startDate/startTime in Asia/Colombo. */
  startAt: number;
  /** Pre-computed UTC epoch ms for endDate/endTime in Asia/Colombo. */
  endAt: number;
  timezone: typeof PROMOTION_TIMEZONE;

  targets: PromotionTargets;
  targetLabels: PromotionTargetLabels;

  /** Incremented on every edit; copied into sale snapshots. */
  version: number;
  createdBy: { userId: string; username: string; role: string; displayName?: string };
  updatedBy?: { userId: string; username: string; role: string; displayName?: string };
  createdAt: number;
  updatedAt: number;
  pausedAt?: number;
  archivedAt?: number;
}

/** Fields an administrator edits. */
export interface PromotionInput {
  name: string;
  description?: string;
  promotionType: PromotionType;
  discountType: PromotionDiscountType;
  discountValue: number;
  priority?: number;
  /** Requested admin intent: "draft" saves unpublished, anything else publishes. */
  status?: PromotionStatus;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  targets: PromotionTargets;
  targetLabels?: PromotionTargetLabels;
}

export type PromotionValidationErrors = Partial<
  Record<
    | "name"
    | "discountValue"
    | "startDate"
    | "startTime"
    | "endDate"
    | "endTime"
    | "dateRange"
    | "targets"
    | "specialPriceTargets"
    | "priority",
    string
  >
>;

/** A cart line as seen by the promotion engine. */
export interface PromotableLine {
  /** Unique key for the line within the cart (productId + variantId). */
  lineKey: string;
  productId: string;
  variantId?: string;
  categoryId?: string;
  brandId?: string;
  brandName?: string;
  /** Original (catalog) unit price in LKR. */
  unitPrice: number;
  quantity: number;
  /** When true the cashier typed a manual price: promotions are not applied. */
  hasManualPrice?: boolean;
}

/** Snapshot of the promotion applied to a line; embedded in sale items. */
export interface AppliedPromotion {
  promotionId: string;
  promotionName: string;
  promotionVersion: number;
  discountType: PromotionDiscountType;
  discountValue: number;
  priority: number;
  originalUnitPrice: number;
  promoUnitPrice: number;
  discountPerUnit: number;
  quantity: number;
  /** discountPerUnit * quantity (exact, cent-based). */
  discountTotal: number;
  /** e.g. "20%" or "LKR 500" — what the cashier sees on the badge. */
  discountLabel: string;
  /** How many other valid promotions were also eligible and lost the conflict. */
  competingPromotions: number;
}

export interface SalePromotionSummaryEntry {
  promotionId: string;
  promotionName: string;
  promotionVersion: number;
  discountType: PromotionDiscountType;
  discountValue: number;
  unitsSold: number;
  discountTotal: number;
  /** Net revenue of the lines sold under this promotion (after promotion). */
  revenue: number;
}

export interface SalePromotionSummary {
  promotions: SalePromotionSummaryEntry[];
  totalPromotionDiscount: number;
  /** "server" = server validated at checkout. */
  validation: "server" | "client_only" | "none";
  validatedAt: number;
}

export interface PromotionStats {
  promotionId: string;
  shopId: string;
  promotionName?: string;
  usageCount: number; // number of sales using the promotion
  unitsSold: number;
  totalDiscountAmount: number;
  revenueGenerated: number;
  lastUsedAt?: number;
  updatedAt?: number;
}

export interface PromotionUsageRecord {
  id: string;
  shopId: string;
  promotionId: string;
  promotionName: string;
  promotionVersion: number;
  saleId: string;
  invoiceNumber: string;
  unitsSold: number;
  discountTotal: number;
  revenue: number;
  createdAt: number;
}
