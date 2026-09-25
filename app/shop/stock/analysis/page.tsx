"use client";

/**
 * app/shop/stock/analysis/page.tsx
 *
 * Dedicated Stock Analysis & Activity Ledger.
 * Features:
 * - Real-time Firebase stock transactions listener scoped strictly by shopId
 * - Dynamic 28–31 day activity dot matrix with luminous emerald green activity indicators
 * - Hover popovers showing exact staff member, product, stock delta, and reason
 * - Click interaction on any day dot to inspect that day's audit records
 * - Dynamic month navigation (Previous, Next, Current Month quick jump)
 * - Interactive daily movement bar graph across the 28–31 days
 * - Enterprise valuation KPIs (Cost Basis, Retail Potential, Projected Gross Margin, Stock Health)
 * - Filtered day audit ledger with CSV export
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertOctagon,
  ShoppingCart,
  Clock,
  User,
  Package,
  Layers,
  FileSpreadsheet,
  BarChart3,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Filter,
  Info,
} from "lucide-react";

import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { getProducts, getCategories } from "@/lib/services/catalogService";
import {
  subscribeToStockTransactions,
  calculateStockValuation,
} from "@/lib/services/stockService";
import { ProductItem, Category } from "@/lib/types/catalog";
import { StockTransaction, StockValuationSummary } from "@/lib/types/stock";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function DedicatedStockAnalysisPage() {
  const { shop, user, isAuthenticated, isLoading: authLoading } = useShopAuth();
  const router = useRouter();

  // ── Date navigation state ──
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number | null>(null); // 1-indexed

  // ── Hover popover state ──
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  // ── Data state ──
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ---------------------------------------------------------------------------
  // 1. Fetch products, categories & real-time transaction stream
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !shop?.shopId) return;

    let unsubTx: (() => void) | undefined;
    setLoadingData(true);

    Promise.all([
      getProducts(shop.shopId),
      getCategories(shop.shopId),
    ])
      .then(([prods, cats]) => {
        setProducts(prods);
        setCategories(cats);
      })
      .catch((err) => {
        console.error("[StockAnalysis] Error loading products/categories:", err);
      })
      .finally(() => {
        setLoadingData(false);
      });

    // Real-time listener for stock transactions scoped to active shop
    unsubTx = subscribeToStockTransactions(
      shop.shopId,
      (records) => {
        setTransactions(records);
      },
      (err) => {
        console.error("[StockAnalysis] Transactions subscription error:", err);
      }
    );

    return () => {
      if (unsubTx) unsubTx();
    };
  }, [isAuthenticated, shop?.shopId]);

  // ---------------------------------------------------------------------------
  // 2. Dynamic Month Days Calculation (28, 29, 30, or 31 days)
  // ---------------------------------------------------------------------------
  const daysInSelectedMonth = useMemo(() => {
    // Passing 0 as day returns the last day of previous month; month + 1 with 0 gives total days
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Navigate month
  const handlePrevMonth = () => {
    setSelectedDay(null);
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    setSelectedDay(null);
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleCurrentMonth = () => {
    const cur = new Date();
    setSelectedYear(cur.getFullYear());
    setSelectedMonth(cur.getMonth());
    setSelectedDay(null);
  };

  // ---------------------------------------------------------------------------
  // 3. Transactions filtered by Month & Year
  // ---------------------------------------------------------------------------
  const monthTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const d = new Date(tx.createdAt);
      return (
        d.getFullYear() === selectedYear &&
        d.getMonth() === selectedMonth
      );
    });
  }, [transactions, selectedYear, selectedMonth]);

  // Group transactions by day (1 to daysInSelectedMonth)
  const dailyTransactionsMap = useMemo(() => {
    const map = new Map<number, StockTransaction[]>();
    for (let day = 1; day <= daysInSelectedMonth; day++) {
      map.set(day, []);
    }
    monthTransactions.forEach((tx) => {
      const dayNum = new Date(tx.createdAt).getDate();
      if (dayNum >= 1 && dayNum <= daysInSelectedMonth) {
        const arr = map.get(dayNum) || [];
        arr.push(tx);
        map.set(dayNum, arr);
      }
    });
    return map;
  }, [monthTransactions, daysInSelectedMonth]);

  // Net monthly metrics
  const monthSummary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalSales = 0;
    let totalDamaged = 0;
    let activeDaysCount = 0;

    dailyTransactionsMap.forEach((txs) => {
      if (txs.length > 0) activeDaysCount++;
      txs.forEach((tx) => {
        const qty = Math.abs(tx.quantityDelta);
        if (tx.type === "STOCK_IN") totalIn += qty;
        else if (tx.type === "STOCK_OUT") totalOut += qty;
        else if (tx.type === "SALE") totalSales += qty;
        else if (tx.type === "DAMAGED") totalDamaged += qty;
      });
    });

    const totalMovements = monthTransactions.length;
    const totalVolume = totalIn + totalOut + totalSales + totalDamaged;

    return {
      totalMovements,
      totalVolume,
      activeDaysCount,
      totalIn,
      totalOut,
      totalSales,
      totalDamaged,
    };
  }, [dailyTransactionsMap, monthTransactions]);

  // Valuation summary
  const valuation: StockValuationSummary = useMemo(() => {
    return calculateStockValuation(products, transactions);
  }, [products, transactions]);

  const potentialProfit = Math.max(0, valuation.totalRetailValue - valuation.totalCostValue);
  const potentialMarginPct =
    valuation.totalRetailValue > 0
      ? ((potentialProfit / valuation.totalRetailValue) * 100).toFixed(1)
      : "0";

  // Filtered transactions for the day inspector
  const displayedTransactions = useMemo(() => {
    if (selectedDay === null) {
      return monthTransactions;
    }
    return dailyTransactionsMap.get(selectedDay) || [];
  }, [selectedDay, monthTransactions, dailyTransactionsMap]);

  // Format currency
  const formatCurrency = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // ---------------------------------------------------------------------------
  // CSV Export for the Month
  // ---------------------------------------------------------------------------
  const handleExportCsv = () => {
    const shopDisplayName = shop?.shopName || "POS Store";
    const lines: string[] = [
      `"STOCK ANALYSIS & ACTIVITY AUDIT - ${shopDisplayName}"`,
      `"Month","${MONTH_NAMES[selectedMonth]} ${selectedYear}"`,
      `"Generated At","${new Date().toLocaleString()}"`,
      "",
      `"MONTH SUMMARY"`,
      `"Total Movements",${monthSummary.totalMovements}`,
      `"Active Activity Days","${monthSummary.activeDaysCount} of ${daysInSelectedMonth}"`,
      `"Total Stock In",${monthSummary.totalIn}`,
      `"Total Stock Out",${monthSummary.totalOut}`,
      `"Total Sales Deductions",${monthSummary.totalSales}`,
      `"Total Damaged Write-offs",${monthSummary.totalDamaged}`,
      "",
      `"VALUATION SNAPSHOT"`,
      `"Asset Value (Cost)",${valuation.totalCostValue.toFixed(2)}`,
      `"Retail Potential",${valuation.totalRetailValue.toFixed(2)}`,
      `"Projected Gross Margin",${potentialProfit.toFixed(2)}`,
      `"Total Units",${valuation.totalUnits}`,
      "",
      `"ACTIVITY AUDIT LEDGER"`,
      `"Date","Time","Product","SKU","Type","Quantity Delta","Previous Stock","New Stock","Reason","Reference","Performed By","Role"`,
    ];

    monthTransactions.forEach((tx) => {
      const d = new Date(tx.createdAt);
      lines.push(
        `"${d.toISOString().slice(0, 10)}","${d.toLocaleTimeString()}","${tx.productName.replace(/"/g, '""')}","${tx.sku}","${tx.type}",${tx.quantityDelta},${tx.previousStock},${tx.newStock},"${(tx.reason || "").replace(/"/g, '""')}","${tx.referenceNumber || ""}","${tx.performedBy?.displayName || tx.performedBy?.username || ""}","${tx.performedBy?.role || ""}"`
      );
    });

    const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `stock_analysis_${selectedYear}_${selectedMonth + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Max volume day for bar chart scaling
  const maxDayVolume = useMemo(() => {
    let max = 1;
    dailyTransactionsMap.forEach((txs) => {
      const vol = txs.reduce((sum, t) => sum + Math.abs(t.quantityDelta), 0);
      if (vol > max) max = vol;
    });
    return max;
  }, [dailyTransactionsMap]);

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex flex-col font-sans selection:bg-emerald-500/30">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 bg-[#07080d]/95 backdrop-blur border-b border-white/[0.08] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/shop/stock")}
            className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer flex-shrink-0"
            title="Return to Stock Management"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/10">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white leading-none truncate">
                  Stock Analysis & Activity
                </h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">
                  Audit Ledger
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 truncate flex items-center gap-1.5 font-mono">
                <span>{shop?.shopName || "POS Store"}</span>
                <span>•</span>
                <span>{valuation.totalProducts} Catalog Items</span>
                <span>•</span>
                <span>{valuation.totalUnits.toLocaleString()} Units</span>
              </p>
            </div>
          </div>
        </div>

        {/* Right Header: Month Navigator & Export */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Month Navigation Pills */}
          <div className="flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
            <button
              onClick={handlePrevMonth}
              className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-2.5 py-1 text-xs font-bold text-zinc-100 flex items-center gap-1.5 min-w-[130px] justify-center">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>{MONTH_NAMES[selectedMonth]} {selectedYear}</span>
            </div>

            <button
              onClick={handleNextMonth}
              className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleCurrentMonth}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Jump to Current Month"
          >
            <Clock className="w-3 h-3 text-emerald-400" />
            <span>Today</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            title="Export Monthly Analysis to CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Export CSV</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Body ── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* ══════════════════════════════════════════════════ */}
        {/* TOP SECTION: VALUATION & ASSET KPIS */}
        {/* ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Inventory Valuation & Asset Metrics
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              Live valuation based on cost & selling prices
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Asset Cost Basis */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-lg flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400">Total Cost Basis</span>
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
              </div>
              <div className="text-xl md:text-2xl font-black font-mono text-zinc-100 tracking-tight">
                {formatCurrency(valuation.totalCostValue)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>Inventory Asset Value</span>
                <span>{valuation.totalUnits.toLocaleString()} units</span>
              </div>
            </div>

            {/* 2. Retail Potential */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-lg flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400">Retail Potential</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="text-xl md:text-2xl font-black font-mono text-emerald-400 tracking-tight">
                {formatCurrency(valuation.totalRetailValue)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>Gross Selling Value</span>
                <span>{valuation.totalProducts} items</span>
              </div>
            </div>

            {/* 3. Projected Gross Margin */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-lg flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400">Projected Margin</span>
                <span className="text-[10px] font-bold text-emerald-400 font-mono">
                  +{potentialMarginPct}%
                </span>
              </div>
              <div className="text-xl md:text-2xl font-black font-mono text-zinc-100 tracking-tight">
                {formatCurrency(potentialProfit)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>Expected Profit</span>
                <span>Markup spread</span>
              </div>
            </div>

            {/* 4. Stock Health Meter */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-lg flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
                <span>Stock Health</span>
                <span className="font-mono text-zinc-300">{valuation.totalProducts} SKUs</span>
              </div>

              {/* Multi-segment bar */}
              <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden flex my-auto">
                {valuation.totalProducts > 0 && (
                  <>
                    <div
                      style={{ width: `${(valuation.healthyCount / valuation.totalProducts) * 100}%` }}
                      className="bg-emerald-500 h-full transition-all"
                      title={`Healthy: ${valuation.healthyCount}`}
                    />
                    <div
                      style={{ width: `${(valuation.lowStockCount / valuation.totalProducts) * 100}%` }}
                      className="bg-amber-500 h-full transition-all"
                      title={`Low Stock: ${valuation.lowStockCount}`}
                    />
                    <div
                      style={{ width: `${(valuation.outOfStockCount / valuation.totalProducts) * 100}%` }}
                      className="bg-rose-500 h-full transition-all"
                      title={`Out of Stock: ${valuation.outOfStockCount}`}
                    />
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 text-[10px] text-zinc-400 pt-0.5">
                <span className="text-emerald-400 font-bold font-mono">
                  {valuation.healthyCount} <span className="text-zinc-500 font-normal">ok</span>
                </span>
                <span className="text-amber-400 font-bold font-mono text-center">
                  {valuation.lowStockCount} <span className="text-zinc-500 font-normal">low</span>
                </span>
                <span className="text-rose-400 font-bold font-mono text-right">
                  {valuation.outOfStockCount} <span className="text-zinc-500 font-normal">out</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* CORE SECTION: DYNAMIC 28–31 DAY ACTIVITY DOT MATRIX */}
        {/* Inspired by reference design with glowing neon dots */}
        {/* ══════════════════════════════════════════════════ */}
        <section className="p-5 md:p-6 rounded-3xl bg-gradient-to-b from-[#0e1017] to-[#0a0b10] border border-white/[0.09] shadow-2xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-1/4 w-80 h-40 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

          <div className="relative z-10 flex flex-col gap-5">
            {/* Card Header with Month Title & Adjusted Volume */}
            <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.2)]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-black text-white tracking-tight">
                      {MONTH_NAMES[selectedMonth]} {selectedYear}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.06] text-zinc-300 font-mono">
                      {daysInSelectedMonth} Days
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2 font-mono">
                    <span className="text-emerald-400 font-semibold">{monthSummary.activeDaysCount} active days</span>
                    <span>•</span>
                    <span>{monthSummary.totalMovements} audit events</span>
                    <span>•</span>
                    <span>{monthSummary.totalVolume} units moved</span>
                  </p>
                </div>
              </div>

              {/* Legend & Filter reset */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-4 bg-black/40 px-3 py-1.5 rounded-xl border border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-700/80" />
                    <span>Inactive</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] border border-emerald-300" />
                    <span>Active Stock Changes</span>
                  </div>
                </div>

                {selectedDay !== null && (
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Show Entire Month</span>
                  </button>
                )}
              </div>
            </div>

            {/* ── THE LUMINOUS DOT MATRIX GRID (28 to 31 Days) ── */}
            <div className="py-2">
              <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-16 gap-2.5 sm:gap-3 items-center justify-items-center">
                {Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1).map((day) => {
                  const dayTxs = dailyTransactionsMap.get(day) || [];
                  const isActive = dayTxs.length > 0;
                  const isSelected = selectedDay === day;
                  const isToday =
                    now.getFullYear() === selectedYear &&
                    now.getMonth() === selectedMonth &&
                    now.getDate() === day;

                  // Total delta magnitude on this day
                  const dayTotalUnits = dayTxs.reduce(
                    (sum, tx) => sum + Math.abs(tx.quantityDelta),
                    0
                  );

                  return (
                    <div
                      key={day}
                      className="relative flex flex-col items-center group cursor-pointer"
                      onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                      onMouseEnter={(e) => {
                        setHoveredDay(day);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setPopoverPos({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      {/* Day dot button */}
                      <button
                        type="button"
                        className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0e1017] scale-110"
                            : ""
                        } ${
                          isActive
                            ? "bg-gradient-to-tr from-emerald-500 to-teal-400 text-black font-black shadow-[0_0_14px_rgba(52,211,153,0.55)] border border-emerald-300 hover:scale-115 hover:shadow-[0_0_20px_rgba(52,211,153,0.8)]"
                            : "bg-zinc-900/90 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-white/[0.06] hover:border-white/[0.15]"
                        }`}
                      >
                        <span className="text-[11px] font-mono select-none">
                          {day}
                        </span>

                        {/* Today pulsing ring */}
                        {isToday && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-indigo-400 border border-[#07080d] ring-1 ring-indigo-300 animate-pulse" />
                        )}

                        {/* Micro indicator badge if high activity */}
                        {isActive && dayTxs.length > 2 && (
                          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-black/90 text-[8px] font-bold text-emerald-300 flex items-center justify-center border border-emerald-500/40 font-mono">
                            {dayTxs.length}
                          </span>
                        )}
                      </button>

                      {/* Day subtitle label */}
                      <span
                        className={`text-[9px] font-mono mt-1 ${
                          isSelected
                            ? "text-emerald-300 font-bold"
                            : isActive
                            ? "text-emerald-400/80 font-medium"
                            : "text-zinc-600"
                        }`}
                      >
                        {isActive ? `+${dayTotalUnits}` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Matrix summary bar */}
            <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-xs text-zinc-400 flex-wrap gap-2">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Info className="w-3.5 h-3.5 text-zinc-500" />
                <span>
                  Click any active dot to filter that day&rsquo;s detailed audit records below.
                </span>
              </span>
              {selectedDay !== null && (
                <div className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-xs font-semibold font-mono">
                  Filtering Day {selectedDay} ({dailyTransactionsMap.get(selectedDay)?.length || 0} events)
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* INTERACTIVE DAILY MOVEMENT BAR GRAPH (28–31 Days)  */}
        {/* ══════════════════════════════════════════════════ */}
        <section className="p-5 md:p-6 rounded-3xl bg-gradient-to-b from-[#0c0e15] to-[#08090e] border border-white/[0.08] shadow-xl">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Daily Stock Movement Volume ({MONTH_NAMES[selectedMonth]} {selectedYear})
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Magnitude of units adjusted across each day of the month
              </p>
            </div>

            {/* Movement type color keys */}
            <div className="flex items-center gap-3 text-[11px] font-medium flex-wrap">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded bg-emerald-500" /> Stock In
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2 h-2 rounded bg-amber-500" /> Stock Out
              </span>
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2 h-2 rounded bg-blue-500" /> POS Sales
              </span>
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="w-2 h-2 rounded bg-rose-500" /> Damaged
              </span>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="pt-6 pb-2">
            <div className="h-44 w-full flex items-end gap-1 sm:gap-2 px-1 border-b border-white/[0.08]">
              {Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1).map((day) => {
                const dayTxs = dailyTransactionsMap.get(day) || [];
                const dayTotalUnits = dayTxs.reduce(
                  (sum, tx) => sum + Math.abs(tx.quantityDelta),
                  0
                );
                const heightPct = maxDayVolume > 0 ? (dayTotalUnits / maxDayVolume) * 100 : 0;
                const isSelected = selectedDay === day;
                const hasActivity = dayTxs.length > 0;

                // Segments breakdown
                let inUnits = 0;
                let outUnits = 0;
                let salesUnits = 0;
                let damagedUnits = 0;

                dayTxs.forEach((tx) => {
                  const qty = Math.abs(tx.quantityDelta);
                  if (tx.type === "STOCK_IN") inUnits += qty;
                  else if (tx.type === "STOCK_OUT") outUnits += qty;
                  else if (tx.type === "SALE") salesUnits += qty;
                  else if (tx.type === "DAMAGED") damagedUnits += qty;
                });

                return (
                  <div
                    key={day}
                    className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                    onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                  >
                    {/* Bar stack */}
                    <div
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                      className={`w-full max-w-[20px] rounded-t-md transition-all duration-200 overflow-hidden flex flex-col justify-end ${
                        isSelected
                          ? "ring-2 ring-emerald-400 shadow-[0_0_12px_#10b981]"
                          : hasActivity
                          ? "group-hover:scale-y-105"
                          : "opacity-40"
                      }`}
                    >
                      {hasActivity ? (
                        <div className="w-full h-full flex flex-col justify-end">
                          {damagedUnits > 0 && (
                            <div
                              style={{ height: `${(damagedUnits / dayTotalUnits) * 100}%` }}
                              className="bg-rose-500 w-full"
                            />
                          )}
                          {salesUnits > 0 && (
                            <div
                              style={{ height: `${(salesUnits / dayTotalUnits) * 100}%` }}
                              className="bg-blue-500 w-full"
                            />
                          )}
                          {outUnits > 0 && (
                            <div
                              style={{ height: `${(outUnits / dayTotalUnits) * 100}%` }}
                              className="bg-amber-500 w-full"
                            />
                          )}
                          {inUnits > 0 && (
                            <div
                              style={{ height: `${(inUnits / dayTotalUnits) * 100}%` }}
                              className="bg-emerald-500 w-full"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-full bg-zinc-800/60" />
                      )}
                    </div>

                    {/* Day label */}
                    <span
                      className={`text-[9px] font-mono mt-2 transition-colors ${
                        isSelected
                          ? "text-emerald-400 font-bold"
                          : hasActivity
                          ? "text-zinc-300 font-medium"
                          : "text-zinc-600"
                      }`}
                    >
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* DAY TRANSACTION INSPECTOR & DETAILED AUDIT LEDGER  */}
        {/* ══════════════════════════════════════════════════ */}
        <section className="p-5 md:p-6 rounded-3xl bg-gradient-to-b from-[#0c0e15] to-[#08090e] border border-white/[0.08] shadow-xl">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  {selectedDay !== null
                    ? `Audit Ledger: ${MONTH_NAMES[selectedMonth]} ${selectedDay}, ${selectedYear}`
                    : `Audit Ledger: All Records for ${MONTH_NAMES[selectedMonth]} ${selectedYear}`}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.05] text-zinc-300 font-mono">
                  {displayedTransactions.length} Record{displayedTransactions.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Every stock addition, reduction, sale, and write-off with who changed what
              </p>
            </div>

            {selectedDay !== null && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline"
              >
                Clear Day Filter
              </button>
            )}
          </div>

          {/* Audit Ledger List */}
          {displayedTransactions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 rounded-2xl bg-white/[0.01] border border-dashed border-white/[0.06]">
              <Package className="w-8 h-8 text-zinc-600" />
              <p className="text-xs">
                {selectedDay !== null
                  ? `No stock activity recorded on Day ${selectedDay}.`
                  : `No stock transactions logged in ${MONTH_NAMES[selectedMonth]} ${selectedYear}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2 overflow-x-auto">
              {displayedTransactions.map((tx) => {
                const txDate = new Date(tx.createdAt);
                const isPositive = tx.quantityDelta > 0;
                const isSale = tx.type === "SALE";
                const isDamaged = tx.type === "DAMAGED";
                const isStockIn = tx.type === "STOCK_IN";

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] transition-all flex items-center justify-between gap-3 text-xs"
                  >
                    {/* Left: Type Icon & Product info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isStockIn
                            ? "bg-emerald-500/15 border border-emerald-500/25 text-emerald-400"
                            : isDamaged
                            ? "bg-rose-500/15 border border-rose-500/25 text-rose-400"
                            : isSale
                            ? "bg-blue-500/15 border border-blue-500/25 text-blue-400"
                            : "bg-amber-500/15 border border-amber-500/25 text-amber-400"
                        }`}
                      >
                        {isStockIn ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : isDamaged ? (
                          <AlertOctagon className="w-4 h-4" />
                        ) : isSale ? (
                          <ShoppingCart className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-zinc-100 truncate">
                            {tx.productName}
                          </span>
                          {tx.variantName && (
                            <span className="text-[10px] text-zinc-400 px-1.5 py-0.2 rounded bg-white/[0.05]">
                              {tx.variantName}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 font-mono">
                            #{tx.sku}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="text-zinc-300 font-medium">{tx.reason || tx.type}</span>
                          {tx.referenceNumber && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-zinc-400">Ref: {tx.referenceNumber}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Staff / Performed By */}
                    <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.03] border border-white/[0.05] flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      <div className="text-[11px]">
                        <span className="text-zinc-200 font-semibold">
                          {tx.performedBy?.displayName || tx.performedBy?.username || "Staff"}
                        </span>
                        {tx.performedBy?.role && (
                          <span className="text-zinc-500 text-[10px] ml-1 uppercase">
                            ({tx.performedBy.role})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Quantity Delta & Stock Transition */}
                    <div className="text-right flex-shrink-0">
                      <div
                        className={`text-sm font-black font-mono ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isPositive ? `+${tx.quantityDelta}` : tx.quantityDelta} units
                      </div>
                      <div className="text-[10.5px] text-zinc-500 font-mono mt-0.5 flex items-center justify-end gap-1.5">
                        <span>{tx.previousStock} → {tx.newStock} stock</span>
                        <span>•</span>
                        <span>{txDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ══════════════════════════════════════════════════ */}
      {/* FLOATING HOVER POPOVER (WHO CHANGED WHAT)           */}
      {/* ══════════════════════════════════════════════════ */}
      {hoveredDay !== null && popoverPos !== null && (
        (() => {
          const dayTxs = dailyTransactionsMap.get(hoveredDay) || [];
          const hasTxs = dayTxs.length > 0;
          const dayDate = new Date(selectedYear, selectedMonth, hoveredDay);
          const dayName = dayDate.toLocaleDateString("en-US", { weekday: "short" });
          const totalUnits = dayTxs.reduce((sum, tx) => sum + Math.abs(tx.quantityDelta), 0);

          return (
            <div
              className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 w-80 rounded-2xl bg-[#0e111a] border border-white/[0.14] shadow-2xl p-3.5 text-xs text-white animate-in fade-in zoom-in-95 duration-150"
              style={{
                left: `${popoverPos.x}px`,
                top: `${popoverPos.y - 12}px`,
              }}
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {dayName}, {MONTH_NAMES[selectedMonth]} {hoveredDay}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                    hasTxs
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {hasTxs ? `${dayTxs.length} event${dayTxs.length !== 1 ? "s" : ""}` : "No Activity"}
                </span>
              </div>

              {/* Popover Content */}
              {hasTxs ? (
                <div className="pt-2.5 space-y-2">
                  <div className="text-[11px] text-zinc-400 flex items-center justify-between font-mono">
                    <span>Total Volume:</span>
                    <span className="font-bold text-emerald-400">+{totalUnits} units</span>
                  </div>

                  {/* Most recent 3 transactions */}
                  <div className="space-y-1.5 max-h-48 overflow-hidden">
                    {dayTxs.slice(0, 3).map((tx) => (
                      <div
                        key={tx.id}
                        className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[11px]"
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-zinc-200 truncate max-w-[170px]">
                            {tx.productName}
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              tx.quantityDelta > 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {tx.quantityDelta > 0 ? `+${tx.quantityDelta}` : tx.quantityDelta}
                          </span>
                        </div>

                        <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                          Reason: {tx.reason || tx.type}
                        </div>

                        <div className="text-[9.5px] text-zinc-500 font-mono mt-0.5 flex items-center justify-between">
                          <span>
                            By: {tx.performedBy?.displayName || tx.performedBy?.username || "Staff"}
                          </span>
                          <span>{new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {dayTxs.length > 3 && (
                    <div className="text-[10px] text-zinc-500 text-center font-mono pt-1">
                      + {dayTxs.length - 3} more (click to view all)
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-3 text-center text-zinc-500 text-[11px]">
                  No stock adjustments or transactions on this date.
                </div>
              )}

              {/* Triangle pointer */}
              <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-[#0e111a]" />
            </div>
          );
        })()
      )}
    </div>
  );
}
