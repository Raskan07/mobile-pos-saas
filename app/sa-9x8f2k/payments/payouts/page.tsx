"use client";

/**
 * app/sa-9x8f2k/payments/payouts/page.tsx
 *
 * Root Platform Payouts & Bank Disbursements Workspace.
 * - Schedule and complete treasury withdrawals / partner payouts from the Platform Wallet.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  DollarSign,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  Building2,
  Sparkles,
  X,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  RootPayoutRecord,
  subscribeToRootPayouts,
  createRootPayout,
  updateRootPayoutStatus,
  deleteRootPayout,
} from "@/lib/services/rootPaymentsService";

export default function RootPayoutsPage() {
  const [payouts, setPayouts] = useState<RootPayoutRecord[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [recipientName, setRecipientName] = useState("Skyfox Corporate Treasury");
  const [accountType, setAccountType] =
    useState<RootPayoutRecord["accountType"]>("bank_account");
  const [bankName, setBankName] = useState("Commercial Bank PLC");
  const [accountMasked, setAccountMasked] = useState("**** 8842");
  const [amount, setAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("0");
  const [reference, setReference] = useState("");
  const [markCompleted, setMarkCompleted] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToRootPayouts(setPayouts);
    return () => unsub();
  }, []);

  const totals = useMemo(() => {
    const completed = payouts
      .filter((p) => p.status === "completed")
      .reduce((s, p) => s + p.amount, 0);
    const pending = payouts
      .filter((p) => p.status === "pending" || p.status === "processing")
      .reduce((s, p) => s + p.amount, 0);
    return { completed, pending };
  }, [payouts]);

  const handleCreatePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      const rec = await createRootPayout({
        recipientName,
        accountType,
        bankName,
        accountNumberMasked: accountMasked,
        amount: Number(amount),
        feeAmount: Number(feeAmount) || 0,
        referenceNumber: reference,
        markCompletedImmediately: markCompleted,
      });
      setIsModalOpen(false);
      setAmount("");
      setReference("");
      setToast(`Payout ${rec.payoutCode} recorded.`);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Payouts & Bank Disbursements</h1>
              <p className="text-xs text-zinc-400">
                Disburse collected SaaS subscription revenue to corporate bank accounts or partner settlements
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Payout</span>
          </button>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/25">
            <div className="text-xs text-emerald-300 font-semibold">Completed Payouts</div>
            <div className="text-xl font-black font-mono text-emerald-300 mt-1">
              LKR {totals.completed.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/25">
            <div className="text-xs text-amber-300 font-semibold">Pending / In Transit</div>
            <div className="text-xl font-black font-mono text-amber-300 mt-1">
              LKR {totals.pending.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <div className="text-xs text-zinc-400 font-semibold">Disbursement Count</div>
            <div className="text-xl font-black font-mono text-white mt-1">{payouts.length}</div>
          </div>
        </div>

        {/* Payouts List */}
        <div className="rounded-2xl bg-white/[0.025] border border-white/[0.08] overflow-hidden">
          {payouts.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              No payouts initiated yet. Click &ldquo;New Payout&rdquo; to disburse funds from the Platform Wallet.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {payouts.map((p) => (
                <div
                  key={p.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{p.recipientName}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-orange-300">
                        {p.payoutCode}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-zinc-300">
                        {p.bankName} ({p.accountNumberMasked})
                      </span>
                      {p.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Completed
                        </span>
                      ) : p.status === "cancelled" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                          <XCircle className="w-3 h-3" />
                          Cancelled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                          <Clock className="w-3 h-3" />
                          {p.status}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Ref: {p.referenceNumber} • Net Disbursed: {p.currency}{" "}
                      {p.netAmount.toLocaleString()} (Fee: {p.currency} {p.feeAmount}) •{" "}
                      {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-base font-black font-mono text-white">
                      {p.currency} {p.amount.toLocaleString()}
                    </span>
                    {p.status !== "completed" && p.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => updateRootPayoutStatus(p.id, "completed")}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                      >
                        Mark Completed
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteRootPayout(p.id)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Payout Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <form
            onSubmit={handleCreatePayout}
            className="w-full max-w-md rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Initiate Treasury Payout</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Recipient Name *</label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Bank Name *</label>
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Account #</label>
                  <input
                    type="text"
                    value={accountMasked}
                    onChange={(e) => setAccountMasked(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Payout Amount (LKR) *</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Transfer Fee (LKR)</label>
                  <input
                    type="number"
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={markCompleted}
                  onChange={(e) => setMarkCompleted(e.target.checked)}
                  className="accent-orange-500 w-4 h-4"
                />
                <span className="text-zinc-300">Mark as completed bank settlement immediately</span>
              </label>
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
                {saving ? "Processing..." : "Confirm Payout"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
