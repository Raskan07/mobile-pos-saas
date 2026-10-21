"use client";

/**
 * app/shop/analytics/page.tsx
 *
 * Multi-Tenant Sales Analytics Hub
 *
 * Core Guarantees:
 * 1. Always filter strictly by authenticated shop ID from session (never query across shops).
 * 2. Reuse existing `sales` collection without creating a separate analytics database.
 * 3. Single reusable filtered data set by shop ID and date range driving all cards, charts,
 *    payment breakdowns, product analytics, category analytics, customer analytics, and refund analytics.
 * 4. Net Revenue calculated as Gross Sales minus Refunds.
 * 5. Complete reconciliation of Cash, Card, Bank Deposit/Wire, Mobile QR, and Split Payments.
 * 6. Respects existing RBAC (`sales:view` and `isShopAdmin`).
 * 7. Dark glass POS design with iOS featured cards and gray secondary typography.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Download,
  Filter,
  Layers,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  CreditCard,
  Banknote,
  Building2,
  Package,
  FolderTree,
  Users,
  FileSpreadsheet,
  FileText,
  Percent,
  Receipt,
  Split,
} from "lucide-react";

import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import { subscribeToSalesByShop } from "@/lib/services/salesService";
import { SaleRecord } from "@/lib/types/sale";
import {
  computeSalesAnalytics,
  SalesAnalyticsResult,
} from "@/lib/services/salesAnalyticsService";
import { downloadSalesPdf } from "@/lib/exporters/salesPdfExporter";
import { downloadSalesExcel } from "@/lib/exporters/salesExcelExporter";
import { downloadReturnsPdf } from "@/lib/exporters/returnsPdfExporter";
import { downloadReturnsExcel } from "@/lib/exporters/returnsExcelExporter";

import IOSFeaturedCard from "@/components/analytics/IOSFeaturedCard";
import SalesTrendChart from "@/components/analytics/SalesTrendChart";
import PaymentBreakdownSection from "@/components/analytics/PaymentBreakdownSection";
import ProductAnalyticsSection from "@/components/analytics/ProductAnalyticsSection";
import CategoryAnalyticsSection from "@/components/analytics/CategoryAnalyticsSection";
import CustomerAnalyticsSection from "@/components/analytics/CustomerAnalyticsSection";
import RefundAnalyticsSection from "@/components/analytics/RefundAnalyticsSection";
import { IOSSpinner } from "@/components/ui/IOSSpinner";

type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "all_time"
  | "custom";

type AnalyticsViewTab =
  | "overview"
  | "payments"
  | "products"
  | "categories"
  | "customers"
  | "refunds";

function getDateRangeBounds(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; label: string; isHourly: boolean } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Today", isHourly: true };
    }
    case "yesterday": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { start, end, label: "Yesterday", isHourly: true };
    }
    case "last_7_days": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 7 Days", isHourly: false };
    }
    case "last_30_days": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 30 Days", isHourly: false };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "This Month", isHourly: false };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end, label: "Last Month", isHourly: false };
    }
    case "last_3_months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 3 Months", isHourly: false };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "This Year", isHourly: false };
    }
    case "all_time": {
      const start = new Date(2020, 0, 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "All Time", isHourly: false };
    }
    case "custom": {
      const start = customStart
        ? new Date(`${customStart}T00:00:00`)
        : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : endOfToday;
      const dayDiff = Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      return {
        start,
        end,
        label: "Custom Range",
        isHourly: dayDiff <= 1.5,
      };
    }
  }
}

export default function ShopSalesAnalyticsPage() {
  const router = useRouter();
  const { shop, user, activeBranchName, isAuthenticated, isLoading: isAuthLoading } = useShopAuth();
  const { hasPermission, isShopAdmin } = useRBAC();

  // Role-Based Access Control: View sales permission or Shop Admin
  const canViewSales = hasPermission("sales:view") || isShopAdmin;

  // Active view tab state
  const [activeTab, setActiveTab] = useState<AnalyticsViewTab>("overview");

  // Date Range state
  const [datePreset, setDatePreset] = useState<DateRangePreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Raw shop sales loaded from Firestore (strictly scoped to shop.shopId)
  const [allShopSales, setAllShopSales] = useState<SaleRecord[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------------------------------------------------------------------------
  // 1. Subscribe to shop-scoped sales strictly by authenticated shopId
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !shop?.shopId || !canViewSales) {
      setIsLoadingSales(false);
      return;
    }

    setIsLoadingSales(true);
    setFetchError(null);

    // Strict multi-tenant isolation: Never queries root sales without shopId boundary
    const unsubscribe = subscribeToSalesByShop(
      shop.shopId,
      (sales) => {
        setAllShopSales(sales);
        setIsLoadingSales(false);
      },
      (err) => {
        console.error(`[SalesAnalytics] Error fetching sales for shop ${shop.shopId}:`, err);
        setFetchError(err.message || "Failed to load sales data.");
        setIsLoadingSales(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [shop?.shopId, isAuthenticated, canViewSales]);

  // ---------------------------------------------------------------------------
  // 2. Single reusable filtered dataset by authenticated shop ID & date range
  // ---------------------------------------------------------------------------
  const dateBounds = useMemo(() => {
    return getDateRangeBounds(datePreset, customStartDate, customEndDate);
  }, [datePreset, customStartDate, customEndDate]);

  const filteredSales: SaleRecord[] = useMemo(() => {
    if (!allShopSales || allShopSales.length === 0) return [];
    const startMs = dateBounds.start.getTime();
    const endMs = dateBounds.end.getTime();

    // Pure single-source filter
    return allShopSales.filter(
      (s) => s.createdAt >= startMs && s.createdAt <= endMs
    );
  }, [allShopSales, dateBounds]);

  // ---------------------------------------------------------------------------
  // 3. Single analytics computation driving ALL downstream cards, charts & sections
  // ---------------------------------------------------------------------------
  const analytics: SalesAnalyticsResult = useMemo(() => {
    return computeSalesAnalytics(filteredSales, dateBounds.isHourly);
  }, [filteredSales, dateBounds.isHourly]);

  // ---------------------------------------------------------------------------
  // 4. Exporters Integration
  // ---------------------------------------------------------------------------
  const handleExportSalesPdf = () => {
    if (filteredSales.length === 0) return;
    downloadSalesPdf(filteredSales, {
      shopName: shop?.shopName || shop?.shopId || "Shop",
      shopId: shop?.shopId || "",
      branchName: activeBranchName || undefined,
      generatedBy: user
        ? {
            username: user.username,
            displayName: user.displayName,
            role: user.role,
          }
        : undefined,
      filterSummary: {
        dateRangeLabel: dateBounds.label,
      },
    });
    setIsExportMenuOpen(false);
  };

  const handleExportSalesExcel = () => {
    if (filteredSales.length === 0) return;
    downloadSalesExcel(filteredSales, {
      shopName: shop?.shopName || shop?.shopId || "Shop",
      shopId: shop?.shopId || "",
      branchName: activeBranchName || undefined,
      generatedBy: user
        ? {
            username: user.username,
            displayName: user.displayName,
            role: user.role,
          }
        : undefined,
      filterSummary: {
        dateRangeLabel: dateBounds.label,
      },
    });
    setIsExportMenuOpen(false);
  };

  const handleExportReturnsPdf = () => {
    const returnRecords = filteredSales.flatMap((s) => s.returns || []);
    if (returnRecords.length === 0) return;
    downloadReturnsPdf(returnRecords, {
      shopName: shop?.shopName || shop?.shopId || "Shop",
      shopId: shop?.shopId || "",
      branchName: activeBranchName || undefined,
      filterSummary: {
        dateRangeLabel: dateBounds.label,
      },
    });
    setIsExportMenuOpen(false);
  };

  const handleExportReturnsExcel = () => {
    const returnRecords = filteredSales.flatMap((s) => s.returns || []);
    if (returnRecords.length === 0) return;
    downloadReturnsExcel(returnRecords, {
      shopName: shop?.shopName || shop?.shopId || "Shop",
      shopId: shop?.shopId || "",
      branchName: activeBranchName || undefined,
      filterSummary: {
        dateRangeLabel: dateBounds.label,
      },
    });
    setIsExportMenuOpen(false);
  };

  // ---------------------------------------------------------------------------
  // 5. Auth & RBAC Guards
  // ---------------------------------------------------------------------------
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#07080d] flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <IOSSpinner size={32} color="#ffffff" />
          <span className="text-xs font-medium">Verifying store authorization…</span>
        </div>
      </div>
    );
  }

  // Not Authenticated
  if (!isAuthenticated || !shop) {
    return (
      <div className="min-h-screen bg-[#07080d] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl bg-[#0c0d15]/90 border border-white/10 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white">Active Shop Session Required</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Please log in through your merchant terminal to access sales analytics.
          </p>
          <button
            type="button"
            onClick={() => router.push("/shop")}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Go to Shop Login
          </button>
        </div>
      </div>
    );
  }

  // RBAC Access Restricted Screen
  if (!canViewSales) {
    return (
      <div className="min-h-screen bg-[#07080d] text-zinc-200 flex flex-col">
        <header className="h-14 px-4 md:px-8 bg-[#0c0d15] border-b border-zinc-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-2 text-xs font-medium transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
            <span>Back to POS</span>
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-3xl bg-[#0c0d15]/90 border border-white/10 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-white">Access Restricted</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Your account role (<span className="text-zinc-200 font-semibold">{user?.role}</span>) does not have permission to inspect sales analytics reports. Please contact store management.
            </p>
            <button
              type="button"
              onClick={() => router.push("/shop/dashboard")}
              className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Return to POS Terminal
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { kpis, payments } = analytics;
  const currencySymbol = "LKR";

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-200 flex flex-col selection:bg-zinc-700">
      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 bg-[#0c0d15]/90 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-5 py-2.5 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.push("/shop/dashboard")}
          className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
          title="Back to POS Terminal"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Right Actions: Date Picker & Export */}
        <div className="flex items-center gap-2">
          {/* Date Range Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((v) => !v)}
              className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span>{dateBounds.label}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-11 z-50 w-72 p-3 rounded-2xl bg-[#121420]/95 backdrop-blur-2xl border border-white/15 shadow-2xl space-y-3 animate-in fade-in duration-150">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  Select Reporting Window
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: "today", label: "Today" },
                      { id: "yesterday", label: "Yesterday" },
                      { id: "last_7_days", label: "Last 7 Days" },
                      { id: "last_30_days", label: "Last 30 Days" },
                      { id: "this_month", label: "This Month" },
                      { id: "last_month", label: "Last Month" },
                      { id: "last_3_months", label: "Last 3 Months" },
                      { id: "this_year", label: "This Year" },
                      { id: "all_time", label: "All Time" },
                      { id: "custom", label: "Custom Range" },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setDatePreset(preset.id);
                        if (preset.id !== "custom") setIsDropdownOpen(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer ${
                        datePreset === preset.id
                          ? "bg-zinc-800 text-white font-semibold border border-white/10"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Inputs */}
                {datePreset === "custom" && (
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 uppercase font-semibold">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs text-zinc-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 uppercase font-semibold">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs text-zinc-200"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Apply Filter
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              disabled={filteredSales.length === 0}
              onClick={() => setIsExportMenuOpen((v) => !v)}
              className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-11 z-50 w-56 p-2 rounded-2xl bg-[#121420]/95 backdrop-blur-2xl border border-white/15 shadow-2xl space-y-1 animate-in fade-in duration-150 text-xs">
                <button
                  type="button"
                  onClick={handleExportSalesPdf}
                  className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-zinc-300 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-rose-400" />
                  <span>Export Sales (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportSalesExcel}
                  className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-zinc-300 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Export Sales (Excel)</span>
                </button>
                {analytics.refunds.totalRefundAmount > 0 && (
                  <>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      type="button"
                      onClick={handleExportReturnsPdf}
                      className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-zinc-300 hover:text-white flex items-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-amber-400" />
                      <span>Export Returns (PDF)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportReturnsExcel}
                      className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-zinc-300 hover:text-white flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                      <span>Export Returns (Excel)</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-5 space-y-4">
        {/* Loading Indicator */}
        {isLoadingSales && (
          <div className="flex items-center justify-center p-6 text-zinc-400 gap-3">
            <IOSSpinner size={20} color="#a1a1aa" />
            <span className="text-xs font-mono">Syncing real-time store transactions…</span>
          </div>
        )}

        {/* ── KPI Highlight Cards (iOS Featured Cards) ── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Net Revenue (Hero Metric) */}
          <IOSFeaturedCard
            eyebrow="NET REVENUE"
            title="Net Collections"
            icon={Wallet}
            value={`${currencySymbol} ${kpis.netRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle={
              <span>
                Gross: <span className="text-zinc-200">{currencySymbol} {kpis.grossSales.toFixed(2)}</span>
                {kpis.totalRefunds > 0 && (
                  <span className="text-rose-400 ml-1.5 font-mono">
                    (-{currencySymbol} {kpis.totalRefunds.toFixed(2)})
                  </span>
                )}
              </span>
            }
            badge={{
              text: "Gross − Refunds",
              variant: "positive",
            }}
          />

          {/* Card 2: Total Gross Sales */}
          <IOSFeaturedCard
            eyebrow="TRANSACTIONS VOLUME"
            title="Gross Revenue"
            icon={TrendingUp}
            value={`${currencySymbol} ${kpis.grossSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle={`${kpis.totalTransactions} completed checkouts`}
            badge={{
              text: `${kpis.totalTransactions} Orders`,
              variant: "neutral",
            }}
          />

          {/* Card 3: Total Refunds Disbursed */}
          <IOSFeaturedCard
            eyebrow="REFUNDS & RETURNS"
            title="Total Refunds"
            icon={RotateCcw}
            value={`${currencySymbol} ${kpis.totalRefunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle={`${kpis.totalUnitsReturned} units returned (${kpis.refundRate.toFixed(1)}% of gross)`}
            badge={{
              text: kpis.totalRefunds > 0 ? `${kpis.refundRate.toFixed(1)}% Return Rate` : "0% Returns",
              variant: kpis.totalRefunds > 0 ? "negative" : "neutral",
            }}
          />

          {/* Card 4: Average Order Value (AOV) */}
          <IOSFeaturedCard
            eyebrow="BASKET METRICS"
            title="Average Order Value"
            icon={Receipt}
            value={`${currencySymbol} ${kpis.averageOrderValue.toFixed(2)}`}
            subtitle={`${kpis.totalItemsSold} net units sold (${kpis.totalTransactions > 0 ? (kpis.totalItemsSold / kpis.totalTransactions).toFixed(1) : 0} items/order)`}
            badge={{
              text: "AOV",
              variant: "info",
            }}
          />
        </section>

        {/* ── Tab Switcher (iOS Segmented Control in Dark Glass) ── */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 border-b border-white/[0.08] pb-2">
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#0c0d15]/90 border border-white/[0.08] shadow-inner text-[11px] overflow-x-auto max-w-full">
            {(
              [
                { id: "overview", label: "Overview", icon: Layers },
                { id: "payments", label: "Payment Breakdown", icon: CreditCard },
                { id: "products", label: "Products", icon: Package },
                { id: "categories", label: "Categories", icon: FolderTree },
                { id: "customers", label: "Customers", icon: Users },
                { id: "refunds", label: "Refunds & Returns", icon: RotateCcw },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap text-[11px] ${
                    isActive
                      ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-zinc-500"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[10px] font-mono text-zinc-400">
            {filteredSales.length} {filteredSales.length === 1 ? "transaction" : "transactions"} analyzed
          </div>
        </div>

        {/* ── Empty State Handling ── */}
        {!isLoadingSales && filteredSales.length === 0 && (
          <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">No Sales in Selected Period</h3>
            <p className="text-[11px] text-zinc-400 max-w-md mx-auto leading-relaxed">
              No transactions were processed for <span className="text-zinc-200 font-semibold">{shop.shopName}</span> during the current reporting window ({dateBounds.label}). Adjust the date range filter or ring up new sales at the POS terminal.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setDatePreset("all_time")}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                View All Time Data
              </button>
              <button
                type="button"
                onClick={() => router.push("/shop/dashboard")}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Open POS Register
              </button>
            </div>
          </div>
        )}

        {/* ── Tab View: OVERVIEW ── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Sales Trend Chart */}
            <SalesTrendChart timeline={analytics.timeline} currencySymbol={currencySymbol} />

            {/* Quick Section Grid: Payment Snapshot & Top Products */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Payment Methods Quick Card */}
              <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                      TENDER HIGHLIGHTS
                    </span>
                    <h3 className="text-xs font-bold text-white">Payment Collections</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("payments")}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                  >
                    View Breakdown →
                  </button>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Cash In Drawer</span>
                    </span>
                    <span className="font-bold text-white">
                      {currencySymbol} {payments.breakdown.cash.totalCollected.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                      <span>Credit / Debit Cards</span>
                    </span>
                    <span className="font-bold text-white">
                      {currencySymbol} {payments.breakdown.card.totalCollected.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Bank Deposit / Wire</span>
                    </span>
                    <span className="font-bold text-white">
                      {currencySymbol} {payments.breakdown.bank_deposit.totalCollected.toFixed(2)}
                    </span>
                  </div>

                  {payments.splitOverview.totalSplitTransactions > 0 && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20">
                      <span className="flex items-center gap-2 text-cyan-300">
                        <Split className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Split Payments ({payments.splitOverview.totalSplitTransactions} txns)</span>
                      </span>
                      <span className="font-bold text-cyan-200">
                        {currencySymbol} {payments.splitOverview.totalSplitVolume.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Best-Sellers Snapshot */}
              <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                      CATALOG LEADERBOARD
                    </span>
                    <h3 className="text-xs font-bold text-white">Top Revenue Contributors</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("products")}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                  >
                    All Products →
                  </button>
                </div>

                <div className="space-y-1.5">
                  {analytics.products.topByRevenue.slice(0, 4).map((p, idx) => (
                    <div
                      key={p.productId || idx}
                      className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-semibold text-zinc-200 truncate">{p.name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {p.netUnitsSold} net units sold • {p.categoryName}
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold text-emerald-400 shrink-0">
                        {currencySymbol} {p.netRevenue.toFixed(2)}
                      </div>
                    </div>
                  ))}

                  {analytics.products.topByRevenue.length === 0 && (
                    <div className="py-6 text-center text-zinc-500 text-xs">
                      No product sales in this reporting window
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab View: PAYMENT BREAKDOWN ── */}
        {activeTab === "payments" && (
          <PaymentBreakdownSection payments={analytics.payments} currencySymbol={currencySymbol} />
        )}

        {/* ── Tab View: PRODUCTS ── */}
        {activeTab === "products" && (
          <ProductAnalyticsSection products={analytics.products} currencySymbol={currencySymbol} />
        )}

        {/* ── Tab View: CATEGORIES ── */}
        {activeTab === "categories" && (
          <CategoryAnalyticsSection categories={analytics.categories} currencySymbol={currencySymbol} />
        )}

        {/* ── Tab View: CUSTOMERS ── */}
        {activeTab === "customers" && (
          <CustomerAnalyticsSection customers={analytics.customers} currencySymbol={currencySymbol} />
        )}

        {/* ── Tab View: REFUNDS & RETURNS ── */}
        {activeTab === "refunds" && (
          <RefundAnalyticsSection
            refunds={analytics.refunds}
            grossSales={kpis.grossSales}
            currencySymbol={currencySymbol}
          />
        )}
      </main>
    </div>
  );
}
