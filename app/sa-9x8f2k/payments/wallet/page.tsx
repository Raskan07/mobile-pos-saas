"use client";

/**
 * app/sa-9x8f2k/payments/wallet/page.tsx
 *
 * Root Platform Treasury & Wallet Workspace.
 * - Aggregates real-time subscription revenue inflows, manual top-ups, approved refunds,
 *   and completed/pending payouts.
 * - Allows Root Admin to record wallet credits/debits and jump directly to Payouts or Refunds.
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  RefreshCw,
  Receipt,
  CreditCard,
  Sparkles,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SubscriptionPaymentRecord } from "@/lib/types/subscription";
import {
  RootWalletEntry,
  RootRefundRecord,
  RootPayoutRecord,
  subscribeToAllSubscriptionPayments,
  subscribeToRootWalletEntries,
  subscribeToRootRefunds,
  subscribeToRootPayouts,
  computePlatformWalletSummary,
  createManualWalletEntry,
} from "@/lib/services/rootPaymentsService";

export default function RootWalletPage() {
  const [subPayments, setSubPayments] = useState<SubscriptionPaymentRecord[]>([]);
  const [walletEntries, setWalletEntries] = useState<RootWalletEntry[]>([]);
  const [refunds, setRefunds] = useState<RootRefundRecord[]>([]);
  const [payouts, setPayouts] = useState<RootPayoutRecord[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [entryType, setEntryType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeToAllSubscriptionPayments(setSubPayments);
    const u2 = subscribeToRootWalletEntries(setWalletEntries);
    const u3 = subscribeToRootRefunds(setRefunds);
    const u4 = subscribeToRootPayouts(setPayouts);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  const summary = useMemo(
    () =>
      computePlatformWalletSummary({
        subscriptionPayments: subPayments,
        walletEntries,
        refunds,
        payouts,
      }),
    [subPayments, walletEntries, refunds, payouts]
  );

  // Unified wallet stream combining subscription inflows, manual entries, approved refunds, and payouts
  const unifiedLedger = useMemo(() => {
    const rows: {
      id: string;
      title: string;
      subtitle: string;
      type: "credit" | "debit";
      amount: number;
      currency: string;
      reference: string;
      badge: string;
      createdAt: number;
    }[] = [];

    subPayments.forEach((p) => {
      rows.push({
        id: `sub_${p.paymentId}`,
        title: `Subscription Payment — ${p.shopName}`,
        subtitle: `${p.shopId} • ${p.planName} (${p.billingCycle})`,
        type: "credit",
        amount: p.amount,
        currency: p.currency || "LKR",
        reference: p.referenceNumber,
        badge: p.isFoundingCustomerRate ? "Founding Rate" : "Subscription",
        createdAt: p.createdAt,
      });
    });

    walletEntries.forEach((w) => {
      rows.push({
        id: `wal_${w.id}`,
        title: w.description,
        subtitle: `${w.category.replace("_", " ")} • ${w.paymentMethod}`,
        type: w.type,
        amount: w.amount,
        currency: w.currency || "LKR",
        reference: w.referenceNumber,
        badge: w.type === "credit" ? "Wallet Credit" : "Wallet Debit",
        createdAt: w.createdAt,
      });
    });

    refunds
      .filter((r) => r.status === "approved")
      .forEach((r) => {
        rows.push({
          id: `ref_${r.id}`,
          title: `Approved Refund — ${r.shopName}`,
          subtitle: `${r.shopId} • ${r.reason}`,
          type: "debit",
          amount: r.amount,
          currency: r.currency || "LKR",
          reference: r.refundCode,
          badge: "Refund",
          createdAt: r.processedAt || r.createdAt,
        });
      });

    payouts
      .filter((p) => p.status !== "cancelled")
      .forEach((p) => {
        rows.push({
          id: `payo_${p.id}`,
          title: `Payout to ${p.recipientName}`,
          subtitle: `${p.bankName} (${p.accountNumberMasked}) • ${p.status.toUpperCase()}`,
          type: "debit",
          amount: p.amount,
          currency: p.currency || "LKR",
          reference: p.payoutCode,
          badge: `Payout (${p.status})`,
          createdAt: p.createdAt,
        });
      });

    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [subPayments, walletEntries, refunds, payouts]);

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await createManualWalletEntry({
        type: entryType,
        category: entryType === "credit" ? "manual_topup" : "adjustment",
        amount: Number(amount),
        description:
          description.trim() ||
          (entryType === "credit" ? "Treasury Capital Top-Up" : "Treasury Adjustment"),
        referenceNumber: reference,
        paymentMethod: method,
      });
      setIsModalOpen(false);
      setAmount("");
      setDescription("");
      setReference("");
      setToast("Wallet ledger entry recorded.");
      setTimeout(() => setToast(null), 3200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell defaultSectionId="payments">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-orange-500/40 text-xs text-orange-100 shadow-2xl flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-400" />
          <span>{toast}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Root Platform Wallet</h1>
              <p className="text-xs text-zinc-400">
                Real-time SaaS treasury balance, subscription inflows, refund deductions, and payout reserves
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setEntryType("credit");
                setIsModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-orange-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Wallet Entry</span>
            </button>
            <Link
              href="/sa-9x8f2k/payments/payouts"
              className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5"
            >
              <ArrowUpRight className="w-4 h-4 text-orange-400" />
              <span>Initiate Payout</span>
            </Link>
          </div>
        </div>

        {/* Wallet Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-orange-500/15 via-amber-500/5 to-white/[0.02] border border-orange-500/35">
            <div className="text-xs font-semibold text-orange-300 flex items-center justify-between">
              <span>Available Wallet Balance</span>
              <Wallet className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-2">
              LKR {summary.availableBalance.toLocaleString()}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Net after refunds & reserved payouts
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/25">
            <div className="text-xs font-semibold text-emerald-300 flex items-center justify-between">
              <span>Total Gross Inflow</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono text-emerald-300 mt-2">
              LKR {summary.grossInflow.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-400/75 mt-1">
              Subscriptions: LKR {summary.subscriptionInflow.toLocaleString()}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-rose-500/[0.06] border border-rose-500/25">
            <div className="text-xs font-semibold text-rose-300 flex items-center justify-between">
              <span>Approved Refunds</span>
              <RefreshCw className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-black font-mono text-rose-300 mt-2">
              LKR {summary.approvedRefundsTotal.toLocaleString()}
            </div>
            <div className="text-[11px] text-rose-400/75 mt-1">
              Pending refunds: LKR {summary.pendingRefundsTotal.toLocaleString()}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <div className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Completed Payouts</span>
              <DollarSign className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-2">
              LKR {summary.completedPayoutsTotal.toLocaleString()}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              In transit: LKR {summary.pendingPayoutsTotal.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Unified Wallet Activity Stream */}
        <div className="rounded-2xl bg-white/[0.025] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">
              Wallet Ledger Activity ({unifiedLedger.length})
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <Link
                href="/sa-9x8f2k/payments/transactions"
                className="text-orange-400 hover:underline"
              >
                All Transactions →
              </Link>
            </div>
          </div>

          {unifiedLedger.length === 0 ? (
            <div className="p-10 text-center text-xs text-zinc-500">
              No wallet movements recorded yet. Record a subscription payment or add a wallet entry above.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {unifiedLedger.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        item.type === "credit"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {item.type === "credit" ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                          {item.reference}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300">
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {item.subtitle} • {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`text-sm font-black font-mono shrink-0 ${
                      item.type === "credit" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {item.type === "credit" ? "+" : "-"}
                    {item.currency} {item.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Wallet Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <form
            onSubmit={handleCreateEntry}
            className="w-full max-w-md rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Add Wallet Ledger Entry</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEntryType("credit")}
                  className={`py-2 rounded-xl font-bold border cursor-pointer ${
                    entryType === "credit"
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/10 text-zinc-400"
                  }`}
                >
                  + Credit (Inflow)
                </button>
                <button
                  type="button"
                  onClick={() => setEntryType("debit")}
                  className={`py-2 rounded-xl font-bold border cursor-pointer ${
                    entryType === "debit"
                      ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                      : "bg-white/5 border-white/10 text-zinc-400"
                  }`}
                >
                  - Debit (Outflow)
                </button>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Amount (LKR) *</label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="25000"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Manual settlement deposit"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Reference #</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Auto-generated"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs cursor-pointer"
              >
                {saving ? "Saving..." : "Record Entry"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
