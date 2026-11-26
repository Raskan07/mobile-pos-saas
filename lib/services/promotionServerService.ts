/**
 * lib/services/promotionServerService.ts
 *
 * Server-side promotion operations used by the /api/promotions/* routes.
 * Every function takes a `shopId` that has ALREADY been authorised by
 * `resolveRequestActor` (taken from the signed session cookie, not the client).
 *
 * Collections (shop-scoped):
 *   shops/{shopId}/promotions/{promotionId}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { getProducts } from "./catalogService";
import { getBranches } from "./branchService";
import { normalizeShopId } from "./shopAuthService";
import type { ProductItem } from "../types/catalog";
import type {
  AppliedPromotion,
  PromotableLine,
  Promotion,
  PromotionInput,
  PromotionStatus,
  PromotionTargetLabels,
} from "../types/promotion";
import { PROMOTION_TIMEZONE } from "../types/promotion";
import {
  assertPromotionBelongsToShop,
  computePromotionWindow,
  detectPromotionOverlaps,
  findBestPromotionForLine,
  isPromotionLive,
  normalizeBrandKey,
  resolveEffectiveStatus,
  validatePromotionInput,
} from "../promotions/engine";
import type { PromotionActor } from "../auth/requestAuth";

export class PromotionApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const promoCol = (shopId: string) => collection(db, "shops", normalizeShopId(shopId), "promotions");

function actorSnapshot(actor: PromotionActor) {
  return {
    userId: actor.userId,
    username: actor.username,
    role: actor.role,
    displayName: actor.displayName,
  };
}

/** Removes `undefined` values (Firestore rejects them). */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

const TIME_DRIVEN: PromotionStatus[] = ["scheduled", "active", "expired"];

/**
 * Lists promotions for a shop. Also persists time-driven status transitions
 * (scheduled -> active -> expired) so stored status never lags the clock for long.
 * Returned `status` is always the effective (clock-derived) status.
 */
