"use client";

/**
 * components/promotions/PromotionManagementWorkspace.tsx
 *
 * Complete Promotion & Discount Management UI used by:
 *   - Shop Administrators / authorized Managers at `/shop/promotions` (`/v1-shop/promotions`)
 *   - Super Administrators across all shops at `/sup-ad-min/promotions` (`/sa-9x8f2k/promotions`)
 *
 * Follows the existing Skyfox POS dark minimalist design system: clean tables, compact KPIs,
 * structured 5-section promotion editor, intuitive product/variant/category/brand selector,
 * Asia/Colombo schedule display, conflict/overlap detection, and per-promotion analytics.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Percent,
  Plus,
  Search,
  Pause,
  Play,
  Archive,
  RotateCcw,
  Edit3,
  Eye,
  X,
  Check,
  AlertCircle,
  Clock,
  Tag,
  Layers,
  Package,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import type {
  Promotion,
  PromotionDiscountType,
  PromotionInput,
  PromotionStats,
  PromotionStatus,
  PromotionTargets,
  PromotionType,
  PromotionUsageRecord,
} from "@/lib/types/promotion";
import type { SelectorProduct } from "@/lib/services/promotionServerService";
import {
  promotionApi,
  subscribeToShopPromotions,
  subscribeToPromotionStats,
  fetchPromotionUsages,
  withEffectiveStatus,
  PromotionClientError,
} from "@/lib/services/promotionService";
import {
  calculateUnitDiscount,
  computePromotionWindow,
  describeDiscount,
  detectPromotionOverlaps,
  epochToColomboParts,
  formatColomboDateTime,
  formatLKR,
  promotionMatchesLine,
  validatePromotionInput,
} from "@/lib/promotions/engine";

interface ShopOption {
  shopId: string;
  shopName: string;
}

interface PromotionManagementWorkspaceProps {
  /** Active shopId (required unless superAdminShops is provided). */
  shopId: string;
  shopName?: string;
  canManage: boolean;
  onBack?: () => void;
  /** Provided only in the Super Admin workspace to switch between shops. */
  superAdminShops?: ShopOption[];
  onSelectSuperAdminShop?: (shopId: string) => void;
}

type StatusFilter = "all" | PromotionStatus;

const STATUS_BADGE: Record<
  PromotionStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  draft: {
    label: "Draft",
    className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  },
  paused: {
    label: "Paused",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  expired: {
    label: "Expired",
    className: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  },
  archived: {
    label: "Archived",
    className: "bg-white/[0.04] text-zinc-500 border-white/10",
  },
};

const PROMO_TYPE_LABELS: Record<PromotionType, string> = {
  general: "General Offer",
  seasonal: "Seasonal Sale",
  clearance: "Clearance",
  flash_sale: "Flash Sale",
  category_offer: "Category Offer",
  brand_offer: "Brand Offer",
};

