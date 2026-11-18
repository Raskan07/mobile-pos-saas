"use client";

/**
 * app/shop/operational/page.tsx
 *
 * Operational Summary — Minimalist, Premium Daily Sales Statement & 80mm Thermal Simulator
 *
 * Focused 100% on the physical 80mm/58mm thermal internal business sales statement
 * without redundant dashboard cards. All Sales Overview, Payment Breakdown, and
 * Detailed Sales Information are rendered directly inside the live receipt statement.
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Calendar,
  ArrowUpDown,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { subscribeToSalesByShop } from "@/lib/services/salesService";
import { SaleRecord } from "@/lib/types/sale";
import { getStoredReceiptSettings } from "@/lib/services/receiptSettingsService";
import { IOSSpinner } from "@/components/ui/IOSSpinner";

const SHOP_TIMEZONE = "Asia/Colombo";

type DatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

/**
 * Returns YYYY-MM-DD string in Asia/Colombo timezone for a given Date object.
 */
function getColomboDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value || "2026";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

/**
 * Converts a YYYY-MM-DD date string in Asia/Colombo (+05:30) into start/end epoch ms.
 */
function getColomboDayBounds(dateStr: string): { start: number; end: number } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`).getTime();
  const end = new Date(`${dateStr}T23:59:59.999+05:30`).getTime();
  return { start, end };
}

/**
 * Formats a timestamp in Asia/Colombo timezone.
 */
function formatColomboTime(epochMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(epochMs));
}

function formatColomboDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(epochMs));
}

function formatColomboDisplayDate(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00+05:30`);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: SHOP_TIMEZONE,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Normalizes POS payment method codes into standard display buckets.
 */
function normalizePaymentMethodLabel(rawMethod?: string): string {
  const m = (rawMethod || "cash").toLowerCase().trim();
  if (m === "cash") return "Cash";
  if (m === "card" || m === "credit-card" || m === "debit-card" || m === "pos-card") return "Card";
  if (m === "bank-transfer" || m === "bank" || m === "bank-deposit" || m === "transfer" || m === "wire") {
    return "Bank Transfer";
  }
  if (m === "mobile-qr" || m === "mobile" || m === "qr" || m === "lankaqr" || m === "wallet") {
    return "Mobile / QR";
  }
  if (m === "store-credit") return "Store Credit";
  return rawMethod ? rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1) : "Other";
}

