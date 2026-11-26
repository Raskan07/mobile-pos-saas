/**
 * lib/promotions/engine.ts
 *
 * Centralized, dependency-free promotion engine. The SAME functions run:
 *   - in the browser (POS cart display, admin editor preview),
 *   - on the server (checkout validation API, status sync).
 *
 * Rules implemented here (and nowhere else):
 *   - Money is calculated in integer cents (no float drift).
 *   - Schedules are interpreted in Asia/Colombo (UTC+05:30, no DST).
 *   - Effective status is DERIVED from the clock, never trusted from storage alone.
 *   - Promotions never stack: for each line only the single best promotion applies
 *     (highest discount per unit; tie -> higher priority; tie -> oldest; tie -> id).
 *   - A manually priced cart line is never promoted.
 *
 * Only `import type` is used so this file can be unit-tested directly by Node.
 */

import type {
  AppliedPromotion,
  Promotion,
  PromotionDiscountType,
  PromotionInput,
  PromotionStatus,
  PromotionTargets,
  PromotionValidationErrors,
  PromotableLine,
} from "../types/promotion";

export const COLOMBO_OFFSET_MINUTES = 330; // UTC+05:30, Sri Lanka observes no DST
const MS_PER_MINUTE = 60_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ─────────────────────────────────────────────────────────────────────────────
// Money helpers (integer cents)
// ─────────────────────────────────────────────────────────────────────────────

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

