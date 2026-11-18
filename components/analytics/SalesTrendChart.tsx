"use client";

/**
 * components/analytics/SalesTrendChart.tsx
 *
 * Luminous Spotlight Bar Chart harmonized with the Skyfox root dark-glass theme:
 * - Root container: `rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`
 * - Root accent palette: emerald (`#10b981`) &zinc/white specular highlights
 * - Filters by Daily (every day of month), Weekly, Monthly, or By Time (Hourly), plus Month, Year, and Day pickers
 */

import React, { useState, useMemo } from "react";
import { SaleRecord } from "@/lib/types/sale";
import {
  TimelineDataPoint,
  getSaleRefundAmount,
} from "@/lib/services/salesAnalyticsService";
import {
  BarChart2,
  MoreHorizontal,
  Sparkles,
  Calendar,
} from "lucide-react";

export type BarPeriodMode = "daily" | "weekly" | "monthly" | "hourly";
export type MetricTabMode = "income" | "gross" | "net_margin";

interface SalesTrendChartProps {
  timeline: TimelineDataPoint[];
  sales?: SaleRecord[];
  currencySymbol?: string;
  className?: string;
}

interface BarBucket {
  key: string;
  label: string;
  fullLabel: string;
  income: number;
  gross: number;
  netMargin: number;
  ordersCount: number;
  itemsCount: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function SalesTrendChart({
  sales = [],
  currencySymbol = "LKR",
  className = "",
}: SalesTrendChartProps) {
  const now = new Date();
  const [periodMode, setPeriodMode] = useState<BarPeriodMode>("daily");
  const [metricTab, setMetricTab] = useState<MetricTabMode>("income");
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | "ALL">("ALL");
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null);

  const daysInMonth = useMemo(
    () => new Date(selectedYear, selectedMonth + 1, 0).getDate(),
    [selectedYear, selectedMonth]
  );

