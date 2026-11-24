"use client";

/**
 * app/sa-9x8f2k/subscriptions/page.tsx
 *
 * Modern, Clean, Task-Oriented Root Subscription & Entitlement Studio.
 * - Full-width natural page layout (zero clipped panes or wrapped stepper boxes)
 * - 1-click inline Founding Customer toggle, Quick Plan & Quota Drawer, Live Feature Toggles
 * - iOS Message Delivery Composer when suspending a shop (delivers an authentic iOS iMessage
 *   notification banner & lock screen to the suspended shop in real time)
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  CreditCard,
  Plus,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  Building2,
  Users,
  Sliders,
  DollarSign,
  RefreshCw,
  Crown,
  Check,
  X,
  Edit3,
  Trash2,
  Play,
  PauseCircle,
  History,
  Layers,
  Lock,
  Unlock,
  MessageCircle,
  CheckCheck,
  Wallet,
  Receipt,
  Store,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Shop } from "@/lib/types/shop";
import { subscribeToShops } from "@/lib/services/shopService";
import {
  SubscriptionPlan,
  ShopSubscription,
  BillingCycle,
  SUBSCRIPTION_FEATURE_CATALOG,
  SubscriptionPaymentRecord,
  SubscriptionLifecycleEvent,
} from "@/lib/types/subscription";
import {
  subscribeToSubscriptionPlans,
  saveSubscriptionPlan,
  deleteSubscriptionPlan,
  buildDefaultShopSubscription,
  runAutomatedSubscriptionLifecycleSweep,
  recordShopSubscriptionPayment,
  setShopSubscriptionStatus,
  updateShopSubscriptionConfiguration,
  toggleShopFeatureEntitlement,
  calculateAndSyncShopResourceUsage,
  getShopSubscriptionPayments,
  getShopSubscriptionEvents,
} from "@/lib/services/subscriptionService";

type ActiveView = "shops" | "plans";
type ShopStatusFilter = "all" | "active" | "grace_period" | "suspended" | "founding";

export default function RootSubscriptionsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>("shops");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShopStatusFilter>("all");

  // Modals State
  const [managingShopId, setManagingShopId] = useState<string | null>(null);
  const [paymentModalShop, setPaymentModalShop] = useState<Shop | null>(null);
  const [suspendingShop, setSuspendingShop] = useState<Shop | null>(null);
  const [editingPlan, setEditingPlan] = useState<Partial<SubscriptionPlan> | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const [isRunningSweep, setIsRunningSweep] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "info" | "warning" } | null>(
    null
  );

  const showToast = (text: string, type: "success" | "info" | "warning" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const u1 = subscribeToSubscriptionPlans(setPlans);
    const u2 = subscribeToShops((list) => {
      setShops(list);
      setLoading(false);
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const [initialSweepDone, setInitialSweepDone] = useState(false);
  useEffect(() => {
    if (!initialSweepDone && shops.length > 0 && plans.length > 0) {
      setInitialSweepDone(true);
      runAutomatedSubscriptionLifecycleSweep(shops, plans).catch(() => {});
    }
  }, [initialSweepDone, shops, plans]);

  const defaultPlan = useMemo(
    () => plans.find((p) => p.isDefault) || plans[0],
    [plans]
  );

  const shopsWithSubscriptions = useMemo(() => {
    return shops.map((shop) => {
      const sub: ShopSubscription =
        shop.subscription || buildDefaultShopSubscription(shop, defaultPlan);
      return { shop, sub };
    });
  }, [shops, defaultPlan]);

  const filteredShops = useMemo(() => {
    return shopsWithSubscriptions.filter(({ shop, sub }) => {
      if (statusFilter === "active" && sub.status !== "active" && sub.status !== "trial")
        return false;
      if (statusFilter === "grace_period" && sub.status !== "grace_period") return false;
      if (statusFilter === "suspended" && sub.status !== "suspended") return false;
      if (statusFilter === "founding" && !sub.isFoundingCustomer) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        shop.shopId.toLowerCase().includes(q) ||
        shop.shopName.toLowerCase().includes(q) ||
        shop.ownerName.toLowerCase().includes(q) ||
        sub.planName.toLowerCase().includes(q)
      );
    });
  }, [shopsWithSubscriptions, statusFilter, searchQuery]);

  const managingShopEntry = useMemo(
    () => shopsWithSubscriptions.find((x) => x.shop.shopId === managingShopId) || null,
    [shopsWithSubscriptions, managingShopId]
  );

  const kpis = useMemo(() => {
    let mrr = 0;
    let activeCount = 0;
    let graceCount = 0;
    let suspendedCount = 0;
    let foundingCount = 0;
    let totalCollected = 0;

    for (const { sub } of shopsWithSubscriptions) {
      if (sub.status === "active" || sub.status === "trial") {
        activeCount++;
        mrr +=
          sub.billingCycle === "annual"
            ? Math.round(sub.effectiveBillingAmount / 12)
            : sub.effectiveBillingAmount;
      } else if (sub.status === "grace_period") {
        graceCount++;
        mrr +=
          sub.billingCycle === "annual"
            ? Math.round(sub.effectiveBillingAmount / 12)
            : sub.effectiveBillingAmount;
      } else if (sub.status === "suspended") {
        suspendedCount++;
      }
      if (sub.isFoundingCustomer) foundingCount++;
      totalCollected += sub.totalPaidAmount || 0;
    }

    return {
      mrr,
      activeCount,
      graceCount,
      suspendedCount,
      foundingCount,
      totalCollected,
      currency: defaultPlan?.currency || "LKR",
    };
  }, [shopsWithSubscriptions, defaultPlan]);

  const handleRunLifecycleSweep = async () => {
    setIsRunningSweep(true);
    try {
      const report = await runAutomatedSubscriptionLifecycleSweep(shops, plans);
      showToast(
        `Checked ${report.checkedCount} shops: ${report.transitionedToGrace.length} grace, ${report.autoSuspended.length} suspended.`,
        report.autoSuspended.length > 0 ? "warning" : "success"
      );
    } finally {
      setIsRunningSweep(false);
    }
  };

  return (
    <AppShell defaultSectionId="payments">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-zinc-900/95 border border-orange-500/40 text-xs text-orange-100 shadow-2xl flex items-center gap-2 backdrop-blur-xl">
          <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
          <span className="font-medium">{toast.text}</span>
        </div>
      )}

      {/* Full-Width Natural Scroll Container */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {/* ── Top Bar ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Subscription Studio
                </h1>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 font-semibold">
                  Isolated by ShopID
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Manage shop plans, Founding Customer pricing, storage/branch/user limits, feature toggles, and iOS suspension alerts
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-black/50 border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveView("shops")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeView === "shops"
                    ? "bg-orange-500 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Shops ({shops.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView("plans")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeView === "plans"
                    ? "bg-orange-500 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Plans & Pricing ({plans.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleRunLifecycleSweep}
              disabled={isRunningSweep}
              className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-orange-400 ${isRunningSweep ? "animate-spin" : ""}`}
              />
              <span>Auto-Sweep</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingPlan({
                  name: "",
                  code: "",
                  currency: defaultPlan?.currency || "LKR",
                  monthlyPrice: 7500,
                  annualPrice: 75000,
                  foundingCustomerMonthlyPrice: 4500,
                  foundingCustomerAnnualPrice: 45000,
                  foundingOfferLabel: "40% Founding Customer Lifetime Rate",
                  defaultGracePeriodDays: 7,
                  limits: {
                    maxStorageMB: 2048,
                    maxBranches: 3,
                    maxUsers: 10,
                    maxWhatsappReceiptsPerMonth: 1000,
                  },
                  features: Object.fromEntries(
                    SUBSCRIPTION_FEATURE_CATALOG.map((f) => [f.key, true])
                  ),
                });
                setIsPlanModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-orange-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>New Plan</span>
            </button>
          </div>
        </div>

        {/* ── 4 Clean KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => {
              setActiveView("shops");
              setStatusFilter("all");
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              statusFilter === "all" && activeView === "shops"
                ? "bg-white/[0.06] border-orange-500/40"
                : "bg-white/[0.025] hover:bg-white/[0.04] border-white/[0.07]"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Monthly Recurring (MRR)</span>
              <DollarSign className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-xl font-black font-mono text-white mt-1.5">
              {kpis.currency} {kpis.mrr.toLocaleString()}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
              <span>Collected: {kpis.currency} {kpis.totalCollected.toLocaleString()}</span>
              <span className="text-orange-300 font-semibold">{shops.length} Shops</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView("shops");
              setStatusFilter("active");
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              statusFilter === "active" && activeView === "shops"
                ? "bg-emerald-500/15 border-emerald-500/45"
                : "bg-emerald-500/[0.05] hover:bg-emerald-500/10 border-emerald-500/20"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-emerald-300">
              <span>Active Subscriptions</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black font-mono text-emerald-300 mt-1.5">
              {kpis.activeCount}
            </div>
            <div className="text-[11px] text-emerald-400/75 mt-1">
              In good billing standing
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView("shops");
              setStatusFilter(kpis.suspendedCount > 0 ? "suspended" : "grace_period");
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              (statusFilter === "grace_period" || statusFilter === "suspended") &&
              activeView === "shops"
                ? "bg-amber-500/15 border-amber-500/45"
                : "bg-amber-500/[0.05] hover:bg-amber-500/10 border-amber-500/20"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-amber-300">
              <span>Grace Period / Suspended</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black font-mono text-white mt-1.5 flex items-center gap-2">
              <span className="text-amber-300">{kpis.graceCount} Grace</span>
              <span className="text-zinc-600">/</span>
              <span className="text-rose-400">{kpis.suspendedCount} Susp.</span>
            </div>
            <div className="text-[11px] text-amber-300/75 mt-1">
              iOS message delivered on suspend
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView("shops");
              setStatusFilter("founding");
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              statusFilter === "founding" && activeView === "shops"
                ? "bg-orange-500/20 border-orange-500/50"
                : "bg-orange-500/[0.07] hover:bg-orange-500/12 border-orange-500/25"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-orange-300">
              <span>Founding Customers</span>
              <Crown className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-xl font-black font-mono text-orange-300 mt-1.5">
              {kpis.foundingCount} Shops
            </div>
            <div className="text-[11px] text-orange-300/75 mt-1">
              Locked-in lifetime discount
            </div>
          </button>
        </div>

        {/* ========================================================================
            VIEW 1: MODERN, CLEAN SHOP SUBSCRIPTIONS WORKSPACE
           ======================================================================== */}
        {activeView === "shops" && (
          <div className="space-y-4">
            {/* Search & Filter Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.08]">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by shopId, shop name, owner, or plan..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/50"
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

              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { id: "all", label: "All Shops" },
                    { id: "active", label: "Active" },
                    { id: "grace_period", label: "Grace Period" },
                    { id: "suspended", label: "Suspended" },
                    { id: "founding", label: "Founding Rate" },
                  ] as { id: ShopStatusFilter; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === tab.id
                        ? "bg-orange-500 text-zinc-950 font-bold"
                        : "bg-white/[0.04] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clean Task-Oriented Shop Cards */}
            {loading ? (
              <div className="p-12 text-center text-xs text-zinc-500">
                Loading isolated shop subscriptions...
              </div>
            ) : filteredShops.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/[0.07] text-xs text-zinc-400">
                No shops match the current filter.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredShops.map(({ shop, sub }) => {
                  const enabledFeaturesCount = SUBSCRIPTION_FEATURE_CATALOG.filter(
                    (f) => sub.effectiveFeatures?.[f.key] !== false
                  ).length;
                  const activePlan =
                    plans.find((p) => p.planId === sub.planId) || defaultPlan;

                  return (
                    <div
                      key={shop.shopId}
                      className="p-5 rounded-2xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.08] transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4"
                    >
                      {/* Left: Shop Name, ShopID, Status & 1-Click Founding Rate Pill */}
                      <div className="space-y-2 min-w-[260px]">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-base font-bold text-white">{shop.shopName}</h3>
                          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-md bg-white/[0.07] border border-white/[0.12] text-orange-300 font-bold">
                            {shop.shopId}
                          </span>

                          {sub.status === "active" || sub.status === "trial" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              ACTIVE
                            </span>
                          ) : sub.status === "grace_period" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              <Clock className="w-3 h-3" />
                              GRACE PERIOD
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              <XCircle className="w-3 h-3" />
                              SUSPENDED
                            </span>
                          )}

                          {/* 1-Click Founding Customer Pricing Toggle Pill */}
                          <button
                            type="button"
                            onClick={async () => {
                              if (!activePlan) return;
                              const nextFounding = !sub.isFoundingCustomer;
                              await updateShopSubscriptionConfiguration({
                                shop,
                                plan: activePlan,
                                isFoundingCustomer: nextFounding,
                              });
                              showToast(
                                `${nextFounding ? "Enabled" : "Disabled"} Founding Customer pricing for ${shop.shopId}.`,
                                "info"
                              );
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                              sub.isFoundingCustomer
                                ? "bg-orange-500/20 text-orange-300 border-orange-500/45"
                                : "bg-white/[0.04] text-zinc-400 hover:text-white border-white/10"
                            }`}
                            title="Click to toggle Founding Customer Lifetime Rate"
                          >
                            <Crown className="w-3 h-3 text-orange-400" />
                            <span>
                              {sub.isFoundingCustomer ? "Founding Rate Locked" : "Enable Founding Rate"}
                            </span>
                          </button>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                          <span>Owner: <strong className="text-zinc-200">{shop.ownerName}</strong></span>
                          <span>•</span>
                          <span>
                            Plan: <strong className="text-white">{sub.planName}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Billing:{" "}
                            <strong className="text-orange-300 font-mono">
                              {sub.currency} {sub.effectiveBillingAmount.toLocaleString()}/
                              {sub.billingCycle === "annual" ? "yr" : "mo"}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            Due:{" "}
                            <strong className="text-zinc-200 font-mono">
                              {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Middle: Clean Single-Line Quota Pills */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.07] text-xs font-mono text-zinc-200">
                          <HardDrive className="w-3.5 h-3.5 text-orange-400" />
                          <span>
                            {sub.usage?.storageUsedMB || 0} /{" "}
                            {sub.limits.maxStorageMB === -1 ? "∞" : `${sub.limits.maxStorageMB} MB`}
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.07] text-xs font-mono text-zinc-200">
                          <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>
                            {sub.usage?.branchCount || 1} /{" "}
                            {sub.limits.maxBranches === -1 ? "∞" : sub.limits.maxBranches} Branches
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.07] text-xs font-mono text-zinc-200">
                          <Users className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            {sub.usage?.userCount ?? shop.staffCount ?? 1} /{" "}
                            {sub.limits.maxUsers === -1 ? "∞" : sub.limits.maxUsers} Users
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.07] text-xs font-mono text-zinc-200">
                          <Sliders className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {enabledFeaturesCount}/{SUBSCRIPTION_FEATURE_CATALOG.length} Features
                          </span>
                        </span>
                      </div>

                      {/* Right: Clean Task Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPaymentModalShop(shop)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/15 cursor-pointer"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Record Payment</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setManagingShopId(shop.shopId)}
                          className="px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.12] text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5 text-orange-400" />
                          <span>Manage Plan & Features</span>
                        </button>

                        {sub.status === "suspended" ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await setShopSubscriptionStatus({
                                shop,
                                newStatus: "active",
                                reason: "Your Skyfox POS subscription has been reactivated by Root Administration.",
                              });
                              showToast(`Reactivated ${shop.shopName} (${shop.shopId}).`);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Reactivate</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSuspendingShop(shop)}
                            className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                            title="Suspend shop and deliver real-time iOS Message alert"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================
            VIEW 2: SUBSCRIPTION PLANS & FOUNDING CUSTOMER PRICING
           ======================================================================== */}
        {activeView === "plans" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const enabledCount = SUBSCRIPTION_FEATURE_CATALOG.filter(
                (f) => plan.features?.[f.key] !== false
              ).length;
              const subscribedCount = shopsWithSubscriptions.filter(
                ({ sub }) => sub.planId === plan.planId
              ).length;

              return (
                <div
                  key={plan.planId}
                  className={`p-5 rounded-2xl border flex flex-col justify-between space-y-5 ${
                    plan.isDefault
                      ? "bg-gradient-to-b from-orange-500/[0.09] to-white/[0.02] border-orange-500/40"
                      : "bg-white/[0.03] border-white/[0.08]"
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white">{plan.name}</h3>
                          {plan.badgeText && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              {plan.badgeText}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">{plan.description}</p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10 shrink-0">
                        {subscribedCount} {subscribedCount === 1 ? "shop" : "shops"}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.07] space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-zinc-400">Standard Monthly</span>
                        <span className="text-base font-black font-mono text-white">
                          {plan.currency} {plan.monthlyPrice.toLocaleString()}/mo
                        </span>
                      </div>
                      <div className="pt-2 border-t border-dashed border-white/10 flex items-baseline justify-between">
                        <span className="text-xs font-semibold text-orange-300 flex items-center gap-1">
                          <Crown className="w-3.5 h-3.5 text-orange-400" />
                          Founding Rate
                        </span>
                        <span className="text-base font-black font-mono text-orange-400">
                          {plan.currency} {plan.foundingCustomerMonthlyPrice.toLocaleString()}/mo
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] text-zinc-400">Storage Limit</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {plan.limits.maxStorageMB === -1 ? "Unlimited" : `${plan.limits.maxStorageMB} MB`}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] text-zinc-400">Branch Limit</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {plan.limits.maxBranches === -1 ? "Unlimited" : `${plan.limits.maxBranches} Branches`}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] text-zinc-400">User Limit</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {plan.limits.maxUsers === -1 ? "Unlimited" : `${plan.limits.maxUsers} Users`}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] text-zinc-400">Features</div>
                        <div className="font-mono font-bold text-emerald-300 mt-0.5">
                          {enabledCount}/{SUBSCRIPTION_FEATURE_CATALOG.length} Enabled
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlan(plan);
                        setIsPlanModalOpen(true);
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-orange-400" />
                      <span>Edit Plan & Pricing</span>
                    </button>
                    {plans.length > 1 && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm(`Delete plan "${plan.name}"?`)) {
                            await deleteSubscriptionPlan(plan.planId);
                            showToast(`Deleted plan "${plan.name}".`, "info");
                          }
                        }}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================
          MODAL 1: SPACIOUS SHOP PLAN, QUOTAS & LIVE FEATURE SWITCHBOARD DRAWER
         ======================================================================== */}
      {managingShopEntry && (
        <ManageShopSubscriptionModal
          shop={managingShopEntry.shop}
          sub={managingShopEntry.sub}
          plans={plans}
          onClose={() => setManagingShopId(null)}
          onNotify={(msg) => showToast(msg)}
        />
      )}

      {/* ========================================================================
          MODAL 2: iOS MESSAGE DELIVERY SUSPENSION COMPOSER
         ======================================================================== */}
      {suspendingShop && (
        <IOSSuspensionComposerModal
          shop={suspendingShop}
          onClose={() => setSuspendingShop(null)}
          onSuspended={(msg) => {
            showToast(msg, "warning");
            setSuspendingShop(null);
          }}
        />
      )}

      {/* ========================================================================
          MODAL 3: RECORD MONTHLY PAYMENT & AUTO-REACTIVATION
         ======================================================================== */}
      {paymentModalShop && (
        <RecordPaymentModal
          shop={paymentModalShop}
          onClose={() => setPaymentModalShop(null)}
          onPaymentRecorded={(msg) => {
            showToast(msg);
            setPaymentModalShop(null);
          }}
        />
      )}

      {/* ========================================================================
          MODAL 4: PLAN EDITOR MODAL
         ======================================================================== */}
      {isPlanModalOpen && editingPlan && (
        <PlanEditorModal
          initialPlan={editingPlan}
          onClose={() => {
            setIsPlanModalOpen(false);
            setEditingPlan(null);
          }}
          onSave={async (planData) => {
            const saved = await saveSubscriptionPlan(planData);
            showToast(`Saved plan "${saved.name}".`);
            setIsPlanModalOpen(false);
            setEditingPlan(null);
          }}
        />
      )}
    </AppShell>
  );
}

