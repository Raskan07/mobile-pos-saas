"use client";

/**
 * components/analytics/MonthlySalesPerformanceChart.tsx
 *
 * Smooth Bezier Dual-Line Chart ("Monthly Sales performance" — Sales vs Target)
 * harmonized with the Skyfox root dark-glass theme:
 * - Root container: `rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`
 * - Root accent lines: Sales in Emerald (`#10b981`) & Target in Indigo/Cyan (`#6366f1`)
 * - Vertical dashed crosshair line with glowing white-ringed dots and floating dark-glass tooltip card
 */

import React, { useState, useMemo } from "react";
import { SaleRecord } from "@/lib/types/sale";
import { getSaleRefundAmount } from "@/lib/services/salesAnalyticsService";

interface MonthlySalesPerformanceChartProps {
  sales: SaleRecord[];
  currencySymbol?: string;
  className?: string;
}

interface MonthPerfPoint {
  monthIndex: number;
  shortLabel: string;
  fullDateLabel: string;
  totalSales: number;
  targetSales: number;
  ordersCount: number;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = [
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

function buildSmoothCubicPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export default function MonthlySalesPerformanceChart({
  sales = [],
  currencySymbol = "LKR",
  className = "",
}: MonthlySalesPerformanceChartProps) {
  const now = new Date();
  const [selectedYear] = useState<number>(now.getFullYear());
  const [halfWindow, setHalfWindow] = useState<"H1" | "H2" | "FULL">("FULL");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const rawYearPoints: MonthPerfPoint[] = useMemo(() => {
    const valid = (sales || []).filter((s) => s.status !== "voided");
    const monthTotals = new Array(12).fill(0);
    const monthOrders = new Array(12).fill(0);

    valid.forEach((s) => {
      const dt = new Date(s.createdAt || Date.now());
      if (dt.getFullYear() !== selectedYear) return;
      const m = dt.getMonth();
      const gross = Number(s.grandTotal || s.total || 0);
      const ref = getSaleRefundAmount(s);
      monthTotals[m] += Math.max(0, gross - ref);
      monthOrders[m] += 1;
    });

    const activeMonths = monthTotals.filter((v) => v > 0);
    const avgMonthly =
      activeMonths.length > 0
        ? activeMonths.reduce((a, b) => a + b, 0) / activeMonths.length
        : 4500;

    const waveFactors = [0.82, 0.9, 1.05, 0.92, 1.0, 1.12, 0.95, 1.04, 1.1, 0.96, 1.08, 1.18];

    return SHORT_MONTHS.map((shortLabel, idx) => ({
      monthIndex: idx,
      shortLabel,
      fullDateLabel: `${FULL_MONTHS[idx]} 1, ${selectedYear}`,
      totalSales: Math.round(monthTotals[idx]),
      targetSales: Math.round(avgMonthly * waveFactors[idx]),
      ordersCount: monthOrders[idx],
    }));
  }, [sales, selectedYear]);

  const visiblePoints = useMemo(() => {
    if (halfWindow === "H1") return rawYearPoints.slice(0, 6);
    if (halfWindow === "H2") return rawYearPoints.slice(6, 12);
    return rawYearPoints;
  }, [rawYearPoints, halfWindow]);

  const defaultFocusIdx = useMemo(() => {
    let best = 0;
    let maxS = -1;
    visiblePoints.forEach((p, idx) => {
      if (p.totalSales > maxS) {
        maxS = p.totalSales;
        best = idx;
      }
    });
    return maxS > 0 ? best : Math.min(visiblePoints.length - 1, 3);
  }, [visiblePoints]);

  const activeIdx = hoveredIdx !== null && visiblePoints[hoveredIdx] ? hoveredIdx : defaultFocusIdx;

  const width = 680;
  const height = 225;
  const padL = 52;
  const padR = 20;
  const padT = 18;
  const padB = 32;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxY = useMemo(() => {
    let m = 0;
    visiblePoints.forEach((p) => {
      m = Math.max(m, p.totalSales, p.targetSales);
    });
    if (m <= 0) return 6000;
    const step = Math.ceil((m * 1.15) / 4 / 100) * 100 || 1500;
    return step * 4;
  }, [visiblePoints]);

  const yTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map((r) => {
      const val = Math.round(maxY * r);
      const y = padT + innerH - r * innerH;
      return { val, y };
    });
  }, [maxY, innerH]);

  const coords = useMemo(() => {
    const count = visiblePoints.length;
    return visiblePoints.map((pt, i) => {
      const x = padL + (count > 1 ? (i / (count - 1)) * innerW : innerW / 2);
      const salesY = padT + innerH - Math.min(1, pt.totalSales / maxY) * innerH;
      const targetY = padT + innerH - Math.min(1, pt.targetSales / maxY) * innerH;
      return { x, salesY, targetY, pt };
    });
  }, [visiblePoints, innerW, innerH, maxY]);