  const buckets: BarBucket[] = useMemo(() => {
    const validSales = (sales || []).filter((s) => s.status !== "voided");

    const calcSaleCost = (s: SaleRecord) => {
      if (!Array.isArray(s.items)) return 0;
      return s.items.reduce(
        (sum, it) => sum + (Number(it.costPrice) || 0) * (Number(it.quantity) || 1),
        0
      );
    };

    if (periodMode === "daily") {
      const map = new Map<number, BarBucket>();
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(selectedYear, selectedMonth, d);
        const wk = dt.toLocaleDateString("en-US", { weekday: "short" });
        map.set(d, {
          key: `D-${d}`,
          label: String(d).padStart(2, "0"),
          fullLabel: `${wk}, ${SHORT_MONTHS[selectedMonth]} ${d}, ${selectedYear}`,
          income: 0,
          gross: 0,
          netMargin: 0,
          ordersCount: 0,
          itemsCount: 0,
        });
      }

      validSales.forEach((s) => {
        const dt = new Date(s.createdAt || Date.now());
        if (dt.getFullYear() !== selectedYear || dt.getMonth() !== selectedMonth) return;
        const d = dt.getDate();
        if (selectedDay !== "ALL" && d !== selectedDay) return;

        const b = map.get(d);
        if (!b) return;
        const gross = Number(s.grandTotal || s.total || 0);
        const refund = getSaleRefundAmount(s);
        const net = Math.max(0, gross - refund);
        const cogs = calcSaleCost(s);
        const items =
          s.itemCount ||
          (Array.isArray(s.items) ? s.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1);

        b.gross += gross;
        b.income += net;
        b.netMargin += Math.max(0, net - cogs);
        b.ordersCount += 1;
        b.itemsCount += items;
      });

      return Array.from(map.values());
    }

    if (periodMode === "weekly") {
      const list: BarBucket[] = [
        { key: "W1", label: "Wk 1", fullLabel: `${SHORT_MONTHS[selectedMonth]} 01 – 07`, income: 0, gross: 0, netMargin: 0, ordersCount: 0, itemsCount: 0 },
        { key: "W2", label: "Wk 2", fullLabel: `${SHORT_MONTHS[selectedMonth]} 08 – 14`, income: 0, gross: 0, netMargin: 0, ordersCount: 0, itemsCount: 0 },
        { key: "W3", label: "Wk 3", fullLabel: `${SHORT_MONTHS[selectedMonth]} 15 – 21`, income: 0, gross: 0, netMargin: 0, ordersCount: 0, itemsCount: 0 },
        { key: "W4", label: "Wk 4", fullLabel: `${SHORT_MONTHS[selectedMonth]} 22 – 28`, income: 0, gross: 0, netMargin: 0, ordersCount: 0, itemsCount: 0 },
      ];
      if (daysInMonth > 28) {
        list.push({
          key: "W5",
          label: "Wk 5",
          fullLabel: `${SHORT_MONTHS[selectedMonth]} 29 – ${daysInMonth}`,
          income: 0,
          gross: 0,
          netMargin: 0,
          ordersCount: 0,
          itemsCount: 0,
        });
      }

      validSales.forEach((s) => {
        const dt = new Date(s.createdAt || Date.now());
        if (dt.getFullYear() !== selectedYear || dt.getMonth() !== selectedMonth) return;
        const d = dt.getDate();
        const idx = Math.min(list.length - 1, Math.floor((d - 1) / 7));
        const b = list[idx];
        const gross = Number(s.grandTotal || s.total || 0);
        const refund = getSaleRefundAmount(s);
        const net = Math.max(0, gross - refund);
        const cogs = calcSaleCost(s);
        const items =
          s.itemCount ||
          (Array.isArray(s.items) ? s.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1);

        b.gross += gross;
        b.income += net;
        b.netMargin += Math.max(0, net - cogs);
        b.ordersCount += 1;
        b.itemsCount += items;
      });

      return list;
    }

    if (periodMode === "monthly") {
      const list: BarBucket[] = SHORT_MONTHS.map((m, idx) => ({
        key: `M-${idx}`,
        label: m,
        fullLabel: `${MONTH_NAMES[idx]} ${selectedYear}`,
        income: 0,
        gross: 0,
        netMargin: 0,
        ordersCount: 0,
        itemsCount: 0,
      }));

      validSales.forEach((s) => {
        const dt = new Date(s.createdAt || Date.now());
        if (dt.getFullYear() !== selectedYear) return;
        const b = list[dt.getMonth()];
        const gross = Number(s.grandTotal || s.total || 0);
        const refund = getSaleRefundAmount(s);
        const net = Math.max(0, gross - refund);
        const cogs = calcSaleCost(s);
        const items =
          s.itemCount ||
          (Array.isArray(s.items) ? s.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1);

        b.gross += gross;
        b.income += net;
        b.netMargin += Math.max(0, net - cogs);
        b.ordersCount += 1;
        b.itemsCount += items;
      });

      return list;
    }

    // 4. HOURLY TIME: Full 24 Hours (12 AM – 11 PM)
    const list: BarBucket[] = Array.from({ length: 24 }, (_, hr) => {
      const label =
        hr === 0 ? "12a" : hr < 12 ? `${hr}a` : hr === 12 ? "12p" : `${hr - 12}p`;
      const fullLabel =
        hr === 0
          ? "12:00 AM"
          : hr < 12
          ? `${hr}:00 AM`
          : hr === 12
          ? "12:00 PM"
          : `${hr - 12}:00 PM`;
      return {
        key: `H-${hr}`,
        label,
        fullLabel,
        income: 0,
        gross: 0,
        netMargin: 0,
        ordersCount: 0,
        itemsCount: 0,
      };
    });

    validSales.forEach((s) => {
      const dt = new Date(s.createdAt || Date.now());
      if (dt.getFullYear() !== selectedYear || dt.getMonth() !== selectedMonth) return;
      if (selectedDay !== "ALL" && dt.getDate() !== selectedDay) return;

      const hr = dt.getHours();
      const b = list[hr];
      const gross = Number(s.grandTotal || s.total || 0);
      const refund = getSaleRefundAmount(s);
      const net = Math.max(0, gross - refund);
      const cogs = calcSaleCost(s);
      const items =
        s.itemCount ||
        (Array.isArray(s.items) ? s.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1);

      b.gross += gross;
      b.income += net;
      b.netMargin += Math.max(0, net - cogs);
      b.ordersCount += 1;
      b.itemsCount += items;
    });

    return list;
  }, [sales, periodMode, selectedMonth, selectedYear, selectedDay, daysInMonth]);

  const getVal = (b: BarBucket) => {
    if (metricTab === "gross") return b.gross;
    if (metricTab === "net_margin") return b.netMargin;
    return b.income;
  };

  const peakIndex = useMemo(() => {
    let bestIdx = 0;
    let bestVal = -1;
    buckets.forEach((b, idx) => {
      const v = getVal(b);
      if (v > bestVal) {
        bestVal = v;
        bestIdx = idx;
      }
    });
    return bestVal > 0 ? bestIdx : Math.floor(buckets.length / 2);
  }, [buckets, metricTab]);

  const highlightedIndex = activeBarIndex !== null ? activeBarIndex : peakIndex;

  const totalMetricValue = useMemo(
    () => buckets.reduce((sum, b) => sum + getVal(b), 0),
    [buckets, metricTab]
  );

  const maxBarValue = useMemo(() => {
    let m = 0;
    buckets.forEach((b) => {
      const v = getVal(b);
      if (v > m) m = v;
    });
    return m > 0 ? m * 1.2 : 1000;
  }, [buckets, metricTab]);

  const formatYAxis = (v: number) => {
    if (v >= 1_000_000) return `${currencySymbol} ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${currencySymbol} ${(v / 1_000).toFixed(0)}k`;
    return `${currencySymbol} ${v.toFixed(0)}`;
  };

  return (
    <div
      className={`relative rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-5 overflow-hidden select-none ${className}`}
    >
      {/* ── TOP ROW: CASH FLOW / SALES HEADER + PERIOD SELECTORS ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
            {metricTab === "income"
              ? "CASH FLOW & NET SALES"
              : metricTab === "gross"
              ? "GROSS SALES VOLUME"
              : "ESTIMATED NET PROFIT"}
          </span>
          <div className="text-xl sm:text-2xl font-bold text-white tracking-tight font-mono mt-0.5">
            {currencySymbol}{" "}
            {totalMetricValue.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        {/* Right: Period Dropdowns matching root dark glass controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Month Picker */}
          <div className="flex items-center bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-2.5 py-1 text-xs text-zinc-200 transition-colors">
            <Calendar className="w-3.5 h-3.5 text-zinc-400 mr-1.5" />
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(Number(e.target.value));
                setSelectedDay("ALL");
                setActiveBarIndex(null);
              }}
              className="bg-transparent font-medium text-zinc-200 focus:outline-none cursor-pointer pr-1"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx} className="bg-[#0c0d15]">
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Year Picker */}
          <div className="flex items-center bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-2.5 py-1 text-xs text-zinc-200 transition-colors">
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
                setActiveBarIndex(null);
              }}
              className="bg-transparent font-mono font-medium text-zinc-200 focus:outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr} className="bg-[#0c0d15]">
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Specific Day Filter when in Daily or Hourly mode */}
          {(periodMode === "daily" || periodMode === "hourly") && (
            <div className="flex items-center bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-2.5 py-1 text-xs text-zinc-200 transition-colors">
              <select
                value={selectedDay}
                onChange={(e) => {
                  setSelectedDay(
                    e.target.value === "ALL" ? "ALL" : Number(e.target.value)
                  );
                  setActiveBarIndex(null);
                }}
                className="bg-transparent font-medium text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#0c0d15]">
                  All Days ({daysInMonth})
                </option>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d} className="bg-[#0c0d15]">
                    {SHORT_MONTHS[selectedMonth]} {String(d).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Granularity Selector (Daily / Weekly / Monthly / Time) */}
          <div className="flex items-center bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-2.5 py-1 text-xs text-white transition-colors">
            <select
              value={periodMode}
              onChange={(e) => {
                setPeriodMode(e.target.value as BarPeriodMode);
                setActiveBarIndex(null);
              }}
              className="bg-transparent font-semibold text-white focus:outline-none cursor-pointer pr-1"
            >
              <option value="daily" className="bg-[#0c0d15]">
                Daily (Every Day)
              </option>
              <option value="weekly" className="bg-[#0c0d15]">
                Weekly
              </option>
              <option value="monthly" className="bg-[#0c0d15]">
                Monthly
              </option>
              <option value="hourly" className="bg-[#0c0d15]">
                By Time (24h)
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* ── SECOND ROW: PILL TABS (Income / Gross Sales / Net Profit) + RIGHT ICON BUTTONS ── */}
      <div className="flex items-center justify-between gap-3 mt-3.5">
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/30 border border-white/[0.07]">
          {(
            [
              { id: "income", label: "Income" },
              { id: "gross", label: "Gross Sales" },
              { id: "net_margin", label: "Net Profit" },
            ] as const
          ).map((tab) => {
            const isActive = metricTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMetricTab(tab.id)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-zinc-800 text-white border border-zinc-700/60 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-400 font-mono mr-1">
            {buckets[highlightedIndex] && (
              <span>
                Selected:{" "}
                <strong className="text-emerald-400">
                  {buckets[highlightedIndex].fullLabel}
                </strong>{" "}
                ({buckets[highlightedIndex].ordersCount} orders)
              </span>
            )}
          </div>
          <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-emerald-400">
            <BarChart2 className="w-3.5 h-3.5" />
          </div>
          <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-400">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* ── LUMINOUS BAR CHART AREA (Root Emerald + Dark Glass Palette) ── */}
      <div className="relative mt-8 h-52 w-full flex flex-col justify-end">
        {/* Horizontal Y-Axis Grid Lines */}
        {[0, 0.33, 0.66, 1].map((ratio, idx) => {
          const val = maxBarValue * ratio;
          return (
            <div
              key={idx}
              style={{ bottom: `${ratio * 76 + 11}%` }}
              className="pointer-events-none absolute inset-x-0 flex items-center gap-2.5"
            >
              <span className="text-[9.5px] font-mono text-zinc-500 w-16 text-right shrink-0">
                {formatYAxis(val)}
              </span>
              <div className="flex-1 border-t border-white/[0.06]" />
            </div>
          );
        })}

        {/* Bars Container */}
        <div className="relative z-10 pl-18 pr-2 h-full flex items-end gap-1 sm:gap-2 pb-6 pt-8">
          {buckets.map((b, idx) => {
            const val = getVal(b);
            const isHighlighted = idx === highlightedIndex;
            const rawPct = maxBarValue > 0 ? (val / maxBarValue) * 100 : 0;
            const heightPct = Math.max(val > 0 ? 14 : 7, Math.min(100, rawPct));

            return (
              <div
                key={b.key}
                onMouseEnter={() => setActiveBarIndex(idx)}
                onClick={() => setActiveBarIndex(idx)}
                className="relative flex-1 h-full flex flex-col justify-end items-center group cursor-pointer"
              >
                {/* Floating Callout Pill + Glowing Star Sparkle on Highlighted Bar */}
                {isHighlighted && (
                  <div className="absolute -top-10 z-30 flex flex-col items-center pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-0.5 rounded-full bg-[#121420]/95 border border-emerald-500/35 shadow-xl text-[10px] font-mono font-bold text-white whitespace-nowrap">
                      {currencySymbol}{" "}
                      {val.toLocaleString("en-US", {
                        minimumFractionDigits: val % 1 === 0 ? 0 : 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="relative flex items-center justify-center mt-0.5">
                      <div className="w-3.5 h-3.5 rounded-full bg-emerald-300/80 blur-[3px] animate-pulse" />
                      <Sparkles className="w-3 h-3 text-white absolute drop-shadow-[0_0_8px_rgba(16,185,129,1)]" />
                    </div>
                  </div>
                )}

                {/* Rounded Bar Pillar (Root Dark Glass & Emerald Spotlight) */}
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`relative w-full max-w-[44px] rounded-t-xl transition-all duration-300 overflow-hidden ${
                    isHighlighted
                      ? "bg-gradient-to-b from-emerald-100 via-emerald-500 to-[#0c241d] shadow-[0_-6px_28px_rgba(16,185,129,0.5)] ring-1 ring-emerald-300/60 scale-x-[1.03]"
                      : val > 0
                      ? "bg-gradient-to-b from-zinc-700/70 to-zinc-900/80 hover:from-zinc-600/80 hover:to-zinc-800/90 border-t border-x border-white/[0.08]"
                      : "bg-gradient-to-b from-white/[0.04] to-white/[0.015] border-t border-x border-white/[0.04]"
                  }`}
                >
                  {isHighlighted && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white blur-[5px] opacity-90" />
                  )}
                </div>

                {/* X-Axis Label */}
                <span
                  className={`absolute -bottom-5 text-[9.5px] font-mono transition-colors ${
                    isHighlighted
                      ? "text-emerald-400 font-bold"
                      : val > 0
                      ? "text-zinc-400"
                      : "text-zinc-600"
                  }`}
                >
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
