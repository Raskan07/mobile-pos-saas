"use client";

/**
 * components/analytics/RefundAnalyticsSection.tsx
 *
 * Detailed Refund & Merchandise Return intelligence derived from the single filtered dataset.
 * Features:
 * - Net impact of refunds on revenue
 * - Restocked vs Damaged inventory tracking
 * - Return reasons distribution
 * - Refund disbursement methods
 */

import React from "react";
import {
  RotateCcw,
  AlertTriangle,
  Warehouse,
  Banknote,
  CreditCard,
  Building2,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { RefundAnalytics } from "@/lib/services/salesAnalyticsService";
import IOSFeaturedCard from "./IOSFeaturedCard";

interface RefundAnalyticsSectionProps {
  refunds: RefundAnalytics;
  grossSales: number;
  currencySymbol?: string;
}

export default function RefundAnalyticsSection({
  refunds,
  grossSales,
  currencySymbol = "LKR",
}: RefundAnalyticsSectionProps) {
  const {
    totalRefundAmount,
    totalReturnEvents,
    totalItemsReturned,
    restockedUnitsCount,
    damagedUnitsCount,
    refundRateRevenue,
    refundRateUnits,
    reasons,
    refundMethodsBreakdown,
  } = refunds;

  const restockPercentage =
    totalItemsReturned > 0 ? (restockedUnitsCount / totalItemsReturned) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* ── Key Return Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Total Value Refunded */}
        <IOSFeaturedCard
          eyebrow="CAPITAL OUTFLOW"
          title="Total Refunds Disbursed"
          icon={RotateCcw}
          value={`${currencySymbol} ${totalRefundAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${totalReturnEvents} return transactions`}
          badge={{
            text: `${refundRateRevenue.toFixed(1)}% of Sales`,
            variant: totalRefundAmount > 0 ? "negative" : "neutral",
          }}
        />

        {/* Units Returned */}
        <IOSFeaturedCard
          eyebrow="PHYSICAL RETURNS"
          title="Total Items Returned"
          icon={AlertTriangle}
          value={`${totalItemsReturned} Units`}
          subtitle={`${refundRateUnits.toFixed(1)}% unit return rate`}
          badge={{ text: "Item Volume", variant: "warning" }}
        />

        {/* Inventory Restock Rate */}
        <IOSFeaturedCard
          eyebrow="RE-CIRCULATION"
          title="Restocked to Inventory"
          icon={Warehouse}
          value={`${restockedUnitsCount} Units`}
          subtitle={`${restockPercentage.toFixed(0)}% restock recovery rate`}
          badge={{ text: "Recovered", variant: "positive" }}
        />

        {/* Damaged / Write-off */}
        <IOSFeaturedCard
          eyebrow="LOSS WRITE-OFF"
          title="Damaged / Scrap"
          icon={Layers}
          value={`${damagedUnitsCount} Units`}
          subtitle="Items not returned to saleable stock"
          badge={{ text: "Shrinkage", variant: "neutral" }}
        />
      </div>

      {/* ── Return Reasons & Refund Method Split ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Return Reasons Breakdown */}
        <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              AUDIT TRAIL
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Customer Return Reasons
            </h3>
          </div>

          {reasons.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              <CheckCircle2 className="w-7 h-7 mx-auto text-emerald-500/40 mb-2" />
              <div className="text-xs">No returns recorded in this period</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {reasons.map((r, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{r.reason}</span>
                    <span className="font-mono font-bold text-rose-400">
                      {currencySymbol} {r.totalAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(5, r.percentage))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>{r.count} incidents</span>
                    <span>{r.percentage.toFixed(1)}% of total refunds</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Refund Method Disbursement Breakdown */}
        <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              DISBURSEMENT CHANNELS
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Refund Disbursed by Tender
            </h3>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-300">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cash Returned from Drawer</span>
              </span>
              <span className="font-bold text-white">
                {currencySymbol} {refundMethodsBreakdown.cash.toFixed(2)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-300">
                <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                <span>Card Terminal Reversals</span>
              </span>
              <span className="font-bold text-white">
                {currencySymbol} {refundMethodsBreakdown.card.toFixed(2)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-300">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Store Credit Notes Issued</span>
              </span>
              <span className="font-bold text-white">
                {currencySymbol} {refundMethodsBreakdown.store_credit.toFixed(2)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-300">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Bank Wire Refunds</span>
              </span>
              <span className="font-bold text-white">
                {currencySymbol} {refundMethodsBreakdown.bank_transfer.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
