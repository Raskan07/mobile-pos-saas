"use client";

/**
 * components/analytics/PaymentBreakdownSection.tsx
 *
 * Payment Breakdown & Tender Reconciliation Component.
 * Fully handles:
 * - Cash
 * - Credit / Debit Card
 * - Bank Deposit / Direct Wire
 * - Mobile QR / Digital
 * - Split Payments (with sub-tender attribution & volume metrics)
 *
 * Styled in dark glass iOS featured card layout with gray secondary typography.
 */

import React, { useState } from "react";
import {
  Banknote,
  CreditCard,
  Building2,
  Smartphone,
  Split,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  PaymentAnalytics,
  NormalizedPaymentMethod,
} from "@/lib/services/salesAnalyticsService";
import IOSFeaturedCard from "./IOSFeaturedCard";

interface PaymentBreakdownSectionProps {
  payments: PaymentAnalytics;
  currencySymbol?: string;
}

export default function PaymentBreakdownSection({
  payments,
  currencySymbol = "LKR",
}: PaymentBreakdownSectionProps) {
  const [selectedTender, setSelectedTender] = useState<NormalizedPaymentMethod | "all">("all");
  const { breakdown, splitOverview, totalCollectedAllMethods } = payments;

  // Tender visual configs
  const tenderConfigs: Record<
    NormalizedPaymentMethod,
    {
      icon: React.ComponentType<{ className?: string }>;
      colorClass: string;
      accentBg: string;
      accentBorder: string;
      glowColor: string;
    }
  > = {
    cash: {
      icon: Banknote,
      colorClass: "text-emerald-400",
      accentBg: "bg-emerald-500/10",
      accentBorder: "border-emerald-500/20",
      glowColor: "#10b981",
    },
    card: {
      icon: CreditCard,
      colorClass: "text-blue-400",
      accentBg: "bg-blue-500/10",
      accentBorder: "border-blue-500/20",
      glowColor: "#3b82f6",
    },
    bank_deposit: {
      icon: Building2,
      colorClass: "text-amber-400",
      accentBg: "bg-amber-500/10",
      accentBorder: "border-amber-500/20",
      glowColor: "#f59e0b",
    },
    mobile_qr: {
      icon: Smartphone,
      colorClass: "text-purple-400",
      accentBg: "bg-purple-500/10",
      accentBorder: "border-purple-500/20",
      glowColor: "#a855f7",
    },
    split: {
      icon: Split,
      colorClass: "text-cyan-400",
      accentBg: "bg-cyan-500/10",
      accentBorder: "border-cyan-500/20",
      glowColor: "#06b6d4",
    },
    other: {
      icon: Layers,
      colorClass: "text-zinc-400",
      accentBg: "bg-zinc-500/10",
      accentBorder: "border-zinc-500/20",
      glowColor: "#71717a",
    },
  };

  const tenderOrder: NormalizedPaymentMethod[] = ["cash", "card", "bank_deposit", "mobile_qr", "split", "other"];

  return (
    <div className="space-y-4">
      {/* ── Top Overview: Proportional Tender Distribution Bar ── */}
      <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              TENDER ALLOCATION
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Payment Methods Breakdown
            </h3>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-400">Total Processed Value</span>
            <div className="text-xs font-bold font-mono text-zinc-200">
              {currencySymbol} {totalCollectedAllMethods.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Stacked Proportional Bar */}
        <div className="h-3 w-full rounded-full bg-zinc-900 border border-white/10 overflow-hidden flex">
          {tenderOrder.map((key) => {
            const item = breakdown[key];
            if (!item || item.percentageOfTotal <= 0) return null;
            const cfg = tenderConfigs[key];
            return (
              <div
                key={key}
                style={{
                  width: `${item.percentageOfTotal}%`,
                  backgroundColor: cfg.glowColor,
                }}
                title={`${item.displayName}: ${item.percentageOfTotal.toFixed(1)}%`}
                className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full opacity-90 hover:opacity-100"
              />
            );
          })}
        </div>

        {/* Legend Pills with secondary gray counts */}
        <div className="flex flex-wrap gap-2 pt-1">
          {tenderOrder.map((key) => {
            const item = breakdown[key];
            if (!item || item.totalCollected <= 0) return null;
            const cfg = tenderConfigs[key];
            const Icon = cfg.icon;

            return (
              <div
                key={key}
                className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center gap-2 text-xs"
              >
                <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cfg.glowColor }} />
                <span className="font-semibold text-zinc-200">{item.displayName}</span>
                <span className="text-zinc-400 font-mono text-[11px]">
                  {item.percentageOfTotal.toFixed(1)}%
                </span>
                <span className="text-zinc-500 font-mono text-[10px]">
                  ({item.transactionCount} {item.transactionCount === 1 ? "txn" : "txns"})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4 Main iOS Featured Cards for Individual Tenders ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* 1. Cash Card */}
        <IOSFeaturedCard
          eyebrow="TENDER 01"
          title="Cash in Register"
          icon={Banknote}
          value={`${currencySymbol} ${breakdown.cash.totalCollected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${breakdown.cash.transactionCount} transactions (${breakdown.cash.percentageOfTotal.toFixed(1)}% volume)`}
          badge={{
            text: `${breakdown.cash.percentageOfTotal.toFixed(0)}% Share`,
            variant: "positive",
          }}
        >
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Gross Cash:</span>
              <span className="text-zinc-200 font-medium">
                {currencySymbol} {breakdown.cash.totalCollected.toFixed(2)}
              </span>
            </div>
            {breakdown.cash.refundsDisbursed > 0 && (
              <div className="flex items-center justify-between text-rose-400">
                <span>Cash Refunds:</span>
                <span>-{currencySymbol} {breakdown.cash.refundsDisbursed.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-emerald-400 pt-1 border-t border-white/5 font-bold">
              <span>Net Cash Kept:</span>
              <span>{currencySymbol} {breakdown.cash.netCollected.toFixed(2)}</span>
            </div>
          </div>
        </IOSFeaturedCard>

        {/* 2. Card Card */}
        <IOSFeaturedCard
          eyebrow="TENDER 02"
          title="Credit & Debit Cards"
          icon={CreditCard}
          value={`${currencySymbol} ${breakdown.card.totalCollected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${breakdown.card.transactionCount} card payments (${breakdown.card.percentageOfTotal.toFixed(1)}% volume)`}
          badge={{
            text: `${breakdown.card.percentageOfTotal.toFixed(0)}% Share`,
            variant: "info",
          }}
        >
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Gross Cards:</span>
              <span className="text-zinc-200 font-medium">
                {currencySymbol} {breakdown.card.totalCollected.toFixed(2)}
              </span>
            </div>
            {breakdown.card.refundsDisbursed > 0 && (
              <div className="flex items-center justify-between text-rose-400">
                <span>Reversals / Refunds:</span>
                <span>-{currencySymbol} {breakdown.card.refundsDisbursed.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-blue-400 pt-1 border-t border-white/5 font-bold">
              <span>Net Settlement:</span>
              <span>{currencySymbol} {breakdown.card.netCollected.toFixed(2)}</span>
            </div>
          </div>
        </IOSFeaturedCard>

        {/* 3. Bank Deposit / Wire Card */}
        <IOSFeaturedCard
          eyebrow="TENDER 03"
          title="Bank Deposit / Wire"
          icon={Building2}
          value={`${currencySymbol} ${breakdown.bank_deposit.totalCollected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${breakdown.bank_deposit.transactionCount} verified transfers (${breakdown.bank_deposit.percentageOfTotal.toFixed(1)}% volume)`}
          badge={{
            text: `${breakdown.bank_deposit.percentageOfTotal.toFixed(0)}% Share`,
            variant: "warning",
          }}
        >
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Direct Inflows:</span>
              <span className="text-zinc-200 font-medium">
                {currencySymbol} {breakdown.bank_deposit.totalCollected.toFixed(2)}
              </span>
            </div>
            {breakdown.bank_deposit.refundsDisbursed > 0 && (
              <div className="flex items-center justify-between text-rose-400">
                <span>Wire Reversals:</span>
                <span>-{currencySymbol} {breakdown.bank_deposit.refundsDisbursed.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-amber-400 pt-1 border-t border-white/5 font-bold">
              <span>Net In Bank:</span>
              <span>{currencySymbol} {breakdown.bank_deposit.netCollected.toFixed(2)}</span>
            </div>
          </div>
        </IOSFeaturedCard>

        {/* 4. Mobile QR / Digital Card */}
        <IOSFeaturedCard
          eyebrow="TENDER 04"
          title="Mobile QR / UPI"
          icon={Smartphone}
          value={`${currencySymbol} ${breakdown.mobile_qr.totalCollected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${breakdown.mobile_qr.transactionCount} digital app scans (${breakdown.mobile_qr.percentageOfTotal.toFixed(1)}% volume)`}
          badge={{
            text: `${breakdown.mobile_qr.percentageOfTotal.toFixed(0)}% Share`,
            variant: "neutral",
          }}
        >
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-zinc-400">
              <span>QR Scan Total:</span>
              <span className="text-zinc-200 font-medium">
                {currencySymbol} {breakdown.mobile_qr.totalCollected.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-purple-400 pt-1 border-t border-white/5 font-bold">
              <span>Net Digital Volume:</span>
              <span>{currencySymbol} {breakdown.mobile_qr.netCollected.toFixed(2)}</span>
            </div>
          </div>
        </IOSFeaturedCard>
      </div>

      {/* ── 5. Special Dedicated Split Payments Deep Inspection Card ── */}
      <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Split className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                MULTI-TENDER RESOLUTION
              </span>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <span>Split Payments Reconciliation</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  {splitOverview.totalSplitTransactions} Txns
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <div className="text-[9px] font-semibold text-zinc-400 uppercase">Total Split Volume</div>
              <div className="text-sm font-mono font-extrabold text-white">
                {currencySymbol} {splitOverview.totalSplitVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-semibold text-zinc-400 uppercase">Avg Split Ticket</div>
              <div className="text-sm font-mono font-extrabold text-zinc-300">
                {currencySymbol} {splitOverview.averageSplitAmount.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Explanation & Sub-tender attribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
            <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Multi-Tenant Audit Guarantee</span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              When a customer settles a bill using multiple tenders (for instance, partial cash and partial card, or cash plus bank deposit), each portion is automatically partitioned and reconciled into its respective ledger. No double-counting occurs.
            </p>
          </div>

          {/* Underlying Tender Attribution from Splits */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
            <div className="text-xs font-semibold text-zinc-200">
              Attributed Sub-Tender Volume within Splits
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-zinc-300">
                <span className="flex items-center gap-2 text-zinc-400">
                  <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                  Cash Portion in Splits
                </span>
                <span className="font-semibold text-white">
                  {currencySymbol} {splitOverview.tenderContributions.cash.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-300">
                <span className="flex items-center gap-2 text-zinc-400">
                  <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                  Card Portion in Splits
                </span>
                <span className="font-semibold text-white">
                  {currencySymbol} {splitOverview.tenderContributions.card.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-300">
                <span className="flex items-center gap-2 text-zinc-400">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  Bank Deposit Portion in Splits
                </span>
                <span className="font-semibold text-white">
                  {currencySymbol} {splitOverview.tenderContributions.bank_deposit.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-300">
                <span className="flex items-center gap-2 text-zinc-400">
                  <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                  Mobile QR Portion in Splits
                </span>
                <span className="font-semibold text-white">
                  {currencySymbol} {splitOverview.tenderContributions.mobile_qr.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
