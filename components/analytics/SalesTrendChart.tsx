"use client";

/**
 * components/analytics/SalesTrendChart.tsx
 *
 * Interactive dark-glass SVG chart for Sales, Net Revenue, and Refunds.
 * Features:
 * - Responsive SVG area & line rendering with subtle gradients
 * - Interactive hover cursor with floating inspection tooltip
 * - Series toggles (Gross Sales, Refunds, Net Revenue)
 * - Secondary gray axis ticks and labels
 * - Graceful fallback for empty or single-point datasets
 */

import React, { useState, useMemo } from "react";
import { TimelineDataPoint } from "@/lib/services/salesAnalyticsService";
import { TrendingUp, Layers, Check } from "lucide-react";

interface SalesTrendChartProps {
  timeline: TimelineDataPoint[];
  currencySymbol?: string;
  className?: string;
}

export default function SalesTrendChart({
  timeline,
  currencySymbol = "LKR",
  className = "",
}: SalesTrendChartProps) {
  const [activeSeries, setActiveSeries] = useState<{
    net: boolean;
    gross: boolean;
    refunds: boolean;
  }>({
    net: true,
    gross: true,
    refunds: true,
  });

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Chart bounds & layout (Reduced ~25%)
  const width = 800;
  const height = 210;
  const padding = { top: 20, right: 25, bottom: 35, left: 55 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Max value calculation across visible series
  const maxVal = useMemo(() => {
    if (!timeline || timeline.length === 0) return 1000;
    let m = 0;
    for (const pt of timeline) {
      if (activeSeries.gross) m = Math.max(m, pt.grossSales);
      if (activeSeries.net) m = Math.max(m, pt.netRevenue);
      if (activeSeries.refunds) m = Math.max(m, pt.refunds);
    }
    return m > 0 ? m * 1.15 : 1000; // 15% headroom
  }, [timeline, activeSeries]);

  // Coordinates computation
  const points = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    const count = timeline.length;
    const step = count > 1 ? innerWidth / (count - 1) : innerWidth / 2;

    return timeline.map((pt, i) => {
      const x = padding.left + (count > 1 ? i * step : innerWidth / 2);
      const grossY = padding.top + innerHeight - (pt.grossSales / maxVal) * innerHeight;
      const netY = padding.top + innerHeight - (pt.netRevenue / maxVal) * innerHeight;
      const refundY = padding.top + innerHeight - (pt.refunds / maxVal) * innerHeight;
      return { x, grossY, netY, refundY, data: pt };
    });
  }, [timeline, innerWidth, innerHeight, padding.left, padding.top, maxVal]);

  // SVG Path generators
  const netAreaPath = useMemo(() => {
    if (points.length < 2) return "";
    const bottomY = padding.top + innerHeight;
    let p = `M ${points[0].x} ${bottomY} L ${points[0].x} ${points[0].netY}`;
    for (let i = 1; i < points.length; i++) {
      p += ` L ${points[i].x} ${points[i].netY}`;
    }
    p += ` L ${points[points.length - 1].x} ${bottomY} Z`;
    return p;
  }, [points, padding.top, innerHeight]);

  const netLinePath = useMemo(() => {
    if (points.length < 2) return "";
    return points.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.netY}`, "");
  }, [points]);

  const grossLinePath = useMemo(() => {
    if (points.length < 2) return "";
    return points.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.grossY}`, "");
  }, [points]);

  const refundLinePath = useMemo(() => {
    if (points.length < 2) return "";
    return points.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.refundY}`, "");
  }, [points]);

  // Y-axis grid ticks
  const yTicks = useMemo(() => {
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    return ticks.map((ratio) => {
      const val = maxVal * ratio;
      const y = padding.top + innerHeight - ratio * innerHeight;
      return { val, y };
    });
  }, [maxVal, innerHeight, padding.top]);

  const hoveredData = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#0c0d15]/90 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 flex flex-col ${className}`}>
      {/* Header bar: Title, Legend toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              REVENUE & REFUNDS DYNAMICS
            </span>
          </div>
          <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
            <span>Sales Performance Trend</span>
            <span className="text-[11px] font-normal text-zinc-400">({timeline.length} intervals)</span>
          </h3>
        </div>

        {/* Legend series toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Net Revenue Toggle */}
          <button
            type="button"
            onClick={() => setActiveSeries((s) => ({ ...s, net: !s.net }))}
            className={`px-2 py-0.5 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSeries.net
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : "bg-white/[0.02] border-white/10 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="font-semibold text-[10px]">Net Revenue</span>
          </button>

          {/* Gross Sales Toggle */}
          <button
            type="button"
            onClick={() => setActiveSeries((s) => ({ ...s, gross: !s.gross }))}
            className={`px-2 py-0.5 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSeries.gross
                ? "bg-zinc-700/40 border-zinc-500/40 text-zinc-200"
                : "bg-white/[0.02] border-white/10 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />
            <span className="font-semibold text-[10px]">Gross Sales</span>
          </button>

          {/* Refunds Toggle */}
          <button
            type="button"
            onClick={() => setActiveSeries((s) => ({ ...s, refunds: !s.refunds }))}
            className={`px-2 py-0.5 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSeries.refunds
                ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                : "bg-white/[0.02] border-white/10 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
            <span className="font-semibold text-[10px]">Refunds</span>
          </button>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="relative w-full h-[210px]">
        {timeline.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
            <Layers className="w-8 h-8 text-zinc-600 animate-pulse" />
            <div className="text-xs font-semibold text-zinc-400">No Sales Data for Current Range</div>
            <div className="text-[11px] text-zinc-400 max-w-xs">
              Transactions processed within this date range will automatically render here.
            </div>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible select-none"
            preserveAspectRatio="none"
          >
            <defs>
              {/* Net Revenue subtle glass gradient */}
              <linearGradient id="netRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="70%" stopColor="#10b981" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
              </linearGradient>

              {/* Refunds gradient */}
              <linearGradient id="refundsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines & Y-axis labels */}
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={tick.y}
                  x2={width - padding.right}
                  y2={tick.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray={i === 0 ? "none" : "3,3"}
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="fill-zinc-500 font-mono text-[9px]"
                >
                  {tick.val >= 1000 ? `${(tick.val / 1000).toFixed(0)}k` : tick.val.toFixed(0)}
                </text>
              </g>
            ))}

            {/* X-axis date labels */}
            {points.map((pt, i) => {
              // Show evenly spaced labels to prevent crowding
              const showLabel =
                points.length <= 8 ||
                i === 0 ||
                i === points.length - 1 ||
                i % Math.ceil(points.length / 7) === 0;

              if (!showLabel) return null;

              return (
                <text
                  key={i}
                  x={pt.x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-zinc-500 font-medium text-[9px]"
                >
                  {pt.data.label}
                </text>
              );
            })}

            {/* Area Fill for Net Revenue */}
            {activeSeries.net && netAreaPath && (
              <path d={netAreaPath} fill="url(#netRevenueGrad)" />
            )}

            {/* Gross Sales Line */}
            {activeSeries.gross && grossLinePath && (
              <path
                d={grossLinePath}
                fill="none"
                stroke="#a1a1aa"
                strokeWidth="2"
                strokeDasharray="4,3"
                className="opacity-70"
              />
            )}

            {/* Refunds Line */}
            {activeSeries.refunds && refundLinePath && (
              <path
                d={refundLinePath}
                fill="none"
                stroke="#fb7185"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}

            {/* Net Revenue Hero Line */}
            {activeSeries.net && netLinePath && (
              <path
                d={netLinePath}
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                filter="drop-shadow(0px 2px 8px rgba(16,185,129,0.3))"
              />
            )}

            {/* Interactive Points & Vertical Marker on Hover */}
            {hoveredData && (
              <g>
                <line
                  x1={hoveredData.x}
                  y1={padding.top}
                  x2={hoveredData.x}
                  y2={padding.top + innerHeight}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />

                {activeSeries.net && (
                  <circle
                    cx={hoveredData.x}
                    cy={hoveredData.netY}
                    r="5"
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                )}
                {activeSeries.gross && (
                  <circle
                    cx={hoveredData.x}
                    cy={hoveredData.grossY}
                    r="4"
                    fill="#a1a1aa"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}
                {activeSeries.refunds && hoveredData.data.refunds > 0 && (
                  <circle
                    cx={hoveredData.x}
                    cy={hoveredData.refundY}
                    r="4"
                    fill="#f43f5e"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            )}

            {/* Invisible Hit Slices for Hover Interaction */}
            {points.map((pt, i) => {
              const sliceWidth = innerWidth / points.length;
              return (
                <rect
                  key={i}
                  x={pt.x - sliceWidth / 2}
                  y={padding.top}
                  width={sliceWidth}
                  height={innerHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}
          </svg>
        )}

        {/* Floating Tooltip */}
        {hoveredData && (
          <div
            className="absolute z-20 pointer-events-none p-3 rounded-2xl bg-[#121420]/95 backdrop-blur-xl border border-white/15 shadow-2xl space-y-1.5 transition-all text-xs"
            style={{
              left: `${Math.min(Math.max(10, (hoveredData.x / width) * 100), 75)}%`,
              top: "10px",
            }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-1.5">
              <span className="font-bold text-white text-[11px]">{hoveredData.data.label}</span>
              <span className="text-[10px] text-zinc-400 font-mono">
                {hoveredData.data.transactions} {hoveredData.data.transactions === 1 ? "Order" : "Orders"}
              </span>
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between gap-4 text-emerald-400 font-bold">
                <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Net Revenue
                </span>
                <span>
                  {currencySymbol} {hoveredData.data.netRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 text-zinc-300">
                <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  Gross Sales
                </span>
                <span>
                  {currencySymbol} {hoveredData.data.grossSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {hoveredData.data.refunds > 0 && (
                <div className="flex items-center justify-between gap-4 text-rose-400">
                  <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    Refunds
                  </span>
                  <span>
                    -{currencySymbol} {hoveredData.data.refunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 text-zinc-400 pt-1 border-t border-white/5 text-[10px]">
                <span>Items Sold</span>
                <span>{hoveredData.data.itemsSold} units</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Summary note in gray */}
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400">
        <span>Formula: Net Revenue = Gross Sales − Total Processed Refunds</span>
        <span>Strictly isolated to active store ID</span>
      </div>
    </div>
  );
}
