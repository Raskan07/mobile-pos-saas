"use client";

/**
 * components/analytics/SalesByTimeHeatmap.tsx
 *
 * Compact 24-Hour "Sales by time" Matrix Heatmap harmonized with the Skyfox root dark-glass theme:
 * - Root container: `rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`
 * - Overall size & box dimensions reduced by ~20% for a crisp, dense dashboard footprint
 * - Shows all 24 hours of the day (`12 am` through `11 pm`) simultaneously
 * - Built-in Date Filter (All Period, Today, This Week, This Month, or Specific Date picker)
 * - Root emerald (`#10b981`) intensity scale with diagonal striped hatching for intermediate tiers
 */

import React, { useState, useMemo } from "react";
import { Calendar, X } from "lucide-react";
import { SaleRecord } from "@/lib/types/sale";
import { getSaleRefundAmount } from "@/lib/services/salesAnalyticsService";

interface SalesByTimeHeatmapProps {
  sales: SaleRecord[];
  currencySymbol?: string;
  className?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ALL_24_HOURS: { hour: number; label: string }[] = Array.from(
  { length: 24 },
  (_, h) => ({
    hour: h,
    label:
      h === 0
        ? "12 am"
        : h < 12
        ? `${h} am`
        : h === 12
        ? "12 pm"
        : `${h - 12} pm`,
  })
);

export default function SalesByTimeHeatmap({
  sales = [],
  currencySymbol = "LKR",
  className = "",
}: SalesByTimeHeatmapProps) {
  const [dateFilterMode, setDateFilterMode] = useState<
    "all" | "this_month" | "this_week" | "custom_date"
  >("all");
  const [specificDate, setSpecificDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [hoveredCell, setHoveredCell] = useState<{
    dayIdx: number;
    hour: number;
    hourLabel: string;
    salesAmount: number;
    ordersCount: number;
  } | null>(null);

  // Filter sales by the component's date filter before building the 24h x 7d matrix
  const dateFilteredSales = useMemo(() => {
    const now = new Date();
    return (sales || []).filter((s) => {
      if (s.status === "voided") return false;
      if (dateFilterMode === "all") return true;

      const dt = new Date(s.createdAt || Date.now());
      if (dateFilterMode === "this_month") {
        return (
          dt.getFullYear() === now.getFullYear() &&
          dt.getMonth() === now.getMonth()
        );
      }
      if (dateFilterMode === "this_week") {
        const diffDays = (now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 7;
      }
      if (dateFilterMode === "custom_date" && specificDate) {
        const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(dt.getDate()).padStart(2, "0")}`;
        return ymd === specificDate;
      }
      return true;
    });
  }, [sales, dateFilterMode, specificDate]);

  // Aggregate sales by [weekday (0=Mon..6=Sun)][hour (0..23)]
  const { matrix, maxCellSales } = useMemo(() => {
    const grid: Record<string, { sales: number; orders: number }> = {};
    let maxVal = 0;

    dateFilteredSales.forEach((s) => {
      const dt = new Date(s.createdAt || Date.now());
      const jsDay = dt.getDay();
      const monBasedIdx = jsDay === 0 ? 6 : jsDay - 1;
      const hr = dt.getHours();

      const gross = Number(s.grandTotal || s.total || 0);
      const ref = getSaleRefundAmount(s);
      const net = Math.max(0, gross - ref);

      const key = `${monBasedIdx}_${hr}`;
      if (!grid[key]) {
        grid[key] = { sales: 0, orders: 0 };
      }
      grid[key].sales += net;
      grid[key].orders += 1;

      if (grid[key].sales > maxVal) {
        maxVal = grid[key].sales;
      }
    });

    return { matrix: grid, maxCellSales: maxVal };
  }, [dateFilteredSales]);

  const thresholds = useMemo(() => {
    if (maxCellSales <= 2500) {
      return [
        { val: 200, label: "200>" },
        { val: 500, label: "500>" },
        { val: 1000, label: "1,000>" },
        { val: 2000, label: "2,000>" },
      ];
    }
    const step = Math.ceil(maxCellSales / 4 / 500) * 500;
    return [
      {
        val: Math.round(step * 0.25),
        label: `${Math.round(step * 0.25).toLocaleString()}>`,
      },
      {
        val: Math.round(step * 0.6),
        label: `${Math.round(step * 0.6).toLocaleString()}>`,
      },
      {
        val: step * 1.2,
        label: `${Math.round(step * 1.2).toLocaleString()}>`,
      },
      { val: step * 2, label: `${Math.round(step * 2).toLocaleString()}>` },
    ];
  }, [maxCellSales]);

  const getCellTier = (amount: number): 0 | 1 | 2 | 3 | 4 => {
    if (amount <= 0) return 0;
    if (amount >= thresholds[3].val) return 4;
    if (amount >= thresholds[2].val) return 3;
    if (amount >= thresholds[1].val) return 2;
    return 1;
  };

  return (
    <div
      className={`relative rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-3.5 sm:p-4 flex flex-col justify-between select-none ${className}`}
    >
      {/* ── COMPACT HEADER: "Sales by time" + DATE FILTER + THRESHOLD LEGEND ── */}
      <div className="space-y-2 mb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[8.5px] font-bold uppercase tracking-widest text-zinc-400 block">
              24-HOUR REVENUE MATRIX
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
              Sales by time
            </h3>
          </div>

          {/* Date Filter Controls */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <div className="flex items-center bg-white/[0.04] border border-white/10 rounded-lg px-2 py-0.5 text-zinc-200">
              <Calendar className="w-3 h-3 text-emerald-400 mr-1" />
              <select
                value={dateFilterMode}
                onChange={(e) => setDateFilterMode(e.target.value as any)}
                className="bg-transparent font-medium text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#0c0d15]">
                  All Dates
                </option>
                <option value="this_month" className="bg-[#0c0d15]">
                  This Month
                </option>
                <option value="this_week" className="bg-[#0c0d15]">
                  Last 7 Days
                </option>
                <option value="custom_date" className="bg-[#0c0d15]">
                  Pick Date
                </option>
              </select>
            </div>

            {dateFilterMode === "custom_date" && (
              <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-lg px-1.5 py-0.5">
                <input
                  type="date"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="bg-transparent text-[10px] font-mono text-white focus:outline-none cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setDateFilterMode("all")}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                  title="Clear date filter"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Threshold Dots Legend (Root Emerald Palette) */}
        <div className="flex items-center justify-between gap-2 text-[9.5px] font-mono text-zinc-400 pt-0.5">
          <span>24h × 7d</span>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-950 border border-emerald-700/50" />
              <span>{thresholds[0].label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-800/80" />
              <span>{thresholds[1].label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>{thresholds[2].label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              <span>{thresholds[3].label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 24-HOUR COMPACT HEATMAP MATRIX GRID (Boxes reduced by ~20%+) ── */}
      <div className="space-y-[3px]">
        {ALL_24_HOURS.map((hRow) => (
          <div
            key={hRow.hour}
            className="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] items-center gap-1"
          >
            {/* Compact Y-Axis Hour Label */}
            <span className="text-[9px] font-mono text-zinc-400 leading-none pr-1 text-right">
              {hRow.label}
            </span>

            {/* 7 Smaller Weekday Boxes */}
            {WEEKDAYS.map((dayName, dayIdx) => {
              const cell = matrix[`${dayIdx}_${hRow.hour}`] || {
                sales: 0,
                orders: 0,
              };
              const tier = getCellTier(cell.sales);
              const isHovered =
                hoveredCell?.dayIdx === dayIdx &&
                hoveredCell?.hour === hRow.hour;

              // Root Emerald Diagonal Hatching for Tiers 1 & 2
              const hatchStyle =
                tier === 1
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(-45deg, rgba(16, 185, 129, 0.32), rgba(16, 185, 129, 0.32) 1.5px, rgba(15, 23, 42, 0.65) 1.5px, rgba(15, 23, 42, 0.65) 4px)",
                    }
                  : tier === 2
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(-45deg, rgba(16, 185, 129, 0.62), rgba(16, 185, 129, 0.62) 2px, rgba(6, 78, 59, 0.75) 2px, rgba(6, 78, 59, 0.75) 4px)",
                    }
                  : undefined;

              return (
                <div
                  key={`${dayName}_${hRow.hour}`}
                  onMouseEnter={() =>
                    setHoveredCell({
                      dayIdx,
                      hour: hRow.hour,
                      hourLabel: hRow.label,
                      salesAmount: cell.sales,
                      ordersCount: cell.orders,
                    })
                  }
                  onMouseLeave={() => setHoveredCell(null)}
                  style={hatchStyle}
                  className={`h-3.5 rounded-[4px] transition-all duration-100 cursor-pointer ${
                    tier === 4
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
                      : tier === 3
                      ? "bg-emerald-600/90"
                      : tier === 2
                      ? "border border-emerald-500/35"
                      : tier === 1
                      ? "border border-emerald-700/30"
                      : "bg-white/[0.035] hover:bg-white/[0.08]"
                  } ${isHovered ? "ring-1 ring-white scale-110 z-10" : ""}`}
                />
              );
            })}
          </div>
        ))}

        {/* X-Axis Weekday Labels Row */}
        <div className="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] items-center gap-1 pt-1.5">
          <div />
          {WEEKDAYS.map((dayName) => (
            <span
              key={dayName}
              className="text-center text-[9.5px] font-medium text-zinc-400"
            >
              {dayName}
            </span>
          ))}
        </div>
      </div>

      {/* ── COMPACT LIVE HOVER FOOTER READOUT ── */}
      <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10.5px] min-h-[20px]">
        {hoveredCell ? (
          <>
            <span className="text-zinc-300 font-medium">
              <strong className="text-white">{WEEKDAYS[hoveredCell.dayIdx]}</strong>{" "}
              •{" "}
              <strong className="text-white uppercase">
                {hoveredCell.hourLabel}
              </strong>
            </span>
            <span className="font-mono font-bold text-emerald-400">
              {currencySymbol}{" "}
              {hoveredCell.salesAmount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-zinc-400 font-normal">
                ({hoveredCell.ordersCount} sales)
              </span>
            </span>
          </>
        ) : (
          <span className="text-[10px] text-zinc-500">
            Hover any 24h box to view exact sales
          </span>
        )}
      </div>
    </div>
  );
}