const fmtAmount = (val: number) =>
  (val || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function OperationalDailySalesSummaryPage() {
  const { shop, user, activeBranchId, activeBranchName, isAuthenticated, isLoading: authLoading } = useShopAuth();

  // Default to TODAY in Asia/Colombo
  const todayColombo = useMemo(() => getColomboDateString(new Date()), []);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customStartDate, setCustomStartDate] = useState<string>(todayColombo);
  const [customEndDate, setCustomEndDate] = useState<string>(todayColombo);

  // Toggle switch for Detailed Sales Information inside the thermal receipt
  const [showDetailedSales, setShowDetailedSales] = useState<boolean>(true);

  // Thermal simulator paper width (80mm default, 58mm optional)
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");
  const [chronologicalOrder, setChronologicalOrder] = useState<"asc" | "desc">("asc");

  // Live Sales Records from Firestore
  const [allSales, setAllSales] = useState<SaleRecord[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => Date.now());

  const currentShopId = shop?.shopId || "";
  const currentShopName = shop?.shopName || "POS Retail Store";

  const receiptSettings = useMemo(() => {
    return getStoredReceiptSettings(currentShopId, currentShopName);
  }, [currentShopId, currentShopName]);
  const currency = receiptSettings.currency || "LKR";

  // Subscribe to real-time sales for the authenticated shop
  useEffect(() => {
    if (!isAuthenticated || !currentShopId) return;
    setIsLoadingSales(true);

    const unsubscribe = subscribeToSalesByShop(
      currentShopId,
      (records) => {
        setAllSales(records);
        setIsLoadingSales(false);
        setLastSyncedAt(Date.now());
      },
      (err) => {
        console.error("[OperationalSummary] Error subscribing to shop sales:", err);
        setIsLoadingSales(false);
      },
      activeBranchId
    );

    return () => unsubscribe();
  }, [isAuthenticated, currentShopId, activeBranchId]);

  // Compute active date range boundaries in Asia/Colombo timezone
  const activePeriod = useMemo(() => {
    const nowColomboStr = getColomboDateString(new Date());
    const nowColomboMidday = new Date(`${nowColomboStr}T12:00:00+05:30`);

    if (datePreset === "today") {
      const { start, end } = getColomboDayBounds(nowColomboStr);
      return {
        start,
        end,
        shortLabel: formatColomboDisplayDate(nowColomboStr),
        isSingleDay: true,
      };
    }

    if (datePreset === "yesterday") {
      const yest = new Date(nowColomboMidday.getTime() - 24 * 60 * 60 * 1000);
      const yestStr = getColomboDateString(yest);
      const { start, end } = getColomboDayBounds(yestStr);
      return {
        start,
        end,
        shortLabel: formatColomboDisplayDate(yestStr),
        isSingleDay: true,
      };
    }

    if (datePreset === "this_week") {
      const dayOfWeek = nowColomboMidday.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(nowColomboMidday.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
      const mondayStr = getColomboDateString(monday);
      const start = getColomboDayBounds(mondayStr).start;
      const end = getColomboDayBounds(nowColomboStr).end;
      return {
        start,
        end,
        shortLabel: `${mondayStr} → ${nowColomboStr}`,
        isSingleDay: mondayStr === nowColomboStr,
      };
    }

    if (datePreset === "this_month") {
      const monthStartStr = `${nowColomboStr.slice(0, 7)}-01`;
      const start = getColomboDayBounds(monthStartStr).start;
      const end = getColomboDayBounds(nowColomboStr).end;
      return {
        start,
        end,
        shortLabel: `${monthStartStr} → ${nowColomboStr}`,
        isSingleDay: false,
      };
    }

    // Custom Date or Range
    const safeStart = customStartDate || nowColomboStr;
    const safeEnd = customEndDate && customEndDate >= safeStart ? customEndDate : safeStart;
    const start = getColomboDayBounds(safeStart).start;
    const end = getColomboDayBounds(safeEnd).end;
    const isSingle = safeStart === safeEnd;

    return {
      start,
      end,
      shortLabel: isSingle ? formatColomboDisplayDate(safeStart) : `${safeStart} → ${safeEnd}`,
      isSingleDay: isSingle,
    };
  }, [datePreset, customStartDate, customEndDate]);

  // Filter sales within active period (excluding voided sales)
  const periodSales = useMemo(() => {
    const filtered = allSales.filter(
      (s) =>
        s.createdAt >= activePeriod.start &&
        s.createdAt <= activePeriod.end &&
        s.status !== "voided"
    );

    filtered.sort((a, b) =>
      chronologicalOrder === "asc"
        ? a.createdAt - b.createdAt
        : b.createdAt - a.createdAt
    );

    return filtered;
  }, [allSales, activePeriod, chronologicalOrder]);

  // Dynamic Financial Calculations for the Thermal Receipt Statement
  const summaryStats = useMemo(() => {
    let totalTransactions = 0;
    let totalItemsSold = 0;
    let grossSales = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;

    const paymentMap = new Map<
      string,
      { method: string; amount: number; count: number }
    >([
      ["Cash", { method: "Cash", amount: 0, count: 0 }],
      ["Card", { method: "Card", amount: 0, count: 0 }],
      ["Bank Transfer", { method: "Bank Transfer", amount: 0, count: 0 }],
      ["Mobile / QR", { method: "Mobile / QR", amount: 0, count: 0 }],
    ]);

    for (const sale of periodSales) {
      totalTransactions += 1;

      const saleItemsCount =
        sale.items?.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0) ||
        Number(sale.itemCount) ||
        0;
      totalItemsSold += saleItemsCount;

      const orderDiscount = Number(sale.discountAmount) || 0;
      const lineDiscountsSum =
        sale.items?.reduce((acc, it) => acc + (Number(it.discount) || 0), 0) || 0;
      const effectiveDiscount = Math.max(orderDiscount, lineDiscountsSum);

      const billedTotal = Number(sale.grandTotal ?? sale.total) || 0;
      const saleGross = billedTotal + effectiveDiscount;

      const refundFromReturns =
        sale.returns?.reduce((acc, r) => acc + (Number(r.totalRefundAmount) || 0), 0) || 0;
      const saleRefund =
        sale.status === "refunded"
          ? Math.max(billedTotal, Number(sale.totalRefunded) || 0, refundFromReturns)
          : Math.max(Number(sale.totalRefunded) || 0, refundFromReturns);

      grossSales += saleGross;
      totalDiscounts += effectiveDiscount;
      totalRefunds += saleRefund;

      const netSaleAmount = Math.max(0, billedTotal - saleRefund);

      // Payment Method Breakdown (Supports Split Payments)
      if (sale.splitPayments && sale.splitPayments.length > 0) {
        const splitSum = sale.splitPayments.reduce(
          (acc, sp) => acc + (Number(sp.amount) || 0),
          0
        );
        for (const sp of sale.splitPayments) {
          const label = normalizePaymentMethodLabel(sp.method);
          const rawAmt = Number(sp.amount) || 0;
          const effectiveSplitAmt =
            splitSum > 0 && saleRefund > 0
              ? Math.max(0, rawAmt - saleRefund * (rawAmt / splitSum))
              : rawAmt;

          const existing = paymentMap.get(label) || {
            method: label,
            amount: 0,
            count: 0,
          };
          existing.amount += effectiveSplitAmt;
          existing.count += 1;
          paymentMap.set(label, existing);
        }
      } else {
        const label = normalizePaymentMethodLabel(sale.paymentMethod);
        const existing = paymentMap.get(label) || {
          method: label,
          amount: 0,
          count: 0,
        };
        existing.amount += netSaleAmount;
        existing.count += 1;
        paymentMap.set(label, existing);
      }
    }

    const netSales = Math.max(0, grossSales - totalDiscounts - totalRefunds);

    const paymentBreakdown = Array.from(paymentMap.values()).filter(
      (p) =>
        p.amount > 0 ||
        ["Cash", "Card", "Bank Transfer", "Mobile / QR"].includes(p.method)
    );

    return {
      totalTransactions,
      totalItemsSold,
      grossSales,
      totalDiscounts,
      totalRefunds,
      netSales,
      paymentBreakdown,
    };
  }, [periodSales]);

  const handlePrintThermalStatement = () => {
    window.print();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#07080d] flex items-center justify-center">
        <IOSSpinner size={36} color="#ffffff" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col relative overflow-x-hidden">
      {/* Subtle Ambient Background Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[620px] h-[420px] bg-emerald-500/[0.04] rounded-full blur-[160px]" />
      </div>

      {/* ── Thermal 80mm / 58mm Print CSS ── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: ${paperWidth === "58mm" ? "58mm" : "80mm"} auto;
                margin: 0mm;
              }
              html,
              body {
                background: #ffffff !important;
                color: #000000 !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              body * {
                visibility: hidden;
              }
              #daily-sales-thermal-print-area,
              #daily-sales-thermal-print-area * {
                visibility: visible;
              }
              #daily-sales-thermal-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: ${paperWidth === "58mm" ? "58mm" : "80mm"} !important;
                max-width: ${paperWidth === "58mm" ? "58mm" : "80mm"} !important;
                margin: 0 !important;
                padding: 3mm 3.5mm !important;
                background: #ffffff !important;
                color: #000000 !important;
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
                overflow: visible !important;
                max-height: none !important;
              }
            }
          `,
        }}
      />

      {/* ── Full-Width Premium Header Bar ── */}
      <header className="sticky top-0 z-40 w-full bg-[#0a0c14]/90 backdrop-blur-2xl border-b border-white/[0.08] px-5 sm:px-8 lg:px-10 py-3.5 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
        <div className="w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
          {/* Left Zone: Back Navigation & Title */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <Link
                href="/shop/dashboard"
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer active:scale-95"
                title="Back to POS Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
                  Daily Sales Summary
                </h1>
                <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                  <span className="text-zinc-200 font-medium">{currentShopName}</span>
                  <span className="text-zinc-600">&bull;</span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {SHOP_TIMEZONE}
                  </span>
                </p>
              </div>
            </div>

            {/* Mobile Print Button */}
            <button
              type="button"
              onClick={handlePrintThermalStatement}
              className="lg:hidden flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
          </div>

          {/* Center Zone: 5 Date Selection Options (Today = Default) + Custom Range */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.08] overflow-x-auto">
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "this_week", label: "This Week" },
                  { id: "this_month", label: "This Month" },
                  { id: "custom", label: "Custom" },
                ] as { id: DatePreset; label: string }[]
              ).map((preset) => {
                const active = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDatePreset(preset.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                      active
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Inline Custom Date / Range Picker when Custom is selected */}
            {datePreset === "custom" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs animate-in fade-in duration-150">
                <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    if (customEndDate < e.target.value) {
                      setCustomEndDate(e.target.value);
                    }
                  }}
                  className="bg-transparent text-white font-mono text-xs focus:outline-none"
                />
                <span className="text-zinc-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  min={customStartDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-white font-mono text-xs focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Right Zone: Detailed Toggle, Paper Width, Sort & Primary Print Action */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Toggle Switch: Detailed Sales Information inside Receipt */}
            <button
              type="button"
              role="switch"
              aria-checked={showDetailedSales}
              onClick={() => setShowDetailedSales((prev) => !prev)}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                showDetailedSales
                  ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-200"
                  : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-zinc-200"
              }`}
              title="Toggle itemized product sales details inside the statement"
            >
              <span>Detailed Sales</span>
              <span
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  showDetailedSales ? "bg-emerald-500" : "bg-zinc-600"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    showDetailedSales ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>

            {/* Paper Width Switcher (80mm / 58mm) */}
            <div className="flex items-center bg-white/[0.03] p-1 rounded-xl border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setPaperWidth("80mm")}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  paperWidth === "80mm"
                    ? "bg-white/15 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth("58mm")}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  paperWidth === "58mm"
                    ? "bg-white/15 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                58mm
              </button>
            </div>

            {/* Sort Order (when Detailed Sales is active) */}
            {showDetailedSales && periodSales.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setChronologicalOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                className="px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-zinc-300 flex items-center gap-1.5 cursor-pointer"
                title="Flip chronological invoice order on statement"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                <span>{chronologicalOrder === "asc" ? "Oldest" : "Newest"}</span>
              </button>
            )}

            {/* Primary Print Button */}
            <button
              type="button"
              onClick={handlePrintThermalStatement}
              className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print Statement</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Centerpiece Premium Thermal Receipt Simulator Stage ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-4 py-6 sm:py-10">
        {isLoadingSales ? (
          <div className="my-auto flex flex-col items-center justify-center gap-3 text-center py-20">
            <IOSSpinner size={34} color="#ffffff" />
            <p className="text-xs font-semibold text-zinc-300">
              Generating Thermal Statement...
            </p>
          </div>
        ) : (
          <div className="w-full max-w-lg flex flex-col items-center">
            {/* Premium Hardware Dispenser Housing */}
            <div className="w-full rounded-[28px] bg-gradient-to-b from-[#151822]/90 to-[#0b0d14]/90 border border-white/[0.08] p-5 sm:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.85)] backdrop-blur-xl flex flex-col items-center">
              {/* Top Metallic Thermal Dispenser Slot */}
              <div className="w-full max-w-[390px] flex flex-col items-center">
                <div className="w-full h-4 rounded-t-xl bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 border-x border-t border-white/15 flex items-center justify-between px-3.5">
                  <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-300">
                    SKYFOX POS • {paperWidth.toUpperCase()} THERMAL STATEMENT
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-emerald-400 uppercase">
                      Ready
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  </div>
                </div>
                <div className="w-[97%] h-2.5 bg-black rounded-b shadow-inner border-x border-b border-zinc-800" />
              </div>

              {/* ── THE ACTUAL 80MM / 58MM PHYSICAL THERMAL PAPER STATEMENT ── */}
              <div className="w-full flex justify-center px-1">
                <div
                  id="daily-sales-thermal-print-area"
                  className={`bg-[#fffefb] text-black font-mono shadow-[0_18px_45px_rgba(0,0,0,0.75)] transition-all duration-200 relative ${
                    paperWidth === "58mm"
                      ? "w-[270px] text-[10.5px] p-4"
                      : "w-[360px] sm:w-[376px] text-[11.5px] p-6"
                  }`}
                >
                  {/* 1. Shop Branding & Statement Header */}
                  <div className="text-center space-y-0.5 pb-3 border-b border-dashed border-black">
                    <div className="font-sans font-black text-base uppercase tracking-wide text-black">
                      {receiptSettings.headerTitle || currentShopName}
                    </div>
                    {receiptSettings.address && (
                      <div className="text-[10.5px] text-zinc-800 leading-tight">
                        {receiptSettings.address}
                      </div>
                    )}
                    {receiptSettings.phone && (
                      <div className="text-[10.5px] text-zinc-800">
                        Tel: {receiptSettings.phone}
                      </div>
                    )}
                    <div className="pt-2">
                      <span className="inline-block font-sans font-extrabold text-[11px] uppercase tracking-widest border-y border-black py-0.5 px-2.5">
                        DAILY SALES STATEMENT
                      </span>
                    </div>
                    <div className="text-[9.5px] uppercase tracking-wider text-zinc-700 pt-0.5">
                      INTERNAL BUSINESS RECORD
                    </div>
                  </div>

                  {/* 2. Statement Metadata (Date, Timezone, Cashier) */}
                  <div className="py-2.5 border-b border-dashed border-black space-y-0.5 text-[11px]">
                    <div className="flex justify-between">
                      <span>PERIOD:</span>
                      <span className="font-bold text-right">{activePeriod.shortLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PRINTED:</span>
                      <span>{formatColomboDateTime(lastSyncedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>BRANCH / ID:</span>
                      <span>
                        {activeBranchName || "Main"} ({currentShopId || "SHOP"})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>GENERATED BY:</span>
                      <span>{user?.displayName || user?.username || "Owner"}</span>
                    </div>
                  </div>

                  {/* 3. SALES OVERVIEW SECTION */}
                  <div className="py-3 border-b border-dashed border-black space-y-1">
                    <div className="font-bold uppercase tracking-wider text-[11px] pb-0.5">
                      SALES OVERVIEW
                    </div>
                    <div className="flex justify-between">
                      <span>Total Transactions:</span>
                      <span className="font-bold">{summaryStats.totalTransactions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Items Sold:</span>
                      <span className="font-bold">{summaryStats.totalItemsSold}</span>
                    </div>

                    <div className="border-t border-dotted border-zinc-400 my-1.5 pt-1.5 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Gross Sales:</span>
                        <span>{currency} {fmtAmount(summaryStats.grossSales)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discounts:</span>
                        <span>{currency} {fmtAmount(summaryStats.totalDiscounts)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Refunds / Returns:</span>
                        <span>{currency} {fmtAmount(summaryStats.totalRefunds)}</span>
                      </div>
                    </div>

                    <div className="border-t border-black pt-1.5 flex justify-between font-bold text-xs">
                      <span>NET SALES:</span>
                      <span>{currency} {fmtAmount(summaryStats.netSales)}</span>
                    </div>
                  </div>

                  {/* 4. PAYMENT METHOD BREAKDOWN SECTION */}
                  <div className="py-3 border-b border-dashed border-black space-y-1">
                    <div className="font-bold uppercase tracking-wider text-[11px] pb-0.5">
                      PAYMENT BREAKDOWN
                    </div>
                    {summaryStats.paymentBreakdown.map((pm) => (
                      <div key={pm.method} className="flex justify-between">
                        <span>{pm.method}:</span>
                        <span className="font-semibold">{currency} {fmtAmount(pm.amount)}</span>
                      </div>
                    ))}
                  </div>

                  {/* 5. DETAILED SALES INFORMATION (Toggled ON/OFF) */}
                  {showDetailedSales && (
                    <div className="py-3 border-b border-dashed border-black space-y-3">
                      <div className="font-bold uppercase tracking-wider text-[11px] border-b border-black pb-1 flex justify-between">
                        <span>SALES DETAILS</span>
                        <span>({periodSales.length} INV)</span>
                      </div>

                      {periodSales.length === 0 ? (
                        <div className="py-4 text-center text-[10.5px] text-zinc-600">
                          -- No transactions in selected period --
                        </div>
                      ) : (
                        periodSales.map((sale) => {
                          const saleDisc = Number(sale.discountAmount) || 0;
                          const saleRef =
                            sale.status === "refunded"
                              ? Number(sale.totalRefunded ?? sale.grandTotal) || 0
                              : Number(sale.totalRefunded) ||
                                (sale.returns?.reduce(
                                  (a, r) => a + (Number(r.totalRefundAmount) || 0),
                                  0
                                ) ??
                                  0);

                          return (
                            <div
                              key={`thermal_${sale.saleId}`}
                              className="pb-2.5 border-b border-dashed border-zinc-400 last:border-b-0 last:pb-0 space-y-1"
                            >
                              <div className="flex justify-between font-bold text-[11px]">
                                <span>{sale.invoiceNumber}</span>
                                <span>
                                  {sale.splitPayments && sale.splitPayments.length > 0
                                    ? "Split"
                                    : normalizePaymentMethodLabel(sale.paymentMethod)}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-700">
                                Time:{" "}
                                {activePeriod.isSingleDay
                                  ? formatColomboTime(sale.createdAt)
                                  : formatColomboDateTime(sale.createdAt)}
                              </div>

                              {/* Column Header */}
                              <div className="grid grid-cols-12 text-[10px] font-bold border-b border-dotted border-zinc-500 pb-0.5 pt-0.5">
                                <span className="col-span-7">Product</span>
                                <span className="col-span-2 text-center">Qty</span>
                                <span className="col-span-3 text-right">Amount</span>
                              </div>

                              {/* Individual Products in Transaction */}
                              <div className="space-y-1 pt-0.5">
                                {sale.items.map((it, idx) => (
                                  <div
                                    key={`th_item_${sale.saleId}_${idx}`}
                                    className="grid grid-cols-12 items-start text-[10.5px] leading-tight"
                                  >
                                    <div className="col-span-7 pr-1 break-words">
                                      <span className="font-medium text-black">
                                        {it.name}
                                        {it.variant ? ` (${it.variant})` : ""}
                                      </span>
                                      <span className="block text-[9.5px] text-zinc-600">
                                        @ {fmtAmount(it.unitPrice)}
                                      </span>
                                    </div>
                                    <div className="col-span-2 text-center font-bold">
                                      {it.quantity}
                                    </div>
                                    <div className="col-span-3 text-right font-semibold">
                                      {fmtAmount(it.subtotal)}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Invoice Discount / Refund / Total */}
                              <div className="pt-1 border-t border-dotted border-zinc-500 text-[10.5px] space-y-0.5">
                                {saleDisc > 0 && (
                                  <div className="flex justify-between text-zinc-700">
                                    <span>Discount:</span>
                                    <span>-{fmtAmount(saleDisc)}</span>
                                  </div>
                                )}
                                {saleRef > 0 && (
                                  <div className="flex justify-between text-zinc-700">
                                    <span>Refunded:</span>
                                    <span>-{fmtAmount(saleRef)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-bold">
                                  <span>Invoice Total:</span>
                                  <span>{currency} {fmtAmount(sale.grandTotal)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* 6. Thermal Statement Footer & Sign-Off */}
                  <div className="pt-3.5 text-center space-y-2 text-[10px]">
                    <div className="pt-3 flex justify-between text-[9.5px]">
                      <span className="border-t border-black pt-0.5 px-2">
                        Cashier Sign
                      </span>
                      <span className="border-t border-black pt-0.5 px-2">
                        Owner / Manager
                      </span>
                    </div>
                    <div className="text-[9px] text-zinc-600 pt-1">
                      *** END OF DAILY SALES STATEMENT ***
                    </div>
                  </div>

                  {/* Visual Serrated Tear-off Edge at Bottom of Simulator */}
                  <div
                    aria-hidden="true"
                    className="mt-4 -mx-6 -mb-6 h-3 bg-[radial-gradient(circle,transparent_4px,#0b0d14_4.5px)] bg-[size:12px_10px] bg-bottom"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
