/**
 * lib/services/promotionService.ts
 *
 * Client-side promotion service:
 *   - Real-time shop-scoped promotion subscription for the POS cart
 *   - Idempotent, atomic promotion usage analytics (recorded when a sale completes)
 *   - Thin fetch wrappers for the server-authorised /api/promotions/* endpoints
 *
 * Reads/writes here are always under shops/{shopId}/... (shop isolation by path AND by shopId field).
 */

import {
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  runTransaction,
  Unsubscribe,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { resolveEffectiveStatus } from "../promotions/engine";
import type {
  Promotion,
  PromotionInput,
  PromotionStats,
  PromotionUsageRecord,
  SalePromotionSummary,
} from "../types/promotion";
import type { SelectorProduct } from "./promotionServerService";

// ─────────────────────────────────────────────────────────────────────────────
// Realtime reads
// ─────────────────────────────────────────────────────────────────────────────

/** Live promotions for the POS. Statuses are re-derived by the engine, so they are not trusted here. */
export function subscribeToShopPromotions(
  shopId: string,
  onUpdate: (promotions: Promotion[]) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) {
    onUpdate([]);
    return () => {};
  }
  const q = query(
    collection(db, "shops", normShopId, "promotions"),
    where("shopId", "==", normShopId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ ...(d.data() as Promotion), id: d.id }))
        .filter((p) => normalizeShopId(p.shopId) === normShopId);
      onUpdate(list);
    },
    (err) => {
      console.warn("[promotions] subscription error:", err);
      onUpdate([]);
    }
  );
}

export function subscribeToPromotionStats(
  shopId: string,
  onUpdate: (stats: Record<string, PromotionStats>) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) {
    onUpdate({});
    return () => {};
  }
  return onSnapshot(
    collection(db, "shops", normShopId, "promotion_stats"),
    (snap) => {
      const map: Record<string, PromotionStats> = {};
      snap.docs.forEach((d) => {
        const s = d.data() as PromotionStats;
        if (normalizeShopId(s.shopId) === normShopId) map[d.id] = { ...s, promotionId: d.id };
      });
      onUpdate(map);
    },
    () => onUpdate({})
  );
}