// ============================================================================
// SUB-COMPONENT 1: iOS MESSAGE DELIVERY SUSPENSION COMPOSER MODAL
// ============================================================================

function IOSSuspensionComposerModal({
  shop,
  onClose,
  onSuspended,
}: {
  shop: Shop;
  onClose: () => void;
  onSuspended: (msg: string) => void;
}) {
  const sub = shop.subscription;
  const presets = [
    `Hello ${shop.ownerName || shop.shopName}, your monthly Skyfox POS subscription for ${shop.shopName} (${shop.shopId}) is overdue past the grace period. Please complete your payment to immediately restore terminal access.`,
    `Notice from Skyfox Root Admin: Terminal access for ${shop.shopName} (${shop.shopId}) has been temporarily paused pending account verification.`,
    `Storage or plan limit exceeded on ${shop.shopName} (${shop.shopId}). Please contact Skyfox Root Administration to upgrade your plan.`,
  ];

  const [messageText, setMessageText] = useState(presets[0]);
  const [sending, setSending] = useState(false);

  const handleDeliverAndSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await setShopSubscriptionStatus({
        shop,
        newStatus: "suspended",
        reason: messageText.trim(),
      });
      onSuspended(
        `Delivered iOS suspension message and suspended ${shop.shopName} (${shop.shopId}).`
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <form
        onSubmit={handleDeliverAndSuspend}
        className="w-full max-w-lg rounded-[28px] bg-[#121216] border border-white/15 shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-5 py-4 bg-[#1c1c1e] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-[#34C759] to-[#28a745] flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-white fill-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                iOS Message Delivery & Shop Suspension
              </h3>
              <p className="text-[11px] text-zinc-400">
                To: {shop.shopName} ({shop.shopId})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Live iOS iMessage Bubble Preview */}
          <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-2">
            <div className="text-center text-[10px] text-zinc-500">
              iMessage Preview on {shop.shopId} Terminal
            </div>
            <div className="max-w-[92%] rounded-[20px] rounded-bl-[5px] bg-[#262629] px-4 py-3 text-xs text-white leading-relaxed">
              <div className="font-bold text-orange-400 mb-0.5">
                Subscription Suspended — {shop.shopName}
              </div>
              <div>{messageText}</div>
            </div>
            <div className="flex items-center justify-end gap-1 text-[10px] text-[#0A84FF] font-medium">
              <CheckCheck className="w-3 h-3" />
              <span>Delivered Instantly via Skyfox Real-Time Stream</span>
            </div>
          </div>

          {/* Preset Messages */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-zinc-400">Quick Message Presets</label>
            <div className="flex flex-wrap gap-1.5">
              {["Overdue Payment", "Account Verification", "Quota Exceeded"].map(
                (label, idx) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setMessageText(presets[idx])}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] text-zinc-200 cursor-pointer"
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Custom Message Input */}
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">
              Message Delivered to {shop.shopName} ({shop.shopId})
            </label>
            <textarea
              rows={3}
              required
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full p-3 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-[#0A84FF]"
            />
          </div>
        </div>

        <div className="p-4 bg-[#1c1c1e] border-t border-white/10 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/10 text-xs font-semibold text-zinc-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending}
            className="px-5 py-2 rounded-full bg-[#0A84FF] hover:bg-[#0070e0] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-[#0A84FF]/25"
          >
            <MessageCircle className="w-3.5 h-3.5 fill-white" />
            <span>{sending ? "Delivering..." : "Suspend & Deliver iOS Message"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENT 2: SPACIOUS SHOP PLAN, QUOTAS & LIVE FEATURE SWITCHBOARD MODAL
// ============================================================================

function ManageShopSubscriptionModal({
  shop,
  sub,
  plans,
  onClose,
  onNotify,
}: {
  shop: Shop;
  sub: ShopSubscription;
  plans: SubscriptionPlan[];
  onClose: () => void;
  onNotify: (msg: string) => void;
}) {
  const [tab, setTab] = useState<"quotas" | "features" | "history">("quotas");
  const [planId, setPlanId] = useState(sub.planId);
  const [cycle, setCycle] = useState<BillingCycle>(sub.billingCycle || "monthly");
  const [isFounding, setIsFounding] = useState(Boolean(sub.isFoundingCustomer));
  const [customPrice, setCustomPrice] = useState(
    typeof sub.customPriceOverride === "number" ? String(sub.customPriceOverride) : ""
  );
  const [storageMB, setStorageMB] = useState(String(sub.limits.maxStorageMB));
  const [branchesLimit, setBranchesLimit] = useState(String(sub.limits.maxBranches));
  const [usersLimit, setUsersLimit] = useState(String(sub.limits.maxUsers));
  const [graceDays, setGraceDays] = useState(String(sub.gracePeriodDays ?? 7));
  const [dueDateStr, setDueDateStr] = useState(
    new Date(sub.currentPeriodEnd).toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);
  const [syncingStorage, setSyncingStorage] = useState(false);

  const [payments, setPayments] = useState<SubscriptionPaymentRecord[]>([]);
  const [events, setEvents] = useState<SubscriptionLifecycleEvent[]>([]);

  useEffect(() => {
    if (tab === "history") {
      Promise.all([
        getShopSubscriptionPayments(shop.shopId),
        getShopSubscriptionEvents(shop.shopId),
      ]).then(([p, e]) => {
        setPayments(p);
        setEvents(e);
      });
    }
  }, [tab, shop.shopId]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.planId === planId) || plans[0],
    [plans, planId]
  );

  const handleSaveQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setSaving(true);
    try {
      await updateShopSubscriptionConfiguration({
        shop,
        plan: selectedPlan,
        billingCycle: cycle,
        isFoundingCustomer: isFounding,
        customPriceOverride: customPrice.trim() !== "" ? Number(customPrice) : null,
        gracePeriodDays: Number(graceDays) || 7,
        nextDueDateMs: dueDateStr
          ? new Date(`${dueDateStr}T23:59:59`).getTime()
          : sub.currentPeriodEnd,
        limitOverrides: {
          maxStorageMB: Number(storageMB),
          maxBranches: Number(branchesLimit),
          maxUsers: Number(usersLimit),
        },
      });
      onNotify(`Saved plan & quotas for ${shop.shopName} (${shop.shopId}).`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-3xl rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{shop.shopName}</h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold">
                {shop.shopId}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Configure plan, Founding Customer pricing, storage/branch/user limits & feature toggles
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

        {/* Sub-Tabs */}
        <div className="px-6 pt-3 border-b border-white/10 flex items-center gap-2 bg-black/30">
          {(
            [
              { id: "quotas", label: "Plan, Founding Rate & Quotas" },
              {
                id: "features",
                label: `Feature Toggles (${
                  SUBSCRIPTION_FEATURE_CATALOG.filter(
                    (f) => sub.effectiveFeatures?.[f.key] !== false
                  ).length
                }/${SUBSCRIPTION_FEATURE_CATALOG.length})`,
              },
              { id: "history", label: "Payments & Lifecycle History" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 border-b-2 text-xs font-bold cursor-pointer transition-all ${
                tab === t.id
                  ? "border-orange-500 text-orange-300"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "quotas" && (
            <form onSubmit={handleSaveQuotas} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Assigned Plan</label>
                  <select
                    value={planId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setPlanId(nextId);
                      const p = plans.find((x) => x.planId === nextId);
                      if (p) {
                        setStorageMB(String(p.limits.maxStorageMB));
                        setBranchesLimit(String(p.limits.maxBranches));
                        setUsersLimit(String(p.limits.maxUsers));
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white"
                  >
                    {plans.map((p) => (
                      <option key={p.planId} value={p.planId}>
                        {p.name} ({p.currency} {p.monthlyPrice.toLocaleString()}/mo)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Billing Cycle</label>
                  <select
                    value={cycle}
                    onChange={(e) => setCycle(e.target.value as BillingCycle)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Custom Price Override (Optional)
                  </label>
                  <input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="Use plan rate"
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
              </div>

              {/* Founding Customer Toggle */}
              <label className="p-4 rounded-xl bg-orange-500/[0.08] border border-orange-500/30 flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 text-orange-400 shrink-0" />
                  <div>
                    <div className="font-bold text-orange-200">
                      Founding Customer Lifetime Pricing
                    </div>
                    <div className="text-[11px] text-orange-300/80">
                      Locks rate at {selectedPlan?.currency}{" "}
                      {(cycle === "annual"
                        ? selectedPlan?.foundingCustomerAnnualPrice
                        : selectedPlan?.foundingCustomerMonthlyPrice
                      )?.toLocaleString()}{" "}
                      (Standard: {selectedPlan?.currency}{" "}
                      {(cycle === "annual"
                        ? selectedPlan?.annualPrice
                        : selectedPlan?.monthlyPrice
                      )?.toLocaleString()}
                      )
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isFounding}
                  onChange={(e) => setIsFounding(e.target.checked)}
                  className="accent-orange-500 w-4 h-4"
                />
              </label>

              {/* Quotas & Billing Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Storage (MB, -1=∞)
                  </label>
                  <input
                    type="number"
                    value={storageMB}
                    onChange={(e) => setStorageMB(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Branch Limit (-1=∞)
                  </label>
                  <input
                    type="number"
                    value={branchesLimit}
                    onChange={(e) => setBranchesLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    User Limit (-1=∞)
                  </label>
                  <input
                    type="number"
                    value={usersLimit}
                    onChange={(e) => setUsersLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Next Due Date</label>
                  <input
                    type="date"
                    value={dueDateStr}
                    onChange={(e) => setDueDateStr(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Grace Days</label>
                  <input
                    type="number"
                    value={graceDays}
                    onChange={(e) => setGraceDays(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={async () => {
                    setSyncingStorage(true);
                    try {
                      const u = await calculateAndSyncShopResourceUsage(shop);
                      onNotify(`Storage synced: ${u.storageUsedMB} MB used.`);
                    } finally {
                      setSyncingStorage(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-orange-300 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingStorage ? "animate-spin" : ""}`} />
                  <span>Recalculate Storage Usage</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-white/5 text-zinc-300 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold cursor-pointer"
                  >
                    {saving ? "Saving..." : "Save Plan & Quotas"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {tab === "features" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SUBSCRIPTION_FEATURE_CATALOG.map((feat) => {
                const enabled = feat.alwaysEnabled
                  ? true
                  : sub.effectiveFeatures?.[feat.key] !== false;
                return (
                  <div
                    key={feat.key}
                    onClick={async () => {
                      if (feat.alwaysEnabled) return;
                      await toggleShopFeatureEntitlement({
                        shop,
                        featureKey: feat.key,
                        enabled: !enabled,
                      });
                      onNotify(
                        `${!enabled ? "Enabled" : "Disabled"} ${feat.label} for ${shop.shopId}.`
                      );
                    }}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      feat.alwaysEnabled
                        ? "bg-emerald-500/[0.04] border-emerald-500/20 opacity-80"
                        : enabled
                        ? "bg-emerald-500/[0.08] border-emerald-500/30 cursor-pointer"
                        : "bg-black/30 border-white/[0.07] cursor-pointer"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        {enabled ? (
                          <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                        <span>{feat.label}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {feat.description}
                      </p>
                    </div>
                    <div
                      className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                        enabled ? "bg-emerald-500" : "bg-zinc-700"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-zinc-300 mb-2">
                  Payments ({payments.length})
                </h4>
                {payments.length === 0 ? (
                  <p className="text-zinc-500">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div
                        key={p.paymentId}
                        className="p-3 rounded-xl bg-black/40 border border-white/10 flex justify-between"
                      >
                        <span>
                          <strong>
                            {p.currency} {p.amount.toLocaleString()}
                          </strong>{" "}
                          • {p.referenceNumber} ({p.planName})
                        </span>
                        <span className="text-zinc-400 font-mono">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-zinc-300 mb-2">
                  Lifecycle Audit Logs ({events.length})
                </h4>
                <div className="space-y-1.5">
                  {events.map((e) => (
                    <div
                      key={e.eventId}
                      className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex justify-between gap-2"
                    >
                      <span>
                        <strong className="text-orange-300 font-mono mr-2">{e.type}</strong>
                        {e.summary}
                      </span>
                      <span className="text-zinc-500 font-mono shrink-0">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENT 3: PLAN EDITOR MODAL
// ============================================================================

function PlanEditorModal({
  initialPlan,
  onClose,
  onSave,
}: {
  initialPlan: Partial<SubscriptionPlan>;
  onClose: () => void;
  onSave: (plan: Partial<SubscriptionPlan> & { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initialPlan.name || "");
  const [code, setCode] = useState(initialPlan.code || "");
  const [badgeText, setBadgeText] = useState(initialPlan.badgeText || "");
  const [description, setDescription] = useState(initialPlan.description || "");
  const [currency, setCurrency] = useState(initialPlan.currency || "LKR");
  const [monthlyPrice, setMonthlyPrice] = useState(String(initialPlan.monthlyPrice ?? 9500));
  const [annualPrice, setAnnualPrice] = useState(String(initialPlan.annualPrice ?? 95000));
  const [foundingMonthly, setFoundingMonthly] = useState(
    String(initialPlan.foundingCustomerMonthlyPrice ?? 5900)
  );
  const [foundingAnnual, setFoundingAnnual] = useState(
    String(initialPlan.foundingCustomerAnnualPrice ?? 59000)
  );
  const [graceDays, setGraceDays] = useState(String(initialPlan.defaultGracePeriodDays ?? 7));
  const [maxStorageMB, setMaxStorageMB] = useState(
    String(initialPlan.limits?.maxStorageMB ?? 2048)
  );
  const [maxBranches, setMaxBranches] = useState(String(initialPlan.limits?.maxBranches ?? 3));
  const [maxUsers, setMaxUsers] = useState(String(initialPlan.limits?.maxUsers ?? 10));
  const [features, setFeatures] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {};
    for (const f of SUBSCRIPTION_FEATURE_CATALOG) {
      base[f.key] = initialPlan.features?.[f.key] !== false;
    }
    return base;
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...initialPlan,
        name: name.trim(),
        code: (code || name.slice(0, 8)).trim().toUpperCase(),
        badgeText: badgeText.trim(),
        description: description.trim(),
        currency: currency.trim().toUpperCase() || "LKR",
        monthlyPrice: Number(monthlyPrice) || 0,
        annualPrice: Number(annualPrice) || 0,
        foundingCustomerMonthlyPrice: Number(foundingMonthly) || 0,
        foundingCustomerAnnualPrice: Number(foundingAnnual) || 0,
        defaultGracePeriodDays: Number(graceDays) || 7,
        limits: {
          maxStorageMB: Number(maxStorageMB) || 500,
          maxBranches: Number(maxBranches) || 1,
          maxUsers: Number(maxUsers) || 3,
        },
        features,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            {initialPlan.planId ? `Edit Plan: ${initialPlan.name}` : "Create Subscription Plan"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Plan Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Badge</label>
              <input
                type="text"
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Standard / Mo</label>
              <input
                type="number"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-orange-300 mb-1">Founding / Mo</label>
              <input
                type="number"
                value={foundingMonthly}
                onChange={(e) => setFoundingMonthly(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-black/40 border border-orange-500/40 text-orange-300 font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Standard / Yr</label>
              <input
                type="number"
                value={annualPrice}
                onChange={(e) => setAnnualPrice(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-orange-300 mb-1">Founding / Yr</label>
              <input
                type="number"
                value={foundingAnnual}
                onChange={(e) => setFoundingAnnual(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-black/40 border border-orange-500/40 text-orange-300 font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Storage (MB, -1=∞)</label>
              <input
                type="number"
                value={maxStorageMB}
                onChange={(e) => setMaxStorageMB(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Branches (-1=∞)</label>
              <input
                type="number"
                value={maxBranches}
                onChange={(e) => setMaxBranches(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Users (-1=∞)</label>
              <input
                type="number"
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Grace Days</label>
              <input
                type="number"
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUBSCRIPTION_FEATURE_CATALOG.map((feat) => {
              const enabled = feat.alwaysEnabled ? true : features[feat.key] !== false;
              return (
                <label
                  key={feat.key}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer ${
                    enabled
                      ? "bg-emerald-500/[0.07] border-emerald-500/25 text-white"
                      : "bg-white/[0.02] border-white/[0.06] text-zinc-500"
                  }`}
                >
                  <span className="text-xs font-semibold truncate">{feat.label}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={feat.alwaysEnabled}
                    onChange={(e) =>
                      setFeatures((prev) => ({ ...prev, [feat.key]: e.target.checked }))
                    }
                    className="accent-emerald-500 w-4 h-4 shrink-0"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 text-xs font-semibold text-zinc-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs cursor-pointer"
          >
            {saving ? "Saving..." : "Save Plan"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENT 4: RECORD PAYMENT MODAL
// ============================================================================

function RecordPaymentModal({
  shop,
  onClose,
  onPaymentRecorded,
}: {
  shop: Shop;
  onClose: () => void;
  onPaymentRecorded: (message: string) => void;
}) {
  const sub = shop.subscription || buildDefaultShopSubscription(shop);
  const [amount, setAmount] = useState(String(sub.effectiveBillingAmount));
  const [cycle, setCycle] = useState<BillingCycle>(sub.billingCycle || "monthly");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { paymentRecord } = await recordShopSubscriptionPayment({
        shop,
        amount: Number(amount) || 0,
        billingCycle: cycle,
        paymentMethod: method,
        referenceNumber: reference,
      });
      onPaymentRecorded(
        `Recorded ${paymentRecord.currency} ${paymentRecord.amount.toLocaleString()} for ${shop.shopName} (${shop.shopId}).`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            Record Payment — {shop.shopName} ({shop.shopId})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                Amount ({sub.currency})
              </label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Cycle</label>
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value as BillingCycle)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
              >
                <option value="monthly">+1 Month (30d)</option>
                <option value="annual">+1 Year (365d)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Reference #</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Auto-generated"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 text-xs font-semibold text-zinc-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer"
          >
            {saving ? "Recording..." : "Confirm Payment & Activate"}
          </button>
        </div>
      </form>
    </div>
  );
}