export default function PromotionManagementWorkspace({
  shopId,
  shopName,
  canManage,
  onBack,
  superAdminShops,
  onSelectSuperAdminShop,
}: PromotionManagementWorkspaceProps) {
  const [rawPromotions, setRawPromotions] = useState<Promotion[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, PromotionStats>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modals
  const [editorTarget, setEditorTarget] = useState<Promotion | "create" | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Promotion | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // Refresh clock every 15s so scheduled/expired badges transition live without manual edits
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Load via server API (syncs stored status + verifies auth) AND attach realtime listeners
  const syncFromServer = useCallback(async () => {
    if (!shopId) return;
    setErrorMsg(null);
    try {
      const res = await promotionApi.list(superAdminShops ? shopId : undefined);
      setRawPromotions(res.promotions);
      setNowMs(res.serverTime || Date.now());
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load promotions.");
    } finally {
      setLoading(false);
    }
  }, [shopId, superAdminShops]);

  useEffect(() => {
    if (!shopId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void syncFromServer();

    const unsubPromos = subscribeToShopPromotions(shopId, (items) => {
      setRawPromotions(items);
      setLoading(false);
    });
    const unsubStats = subscribeToPromotionStats(shopId, setStatsMap);

    return () => {
      unsubPromos();
      unsubStats();
    };
  }, [shopId, syncFromServer]);

  const promotions = useMemo(() => {
    return withEffectiveStatus(rawPromotions, nowMs).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
  }, [rawPromotions, nowMs]);

  const filteredPromotions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return promotions.filter((p) => {
      if (statusFilter === "all") {
        // Hide archived under "All" unless searched or explicitly filtered
        if (p.status === "archived" && !q) return false;
      } else if (p.status !== statusFilter) {
        return false;
      }

      if (!q) return true;
      const inBasic =
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q);
      const inLabels =
        (p.targetLabels?.products || []).some(
          (pr) =>
            pr.name.toLowerCase().includes(q) ||
            (pr.sku || "").toLowerCase().includes(q)
        ) ||
        (p.targetLabels?.categories || []).some((c) =>
          c.name.toLowerCase().includes(q)
        ) ||
        (p.targetLabels?.brands || []).some((b) =>
          b.name.toLowerCase().includes(q)
        );
      return inBasic || inLabels;
    });
  }, [promotions, statusFilter, searchQuery]);

  // Aggregate Analytics Summary
  const summary = useMemo(() => {
    let activeCount = 0;
    let scheduledCount = 0;
    let totalRedemptions = 0;
    let totalUnits = 0;
    let totalDiscount = 0;
    let totalRevenue = 0;

    for (const p of promotions) {
      if (p.status === "active") activeCount += 1;
      if (p.status === "scheduled") scheduledCount += 1;
    }
    for (const st of Object.values(statsMap)) {
      totalRedemptions += Number(st.usageCount) || 0;
      totalUnits += Number(st.unitsSold) || 0;
      totalDiscount += Number(st.totalDiscountAmount) || 0;
      totalRevenue += Number(st.revenueGenerated) || 0;
    }

    return {
      activeCount,
      scheduledCount,
      totalRedemptions,
      totalUnits,
      totalDiscount,
      totalRevenue,
    };
  }, [promotions, statsMap]);

  const handleLifecycleAction = async (
    promo: Promotion,
    action: "pause" | "resume" | "archive" | "restore" | "publish"
  ) => {
    setBusyId(promo.id);
    setErrorMsg(null);
    try {
      await promotionApi.action(
        promo.id,
        action,
        superAdminShops ? shopId : undefined
      );
      showToast(`Promotion "${promo.name}" updated (${action}).`);
    } catch (err: any) {
      setErrorMsg(err?.message || `Failed to ${action} promotion.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-emerald-500/35 text-xs text-emerald-200 shadow-xl flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="flex-1 max-w-7xl w-full mx-auto p-5 sm:p-7 space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-orange-400 shrink-0">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  Discount Management
                </h1>
                {shopId && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] border border-white/10 text-zinc-300">
                    {shopName ? `${shopName} • ${shopId}` : shopId}
                  </span>
                )}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.07] text-zinc-400">
                  TZ: Asia/Colombo
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Scheduled percentage, fixed LKR, and special-price promotions with automatic POS cart resolution
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {superAdminShops && onSelectSuperAdminShop && (
              <select
                value={shopId}
                onChange={(e) => onSelectSuperAdminShop(e.target.value)}
                className="px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
              >
                {superAdminShops.map((s) => (
                  <option key={s.shopId} value={s.shopId}>
                    {s.shopName} ({s.shopId})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => void syncFromServer()}
              className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-zinc-300 flex items-center gap-1.5 cursor-pointer"
              title="Refresh & sync promotion schedules"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>

            {canManage && shopId && (
              <button
                type="button"
                onClick={() => setEditorTarget("create")}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Promotion</span>
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-300 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Analytics & KPI Strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07]">
            <div className="text-[11px] text-zinc-400">Live / Scheduled</div>
            <div className="text-lg font-bold font-mono text-white mt-1">
              <span className="text-emerald-400">{summary.activeCount}</span> Active
              <span className="text-zinc-600 mx-1.5">/</span>
              <span className="text-sky-300">{summary.scheduledCount}</span> Sched.
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07]">
            <div className="text-[11px] text-zinc-400">Redemptions & Units</div>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {summary.totalRedemptions.toLocaleString()} sales{" "}
              <span className="text-xs font-normal text-zinc-400">
                ({summary.totalUnits.toLocaleString()} units)
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07]">
            <div className="text-[11px] text-zinc-400">Total Discount Given</div>
            <div className="text-lg font-bold font-mono text-amber-300 mt-1">
              {formatLKR(summary.totalDiscount)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07]">
            <div className="text-[11px] text-zinc-400">Promotional Revenue</div>
            <div className="text-lg font-bold font-mono text-emerald-300 mt-1">
              {formatLKR(summary.totalRevenue)}
            </div>
          </div>
        </div>

        {/* ── Search & Status Filter Bar ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.025] border border-white/[0.07]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search promotions, products, SKUs, categories, brands..."
              className="w-full pl-8 pr-8 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/25"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                "all",
                "active",
                "scheduled",
                "draft",
                "paused",
                "expired",
                "archived",
              ] as StatusFilter[]
            ).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer transition-colors ${
                  statusFilter === st
                    ? "bg-white/15 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* ── Promotions Table / List ── */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.07] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-zinc-400">
              Loading promotions...
            </div>
          ) : filteredPromotions.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-semibold text-zinc-300">
                No promotions found
              </p>
              <p className="text-xs text-zinc-500">
                {promotions.length === 0
                  ? "Create your first promotion to automatically apply scheduled discounts at POS checkout."
                  : "No promotions match the active search or status filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11px] text-zinc-400 bg-white/[0.015]">
                    <th className="py-3 px-4 font-semibold">Promotion</th>
                    <th className="py-3 px-3 font-semibold">Discount</th>
                    <th className="py-3 px-3 font-semibold">Scope</th>
                    <th className="py-3 px-3 font-semibold">Schedule (Colombo)</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                    <th className="py-3 px-3 font-semibold">Performance</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredPromotions.map((promo) => {
                    const badge = STATUS_BADGE[promo.status];
                    const st = statsMap[promo.id];
                    const isBusy = busyId === promo.id;

                    const prodCount = promo.targets?.productIds?.length || 0;
                    const varCount = promo.targets?.variants?.length || 0;
                    const catCount = promo.targets?.categoryIds?.length || 0;
                    const brandCount = promo.targets?.brandKeys?.length || 0;
                    const scopeParts = [
                      prodCount ? `${prodCount} prod` : "",
                      varCount ? `${varCount} var` : "",
                      catCount ? `${catCount} cat` : "",
                      brandCount ? `${brandCount} brand` : "",
                    ].filter(Boolean);

                    return (
                      <tr
                        key={promo.id}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3.5 px-4 max-w-[240px]">
                          <div className="font-semibold text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{promo.name}</span>
                            {promo.priority > 0 && (
                              <span
                                className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-zinc-300 shrink-0"
                                title="Conflict tie-breaker priority"
                              >
                                P{promo.priority}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            {PROMO_TYPE_LABELS[promo.promotionType] || promo.promotionType}
                            {promo.description ? ` • ${promo.description}` : ""}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 font-mono font-bold text-orange-300 whitespace-nowrap">
                          {describeDiscount(promo.discountType, promo.discountValue)}
                        </td>

                        <td className="py-3.5 px-3 text-zinc-300 whitespace-nowrap">
                          {scopeParts.join(", ") || "—"}
                        </td>

                        <td className="py-3.5 px-3 font-mono text-[11px] text-zinc-300 whitespace-nowrap">
                          <div>{formatColomboDateTime(promo.startAt)}</div>
                          <div className="text-zinc-500">
                            → {formatColomboDateTime(promo.endAt)}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 font-mono text-[11px] text-zinc-300 whitespace-nowrap">
                          <div>
                            {st?.usageCount || 0} sales • {st?.unitsSold || 0} units
                          </div>
                          <div className="text-zinc-500">
                            Rev: {formatLKR(st?.revenueGenerated || 0)}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailsTarget(promo)}
                              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white cursor-pointer"
                              title="View details & analytics"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {canManage && promo.status !== "archived" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setEditorTarget(promo)}
                                className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white cursor-pointer disabled:opacity-40"
                                title="Edit promotion"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canManage && promo.status === "draft" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleLifecycleAction(promo, "publish")}
                                className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 cursor-pointer"
                              >
                                Publish
                              </button>
                            )}

                            {canManage &&
                              (promo.status === "active" ||
                                promo.status === "scheduled") && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleLifecycleAction(promo, "pause")}
                                  className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 cursor-pointer"
                                  title="Pause promotion"
                                >
                                  <Pause className="w-3.5 h-3.5" />
                                </button>
                              )}

                            {canManage && promo.status === "paused" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleLifecycleAction(promo, "resume")}
                                className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 cursor-pointer"
                                title="Resume promotion"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canManage && promo.status !== "archived" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleLifecycleAction(promo, "archive")}
                                className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 cursor-pointer"
                                title="Archive promotion"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canManage && promo.status === "archived" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleLifecycleAction(promo, "restore")}
                                className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-300 flex items-center gap-1 cursor-pointer"
                                title="Restore to Draft"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Multi-Section Create / Edit Modal ── */}
      {editorTarget && (
        <PromotionEditorModal
          shopId={shopId}
          isSuperAdminMode={Boolean(superAdminShops)}
          initial={editorTarget === "create" ? null : editorTarget}
          existingPromotions={promotions}
          onClose={() => setEditorTarget(null)}
          onSaved={(saved) => {
            setEditorTarget(null);
            showToast(`Saved promotion "${saved.name}".`);
            void syncFromServer();
          }}
        />
      )}

      {/* ── Promotion Details & Performance Analytics Modal ── */}
      {detailsTarget && (
        <PromotionDetailsModal
          shopId={shopId}
          promotion={detailsTarget}
          stats={statsMap[detailsTarget.id]}
          onClose={() => setDetailsTarget(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// 5-SECTION PROMOTION CREATION & EDIT MODAL
// ============================================================================

const SECTIONS = [
  { step: 1, title: "Basic Info" },
  { step: 2, title: "Discount" },
  { step: 3, title: "Products" },
  { step: 4, title: "Schedule" },
  { step: 5, title: "Review" },
] as const;

function PromotionEditorModal({
  shopId,
  isSuperAdminMode,
  initial,
  existingPromotions,
  onClose,
  onSaved,
}: {
  shopId: string;
  isSuperAdminMode: boolean;
  initial: Promotion | null;
  existingPromotions: Promotion[];
  onClose: () => void;
  onSaved: (promo: Promotion) => void;
}) {
  const todayColombo = useMemo(() => epochToColomboParts(Date.now()).date, []);
  const nextWeekColombo = useMemo(
    () => epochToColomboParts(Date.now() + 7 * 86_400_000).date,
    []
  );

  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [promotionType, setPromotionType] = useState<PromotionType>(
    initial?.promotionType || "general"
  );
  const [priority, setPriority] = useState<string>(String(initial?.priority ?? 10));

  const [discountType, setDiscountType] = useState<PromotionDiscountType>(
    initial?.discountType || "percentage"
  );
  const [discountValue, setDiscountValue] = useState<string>(
    initial ? String(initial.discountValue) : "10"
  );

  const [targets, setTargets] = useState<PromotionTargets>(
    initial?.targets || {
      productIds: [],
      variants: [],
      categoryIds: [],
      brandKeys: [],
    }
  );

  const [startDate, setStartDate] = useState(initial?.startDate || todayColombo);
  const [startTime, setStartTime] = useState(initial?.startTime || "");
  const [endDate, setEndDate] = useState(initial?.endDate || nextWeekColombo);
  const [endTime, setEndTime] = useState(initial?.endTime || "");

  // Catalogue state for Step 3 selector
  const [catalogueProducts, setCatalogueProducts] = useState<SelectorProduct[]>([]);
  const [catalogueCategories, setCatalogueCategories] = useState<
    { categoryId: string; name: string; productCount: number }[]
  >([]);
  const [catalogueBrands, setCatalogueBrands] = useState<
    { brandKey: string; name: string; productCount: number }[]
  >([]);
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);
  const [prodQuery, setProdQuery] = useState("");
  const [selectorTab, setSelectorTab] = useState<"products" | "categories" | "brands">(
    "products"
  );
  const [expandedVariantProductId, setExpandedVariantProductId] = useState<
    string | null
  >(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingCatalogue(true);
    promotionApi
      .searchProducts({}, isSuperAdminMode ? shopId : undefined)
      .then((res) => {
        if (!active) return;
        setCatalogueProducts(res.products);
        setCatalogueCategories(res.categories);
        setCatalogueBrands(res.brands);
      })
      .catch((err) => {
        if (!active) return;
        setSubmitError(err?.message || "Failed to load shop products.");
      })
      .finally(() => {
        if (active) setLoadingCatalogue(false);
      });
    return () => {
      active = false;
    };
  }, [shopId, isSuperAdminMode]);

  const filteredCatalogue = useMemo(() => {
    const q = prodQuery.trim().toLowerCase();
    if (!q) return catalogueProducts;
    return catalogueProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(q))
    );
  }, [catalogueProducts, prodQuery]);

  // All products currently matched by the selected products/variants/categories/brands (with live price preview)
  const previewRows = useMemo(() => {
    const val = Number(discountValue) || 0;
    const rows: {
      key: string;
      label: string;
      sku: string;
      originalPrice: number;
      promoPrice: number;
      discountPerUnit: number;
      applicable: boolean;
      reason?: string;
      removable?: () => void;
    }[] = [];

    for (const p of catalogueProducts) {
      if (p.variants.length > 0) {
        // Check if whole product/category/brand selected or specific variants
        const wholeMatched = promotionMatchesLine(
          { ...targets, variants: [] },
          {
            productId: p.id,
            categoryId: p.categoryId,
            brandName: p.brand,
          }
        );
        for (const v of p.variants) {
          const varSelected = targets.variants.some(
            (tv) => tv.productId === p.id && tv.variantId === v.id
          );
          if (!wholeMatched && !varSelected) continue;
          const calc = calculateUnitDiscount(discountType, val, v.sellingPrice);
          rows.push({
            key: `${p.id}__${v.id}`,
            label: `${p.name} (${v.label})`,
            sku: v.sku,
            originalPrice: v.sellingPrice,
            promoPrice: calc.promoUnitPrice,
            discountPerUnit: calc.discountPerUnit,
            applicable: calc.applicable,
            reason: calc.reason,
            removable: varSelected
              ? () =>
                  setTargets((prev) => ({
                    ...prev,
                    variants: prev.variants.filter(
                      (tv) => !(tv.productId === p.id && tv.variantId === v.id)
                    ),
                  }))
              : targets.productIds.includes(p.id)
              ? () =>
                  setTargets((prev) => ({
                    ...prev,
                    productIds: prev.productIds.filter((id) => id !== p.id),
                  }))
              : undefined,
          });
        }
      } else {
        const matched = promotionMatchesLine(targets, {
          productId: p.id,
          categoryId: p.categoryId,
          brandName: p.brand,
        });
        if (!matched) continue;
        const calc = calculateUnitDiscount(discountType, val, p.sellingPrice);
        rows.push({
          key: p.id,
          label: p.name,
          sku: p.sku,
          originalPrice: p.sellingPrice,
          promoPrice: calc.promoUnitPrice,
          discountPerUnit: calc.discountPerUnit,
          applicable: calc.applicable,
          reason: calc.reason,
          removable: targets.productIds.includes(p.id)
            ? () =>
                setTargets((prev) => ({
                  ...prev,
                  productIds: prev.productIds.filter((id) => id !== p.id),
                }))
            : undefined,
        });
      }
    }
    return rows;
  }, [catalogueProducts, targets, discountType, discountValue]);

  const draftInput: PromotionInput = useMemo(
    () => ({
      name,
      description,
      promotionType,
      discountType,
      discountValue: Number(discountValue),
      priority: Number(priority) || 0,
      startDate,
      startTime: startTime || undefined,
      endDate,
      endTime: endTime || undefined,
      targets,
    }),
    [
      name,
      description,
      promotionType,
      discountType,
      discountValue,
      priority,
      startDate,
      startTime,
      endDate,
      endTime,
      targets,
    ]
  );

  const validation = useMemo(() => validatePromotionInput(draftInput), [draftInput]);

  const overlapReport = useMemo(() => {
    if (validation.errors.startDate || validation.errors.endDate || validation.errors.dateRange) {
      return { duplicates: [], overlaps: [] };
    }
    const window = computePromotionWindow(draftInput);
    return detectPromotionOverlaps(
      {
        id: initial?.id,
        discountType,
        discountValue: Number(discountValue) || 0,
        ...window,
        targets,
      },
      existingPromotions
    );
  }, [draftInput, validation.errors, initial?.id, discountType, discountValue, targets, existingPromotions]);

  const toggleProduct = (productId: string) => {
    setTargets((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter((id) => id !== productId)
        : [...prev.productIds, productId],
    }));
  };

  const toggleVariant = (productId: string, variantId: string, label: string) => {
    setTargets((prev) => {
      const exists = prev.variants.some(
        (v) => v.productId === productId && v.variantId === variantId
      );
      return {
        ...prev,
        variants: exists
          ? prev.variants.filter(
              (v) => !(v.productId === productId && v.variantId === variantId)
            )
          : [...prev.variants, { productId, variantId, label }],
      };
    });
  };

  const toggleCategory = (categoryId: string) => {
    setTargets((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(categoryId)
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...prev.categoryIds, categoryId],
    }));
  };

  const toggleBrand = (brandKey: string) => {
    setTargets((prev) => ({
      ...prev,
      brandKeys: prev.brandKeys.includes(brandKey)
        ? prev.brandKeys.filter((k) => k !== brandKey)
        : [...prev.brandKeys, brandKey],
    }));
  };

  const handleSave = async (saveAsDraft: boolean) => {
    setSubmitError(null);
    if (!validation.valid) {
      const firstErr = Object.values(validation.errors)[0];
      setSubmitError(firstErr || "Please review all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: PromotionInput = {
        ...draftInput,
        status: saveAsDraft ? "draft" : "active",
      };
      const targetShopArg = isSuperAdminMode ? shopId : undefined;
      const res = initial
        ? await promotionApi.update(initial.id, payload, targetShopArg)
        : await promotionApi.create(payload, targetShopArg);
      onSaved(res.promotion);
    } catch (err: any) {
      if (err instanceof PromotionClientError && err.details) {
        const msg = Object.values(err.details)[0] || err.message;
        setSubmitError(msg);
      } else {
        setSubmitError(err?.message || "Failed to save promotion.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-[#0e1017] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Top Bar */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">
              {initial ? `Edit Promotion — ${initial.name}` : "Create Promotion"}
            </h2>
            <p className="text-[11px] text-zinc-400">
              Shop: {shopId} • Timezone: Asia/Colombo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5-Section Stepper */}
        <div className="px-5 py-2.5 border-b border-white/10 bg-black/30 flex items-center gap-1 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setStep(s.step)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                step === s.step
                  ? "bg-orange-500 text-zinc-950 font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span className="font-mono text-[10px]">{s.step}.</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {submitError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* SECTION 1: BASIC INFO */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Promotion Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Year-End Smartphone Offer"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white"
                />
                {validation.errors.name && name !== "" && (
                  <p className="text-[11px] text-rose-400 mt-1">{validation.errors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional internal or cashier reference notes..."
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Promotion Type
                  </label>
                  <select
                    value={promotionType}
                    onChange={(e) => setPromotionType(e.target.value as PromotionType)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white"
                  >
                    {Object.entries(PROMO_TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Conflict Priority (0 – 1000)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Highest discount wins automatically; priority breaks ties when two promotions yield the exact same discount.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: DISCOUNT CONFIGURATION */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    {
                      id: "percentage",
                      title: "Percentage Off",
                      sub: "e.g. 5%, 10%, 25% off",
                    },
                    {
                      id: "fixed_amount",
                      title: "Fixed Amount Off",
                      sub: "e.g. LKR 500 off",
                    },
                    {
                      id: "special_price",
                      title: "Special Selling Price",
                      sub: "Set fixed promotional LKR",
                    },
                  ] as { id: PromotionDiscountType; title: string; sub: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setDiscountType(opt.id);
                      if (opt.id === "special_price") {
                        // Clear category/brand targets when switching to special_price
                        setTargets((prev) => ({
                          ...prev,
                          categoryIds: [],
                          brandKeys: [],
                        }));
                      }
                    }}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      discountType === opt.id
                        ? "bg-orange-500/15 border-orange-500/45 text-white"
                        : "bg-black/35 border-white/10 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <div className="font-bold text-xs">{opt.title}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  {discountType === "percentage"
                    ? "Percentage Discount (%) *"
                    : discountType === "fixed_amount"
                    ? "Fixed Discount Amount (LKR) *"
                    : "Promotional Selling Price (LKR) *"}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-48 px-3 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white font-mono font-bold"
                  />
                  {discountType === "percentage" && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[5, 10, 15, 20, 25, 50].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDiscountValue(String(pct))}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 font-mono text-[11px] text-zinc-300 cursor-pointer"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {validation.errors.discountValue && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    {validation.errors.discountValue}
                  </p>
                )}
              </div>

              {/* Sample calculation preview */}
              <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between">
                <span className="text-zinc-400">
                  Sample on a {formatLKR(10000)} item:
                </span>
                {(() => {
                  const sample = calculateUnitDiscount(
                    discountType,
                    Number(discountValue) || 0,
                    10000
                  );
                  return sample.applicable ? (
                    <span className="font-mono">
                      <span className="text-zinc-500 line-through mr-2">
                        {formatLKR(10000)}
                      </span>
                      <strong className="text-emerald-300">
                        {formatLKR(sample.promoUnitPrice)}
                      </strong>{" "}
                      <span className="text-zinc-400">
                        (-{formatLKR(sample.discountPerUnit)})
                      </span>
                    </span>
                  ) : (
                    <span className="text-zinc-500">{sample.reason}</span>
                  );
                })()}
              </div>
            </div>
          )}

          {/* SECTION 3: PRODUCT / VARIANT / CATEGORY / BRAND SELECTOR */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 w-fit">
                  <button
                    type="button"
                    onClick={() => setSelectorTab("products")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                      selectorTab === "products"
                        ? "bg-white/15 text-white font-semibold"
                        : "text-zinc-400"
                    }`}
                  >
                    Products & Variants ({targets.productIds.length + targets.variants.length})
                  </button>
                  <button
                    type="button"
                    disabled={discountType === "special_price"}
                    onClick={() => setSelectorTab("categories")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 ${
                      selectorTab === "categories"
                        ? "bg-white/15 text-white font-semibold"
                        : "text-zinc-400"
                    }`}
                  >
                    Categories ({targets.categoryIds.length})
                  </button>
                  <button
                    type="button"
                    disabled={discountType === "special_price"}
                    onClick={() => setSelectorTab("brands")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 ${
                      selectorTab === "brands"
                        ? "bg-white/15 text-white font-semibold"
                        : "text-zinc-400"
                    }`}
                  >
                    Brands ({targets.brandKeys.length})
                  </button>
                </div>

                {selectorTab === "products" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTargets((prev) => ({
                          ...prev,
                          productIds: Array.from(
                            new Set([
                              ...prev.productIds,
                              ...filteredCatalogue.map((p) => p.id),
                            ])
                          ),
                        }))
                      }
                      className="text-[11px] text-orange-300 hover:underline cursor-pointer"
                    >
                      Select visible ({filteredCatalogue.length})
                    </button>
                    <span className="text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={() =>
                        setTargets({
                          productIds: [],
                          variants: [],
                          categoryIds: [],
                          brandKeys: [],
                        })
                      }
                      className="text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {loadingCatalogue ? (
                <div className="p-8 text-center text-zinc-500">
                  Loading shop catalogue...
                </div>
              ) : selectorTab === "products" ? (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={prodQuery}
                      onChange={(e) => setProdQuery(e.target.value)}
                      placeholder="Search shop products by name, SKU, or barcode..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white"
                    />
                  </div>

                  <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/[0.06] bg-black/30">
                    {filteredCatalogue.length === 0 ? (
                      <div className="p-6 text-center text-zinc-500">
                        No matching products in this shop.
                      </div>
                    ) : (
                      filteredCatalogue.map((prod) => {
                        const checked = targets.productIds.includes(prod.id);
                        const calc = calculateUnitDiscount(
                          discountType,
                          Number(discountValue) || 0,
                          prod.sellingPrice
                        );
                        const isExpanded = expandedVariantProductId === prod.id;

                        return (
                          <div key={prod.id} className="p-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleProduct(prod.id)}
                                  className="accent-orange-500 w-3.5 h-3.5 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-white truncate">
                                    {prod.name}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 truncate">
                                    SKU: {prod.sku || "—"} • {prod.categoryName}
                                    {prod.brand ? ` • ${prod.brand}` : ""}
                                  </div>
                                </div>
                              </label>

                              <div className="flex items-center gap-2.5 shrink-0">
                                {prod.variants.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedVariantProductId(
                                        isExpanded ? null : prod.id
                                      )
                                    }
                                    className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] text-zinc-300 cursor-pointer"
                                  >
                                    {prod.variants.length} variants
                                  </button>
                                )}
                                <div className="text-right font-mono text-[11px]">
                                  <span className="text-zinc-500 line-through mr-1.5">
                                    {formatLKR(prod.sellingPrice)}
                                  </span>
                                  <span className="text-emerald-300 font-bold">
                                    {formatLKR(calc.promoUnitPrice)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {isExpanded && prod.variants.length > 0 && (
                              <div className="mt-2 pl-6 space-y-1.5 border-l border-white/10">
                                {prod.variants.map((v) => {
                                  const vChecked = targets.variants.some(
                                    (tv) =>
                                      tv.productId === prod.id && tv.variantId === v.id
                                  );
                                  const vCalc = calculateUnitDiscount(
                                    discountType,
                                    Number(discountValue) || 0,
                                    v.sellingPrice
                                  );
                                  return (
                                    <label
                                      key={v.id}
                                      className="flex items-center justify-between text-[11px] cursor-pointer py-0.5"
                                    >
                                      <span className="flex items-center gap-2 text-zinc-300">
                                        <input
                                          type="checkbox"
                                          checked={vChecked}
                                          onChange={() =>
                                            toggleVariant(prod.id, v.id, v.label)
                                          }
                                          className="accent-orange-500 w-3.5 h-3.5"
                                        />
                                        <span>{v.label}</span>
                                        <span className="text-zinc-500 font-mono">
                                          ({v.sku})
                                        </span>
                                      </span>
                                      <span className="font-mono">
                                        <span className="text-zinc-500 line-through mr-1.5">
                                          {formatLKR(v.sellingPrice)}
                                        </span>
                                        <span className="text-emerald-300 font-semibold">
                                          {formatLKR(vCalc.promoUnitPrice)}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : selectorTab === "categories" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                  {catalogueCategories.map((c) => {
                    const checked = targets.categoryIds.includes(c.categoryId);
                    return (
                      <label
                        key={c.categoryId}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${
                          checked
                            ? "bg-orange-500/15 border-orange-500/40 text-white"
                            : "bg-black/30 border-white/10 text-zinc-300"
                        }`}
                      >
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-[10px] text-zinc-400">
                            {c.productCount} products
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(c.categoryId)}
                          className="accent-orange-500 w-4 h-4"
                        />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                  {catalogueBrands.map((b) => {
                    const checked = targets.brandKeys.includes(b.brandKey);
                    return (
                      <label
                        key={b.brandKey}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${
                          checked
                            ? "bg-orange-500/15 border-orange-500/40 text-white"
                            : "bg-black/30 border-white/10 text-zinc-300"
                        }`}
                      >
                        <div>
                          <div className="font-semibold">{b.name}</div>
                          <div className="text-[10px] text-zinc-400">
                            {b.productCount} products
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBrand(b.brandKey)}
                          className="accent-orange-500 w-4 h-4"
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Selected Products Preview Table (Original vs Promotional Price) */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-zinc-300">
                  Selected Items Price Preview ({previewRows.length} matched)
                </div>
                {previewRows.length === 0 ? (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-zinc-500">
                    Select products, variants, categories, or brands above to preview promotional prices.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/[0.06] bg-black/25">
                    {previewRows.slice(0, 80).map((row) => (
                      <div
                        key={row.key}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="min-w-0">
                          <span className="text-zinc-200 font-medium truncate">
                            {row.label}
                          </span>
                          {row.sku && (
                            <span className="ml-2 text-zinc-500 font-mono">
                              {row.sku}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 font-mono">
                          <span className="text-zinc-500 line-through">
                            {formatLKR(row.originalPrice)}
                          </span>
                          {row.applicable ? (
                            <span className="text-emerald-300 font-bold">
                              {formatLKR(row.promoPrice)}
                            </span>
                          ) : (
                            <span className="text-amber-300 text-[10px]">
                              {row.reason}
                            </span>
                          )}
                          {row.removable && (
                            <button
                              type="button"
                              onClick={row.removable}
                              className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                              title="Remove from promotion"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 4: SCHEDULING (ASIA/COLOMBO) */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.07] text-[11px] text-zinc-300">
                All dates and optional times are interpreted in{" "}
                <strong className="text-white">Asia/Colombo (UTC+05:30)</strong> and validated on the server. Promotions automatically activate at start and expire at end.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Start Time (Optional, default 00:00)
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    End Time (Optional, default 23:59)
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
              </div>

              {validation.errors.dateRange && (
                <p className="text-xs text-rose-400">{validation.errors.dateRange}</p>
              )}
            </div>
          )}

          {/* SECTION 5: REVIEW & PUBLISH */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.08] space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Name</span>
                  <strong className="text-white">{name || "—"}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Type & Priority</span>
                  <span className="text-zinc-200">
                    {PROMO_TYPE_LABELS[promotionType]} • Priority {priority || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Discount</span>
                  <strong className="text-orange-300 font-mono">
                    {describeDiscount(discountType, Number(discountValue) || 0)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Schedule (Asia/Colombo)</span>
                  <span className="font-mono text-zinc-200">
                    {startDate} {startTime || "00:00"} → {endDate}{" "}
                    {endTime || "23:59"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Matched Catalogue Items</span>
                  <span className="font-mono text-emerald-300">
                    {previewRows.length} items
                  </span>
                </div>
              </div>

              {overlapReport.duplicates.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200">
                  Duplicate blocked: An identical promotion (&ldquo;
                  {overlapReport.duplicates[0].name}&rdquo;) already covers the exact same items, discount, and schedule.
                </div>
              )}

              {overlapReport.overlaps.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                  Note: Overlaps with {overlapReport.overlaps.length} existing promotion(s) (
                  {overlapReport.overlaps.map((o) => o.name).join(", ")}). Discounts will not stack — POS will automatically apply the highest valid discount (using Priority on ties).
                </div>
              )}

              {!validation.valid && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-1">
                  <div className="font-bold">Please resolve before publishing:</div>
                  <ul className="list-disc pl-4">
                    {Object.values(validation.errors).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 flex items-center justify-between gap-2 bg-black/30">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-white/5 text-xs font-medium text-zinc-300 cursor-pointer"
            >
              Cancel
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={submitting || !validation.valid}
                  onClick={() => handleSave(true)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer disabled:opacity-40"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={
                    submitting ||
                    !validation.valid ||
                    overlapReport.duplicates.length > 0
                  }
                  onClick={() => handleSave(false)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer disabled:opacity-40"
                >
                  {submitting
                    ? "Saving..."
                    : initial
                    ? "Save & Publish"
                    : "Publish Promotion"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PROMOTION DETAILS & PERFORMANCE ANALYTICS MODAL
// ============================================================================

function PromotionDetailsModal({
  shopId,
  promotion,
  stats,
  onClose,
}: {
  shopId: string;
  promotion: Promotion;
  stats?: PromotionStats;
  onClose: () => void;
}) {
  const [usages, setUsages] = useState<PromotionUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchPromotionUsages(shopId, promotion.id)
      .then((list) => {
        if (active) setUsages(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shopId, promotion.id]);

  const badge = STATUS_BADGE[promotion.status];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0e1017] border border-white/10 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">{promotion.name}</h3>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {describeDiscount(promotion.discountType, promotion.discountValue)} • Priority{" "}
              {promotion.priority} • Version v{promotion.version}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Analytics Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="text-[10px] text-zinc-400">Usage Count</div>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {stats?.usageCount || 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="text-[10px] text-zinc-400">Units Sold</div>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {stats?.unitsSold || 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="text-[10px] text-zinc-400">Total Discount</div>
              <div className="text-base font-bold font-mono text-amber-300 mt-0.5">
                {formatLKR(stats?.totalDiscountAmount || 0)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="text-[10px] text-zinc-400">Revenue Generated</div>
              <div className="text-base font-bold font-mono text-emerald-300 mt-0.5">
                {formatLKR(stats?.revenueGenerated || 0)}
              </div>
            </div>
          </div>

          {/* Schedule & Targets */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-1.5">
            <div className="flex justify-between">
              <span className="text-zinc-400">Window (Asia/Colombo)</span>
              <span className="font-mono text-zinc-200">
                {formatColomboDateTime(promotion.startAt)} →{" "}
                {formatColomboDateTime(promotion.endAt)}
              </span>
            </div>
            {promotion.description && (
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400 shrink-0">Description</span>
                <span className="text-zinc-200 text-right">{promotion.description}</span>
              </div>
            )}
            <div className="pt-1.5 border-t border-white/[0.06] flex flex-wrap gap-1.5">
              {(promotion.targetLabels?.products || []).map((p) => (
                <span
                  key={p.productId}
                  className="px-2 py-0.5 rounded bg-white/[0.05] text-[10px] text-zinc-300"
                >
                  {p.name}
                </span>
              ))}
              {(promotion.targetLabels?.categories || []).map((c) => (
                <span
                  key={c.categoryId}
                  className="px-2 py-0.5 rounded bg-sky-500/15 text-[10px] text-sky-300"
                >
                  Category: {c.name}
                </span>
              ))}
              {(promotion.targetLabels?.brands || []).map((b) => (
                <span
                  key={b.brandKey}
                  className="px-2 py-0.5 rounded bg-orange-500/15 text-[10px] text-orange-300"
                >
                  Brand: {b.name}
                </span>
              ))}
            </div>
          </div>

          {/* Invoice Usage Ledger */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Completed Sales Using This Promotion ({usages.length})
            </h4>
            {loading ? (
              <div className="p-4 text-zinc-500">Loading usage records...</div>
            ) : usages.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-zinc-500">
                No completed sales have used this promotion yet.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/[0.06]">
                {usages.map((u) => (
                  <div
                    key={u.id}
                    className="px-3.5 py-2.5 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <span className="font-mono font-bold text-white">
                        {u.invoiceNumber}
                      </span>
                      <span className="text-zinc-500 ml-2">
                        {u.unitsSold} units • v{u.promotionVersion}
                      </span>
                    </div>
                    <div className="font-mono text-right">
                      <span className="text-amber-300 mr-3">
                        -{formatLKR(u.discountTotal)}
                      </span>
                      <span className="text-emerald-300 font-semibold">
                        {formatLKR(u.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