export async function fetchPromotionUsages(
  shopId: string,
  promotionId: string
): Promise<PromotionUsageRecord[]> {
  const normShopId = normalizeShopId(shopId);
  const snap = await getDocs(
    query(
      collection(db, "shops", normShopId, "promotion_usages"),
      where("promotionId", "==", promotionId)
    )
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as PromotionUsageRecord), id: d.id }))
    .filter((u) => normalizeShopId(u.shopId) === normShopId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (called from salesService after a sale is persisted)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records usage for every promotion in a completed sale.
 * Idempotent per (saleId, promotionId) via a transaction, so retries and concurrent
 * checkouts can never double-count. Counters use atomic increments.
 */
export async function recordPromotionUsageForSale(
  shopId: string,
  sale: {
    saleId: string;
    invoiceNumber: string;
    promotionSummary?: SalePromotionSummary;
    createdAt: number;
  }
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  const entries = sale.promotionSummary?.promotions || [];
  if (!normShopId || entries.length === 0) return;

  await Promise.all(
    entries.map((entry) =>
      runTransaction(db, async (tx) => {
        const usageId = `${sale.saleId}__${entry.promotionId}`;
        const usageRef = doc(db, "shops", normShopId, "promotion_usages", usageId);
        const statsRef = doc(db, "shops", normShopId, "promotion_stats", entry.promotionId);

        const existing = await tx.get(usageRef);
        if (existing.exists()) return; // already recorded for this sale

        const usage: Omit<PromotionUsageRecord, "id"> = {
          shopId: normShopId,
          promotionId: entry.promotionId,
          promotionName: entry.promotionName,
          promotionVersion: entry.promotionVersion,
          saleId: sale.saleId,
          invoiceNumber: sale.invoiceNumber,
          unitsSold: entry.unitsSold,
          discountTotal: entry.discountTotal,
          revenue: entry.revenue,
          createdAt: sale.createdAt,
        };
        tx.set(usageRef, usage);
        tx.set(
          statsRef,
          {
            shopId: normShopId,
            promotionId: entry.promotionId,
            promotionName: entry.promotionName,
            usageCount: increment(1),
            unitsSold: increment(entry.unitsSold),
            totalDiscountAmount: increment(entry.discountTotal),
            revenueGenerated: increment(entry.revenue),
            lastUsedAt: sale.createdAt,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }).catch((err) => {
        console.warn("[promotions] usage tracking notice:", err);
      })
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server API wrappers
// ─────────────────────────────────────────────────────────────────────────────

export class PromotionClientError extends Error {
  status: number;
  details?: Record<string, string>;
  constructor(message: string, status: number, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    credentials: "same-origin",
    cache: "no-store",
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON error body
  }
  if (!res.ok) {
    throw new PromotionClientError(
      data?.error || `Request failed (${res.status})`,
      res.status,
      data?.details
    );
  }
  return data as T;
}

const withShop = (url: string, shopId?: string) =>
  shopId ? `${url}${url.includes("?") ? "&" : "?"}shopId=${encodeURIComponent(shopId)}` : url;

export const promotionApi = {
  list: (shopId?: string) =>
    apiFetch<{ shopId: string; canManage: boolean; serverTime: number; promotions: Promotion[] }>(
      withShop("/api/promotions", shopId)
    ),
  create: (promotion: PromotionInput, shopId?: string) =>
    apiFetch<{ promotion: Promotion }>("/api/promotions", {
      method: "POST",
      body: JSON.stringify({ shopId, promotion }),
    }),
  update: (promotionId: string, promotion: PromotionInput, shopId?: string) =>
    apiFetch<{ promotion: Promotion }>(`/api/promotions/${encodeURIComponent(promotionId)}`, {
      method: "PUT",
      body: JSON.stringify({ shopId, promotion }),
    }),
  action: (
    promotionId: string,
    action: "pause" | "resume" | "archive" | "restore" | "publish",
    shopId?: string
  ) =>
    apiFetch<{ promotion: Promotion }>(`/api/promotions/${encodeURIComponent(promotionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ shopId, action }),
    }),
  searchProducts: (
    params: { q?: string; categoryId?: string; brandKey?: string },
    shopId?: string
  ) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.categoryId) sp.set("categoryId", params.categoryId);
    if (params.brandKey) sp.set("brandKey", params.brandKey);
    if (shopId) sp.set("shopId", shopId);
    return apiFetch<{
      shopId: string;
      products: SelectorProduct[];
      categories: { categoryId: string; name: string; productCount: number }[];
      brands: { brandKey: string; name: string; productCount: number }[];
      total: number;
    }>(`/api/promotions/products?${sp.toString()}`);
  },
  validateCheckout: (
    lines: {
      lineKey: string;
      productId: string;
      variantId?: string;
      quantity: number;
      hasManualPrice?: boolean;
    }[]
  ) =>
    apiFetch<{
      serverTime: number;
      lines: {
        lineKey: string;
        productFound: boolean;
        originalUnitPrice: number;
        finalUnitPrice: number;
        promotion: import("../types/promotion").AppliedPromotion | null;
      }[];
      totalPromotionDiscount: number;
      appliedPromotionIds: string[];
    }>("/api/promotions/validate-checkout", {
      method: "POST",
      body: JSON.stringify({ lines }),
    }),
};

/** Derived status helper for UI lists fed by the realtime subscription. */
export function withEffectiveStatus(promos: Promotion[], nowMs: number): Promotion[] {
  return promos.map((p) => ({ ...p, status: resolveEffectiveStatus(p, nowMs) }));
}
