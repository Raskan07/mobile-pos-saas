/**
 * tests/promotionEngine.test.mts
 *
 * Run with:  node --test tests/promotionEngine.test.mts
 * (Node 22.6+ strips TypeScript types natively; no extra dependencies required.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPromotionBelongsToShop,
  calculateUnitDiscount,
  canManagePromotionsForRole,
  colomboToEpoch,
  computePromotionWindow,
  detectPromotionOverlaps,
  epochToColomboParts,
  findBestPromotionForLine,
  formatLKR,
  priceCartLines,
  resolveEffectiveStatus,
  validatePromotionInput,
} from "../lib/promotions/engine.ts";

const baseTargets = { productIds: [], variants: [], categoryIds: [], brandKeys: [] };

function makePromo(over: Record<string, unknown> = {}): any {
  return {
    id: "promo_a",
    shopId: "SHP-1001",
    name: "Promo A",
    description: "",
    promotionType: "general",
    discountType: "percentage",
    discountValue: 10,
    priority: 0,
    status: "active",
    startDate: "2026-12-01",
    endDate: "2026-12-31",
    startAt: colomboToEpoch("2026-12-01", undefined, "start"),
    endAt: colomboToEpoch("2026-12-31", undefined, "end"),
    timezone: "Asia/Colombo",
    targets: { ...baseTargets, productIds: ["p1"] },
    targetLabels: { products: [], categories: [], brands: [] },
    version: 1,
    createdBy: { userId: "u", username: "u", role: "admin" },
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

const NOW = colomboToEpoch("2026-12-15", "12:00", "start");
const line = (over: Record<string, unknown> = {}): any => ({
  lineKey: "p1",
  productId: "p1",
  unitPrice: 1000,
  quantity: 1,
  ...over,
});

// ── Discount maths ────────────────────────────────────────────────────────────
test("percentage discount: 20% of LKR 1,000 -> LKR 800", () => {
  const r = calculateUnitDiscount("percentage", 20, 1000);
  assert.equal(r.applicable, true);
  assert.equal(r.discountPerUnit, 200);
  assert.equal(r.promoUnitPrice, 800);
});

test("percentage discount rounds to cents without float drift", () => {
  const r = calculateUnitDiscount("percentage", 33.33, 99.99);
  assert.equal(r.discountPerUnit, 33.33);
  assert.equal(r.promoUnitPrice, 66.66);
});

test("fixed amount: LKR 500 off LKR 2,000 -> LKR 1,500", () => {
  const r = calculateUnitDiscount("fixed_amount", 500, 2000);
  assert.equal(r.promoUnitPrice, 1500);
});

test("fixed amount larger than price is capped at the price (never negative)", () => {
  const r = calculateUnitDiscount("fixed_amount", 5000, 1200);
  assert.equal(r.promoUnitPrice, 0);
  assert.equal(r.discountPerUnit, 1200);
});

test("special price: LKR 899 on LKR 1,000 -> discount LKR 101", () => {
  const r = calculateUnitDiscount("special_price", 899, 1000);
  assert.equal(r.promoUnitPrice, 899);
  assert.equal(r.discountPerUnit, 101);
});

test("special price not lower than current price is not applied", () => {
  assert.equal(calculateUnitDiscount("special_price", 1000, 1000).applicable, false);
  assert.equal(calculateUnitDiscount("special_price", 1500, 1000).applicable, false);
});

test("LKR formatting follows POS convention", () => {
  assert.equal(formatLKR(1500), "LKR 1,500");
  assert.equal(formatLKR(1500.5), "LKR 1,500.50");
});

// ── Asia/Colombo scheduling ───────────────────────────────────────────────────
test("Colombo midnight is 18:30 UTC of the previous day", () => {
  const ms = colomboToEpoch("2026-12-01", undefined, "start");
  assert.equal(new Date(ms).toISOString(), "2026-11-30T18:30:00.000Z");
});

test("end date without a time runs to 23:59:59.999 Colombo", () => {
  const ms = colomboToEpoch("2026-12-01", undefined, "end");
  assert.equal(new Date(ms).toISOString(), "2026-12-01T18:29:59.999Z");
});

test("epochToColomboParts is the inverse of colomboToEpoch", () => {
  const ms = colomboToEpoch("2026-12-24", "09:30", "start");
  assert.deepEqual(epochToColomboParts(ms), { date: "2026-12-24", time: "09:30" });
});

test("status becomes active exactly at start and expired right after end", () => {
  const p = makePromo({
    startAt: colomboToEpoch("2026-12-10", "10:00", "start"),
    endAt: colomboToEpoch("2026-12-10", "18:00", "end"),
  });
  assert.equal(resolveEffectiveStatus(p, p.startAt - 1), "scheduled");
  assert.equal(resolveEffectiveStatus(p, p.startAt), "active");
  assert.equal(resolveEffectiveStatus(p, p.endAt), "active");
  assert.equal(resolveEffectiveStatus(p, p.endAt + 1), "expired");
});

test("stored 'active' status cannot keep an expired promotion alive", () => {
  const p = makePromo({ status: "active", endAt: NOW - 1 });
  assert.equal(resolveEffectiveStatus(p, NOW), "expired");
  assert.equal(findBestPromotionForLine(line(), [p], NOW), null);
});

test("paused, draft and archived are never live regardless of the clock", () => {
  for (const status of ["paused", "draft", "archived"]) {
    const p = makePromo({ status });
    assert.equal(resolveEffectiveStatus(p, NOW), status);
    assert.equal(findBestPromotionForLine(line(), [p], NOW), null);
  }
});

test("future (scheduled) promotion is not applied yet", () => {
  const p = makePromo({ startAt: NOW + 3600_000, endAt: NOW + 7200_000 });
  assert.equal(findBestPromotionForLine(line(), [p], NOW), null);
});

// ── Validation ────────────────────────────────────────────────────────────────
test("validation rejects an invalid date range and missing targets", () => {
  const r = validatePromotionInput({
    name: "X",
    discountType: "percentage",
    discountValue: 10,
    startDate: "2026-12-10",
    endDate: "2026-12-01",
    targets: baseTargets,
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.dateRange);
  assert.ok(r.errors.targets);
});

test("validation rejects >100% and non-positive values and impossible dates", () => {
  const bad = (over: Record<string, unknown>) =>
    validatePromotionInput({
      name: "X",
      discountType: "percentage",
      discountValue: 10,
      startDate: "2026-12-01",
      endDate: "2026-12-02",
      targets: { ...baseTargets, productIds: ["p1"] },
      ...over,
    } as any);
  assert.ok(bad({ discountValue: 150 }).errors.discountValue);
  assert.ok(bad({ discountValue: 0 }).errors.discountValue);
  assert.ok(bad({ discountValue: -5 }).errors.discountValue);
  assert.ok(bad({ startDate: "2026-02-31" }).errors.startDate);
  assert.equal(bad({}).valid, true);
});

test("special price cannot target whole categories or brands", () => {
  const r = validatePromotionInput({
    name: "X",
    discountType: "special_price",
    discountValue: 500,
    startDate: "2026-12-01",
    endDate: "2026-12-02",
    targets: { ...baseTargets, categoryIds: ["c1"] },
  });
  assert.ok(r.errors.specialPriceTargets);
});

test("computePromotionWindow uses Asia/Colombo", () => {
  const w = computePromotionWindow({ startDate: "2026-12-01", endDate: "2026-12-01" });
  assert.equal(new Date(w.startAt).toISOString(), "2026-11-30T18:30:00.000Z");
});

// ── Conflict handling ─────────────────────────────────────────────────────────
test("only the highest discount applies; discounts never stack", () => {
  const ten = makePromo({ id: "ten", discountValue: 10 });
  const twenty = makePromo({ id: "twenty", discountValue: 20 });
  const applied = findBestPromotionForLine(line(), [ten, twenty], NOW)!;
  assert.equal(applied.promotionId, "twenty");
  assert.equal(applied.promoUnitPrice, 800); // not 720
  assert.equal(applied.competingPromotions, 1);
});

test("equal discounts are resolved by configured priority", () => {
  const low = makePromo({ id: "low", discountValue: 10, priority: 1 });
  const high = makePromo({ id: "high", discountType: "fixed_amount", discountValue: 100, priority: 9 });
  const applied = findBestPromotionForLine(line(), [low, high], NOW)!;
  assert.equal(applied.discountPerUnit, 100);
  assert.equal(applied.promotionId, "high");
});

test("equal discount and priority resolves deterministically (oldest first)", () => {
  const a = makePromo({ id: "a", createdAt: 5 });
  const b = makePromo({ id: "b", createdAt: 1 });
  assert.equal(findBestPromotionForLine(line(), [a, b], NOW)!.promotionId, "b");
  assert.equal(findBestPromotionForLine(line(), [b, a], NOW)!.promotionId, "b");
});

test("manually priced lines are never promoted", () => {
  assert.equal(findBestPromotionForLine(line({ hasManualPrice: true }), [makePromo()], NOW), null);
});

// ── Matching: products, variants, categories, brands ─────────────────────────
test("category and brand selection match lines", () => {
  const cat = makePromo({ id: "cat", targets: { ...baseTargets, categoryIds: ["cX"] } });
  const brand = makePromo({ id: "brand", targets: { ...baseTargets, brandKeys: ["apple"] } });
  assert.ok(findBestPromotionForLine(line({ productId: "z", categoryId: "cX" }), [cat], NOW));
  assert.ok(findBestPromotionForLine(line({ productId: "z", brandName: " Apple " }), [brand], NOW));
  assert.equal(findBestPromotionForLine(line({ productId: "z", categoryId: "other" }), [cat], NOW), null);
});

test("variant-specific promotion only matches that variant", () => {
  const v = makePromo({
    targets: { ...baseTargets, variants: [{ productId: "p1", variantId: "v-red" }] },
  });
  assert.ok(findBestPromotionForLine(line({ variantId: "v-red" }), [v], NOW));
  assert.equal(findBestPromotionForLine(line({ variantId: "v-blue" }), [v], NOW), null);
  assert.equal(findBestPromotionForLine(line(), [v], NOW), null);
});

test("deleted/unknown products simply never match", () => {
  assert.equal(findBestPromotionForLine(line({ productId: "gone" }), [makePromo()], NOW), null);
});

// ── Cart pricing ──────────────────────────────────────────────────────────────
test("cart totals use exact cent arithmetic with quantity", () => {
  const promo = makePromo({ discountType: "percentage", discountValue: 15 });
  const res = priceCartLines(
    [line({ lineKey: "p1", unitPrice: 333.33, quantity: 3 })],
    [promo],
    NOW
  );
  const applied = res.byLineKey["p1"]!;
  assert.equal(applied.discountPerUnit, 50);
  assert.equal(applied.discountTotal, 150);
  assert.equal(res.totalPromotionDiscount, 150);
});

test("price change after promotion creation: percentage follows the new price, special price stays fixed", () => {
  const pct = makePromo({ discountValue: 10 });
  assert.equal(findBestPromotionForLine(line({ unitPrice: 2000 }), [pct], NOW)!.promoUnitPrice, 1800);
  const special = makePromo({ discountType: "special_price", discountValue: 900 });
  assert.equal(findBestPromotionForLine(line({ unitPrice: 2000 }), [special], NOW)!.promoUnitPrice, 900);
  // price dropped below the special price -> promotion no longer applies
  assert.equal(findBestPromotionForLine(line({ unitPrice: 850 }), [special], NOW), null);
});

// ── Overlap / duplicate detection ────────────────────────────────────────────
test("exact duplicates are flagged; partial overlaps are warnings", () => {
  const existing = makePromo({ id: "e1" });
  const exact = detectPromotionOverlaps(
    {
      discountType: existing.discountType,
      discountValue: existing.discountValue,
      startAt: existing.startAt,
      endAt: existing.endAt,
      targets: existing.targets,
    },
    [existing]
  );
  assert.equal(exact.duplicates.length, 1);

  const partial = detectPromotionOverlaps(
    {
      discountType: "percentage",
      discountValue: 25,
      startAt: existing.startAt,
      endAt: existing.endAt,
      targets: { ...baseTargets, productIds: ["p1", "p2"] },
    },
    [existing]
  );
  assert.equal(partial.duplicates.length, 0);
  assert.equal(partial.overlaps.length, 1);
});

// ── Permissions & tenancy ────────────────────────────────────────────────────
test("permissions: admin always; manager by default; cashier never by default", () => {
  assert.equal(canManagePromotionsForRole("admin", { promotions: false }), true);
  assert.equal(canManagePromotionsForRole("manager"), true);
  assert.equal(canManagePromotionsForRole("cashier"), false);
  assert.equal(canManagePromotionsForRole("technician"), false);
  assert.equal(canManagePromotionsForRole("manager", { promotions: false }), false);
  assert.equal(canManagePromotionsForRole("cashier", { promotions: true }), true);
  assert.equal(canManagePromotionsForRole(undefined), false);
});

test("tenant guard rejects another shop's promotion", () => {
  assert.doesNotThrow(() => assertPromotionBelongsToShop({ shopId: "shp-1001" }, "SHP-1001"));
  assert.throws(() => assertPromotionBelongsToShop({ shopId: "SHP-2002" }, "SHP-1001"));
  assert.throws(() => assertPromotionBelongsToShop(null, "SHP-1001"));
});

test("multi-variant cart lines evaluate independently and aggregate promotionSummary", () => {
  const redPromo = makePromo({
    id: "promo_red",
    name: "Red Variant Flash",
    discountType: "fixed_amount",
    discountValue: 300,
    targets: { ...baseTargets, variants: [{ productId: "p1", variantId: "v-red" }] },
  });
  const productPromo = makePromo({
    id: "promo_all",
    name: "Storewide P1 10%",
    discountType: "percentage",
    discountValue: 10,
    targets: { ...baseTargets, productIds: ["p1"] },
  });

  const cartRes = priceCartLines(
    [
      line({ lineKey: "p1::v-red", productId: "p1", variantId: "v-red", unitPrice: 2000, quantity: 2 }),
      line({ lineKey: "p1::v-blue", productId: "p1", variantId: "v-blue", unitPrice: 2000, quantity: 1 }),
    ],
    [redPromo, productPromo],
    NOW
  );

  // Red variant: LKR 300 off beats 10% (LKR 200 off) -> LKR 1,700 x 2 = LKR 600 discount
  assert.equal(cartRes.byLineKey["p1::v-red"]?.promotionId, "promo_red");
  assert.equal(cartRes.byLineKey["p1::v-red"]?.promoUnitPrice, 1700);
  assert.equal(cartRes.byLineKey["p1::v-red"]?.discountTotal, 600);

  // Blue variant: only product-level 10% applies -> LKR 1,800 x 1 = LKR 200 discount
  assert.equal(cartRes.byLineKey["p1::v-blue"]?.promotionId, "promo_all");
  assert.equal(cartRes.byLineKey["p1::v-blue"]?.promoUnitPrice, 1800);
  assert.equal(cartRes.byLineKey["p1::v-blue"]?.discountTotal, 200);

  assert.equal(cartRes.totalPromotionDiscount, 800);
  assert.equal(cartRes.appliedCount, 2);
});

test("cart open across promotion expiration drops expired promo upon revalidation", () => {
  const flash = makePromo({
    id: "flash_1",
    discountType: "percentage",
    discountValue: 25,
    startAt: NOW - 60_000,
    endAt: NOW + 30_000,
  });
  const cartLines = [line({ lineKey: "p1", unitPrice: 4000, quantity: 1 })];

  // While open at NOW: 25% off -> LKR 3,000
  const beforeExpiry = priceCartLines(cartLines, [flash], NOW);
  assert.equal(beforeExpiry.byLineKey["p1"]?.promoUnitPrice, 3000);
  assert.equal(beforeExpiry.totalPromotionDiscount, 1000);

  // Checkout 31 seconds later (after endAt): promo automatically invalidated
  const afterExpiry = priceCartLines(cartLines, [flash], NOW + 31_000);
  assert.equal(afterExpiry.byLineKey["p1"], null);
  assert.equal(afterExpiry.totalPromotionDiscount, 0);
  assert.equal(afterExpiry.appliedCount, 0);
});

