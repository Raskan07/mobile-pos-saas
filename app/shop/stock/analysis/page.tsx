"use client";

/**
 * app/shop/stock/analysis/page.tsx
 *
 * Dedicated Stock Analysis & Activity Ledger.
 * Data visualization UI/UX with date range filtering (Last 2 Months, Last 3 Months, etc.),
 * multi-color stock change event indicators (increment = emerald, reduce = amber, damage = rose),
 * sleek gray secondary styling, and interactive timeline & dot matrix components.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  ArrowUpRight,
  ArrowDownRight,
  Search,
  X,
  ChevronDown,
  CalendarDays,
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

type DateRangePreset =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_2_months"
  | "last_3_months"
  | "last_6_months"
  | "custom";

type EventTypeFilter = "ALL" | "INCREMENT" | "REDUCE" | "DAMAGE";

function getDateRangeBounds(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; label: string } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Today" };
    }
    case "last_7_days": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 7 Days" };
    }
    case "last_30_days": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 30 Days" };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "This Month" };
    }
    case "last_2_months": {
      // 2 calendar months including current
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 2 Months" };
    }
    case "last_3_months": {
      // 3 calendar months including current
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 3 Months" };
    }
    case "last_6_months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
      return { start, end: endOfToday, label: "Last 6 Months" };
    }
    case "custom": {
      const start = customStart
        ? new Date(`${customStart}T00:00:00`)
        : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = customEnd
        ? new Date(`${customEnd}T23:59:59`)
        : endOfToday;
      return { start, end, label: "Custom Range" };
    }
  }
}

export default function DedicatedStockAnalysisPage() {
  const { shop, user, isAuthenticated } = useShopAuth();
  const router = useRouter();

  // ── Date Range State ──
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last_2_months");
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Month matrix selection state ──
  const now = new Date();
  const [matrixYear, setMatrixYear] = useState<number>(now.getFullYear());
  const [matrixMonth, setMatrixMonth] = useState<number>(now.getMonth());

  // ── Selected day filter (YYYY-MM-DD string or null) ──
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  // ── Event type filter (All, Increment, Reduce, Damage) & Search ──
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Hover popover state ──
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  // ── Data state ──
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowRangeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
  // 2. Active Date Range Bounds & Filtered Transactions
  // ---------------------------------------------------------------------------
  const rangeBounds = useMemo(() => {
    return getDateRangeBounds(datePreset, customStartDate, customEndDate);
  }, [datePreset, customStartDate, customEndDate]);

  // Transactions within selected date range
  const rangeTransactions = useMemo(() => {
    const startMs = rangeBounds.start.getTime();
    const endMs = rangeBounds.end.getTime();
    return transactions.filter(
      (tx) => tx.createdAt >= startMs && tx.createdAt <= endMs
    );
  }, [transactions, rangeBounds]);

  // Months contained within the selected date range (for dot matrix tabs)
  const rangeMonths = useMemo(() => {
    const months: { year: number; month: number; label: string }[] = [];
    const cur = new Date(rangeBounds.start.getFullYear(), rangeBounds.start.getMonth(), 1);
    const end = new Date(rangeBounds.end.getFullYear(), rangeBounds.end.getMonth(), 1);

    while (cur <= end) {
      months.push({
        year: cur.getFullYear(),
        month: cur.getMonth(),
        label: `${MONTH_NAMES[cur.getMonth()]} ${cur.getFullYear()}`,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  }, [rangeBounds]);

  // Sync matrix month if current selection is outside range
  useEffect(() => {
    if (rangeMonths.length > 0) {
      const exists = rangeMonths.some(
        (m) => m.year === matrixYear && m.month === matrixMonth
      );
      if (!exists) {
        // default to latest month in range
        const latest = rangeMonths[rangeMonths.length - 1];
        setMatrixYear(latest.year);
        setMatrixMonth(latest.month);
      }
    }
  }, [rangeMonths, matrixYear, matrixMonth]);

  // Helper to categorize stock changes
  const getChangeMeta = useCallback((tx: StockTransaction) => {
    if (tx.type === "DAMAGED") {
      return {
        category: "damage" as const,
        label: "Damage",
        icon: AlertTriangle,
        colorText: "text-rose-400",
        colorBg: "bg-rose-500/10",
        colorBorder: "border-rose-500/25",
        colorDot: "bg-rose-400 shadow-[0_0_8px_#f43f5e]",
        colorBar: "bg-rose-500",
      };
    }
    if (tx.type === "STOCK_IN" || tx.quantityDelta > 0) {
      return {
        category: "increment" as const,
        label: tx.type === "STOCK_IN" ? "Restock In" : "Increment",
        icon: ArrowUpRight,
        colorText: "text-emerald-400",
        colorBg: "bg-emerald-500/10",
        colorBorder: "border-emerald-500/25",
        colorDot: "bg-emerald-400 shadow-[0_0_8px_#10b981]",
        colorBar: "bg-emerald-500",
      };
    }
    // Reduce: STOCK_OUT, SALE, or negative adjustment
    return {
      category: "reduce" as const,
      label: tx.type === "SALE" ? "POS Sale" : tx.type === "STOCK_OUT" ? "Stock Out" : "Reduction",
      icon: tx.type === "SALE" ? ShoppingCart : ArrowDownRight,
      colorText: "text-amber-400",
      colorBg: "bg-amber-500/10",
      colorBorder: "border-amber-500/25",
      colorDot: "bg-amber-400 shadow-[0_0_8px_#f59e0b]",
      colorBar: "bg-amber-500",
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 3. Daily Movement Map across Selected Range
  // ---------------------------------------------------------------------------
  interface DayEntry {
    dateKey: string; // YYYY-MM-DD
    dateObj: Date;
    dayNum: number;
    monthNum: number;
    yearNum: number;
    transactions: StockTransaction[];
    inUnits: number;
    outUnits: number;
    damagedUnits: number;
    totalVolume: number;
    hasIncrement: boolean;
    hasReduce: boolean;
    hasDamage: boolean;
  }

  const dailyMap = useMemo(() => {
    const map = new Map<string, DayEntry>();
    const cur = new Date(rangeBounds.start);
    cur.setHours(0, 0, 0, 0);

    const end = new Date(rangeBounds.end);
    end.setHours(23, 59, 59, 999);

    while (cur <= end) {
      const year = cur.getFullYear();
      const month = String(cur.getMonth() + 1).padStart(2, "0");
      const day = String(cur.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;

      map.set(key, {
        dateKey: key,
        dateObj: new Date(cur),
        dayNum: cur.getDate(),
        monthNum: cur.getMonth(),
        yearNum: cur.getFullYear(),
        transactions: [],
        inUnits: 0,
        outUnits: 0,
        damagedUnits: 0,
        totalVolume: 0,
        hasIncrement: false,
        hasReduce: false,
        hasDamage: false,
      });

      cur.setDate(cur.getDate() + 1);
    }

    rangeTransactions.forEach((tx) => {
      const txDate = new Date(tx.createdAt);
      const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, "0")}-${String(txDate.getDate()).padStart(2, "0")}`;
      const entry = map.get(key);
      if (entry) {
        entry.transactions.push(tx);
        const qty = Math.abs(tx.quantityDelta);
        entry.totalVolume += qty;

        if (tx.type === "DAMAGED") {
          entry.damagedUnits += qty;
          entry.hasDamage = true;
        } else if (tx.type === "STOCK_IN" || tx.quantityDelta > 0) {
          entry.inUnits += qty;
          entry.hasIncrement = true;
        } else {
          entry.outUnits += qty;
          entry.hasReduce = true;
        }
      }
    });

    return map;
  }, [rangeBounds, rangeTransactions]);

  const daysArray = useMemo(() => Array.from(dailyMap.values()), [dailyMap]);

  // Max daily volume for responsive bar chart scaling
  const maxDayVolume = useMemo(() => {
    let max = 1;
    daysArray.forEach((d) => {
      if (d.totalVolume > max) max = d.totalVolume;
    });
    return max;
  }, [daysArray]);

  // ---------------------------------------------------------------------------
  // 4. Range Aggregates & KPIs
  // ---------------------------------------------------------------------------
  const rangeSummary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalDamaged = 0;
    let incrementCount = 0;
    let reduceCount = 0;
    let damageCount = 0;

    rangeTransactions.forEach((tx) => {
      const qty = Math.abs(tx.quantityDelta);
      if (tx.type === "DAMAGED") {
        totalDamaged += qty;
        damageCount++;
      } else if (tx.type === "STOCK_IN" || tx.quantityDelta > 0) {
        totalIn += qty;
        incrementCount++;
      } else {
        totalOut += qty;
        reduceCount++;
      }
    });

    const netUnits = totalIn - totalOut - totalDamaged;
    const totalVolume = totalIn + totalOut + totalDamaged;
    const activeDays = daysArray.filter((d) => d.transactions.length > 0).length;

    return {
      totalMovements: rangeTransactions.length,
      totalVolume,
      totalIn,
      totalOut,
      totalDamaged,
      netUnits,
      activeDays,
      totalDays: daysArray.length,
      incrementCount,
      reduceCount,
      damageCount,
    };
  }, [rangeTransactions, daysArray]);

  // Overall Catalog Valuation
  const valuation: StockValuationSummary = useMemo(() => {
    return calculateStockValuation(products, transactions);
  }, [products, transactions]);

  const potentialProfit = Math.max(0, valuation.totalRetailValue - valuation.totalCostValue);
  const potentialMarginPct =
    valuation.totalRetailValue > 0
      ? ((potentialProfit / valuation.totalRetailValue) * 100).toFixed(1)
      : "0";

  // ---------------------------------------------------------------------------
  // 5. Filtered Transactions for Detailed Ledger
  // ---------------------------------------------------------------------------
  const displayedTransactions = useMemo(() => {
    let list = rangeTransactions;

    // Filter by selected day if active
    if (selectedDateKey) {
      list = dailyMap.get(selectedDateKey)?.transactions || [];
    }

    // Filter by event type
    if (typeFilter !== "ALL") {
      list = list.filter((tx) => {
        if (typeFilter === "DAMAGE") return tx.type === "DAMAGED";
        if (typeFilter === "INCREMENT") return tx.type === "STOCK_IN" || tx.quantityDelta > 0;
        if (typeFilter === "REDUCE") return tx.type !== "DAMAGED" && (tx.type === "STOCK_OUT" || tx.type === "SALE" || tx.quantityDelta < 0);
        return true;
      });
    }

    // Filter by text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((tx) =>
        (tx.productName || "").toLowerCase().includes(q) ||
        (tx.sku || "").toLowerCase().includes(q) ||
        (tx.reason || "").toLowerCase().includes(q) ||
        (tx.referenceNumber || "").toLowerCase().includes(q) ||
        (tx.performedBy?.displayName || "").toLowerCase().includes(q) ||
        (tx.performedBy?.username || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [rangeTransactions, selectedDateKey, dailyMap, typeFilter, searchQuery]);

  // Format currency
  const formatCurrency = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // ---------------------------------------------------------------------------
  // 6. CSV Export for Active Date Range
  // ---------------------------------------------------------------------------
  const handleExportCsv = () => {
    const shopDisplayName = shop?.shopName || "POS Store";
    const dateRangeStr = `${rangeBounds.start.toISOString().slice(0, 10)} to ${rangeBounds.end.toISOString().slice(0, 10)}`;

    const lines: string[] = [
      `"STOCK ACTIVITY AUDIT LEDGER - ${shopDisplayName}"`,
      `"Date Range","${dateRangeStr}"`,
      `"Generated At","${new Date().toLocaleString()}"`,
      "",
      `"SUMMARY METRICS"`,
      `"Total Movements",${rangeSummary.totalMovements}`,
      `"Total Units Volume",${rangeSummary.totalVolume}`,
      `"Total Increments (+)",${rangeSummary.totalIn}`,
      `"Total Reductions (-)",${rangeSummary.totalOut}`,
      `"Total Damaged (-)",${rangeSummary.totalDamaged}`,
      `"Net Stock Movement",${rangeSummary.netUnits}`,
      `"Active Activity Days","${rangeSummary.activeDays} of ${rangeSummary.totalDays}"`,
      "",
      `"TRANSACTION AUDIT RECORDS"`,
      `"Date","Time","Product","SKU","Type","Category","Quantity Delta","Previous Stock","New Stock","Reason","Reference","Staff","Role"`,
    ];

    displayedTransactions.forEach((tx) => {
      const d = new Date(tx.createdAt);
      const meta = getChangeMeta(tx);
      lines.push(
        `"${d.toISOString().slice(0, 10)}","${d.toLocaleTimeString()}","${(tx.productName || "").replace(/"/g, '""')}","${tx.sku}","${tx.type}","${meta.label}",${tx.quantityDelta},${tx.previousStock},${tx.newStock},"${(tx.reason || "").replace(/"/g, '""')}","${tx.referenceNumber || ""}","${tx.performedBy?.displayName || tx.performedBy?.username || ""}","${tx.performedBy?.role || ""}"`
      );
    });

    const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `stock_activity_${rangeBounds.start.toISOString().slice(0, 10)}_${rangeBounds.end.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Matrix days calculation for the active matrix tab
  const daysInMatrixMonth = useMemo(() => {
    return new Date(matrixYear, matrixMonth + 1, 0).getDate();
  }, [matrixYear, matrixMonth]);

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans selection:bg-zinc-800">
      {/* ── Top Bar (Clean, no heading & description, secondary color is gray) ── */}
      <header className="sticky top-0 z-40 bg-[#090a0f]/95 backdrop-blur border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Back button & sleek breadcrumbs */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => router.push("/shop/stock")}
            className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            title="Return to Stock"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
            <span className="text-zinc-500">{shop?.shopName || "POS"}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-300 font-semibold flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-zinc-400" />
              Stock Analytics
            </span>
          </div>
        </div>

        {/* Right: Date Range Selector & Export Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Date Range Picker Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowRangeDropdown(!showRangeDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
            >
              <CalendarDays className="w-3.5 h-3.5 text-zinc-400" />
              <span>{rangeBounds.label}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {showRangeDropdown && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-2 z-50 text-xs animate-in fade-in zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Select Date Range
                </div>
                <div className="space-y-0.5 mt-1">
                  {[
                    { id: "today", label: "Today" },
                    { id: "last_7_days", label: "Last 7 Days" },
                    { id: "last_30_days", label: "Last 30 Days" },
                    { id: "this_month", label: "This Month" },
                    { id: "last_2_months", label: "Last 2 Months" },
                    { id: "last_3_months", label: "Last 3 Months" },
                    { id: "last_6_months", label: "Last 6 Months" },
                    { id: "custom", label: "Custom Range" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setDatePreset(item.id as DateRangePreset);
                        if (item.id !== "custom") {
                          setShowRangeDropdown(false);
                          setSelectedDateKey(null);
                        }
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                        datePreset === item.id
                          ? "bg-zinc-800 text-white font-medium"
                          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                      }`}
                    >
                      <span>{item.label}</span>
                      {datePreset === item.id && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                    </button>
                  ))}
                </div>

                {datePreset === "custom" && (
                  <div className="pt-2.5 mt-1.5 border-t border-zinc-800 space-y-2 px-1">
                    <div>
                      <span className="text-[10px] text-zinc-400 block mb-1">From</span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 block mb-1">To</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                      />
                    </div>
                    <button
                      onClick={() => setShowRangeDropdown(false)}
                      className="w-full py-1.5 mt-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer"
                    >
                      Apply Range
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
            title="Export CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </header>

      {/* ── Main Data Visualization Content ── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">
        {/* ══════════════════════════════════════════════════ */}
        {/* 1. DATA VISUALIZATION SUMMARY METRICS (GRAY SECONDARY) */}
        {/* ══════════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Total Movements */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between gap-1">
            <span className="text-[11px] font-medium text-zinc-400">Total Movements</span>
            <div className="text-xl font-bold font-mono text-zinc-100">
              {rangeSummary.totalMovements.toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Across {rangeSummary.activeDays} of {rangeSummary.totalDays} days
            </div>
          </div>

          {/* Card 2: Increments (Emerald Color Added) */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">Increment</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              +{rangeSummary.totalIn.toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {rangeSummary.incrementCount} restock / entries
            </div>
          </div>

          {/* Card 3: Reductions (Amber Color Added) */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">Reduce</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              -{rangeSummary.totalOut.toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {rangeSummary.reduceCount} sales / deductions
            </div>
          </div>

          {/* Card 4: Damaged (Rose Color Added) */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">Damage</span>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_#f43f5e]" />
            </div>
            <div className="text-xl font-bold font-mono text-rose-400">
              -{rangeSummary.totalDamaged.toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {rangeSummary.damageCount} write-offs
            </div>
          </div>

          {/* Card 5: Net Units Delta */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between gap-1 col-span-2 lg:col-span-1">
            <span className="text-[11px] font-medium text-zinc-400">Net Delta</span>
            <div className={`text-xl font-bold font-mono ${
              rangeSummary.netUnits > 0
                ? "text-emerald-400"
                : rangeSummary.netUnits < 0
                ? "text-rose-400"
                : "text-zinc-300"
            }`}>
              {rangeSummary.netUnits > 0 ? `+${rangeSummary.netUnits}` : rangeSummary.netUnits}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {valuation.totalUnits.toLocaleString()} units current stock
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* 2. INTERACTIVE TIMELINE / DISTRIBUTION GRAPH        */}
        {/* ══════════════════════════════════════════════════ */}
        <section className="p-4 md:p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-300 font-mono">
                {rangeBounds.start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" — "}
                {rangeBounds.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              {selectedDateKey && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Filtered: {selectedDateKey}
                </span>
              )}
            </div>

            {/* Change Type Color Keys */}
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_#10b981]" />
                <span className="text-emerald-400 font-medium">Increment</span>
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_5px_#f59e0b]" />
                <span className="text-amber-400 font-medium">Reduce</span>
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_5px_#f43f5e]" />
                <span className="text-rose-400 font-medium">Damage</span>
              </span>
              {selectedDateKey && (
                <button
                  onClick={() => setSelectedDateKey(null)}
                  className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer ml-1"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Time Series Bar Chart */}
          <div className="pt-4 pb-1 overflow-x-auto">
            <div className="h-40 min-w-[500px] flex items-end gap-1 px-1 border-b border-zinc-800">
              {daysArray.map((day) => {
                const heightPct = maxDayVolume > 0 ? (day.totalVolume / maxDayVolume) * 100 : 0;
                const isSelected = selectedDateKey === day.dateKey;
                const hasActivity = day.totalVolume > 0;

                return (
                  <div
                    key={day.dateKey}
                    className="flex-1 min-w-[12px] flex flex-col items-center h-full justify-end group relative cursor-pointer"
                    onClick={() =>
                      setSelectedDateKey(selectedDateKey === day.dateKey ? null : day.dateKey)
                    }
                    onMouseEnter={(e) => {
                      setHoveredDateKey(day.dateKey);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPopoverPos({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setHoveredDateKey(null)}
                  >
                    {/* Bar Stack */}
                    <div
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                      className={`w-full max-w-[18px] rounded-t-sm transition-all duration-150 overflow-hidden flex flex-col justify-end ${
                        isSelected
                          ? "ring-2 ring-zinc-300 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                          : hasActivity
                          ? "group-hover:opacity-90"
                          : "opacity-25"
                      }`}
                    >
                      {hasActivity ? (
                        <div className="w-full h-full flex flex-col justify-end">
                          {day.damagedUnits > 0 && (
                            <div
                              style={{ height: `${(day.damagedUnits / day.totalVolume) * 100}%` }}
                              className="bg-rose-500 w-full"
                            />
                          )}
                          {day.outUnits > 0 && (
                            <div
                              style={{ height: `${(day.outUnits / day.totalVolume) * 100}%` }}
                              className="bg-amber-500 w-full"
                            />
                          )}
                          {day.inUnits > 0 && (
                            <div
                              style={{ height: `${(day.inUnits / day.totalVolume) * 100}%` }}
                              className="bg-emerald-500 w-full"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-full bg-zinc-800/80" />
                      )}
                    </div>

                    {/* Date label */}
                    <span
                      className={`text-[8.5px] font-mono mt-1.5 transition-colors select-none ${
                        isSelected
                          ? "text-zinc-100 font-bold"
                          : hasActivity
                          ? "text-zinc-400 group-hover:text-zinc-200"
                          : "text-zinc-600"
                      }`}
                    >
                      {day.dayNum === 1 || daysArray.length <= 14 ? `${day.monthNum + 1}/${day.dayNum}` : day.dayNum}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* 3. DATE MATRIX WITH CHANGE COLOR INDICATORS        */}
        {/* ══════════════════════════════════════════════════ */}
        <section className="p-4 md:p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 shadow-lg">
          {/* Header controls: month tabs if multi-month, else active month */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-1.5 flex-wrap">
              {rangeMonths.map((m) => (
                <button
                  key={`${m.year}-${m.month}`}
                  onClick={() => {
                    setMatrixYear(m.year);
                    setMatrixMonth(m.month);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    matrixYear === m.year && matrixMonth === m.month
                      ? "bg-zinc-800 text-white font-semibold border border-zinc-700"
                      : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs">
              {/* Legend with change colors */}
              <div className="flex items-center gap-3 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800/80 font-mono text-[10.5px]">
                <span className="flex items-center gap-1 text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  +In
                </span>
                <span className="flex items-center gap-1 text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  -Out
                </span>
                <span className="flex items-center gap-1 text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Damage
                </span>
              </div>

              {selectedDateKey && (
                <button
                  onClick={() => setSelectedDateKey(null)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-zinc-400" />
                  <span>Show All</span>
                </button>
              )}
            </div>
          </div>

          {/* Matrix Grid of Days for Active Month */}
          <div className="py-3">
            <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-16 gap-2 sm:gap-2.5 items-center justify-items-center">
              {Array.from({ length: daysInMatrixMonth }, (_, i) => i + 1).map((day) => {
                const dateKey = `${matrixYear}-${String(matrixMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEntry = dailyMap.get(dateKey);
                const hasActivity = dayEntry && dayEntry.transactions.length > 0;
                const isSelected = selectedDateKey === dateKey;
                const isToday =
                  now.getFullYear() === matrixYear &&
                  now.getMonth() === matrixMonth &&
                  now.getDate() === day;

                return (
                  <div
                    key={dateKey}
                    className="relative flex flex-col items-center group cursor-pointer"
                    onClick={() =>
                      setSelectedDateKey(selectedDateKey === dateKey ? null : dateKey)
                    }
                    onMouseEnter={(e) => {
                      setHoveredDateKey(dateKey);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPopoverPos({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setHoveredDateKey(null)}
                  >
                    {/* Day button - Sleek gray base with specific change color dots */}
                    <button
                      type="button"
                      className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? "ring-2 ring-zinc-300 bg-zinc-800 scale-105"
                          : hasActivity
                          ? "bg-zinc-800/90 text-zinc-200 border border-zinc-700 hover:bg-zinc-700/80 hover:scale-105"
                          : "bg-zinc-950/70 text-zinc-500 border border-zinc-800/80 hover:text-zinc-300 hover:bg-zinc-900"
                      }`}
                    >
                      <span className="text-[11px] font-mono leading-none select-none">
                        {day}
                      </span>

                      {/* Multi-color change dots on the day button */}
                      {hasActivity && (
                        <div className="flex items-center gap-0.5 mt-1">
                          {dayEntry.hasIncrement && (
                            <span className="w-1 h-1 rounded-full bg-emerald-400" />
                          )}
                          {dayEntry.hasReduce && (
                            <span className="w-1 h-1 rounded-full bg-amber-400" />
                          )}
                          {dayEntry.hasDamage && (
                            <span className="w-1 h-1 rounded-full bg-rose-400" />
                          )}
                        </div>
                      )}

                      {/* Today pulse dot */}
                      {isToday && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-zinc-300 border border-zinc-950" />
                      )}
                    </button>

                    {/* Delta label below button */}
                    <span
                      className={`text-[8.5px] font-mono mt-1 ${
                        isSelected
                          ? "text-zinc-200 font-bold"
                          : hasActivity
                          ? dayEntry.hasDamage
                            ? "text-rose-400 font-medium"
                            : dayEntry.hasIncrement
                            ? "text-emerald-400 font-medium"
                            : "text-amber-400 font-medium"
                          : "text-zinc-600"
                      }`}
                    >
                      {hasActivity ? `${dayEntry.totalVolume}` : "·"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* 4. STOCK CHANGES EVENT LEDGER (NEW STYLE & ICONS) */}
        {/* ══════════════════════════════════════════════════ */}
        <section className="p-4 md:p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 shadow-lg">
          {/* Controls toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2.5 pb-3 border-b border-zinc-800/80">
            {/* Filter chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "ALL", label: `All (${displayedTransactions.length})` },
                { id: "INCREMENT", label: "Increments (+)", dot: "bg-emerald-400" },
                { id: "REDUCE", label: "Reductions (-)", dot: "bg-amber-400" },
                { id: "DAMAGE", label: "Damaged", dot: "bg-rose-400" },
              ].map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setTypeFilter(chip.id as EventTypeFilter)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer ${
                    typeFilter === chip.id
                      ? "bg-zinc-800 text-white font-medium border border-zinc-700"
                      : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800/80"
                  }`}
                >
                  {chip.dot && <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />}
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search product, SKU, staff, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Event Items List */}
          {displayedTransactions.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-500 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800/80">
              <Package className="w-7 h-7 text-zinc-600" />
              <p className="text-xs font-mono">No stock changes match the selected criteria.</p>
            </div>
          ) : (
            <div className="space-y-2 mt-3">
              {displayedTransactions.map((tx) => {
                const txDate = new Date(tx.createdAt);
                const meta = getChangeMeta(tx);
                const IconComponent = meta.icon;
                const isPositive = tx.quantityDelta > 0;

                return (
                  <div
                    key={tx.id}
                    className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-900/80 border border-zinc-800/80 transition-all flex items-center justify-between gap-3 text-xs"
                  >
                    {/* Left: Event Icon (Only change color added) + Product details */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon container with change color */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.colorBg} border ${meta.colorBorder} ${meta.colorText}`}
                        title={meta.label}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-zinc-100 truncate">
                            {tx.productName}
                          </span>
                          {tx.variantName && (
                            <span className="text-[10px] text-zinc-400 px-1.5 py-0.2 rounded bg-zinc-800/80 font-mono">
                              {tx.variantName}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 font-mono">
                            #{tx.sku}
                          </span>
                          {/* Change Type Badge (Only change color added) */}
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${meta.colorBg} ${meta.colorBorder} ${meta.colorText}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="text-zinc-400">{tx.reason || tx.type}</span>
                          {tx.referenceNumber && (
                            <>
                              <span className="text-zinc-600">•</span>
                              <span className="font-mono text-zinc-500">Ref: {tx.referenceNumber}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Staff Member (Sleek gray style) */}
                    <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-zinc-500" />
                      <div className="text-[11px] font-mono">
                        <span className="text-zinc-300">
                          {tx.performedBy?.displayName || tx.performedBy?.username || "Staff"}
                        </span>
                        {tx.performedBy?.role && (
                          <span className="text-zinc-500 text-[9.5px] ml-1 uppercase">
                            ({tx.performedBy.role})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Quantity Delta (Only change color added) & Transition */}
                    <div className="text-right flex-shrink-0">
                      <div className={`text-sm font-bold font-mono ${meta.colorText}`}>
                        {isPositive ? `+${tx.quantityDelta}` : tx.quantityDelta} units
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5 flex items-center justify-end gap-1.5">
                        <span>{tx.previousStock} → {tx.newStock}</span>
                        <span className="text-zinc-600">•</span>
                        <span>
                          {txDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                          {txDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
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
      {/* FLOATING HOVER POPOVER (SLEEK GRAY WITH CHANGE COLORS) */}
      {/* ══════════════════════════════════════════════════ */}
      {hoveredDateKey !== null && popoverPos !== null && (
        (() => {
          const dayEntry = dailyMap.get(hoveredDateKey);
          const dayTxs = dayEntry?.transactions || [];
          const hasTxs = dayTxs.length > 0;
          const dayDate = dayEntry?.dateObj || new Date();
          const dayLabel = dayDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          return (
            <div
              className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-2.5 w-76 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-3 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
              style={{
                left: `${popoverPos.x}px`,
                top: `${popoverPos.y - 8}px`,
              }}
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="font-semibold text-zinc-100 font-mono text-[11px]">
                  {dayLabel}
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  {hasTxs ? `${dayTxs.length} event${dayTxs.length !== 1 ? "s" : ""}` : "No events"}
                </span>
              </div>

              {/* Popover Content */}
              {hasTxs ? (
                <div className="pt-2 space-y-2">
                  {/* Breakdown pill */}
                  <div className="flex items-center justify-between text-[10.5px] font-mono text-zinc-400 bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800/80">
                    <span className="text-emerald-400">+{dayEntry?.inUnits || 0}</span>
                    <span className="text-amber-400">-{dayEntry?.outUnits || 0}</span>
                    <span className="text-rose-400">-{dayEntry?.damagedUnits || 0}</span>
                    <span className="text-zinc-500 font-medium">Vol: {dayEntry?.totalVolume || 0}</span>
                  </div>

                  {/* Top 3 transactions */}
                  <div className="space-y-1.5 max-h-44 overflow-hidden">
                    {dayTxs.slice(0, 3).map((tx) => {
                      const meta = getChangeMeta(tx);
                      return (
                        <div
                          key={tx.id}
                          className="p-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-[10.5px]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-200 truncate font-medium max-w-[170px]">
                              {tx.productName}
                            </span>
                            <span className={`font-mono font-bold ${meta.colorText}`}>
                              {tx.quantityDelta > 0 ? `+${tx.quantityDelta}` : tx.quantityDelta}
                            </span>
                          </div>
                          <div className="text-[9.5px] text-zinc-400 mt-0.5 truncate flex items-center justify-between">
                            <span>{tx.reason || tx.type}</span>
                            <span className="font-mono text-zinc-500">
                              {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {dayTxs.length > 3 && (
                    <div className="text-[9.5px] text-zinc-500 text-center font-mono">
                      + {dayTxs.length - 3} more (click day to view)
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-2 text-center text-zinc-500 text-[11px] font-mono">
                  No stock adjustments on this date.
                </div>
              )}

              {/* Triangle indicator */}
              <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-0 h-0 border-x-6 border-x-transparent border-t-6 border-t-zinc-900" />
            </div>
          );
        })()
      )}
    </div>
  );
}