/** LKR display convention used across the POS: "LKR 1,500" / "LKR 1,500.50". */
export function formatLKR(amount: number, currency = "LKR"): string {
  const value = roundMoney(amount);
  const hasFraction = Math.abs(value % 1) > 0;
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Asia/Colombo date handling
// ─────────────────────────────────────────────────────────────────────────────

export function isValidDateString(value: string | undefined): boolean {
  if (!value || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimeString(value: string | undefined): boolean {
  return !value || TIME_RE.test(value);
}

/**
 * Converts an Asia/Colombo wall-clock date (+ optional time) to UTC epoch ms.
 * When `time` is omitted: start -> 00:00:00.000, end -> 23:59:59.999.
 */
export function colomboToEpoch(
  date: string,
  time: string | undefined,
  boundary: "start" | "end"
): number {
  const [y, m, d] = date.split("-").map(Number);
  let hh = boundary === "start" ? 0 : 23;
  let mm = boundary === "start" ? 0 : 59;
  let ss = boundary === "start" ? 0 : 59;
  let ms = boundary === "start" ? 0 : 999;
  if (time && TIME_RE.test(time)) {
    const [h, mi] = time.split(":").map(Number);
    hh = h;
    mm = mi;
    // An explicit end time "18:00" means the promotion ends at 18:00:00.000 sharp.
    ss = 0;
    ms = 0;
  }
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, ss, ms);
  return utcMs - COLOMBO_OFFSET_MINUTES * MS_PER_MINUTE;
}

/** Current date (YYYY-MM-DD) and time (HH:mm) in Asia/Colombo for a given instant. */
export function epochToColomboParts(epochMs: number): { date: string; time: string } {
  const shifted = new Date(epochMs + COLOMBO_OFFSET_MINUTES * MS_PER_MINUTE);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mi = String(shifted.getUTCMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mi}` };
}

export function formatColomboDateTime(epochMs: number): string {
  const { date, time } = epochToColomboParts(epochMs);
  return `${date} ${time}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation (shared by the editor form and the API)
// ─────────────────────────────────────────────────────────────────────────────

export function hasAnyTarget(targets: PromotionTargets | undefined): boolean {
  if (!targets) return false;
  return (
    (targets.productIds?.length || 0) > 0 ||
    (targets.variants?.length || 0) > 0 ||
    (targets.categoryIds?.length || 0) > 0 ||
    (targets.brandKeys?.length || 0) > 0
  );
}

export function validatePromotionInput(
  input: Partial<PromotionInput>
): { valid: boolean; errors: PromotionValidationErrors } {
  const errors: PromotionValidationErrors = {};

  const name = (input.name || "").trim();
  if (!name) errors.name = "Promotion name is required.";
  else if (name.length > 120) errors.name = "Promotion name must be 120 characters or fewer.";

  const value = Number(input.discountValue);
  if (!Number.isFinite(value) || value <= 0) {
    errors.discountValue = "Enter a discount value greater than 0.";
  } else if (input.discountType === "percentage" && value > 100) {
    errors.discountValue = "A percentage discount cannot exceed 100%.";
  } else if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    errors.discountValue = "Use at most 2 decimal places.";
  }

  if (!isValidDateString(input.startDate)) errors.startDate = "Enter a valid start date.";
  if (!isValidDateString(input.endDate)) errors.endDate = "Enter a valid end date.";
  if (!isValidTimeString(input.startTime)) errors.startTime = "Use HH:mm (24-hour).";
  if (!isValidTimeString(input.endTime)) errors.endTime = "Use HH:mm (24-hour).";

  if (!errors.startDate && !errors.endDate && !errors.startTime && !errors.endTime) {
    const startAt = colomboToEpoch(input.startDate!, input.startTime, "start");
    const endAt = colomboToEpoch(input.endDate!, input.endTime, "end");
    if (endAt <= startAt) {
      errors.dateRange = "The end must be after the start (Asia/Colombo time).";
    }
  }

  if (!hasAnyTarget(input.targets)) {
    errors.targets = "Select at least one product, variant, category or brand.";
  } else if (
    input.discountType === "special_price" &&
    ((input.targets?.categoryIds?.length || 0) > 0 || (input.targets?.brandKeys?.length || 0) > 0)
  ) {
    errors.specialPriceTargets =
      "A special selling price applies to specific products or variants only, not whole categories or brands.";
  }

  const priority = input.priority === undefined ? 0 : Number(input.priority);
  if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
    errors.priority = "Priority must be between 0 and 1000.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Computes startAt/endAt from the input's Asia/Colombo wall-clock fields. */
export function computePromotionWindow(
  input: Pick<PromotionInput, "startDate" | "startTime" | "endDate" | "endTime">
): { startAt: number; endAt: number } {
  return {
    startAt: colomboToEpoch(input.startDate, input.startTime, "start"),
    endAt: colomboToEpoch(input.endDate, input.endTime, "end"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives the real status from admin intent + clock.
 * draft / paused / archived are manual intents and are never overridden by time.
 * scheduled / active / expired are purely time-driven.
 */
export function resolveEffectiveStatus(
  promo: Pick<Promotion, "status" | "startAt" | "endAt">,
  nowMs: number
): PromotionStatus {
  if (promo.status === "draft" || promo.status === "paused" || promo.status === "archived") {
    return promo.status;
  }
  if (nowMs < promo.startAt) return "scheduled";
  if (nowMs > promo.endAt) return "expired";
  return "active";
}

export function isPromotionLive(
  promo: Pick<Promotion, "status" | "startAt" | "endAt">,
  nowMs: number
): boolean {
  return resolveEffectiveStatus(promo, nowMs) === "active";
}

// ─────────────────────────────────────────────────────────────────────────────
// Discount calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscountCalculation {
  applicable: boolean;
  originalUnitPrice: number;
  promoUnitPrice: number;
  discountPerUnit: number;
  reason?: string;
}

/**
 * Computes the per-unit discount for one promotion against an original price.
 * - percentage:    discount = round(original * pct / 100)
 * - fixed_amount:  discount = min(original, value)         (never below LKR 0)
 * - special_price: discount = original - special           (only if special < original)
 */
export function calculateUnitDiscount(
  discountType: PromotionDiscountType,
  discountValue: number,
  originalUnitPrice: number
): DiscountCalculation {
  const originalCents = Math.max(0, toCents(originalUnitPrice));
  const none = (reason: string): DiscountCalculation => ({
    applicable: false,
    originalUnitPrice: fromCents(originalCents),
    promoUnitPrice: fromCents(originalCents),
    discountPerUnit: 0,
    reason,
  });

  if (originalCents <= 0) return none("Product has no price.");
  const value = Number(discountValue);
  if (!Number.isFinite(value) || value <= 0) return none("Invalid discount value.");

  let discountCents = 0;
  if (discountType === "percentage") {
    discountCents = Math.round((originalCents * Math.min(100, value)) / 100);
  } else if (discountType === "fixed_amount") {
    discountCents = Math.min(originalCents, toCents(value));
  } else if (discountType === "special_price") {
    const specialCents = toCents(value);
    if (specialCents >= originalCents) {
      return none("Special price is not lower than the current price.");
    }
    discountCents = originalCents - specialCents;
  }

  discountCents = Math.min(originalCents, Math.max(0, discountCents));
  if (discountCents <= 0) return none("Discount rounds to zero.");

  return {
    applicable: true,
    originalUnitPrice: fromCents(originalCents),
    promoUnitPrice: fromCents(originalCents - discountCents),
    discountPerUnit: fromCents(discountCents),
  };
}

export function describeDiscount(
  discountType: PromotionDiscountType,
  discountValue: number,
  currency = "LKR"
): string {
  if (discountType === "percentage") return `${roundMoney(discountValue)}%`;
  if (discountType === "fixed_amount") return `${formatLKR(discountValue, currency)} off`;
  return `Special price ${formatLKR(discountValue, currency)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching & conflict resolution
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeBrandKey(brandId?: string, brandName?: string): string {
  const id = (brandId || "").trim();
  if (id) return id;
  return (brandName || "").trim().toLowerCase();
}

export function promotionMatchesLine(
  targets: PromotionTargets,
  line: Pick<PromotableLine, "productId" | "variantId" | "categoryId" | "brandId" | "brandName">
): boolean {
  if (
    line.variantId &&
    (targets.variants || []).some(
      (v) => v.productId === line.productId && v.variantId === line.variantId
    )
  ) {
    return true;
  }
  if ((targets.productIds || []).includes(line.productId)) return true;
  if (line.categoryId && (targets.categoryIds || []).includes(line.categoryId)) return true;
  const brandKey = normalizeBrandKey(line.brandId, line.brandName);
  if (brandKey && (targets.brandKeys || []).some((k) => k === brandKey || k === (line.brandName || "").trim().toLowerCase())) {
    return true;
  }
  return false;
}

interface Candidate {
  promo: Promotion;
  calc: DiscountCalculation;
}

/** Highest discount wins; tie -> priority; tie -> oldest createdAt; tie -> id (deterministic). */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (b.calc.discountPerUnit !== a.calc.discountPerUnit) {
    return b.calc.discountPerUnit - a.calc.discountPerUnit;
  }
  if ((b.promo.priority || 0) !== (a.promo.priority || 0)) {
    return (b.promo.priority || 0) - (a.promo.priority || 0);
  }
  if ((a.promo.createdAt || 0) !== (b.promo.createdAt || 0)) {
    return (a.promo.createdAt || 0) - (b.promo.createdAt || 0);
  }
  return a.promo.id.localeCompare(b.promo.id);
}

/** Finds the single best live promotion for one line (never stacks). */
export function findBestPromotionForLine(
  line: PromotableLine,
  promotions: Promotion[],
  nowMs: number,
  currency = "LKR"
): AppliedPromotion | null {
  if (line.hasManualPrice) return null;
  if (!line.unitPrice || line.unitPrice <= 0 || line.quantity <= 0) return null;

  const candidates: Candidate[] = [];
  for (const promo of promotions) {
    if (!isPromotionLive(promo, nowMs)) continue;
    if (!promotionMatchesLine(promo.targets, line)) continue;
    const calc = calculateUnitDiscount(promo.discountType, promo.discountValue, line.unitPrice);
    if (!calc.applicable) continue;
    candidates.push({ promo, calc });
  }
  if (candidates.length === 0) return null;

  candidates.sort(compareCandidates);
  const winner = candidates[0];
  const qty = Math.max(1, Math.floor(line.quantity));
  const discountTotalCents = toCents(winner.calc.discountPerUnit) * qty;

  return {
    promotionId: winner.promo.id,
    promotionName: winner.promo.name,
    promotionVersion: winner.promo.version || 1,
    discountType: winner.promo.discountType,
    discountValue: winner.promo.discountValue,
    priority: winner.promo.priority || 0,
    originalUnitPrice: winner.calc.originalUnitPrice,
    promoUnitPrice: winner.calc.promoUnitPrice,
    discountPerUnit: winner.calc.discountPerUnit,
    quantity: qty,
    discountTotal: fromCents(discountTotalCents),
    discountLabel: describeDiscount(winner.promo.discountType, winner.promo.discountValue, currency),
    competingPromotions: candidates.length - 1,
  };
}

export interface PricedCartResult {
  byLineKey: Record<string, AppliedPromotion | null>;
  totalPromotionDiscount: number;
  appliedCount: number;
}

/** Prices a whole cart. Pure; call it again whenever the clock, cart or promotions change. */
export function priceCartLines(
  lines: PromotableLine[],
  promotions: Promotion[],
  nowMs: number,
  currency = "LKR"
): PricedCartResult {
  const byLineKey: Record<string, AppliedPromotion | null> = {};
  let totalCents = 0;
  let appliedCount = 0;
  for (const line of lines) {
    const applied = findBestPromotionForLine(line, promotions, nowMs, currency);
    byLineKey[line.lineKey] = applied;
    if (applied) {
      totalCents += toCents(applied.discountTotal);
      appliedCount += 1;
    }
  }
  return { byLineKey, totalPromotionDiscount: fromCents(totalCents), appliedCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin helpers: duplicate / overlap detection
// ─────────────────────────────────────────────────────────────────────────────

function targetKeys(t: PromotionTargets): Set<string> {
  const keys = new Set<string>();
  (t.productIds || []).forEach((id) => keys.add(`p:${id}`));
  (t.variants || []).forEach((v) => keys.add(`v:${v.productId}:${v.variantId}`));
  (t.categoryIds || []).forEach((id) => keys.add(`c:${id}`));
  (t.brandKeys || []).forEach((k) => keys.add(`b:${k}`));
  return keys;
}

function windowsOverlap(a: { startAt: number; endAt: number }, b: { startAt: number; endAt: number }): boolean {
  return a.startAt <= b.endAt && b.startAt <= a.endAt;
}

export interface OverlapReport {
  duplicates: Promotion[];
  overlaps: Promotion[];
}

/**
 * `duplicates` = same type/value/targets/window (blocked: would create a duplicate discount).
 * `overlaps`   = share a target during the same period (allowed; the conflict rule picks one).
 */
export function detectPromotionOverlaps(
  candidate: {
    id?: string;
    discountType: PromotionDiscountType;
    discountValue: number;
    startAt: number;
    endAt: number;
    targets: PromotionTargets;
  },
  existing: Promotion[]
): OverlapReport {
  const mine = targetKeys(candidate.targets);
  const duplicates: Promotion[] = [];
  const overlaps: Promotion[] = [];

  for (const other of existing) {
    if (candidate.id && other.id === candidate.id) continue;
    if (other.status === "archived" || other.status === "draft") continue;
    if (!windowsOverlap(candidate, other)) continue;

    const theirs = targetKeys(other.targets);
    let shared = false;
    for (const k of mine) {
      if (theirs.has(k)) {
        shared = true;
        break;
      }
    }
    if (!shared) continue;

    const sameTargets = mine.size === theirs.size && [...mine].every((k) => theirs.has(k));
    if (
      sameTargets &&
      other.discountType === candidate.discountType &&
      other.discountValue === candidate.discountValue &&
      other.startAt === candidate.startAt &&
      other.endAt === candidate.endAt
    ) {
      duplicates.push(other);
    } else {
      overlaps.push(other);
    }
  }
  return { duplicates, overlaps };
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission helpers (pure, so they can be unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

/** Roles that manage promotions when a shop has not customised its role permissions. */
export const DEFAULT_PROMOTION_MANAGER_ROLES = ["admin", "manager"];

/**
 * @param role        authenticated shop role
 * @param permissions the role's saved `permissions` map (shops/{shopId}/rolePermissions/{role}), if any
 */
export function canManagePromotionsForRole(
  role: string | undefined,
  permissions?: Record<string, boolean> | null
): boolean {
  const cleanRole = (role || "").trim().toLowerCase();
  if (!cleanRole) return false;
  if (cleanRole === "admin") return true;
  if (permissions && typeof permissions.promotions === "boolean") return permissions.promotions;
  return DEFAULT_PROMOTION_MANAGER_ROLES.includes(cleanRole);
}

/** Tenant guard used on every server read/write of a promotion document. */
export function assertPromotionBelongsToShop(
  promo: { shopId?: string } | null | undefined,
  shopId: string
): void {
  const a = (promo?.shopId || "").trim().toUpperCase();
  const b = (shopId || "").trim().toUpperCase();
  if (!a || !b || a !== b) {
    throw new Error("Security violation: promotion does not belong to this shop.");
  }
}