export async function listShopPromotions(shopId: string, nowMs = Date.now()): Promise<Promotion[]> {
  const normShopId = normalizeShopId(shopId);
  const snap = await getDocs(promoCol(normShopId));
  const result: Promotion[] = [];
  const writes: Promise<unknown>[] = [];

  for (const d of snap.docs) {
    const promo = { ...(d.data() as Promotion), id: d.id };
    if (normalizeShopId(promo.shopId) !== normShopId) continue; // defensive tenant filter
    const effective = resolveEffectiveStatus(promo, nowMs);
    if (effective !== promo.status && TIME_DRIVEN.includes(promo.status) && TIME_DRIVEN.includes(effective)) {
      writes.push(
        updateDoc(d.ref, { status: effective, updatedAt: nowMs }).catch(() => undefined)
      );
    }
    result.push({ ...promo, status: effective });
  }
  await Promise.all(writes);
  return result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function loadLivePromotions(shopId: string, nowMs = Date.now()): Promise<Promotion[]> {
  const all = await listShopPromotions(shopId, nowMs);
  return all.filter((p) => isPromotionLive(p, nowMs));
}

async function getPromotionOrThrow(shopId: string, promotionId: string): Promise<Promotion> {
  const ref = doc(db, "shops", normalizeShopId(shopId), "promotions", promotionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new PromotionApiError("Promotion not found.", 404);
  const promo = { ...(snap.data() as Promotion), id: snap.id };
  assertPromotionBelongsToShop(promo, shopId);
  return promo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Product catalogue (shop-scoped) for the selector and target validation
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectorProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  sellingPrice: number;
  categoryId: string;
  categoryName: string;
  brand: string;
  brandKey: string;
  imageUrl?: string;
  variants: { id: string; label: string; sku: string; sellingPrice: number }[];
}

async function loadAllShopProducts(shopId: string): Promise<ProductItem[]> {
  const normShopId = normalizeShopId(shopId);
  const branches = await getBranches(normShopId);
  const lists = await Promise.all(
    branches.map((b) => getProducts(normShopId, undefined, undefined, b.branchId).catch(() => []))
  );
  const map = new Map<string, ProductItem>();
  for (const list of lists) {
    for (const p of list) {
      if (normalizeShopId(p.shopId || normShopId) !== normShopId) continue;
      if (!map.has(p.id)) map.set(p.id, p);
    }
  }
  return [...map.values()].filter((p) => p.status !== "inactive");
}

function toSelectorProduct(p: ProductItem): SelectorProduct {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku || "",
    barcode: p.barcode || "",
    sellingPrice: p.sellingPrice || 0,
    categoryId: p.categoryId || "",
    categoryName: p.categoryName || "Uncategorised",
    brand: p.brand || "",
    brandKey: normalizeBrandKey(p.brandId, p.brand),
    imageUrl: p.images && p.images.length > 0 ? p.images[0] : undefined,
    variants: (p.variants || []).map((v) => ({
      id: v.id,
      label: [v.size, v.color].filter(Boolean).join(" / ") || v.sku,
      sku: v.sku,
      sellingPrice: v.sellingPrice,
    })),
  };
}

export async function searchShopProducts(
  shopId: string,
  query: { q?: string; categoryId?: string; brandKey?: string; limit?: number }
): Promise<{
  products: SelectorProduct[];
  categories: { categoryId: string; name: string; productCount: number }[];
  brands: { brandKey: string; name: string; productCount: number }[];
  total: number;
}> {
  const all = (await loadAllShopProducts(shopId)).map(toSelectorProduct);

  const categoriesMap = new Map<string, { categoryId: string; name: string; productCount: number }>();
  const brandsMap = new Map<string, { brandKey: string; name: string; productCount: number }>();
  for (const p of all) {
    if (p.categoryId) {
      const c = categoriesMap.get(p.categoryId) || { categoryId: p.categoryId, name: p.categoryName, productCount: 0 };
      c.productCount += 1;
      categoriesMap.set(p.categoryId, c);
    }
    if (p.brandKey) {
      const b = brandsMap.get(p.brandKey) || { brandKey: p.brandKey, name: p.brand || p.brandKey, productCount: 0 };
      b.productCount += 1;
      brandsMap.set(p.brandKey, b);
    }
  }

  const q = (query.q || "").trim().toLowerCase();
  let filtered = all;
  if (query.categoryId) filtered = filtered.filter((p) => p.categoryId === query.categoryId);
  if (query.brandKey) filtered = filtered.filter((p) => p.brandKey === query.brandKey);
  if (q) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(q))
    );
  }
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  const limit = Math.min(500, Math.max(1, query.limit || 200));
  return {
    products: filtered.slice(0, limit),
    categories: [...categoriesMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    brands: [...brandsMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    total: filtered.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies every referenced product/variant/category/brand really belongs to the shop
 * and rebuilds the display labels from authoritative data (client labels are ignored).
 */
async function verifyAndLabelTargets(
  shopId: string,
  input: PromotionInput
): Promise<{ targets: Promotion["targets"]; labels: PromotionTargetLabels }> {
  const all = await loadAllShopProducts(shopId);
  const byId = new Map(all.map((p) => [p.id, p]));
  const categoryNames = new Map<string, string>();
  const brandNames = new Map<string, string>();
  for (const p of all) {
    if (p.categoryId) categoryNames.set(p.categoryId, p.categoryName || p.categoryId);
    const key = normalizeBrandKey(p.brandId, p.brand);
    if (key) brandNames.set(key, p.brand || key);
  }

  const unknown: string[] = [];
  const productIds = [...new Set(input.targets.productIds || [])];
  const variants = input.targets.variants || [];
  const categoryIds = [...new Set(input.targets.categoryIds || [])];
  const brandKeys = [...new Set(input.targets.brandKeys || [])];

  const labels: PromotionTargetLabels = { products: [], categories: [], brands: [] };
  const labelledProducts = new Set<string>();

  for (const id of productIds) {
    const p = byId.get(id);
    if (!p) unknown.push(`product ${id}`);
    else {
      labels.products.push({ productId: p.id, name: p.name, sku: p.sku });
      labelledProducts.add(p.id);
    }
  }
  const verifiedVariants = variants.filter((v) => {
    const p = byId.get(v.productId);
    const variant = p?.variants?.find((x) => x.id === v.variantId);
    if (!p || !variant) {
      unknown.push(`variant ${v.productId}/${v.variantId}`);
      return false;
    }
    if (!labelledProducts.has(p.id)) {
      labels.products.push({ productId: p.id, name: p.name, sku: p.sku });
      labelledProducts.add(p.id);
    }
    return true;
  });
  const variantsWithLabels = verifiedVariants.map((v) => {
    const variant = byId.get(v.productId)!.variants!.find((x) => x.id === v.variantId)!;
    return {
      productId: v.productId,
      variantId: v.variantId,
      label: [variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku,
    };
  });
  for (const id of categoryIds) {
    if (!categoryNames.has(id)) unknown.push(`category ${id}`);
    else labels.categories.push({ categoryId: id, name: categoryNames.get(id)! });
  }
  for (const key of brandKeys) {
    if (!brandNames.has(key)) unknown.push(`brand ${key}`);
    else labels.brands.push({ brandKey: key, name: brandNames.get(key)! });
  }

  if (unknown.length > 0) {
    throw new PromotionApiError(
      "Some selected items do not belong to this shop's catalogue.",
      400,
      { unknown }
    );
  }

  return {
    targets: { productIds, variants: variantsWithLabels, categoryIds, brandKeys },
    labels,
  };
}

function assertValid(input: Partial<PromotionInput>) {
  const { valid, errors } = validatePromotionInput(input);
  if (!valid) throw new PromotionApiError("Please fix the highlighted fields.", 422, errors);
}

export async function createPromotion(actor: PromotionActor, input: PromotionInput): Promise<Promotion> {
  assertValid(input);
  const shopId = actor.shopId;
  const now = Date.now();
  const window = computePromotionWindow(input);
  const { targets, labels } = await verifyAndLabelTargets(shopId, input);

  const existing = await listShopPromotions(shopId, now);
  const report = detectPromotionOverlaps(
    { discountType: input.discountType, discountValue: Number(input.discountValue), ...window, targets },
    existing
  );
  if (report.duplicates.length > 0) {
    throw new PromotionApiError(
      `An identical promotion already exists: "${report.duplicates[0].name}".`,
      409
    );
  }

  const id = `promo_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const base = {
    startAt: window.startAt,
    endAt: window.endAt,
    status: "active" as PromotionStatus,
  };
  const status: PromotionStatus =
    input.status === "draft" ? "draft" : resolveEffectiveStatus(base, now);

  const promo: Promotion = clean({
    id,
    shopId,
    name: input.name.trim(),
    description: (input.description || "").trim(),
    promotionType: input.promotionType,
    discountType: input.discountType,
    discountValue: Number(input.discountValue),
    priority: Math.round(Number(input.priority) || 0),
    status,
    startDate: input.startDate,
    ...(input.startTime ? { startTime: input.startTime } : {}),
    endDate: input.endDate,
    ...(input.endTime ? { endTime: input.endTime } : {}),
    startAt: window.startAt,
    endAt: window.endAt,
    timezone: PROMOTION_TIMEZONE,
    targets,
    targetLabels: labels,
    version: 1,
    createdBy: actorSnapshot(actor),
    createdAt: now,
    updatedAt: now,
  });

  await setDoc(doc(db, "shops", normalizeShopId(shopId), "promotions", id), promo);
  return promo;
}

export async function updatePromotion(
  actor: PromotionActor,
  promotionId: string,
  input: PromotionInput
): Promise<Promotion> {
  const current = await getPromotionOrThrow(actor.shopId, promotionId);
  if (current.status === "archived") {
    throw new PromotionApiError("Archived promotions cannot be edited. Restore it first.", 409);
  }
  assertValid(input);

  const now = Date.now();
  const window = computePromotionWindow(input);
  const { targets, labels } = await verifyAndLabelTargets(actor.shopId, input);

  const existing = await listShopPromotions(actor.shopId, now);
  const report = detectPromotionOverlaps(
    { id: promotionId, discountType: input.discountType, discountValue: Number(input.discountValue), ...window, targets },
    existing
  );
  if (report.duplicates.length > 0) {
    throw new PromotionApiError(
      `An identical promotion already exists: "${report.duplicates[0].name}".`,
      409
    );
  }

  // Admin intent: keep paused; draft stays draft unless published; otherwise time-driven.
  const stored = current;
  let status: PromotionStatus;
  if (input.status === "draft") status = "draft";
  else if (stored.status === "paused") status = "paused";
  else status = resolveEffectiveStatus({ status: "active", ...window }, now);

  const updated: Promotion = clean({
    ...stored,
    id: promotionId,
    shopId: normalizeShopId(actor.shopId),
    name: input.name.trim(),
    description: (input.description || "").trim(),
    promotionType: input.promotionType,
    discountType: input.discountType,
    discountValue: Number(input.discountValue),
    priority: Math.round(Number(input.priority) || 0),
    status,
    startDate: input.startDate,
    startTime: input.startTime || undefined,
    endDate: input.endDate,
    endTime: input.endTime || undefined,
    startAt: window.startAt,
    endAt: window.endAt,
    targets,
    targetLabels: labels,
    version: (stored.version || 1) + 1,
    updatedBy: actorSnapshot(actor),
    updatedAt: now,
  });

  // setDoc without merge so removed optional fields (times) are really removed.
  await setDoc(doc(db, "shops", normalizeShopId(actor.shopId), "promotions", promotionId), updated);
  return updated;
}

export type PromotionAction = "pause" | "resume" | "archive" | "restore" | "publish";

export async function applyPromotionAction(
  actor: PromotionActor,
  promotionId: string,
  action: PromotionAction
): Promise<Promotion> {
  const promo = await getPromotionOrThrow(actor.shopId, promotionId);
  const now = Date.now();
  const derived = resolveEffectiveStatus({ status: "active", startAt: promo.startAt, endAt: promo.endAt }, now);

  let next: PromotionStatus;
  const patch: Record<string, unknown> = { updatedAt: now, updatedBy: actorSnapshot(actor) };

  switch (action) {
    case "pause":
      if (!["active", "scheduled"].includes(resolveEffectiveStatus(promo, now))) {
        throw new PromotionApiError("Only active or scheduled promotions can be paused.", 409);
      }
      next = "paused";
      patch.pausedAt = now;
      break;
    case "resume":
      if (promo.status !== "paused") throw new PromotionApiError("Promotion is not paused.", 409);
      next = derived;
      break;
    case "publish":
      if (promo.status !== "draft") throw new PromotionApiError("Only drafts can be published.", 409);
      next = derived;
      break;
    case "archive":
      if (promo.status === "archived") throw new PromotionApiError("Already archived.", 409);
      next = "archived";
      patch.archivedAt = now;
      break;
    case "restore":
      if (promo.status !== "archived") throw new PromotionApiError("Promotion is not archived.", 409);
      next = "draft";
      break;
    default:
      throw new PromotionApiError("Unknown action.", 400);
  }

  patch.status = next;
  const ref = doc(db, "shops", normalizeShopId(actor.shopId), "promotions", promotionId);
  await updateDoc(ref, clean(patch));
  return { ...promo, ...(patch as Partial<Promotion>), status: next };
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout validation (authoritative pricing)
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckoutLineInput {
  lineKey: string;
  productId: string;
  variantId?: string;
  quantity: number;
  hasManualPrice?: boolean;
}

export interface CheckoutLineResult {
  lineKey: string;
  productFound: boolean;
  originalUnitPrice: number;
  finalUnitPrice: number;
  promotion: AppliedPromotion | null;
}

async function loadProductForCheckout(
  shopId: string,
  branchId: string,
  productId: string
): Promise<ProductItem | null> {
  const norm = normalizeShopId(shopId);
  const tryRefs = [
    doc(db, "shops", norm, "products", productId),
    doc(db, "shops", norm, "branches", branchId || "main", "products", productId),
    doc(db, "products", productId),
  ];
  for (const ref of tryRefs) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as ProductItem;
        // Tenant guard: a product from another shop is treated as "not found".
        if (data.shopId && normalizeShopId(data.shopId) !== norm) continue;
        return { ...data, id: snap.id };
      }
    } catch {
      // try next location
    }
  }
  return null;
}

export async function validateCheckoutLines(
  actor: PromotionActor,
  lines: CheckoutLineInput[],
  nowMs = Date.now()
): Promise<{
  serverTime: number;
  lines: CheckoutLineResult[];
  totalPromotionDiscount: number;
  appliedPromotionIds: string[];
}> {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PromotionApiError("Cart is empty.", 400);
  }
  if (lines.length > 300) throw new PromotionApiError("Too many cart lines.", 400);

  const promotions = await loadLivePromotions(actor.shopId, nowMs);

  const results: CheckoutLineResult[] = [];
  let totalCents = 0;
  const applied = new Set<string>();

  for (const raw of lines) {
    const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
    const product = promotions.length
      ? await loadProductForCheckout(actor.shopId, actor.branchId, raw.productId)
      : null;

    if (!product) {
      results.push({
        lineKey: raw.lineKey,
        productFound: false,
        originalUnitPrice: 0,
        finalUnitPrice: 0,
        promotion: null,
      });
      continue;
    }

    const variant = raw.variantId ? product.variants?.find((v) => v.id === raw.variantId) : undefined;
    const originalUnitPrice = variant ? variant.sellingPrice : product.sellingPrice;
    const line: PromotableLine = {
      lineKey: raw.lineKey,
      productId: product.id,
      variantId: variant?.id,
      categoryId: product.categoryId,
      brandId: product.brandId,
      brandName: product.brand,
      unitPrice: originalUnitPrice,
      quantity,
      hasManualPrice: Boolean(raw.hasManualPrice),
    };
    const promotion = findBestPromotionForLine(line, promotions, nowMs);
    if (promotion) {
      applied.add(promotion.promotionId);
      totalCents += Math.round(promotion.discountTotal * 100);
    }
    results.push({
      lineKey: raw.lineKey,
      productFound: true,
      originalUnitPrice,
      finalUnitPrice: promotion ? promotion.promoUnitPrice : originalUnitPrice,
      promotion,
    });
  }

  return {
    serverTime: nowMs,
    lines: results,
    totalPromotionDiscount: totalCents / 100,
    appliedPromotionIds: [...applied],
  };
}