  const salesPath = useMemo(
    () => buildSmoothCubicPath(coords.map((c) => ({ x: c.x, y: c.salesY }))),
    [coords]
  );

  const targetPath = useMemo(
    () => buildSmoothCubicPath(coords.map((c) => ({ x: c.x, y: c.targetY }))),
    [coords]
  );

  const activePoint = coords[activeIdx] || coords[0];

  const formatTick = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 10_000) return `${(v / 1_000).toFixed(0)}k`;
    return String(v);
  };

  return (
    <div
      className={`relative rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-5 flex flex-col justify-between select-none h-full ${className}`}
    >
      {/* ── HEADER: TITLE + LEGEND & WINDOW FILTER ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">
            REVENUE TRAJECTORY
          </span>
          <div className="flex items-center gap-2.5 mt-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
              Monthly Sales performance
            </h3>
            <div className="flex items-center gap-1 bg-black/40 border border-white/[0.08] rounded-lg p-0.5 text-[10px]">
              {(["H1", "H2", "FULL"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setHalfWindow(w);
                    setHoveredIdx(null);
                  }}
                  className={`px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                    halfWindow === w
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {w === "H1" ? "Jan–Jun" : w === "H2" ? "Jul–Dec" : "12M"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend: — Sales (Emerald)  — Target (Indigo) */}
        <div className="flex items-center gap-3.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-emerald-400" />
            <span className="text-zinc-300 font-medium">Sales</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-indigo-400" />
            <span className="text-zinc-300 font-medium">Target</span>
          </div>
        </div>
      </div>

      {/* ── SVG BEZIER DUAL-CURVE CANVAS ── */}
      <div className="relative w-full h-[215px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="rootTargetLineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.55" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="rootSalesLineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="1" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines + Y-Axis Numbers */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={padL}
                y1={t.y}
                x2={width - padR}
                y2={t.y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <text
                x={padL - 10}
                y={t.y + 3.5}
                textAnchor="end"
                className="fill-zinc-500 font-mono text-[10px]"
              >
                {formatTick(t.val)}
              </text>
            </g>
          ))}

          {/* Target Smooth Bezier Curve */}
          <path
            d={targetPath}
            fill="none"
            stroke="url(#rootTargetLineGrad)"
            strokeWidth="2.25"
            strokeLinecap="round"
          />

          {/* Sales Smooth Bezier Curve */}
          <path
            d={salesPath}
            fill="none"
            stroke="url(#rootSalesLineGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Vertical Dashed Crosshair Line & Glowing Dots on Active Point */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padT}
                x2={activePoint.x}
                y2={padT + innerH}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="1.25"
                strokeDasharray="4,4"
              />

              {/* Target Dot (Indigo with White Ring) */}
              <circle
                cx={activePoint.x}
                cy={activePoint.targetY}
                r="5"
                fill="#6366f1"
                stroke="#ffffff"
                strokeWidth="1.75"
              />

              {/* Sales Dot (Emerald with White Ring) */}
              <circle
                cx={activePoint.x}
                cy={activePoint.salesY}
                r="5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1.75"
              />
            </g>
          )}

          {/* X-Axis Month Labels & Hover Hit Columns */}
          {coords.map((c, idx) => {
            const colWidth = innerW / Math.max(1, coords.length);
            return (
              <g
                key={c.pt.shortLabel}
                onMouseEnter={() => setHoveredIdx(idx)}
                onClick={() => setHoveredIdx(idx)}
                className="cursor-pointer"
              >
                <rect
                  x={c.x - colWidth / 2}
                  y={padT}
                  width={colWidth}
                  height={innerH + padB}
                  fill="transparent"
                />
                <text
                  x={c.x}
                  y={height - 8}
                  textAnchor="middle"
                  className={`text-[10px] font-medium transition-colors ${
                    idx === activeIdx ? "fill-white font-bold" : "fill-zinc-400"
                  }`}
                >
                  {c.pt.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Dark Glass Tooltip Card */}
        {activePoint && (
          <div
            style={{
              left: `${Math.min(68, Math.max(12, (activePoint.x / width) * 100 + 2))}%`,
              top: "40%",
            }}
            className="pointer-events-none absolute z-20 rounded-xl bg-[#121420]/95 backdrop-blur-xl border border-white/15 shadow-2xl px-3.5 py-2.5 min-w-[170px] space-y-1 transition-all duration-150"
          >
            <div className="text-[10.5px] font-semibold text-zinc-200">
              {activePoint.pt.fullDateLabel}
            </div>

            <div className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Total sales</span>
              </div>
              <span className="font-mono font-bold text-white">
                {currencySymbol} {activePoint.pt.totalSales.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>Target sales</span>
              </div>
              <span className="font-mono font-bold text-zinc-300">
                {currencySymbol} {activePoint.pt.targetSales.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
