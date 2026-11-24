"use client";

/**
 * app/sa-9x8f2k/payments/refunds/page.tsx
 *
 * Root Platform Refunds Management Workspace.
 * - Issue, approve, or reject subscription/platform refunds scoped by `shopId`.
 * - Approved refunds automatically deduct from the Root Platform Wallet balance.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  RefreshCw,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Shop } from "@/lib/types/shop";
import { subscribeToShops } from "@/lib/services/shopService";
import {
  RootRefundRecord,
  subscribeToRootRefunds,
  createRootRefundRequest,
  updateRootRefundStatus,
} from "@/lib/services/rootPaymentsService";

export default function RootRefundsPage() {
  const [refunds, setRefunds] = useState<RootRefundRecord[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">(
    "all"
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [originalRef, setOriginalRef] = useState("");
  const [method, setMethod] = useState<RootRefundRecord["refundMethod"]>("bank_transfer");
  const [autoApprove, setAutoApprove] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeToRootRefunds(setRefunds);
    const u2 = subscribeToShops((list) => {
      setShops(list);
      if (list.length > 0 && !selectedShopId) {
        setSelectedShopId(list[0].shopId);
      }
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const filtered = useMemo(
    () =>
      refunds.filter((r) => (statusFilter === "all" ? true : r.status === statusFilter)),
    [refunds, statusFilter]
  );

  const stats = useMemo(() => {
    const approved = refunds
      .filter((r) => r.status === "approved")
      .reduce((s, r) => s + r.amount, 0);
    const pending = refunds
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + r.amount, 0);
    return { approved, pending, count: refunds.length };
  }, [refunds]);

  const handleCreateRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    const shop = shops.find((s) => s.shopId === selectedShopId);
    if (!shop || !amount) return;
    setSaving(true);
    try {
      const rec = await createRootRefundRequest({
        shopId: shop.shopId,
        shopName: shop.shopName,
        originalReference: originalRef,
        amount: Number(amount),
        reason,
        refundMethod: method,
        autoApprove,
      });
      setIsModalOpen(false);
      setAmount("");
      setReason("");
      setOriginalRef("");
      setToast(`Created refund ${rec.refundCode} for ${shop.shopName}.`);
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
            <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Subscription & Platform Refunds</h1>
              <p className="text-xs text-zinc-400">
                Process, approve, and audit shop subscription refunds with automatic wallet reconciliation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Issue New Refund</span>
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-rose-500/[0.06] border border-rose-500/25">
            <div className="text-xs text-rose-300 font-semibold">Approved Refunds Total</div>
            <div className="text-xl font-black font-mono text-rose-300 mt-1">
              LKR {stats.approved.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/25">
            <div className="text-xs text-amber-300 font-semibold">Pending Approval</div>
            <div className="text-xl font-black font-mono text-amber-300 mt-1">
              LKR {stats.pending.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <div className="text-xs text-zinc-400 font-semibold">Total Refund Requests</div>
            <div className="text-xl font-black font-mono text-white mt-1">{stats.count}</div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5">
          {(["all", "pending", "approved", "rejected"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize cursor-pointer ${
                statusFilter === st
                  ? "bg-orange-500 text-zinc-950 font-bold"
                  : "bg-white/[0.04] text-zinc-400 hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Refunds List */}
        <div className="rounded-2xl bg-white/[0.025] border border-white/[0.08] overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              No refund records found.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{r.shopName}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-orange-300">
                        {r.shopId}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-zinc-300">
                        {r.refundCode}
                      </span>
                      {r.status === "approved" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Approved
                        </span>
                      ) : r.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                          <XCircle className="w-3 h-3" />
                          Rejected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Reason: <strong className="text-zinc-200">{r.reason}</strong> • Method:{" "}
                      {r.refundMethod.replace("_", " ")} •{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-base font-black font-mono text-rose-400">
                      -{r.currency} {r.amount.toLocaleString()}
                    </span>
                    {r.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            await updateRootRefundStatus(r, "approved");
                            setToast(`Approved refund ${r.refundCode}.`);
                            setTimeout(() => setToast(null), 3000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await updateRootRefundStatus(r, "rejected");
                            setToast(`Rejected refund ${r.refundCode}.`);
                            setTimeout(() => setToast(null), 3000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Refund Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <form
            onSubmit={handleCreateRefund}
            className="w-full max-w-md rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Issue Subscription Refund</h3>
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
                <label className="block text-[11px] text-zinc-400 mb-1">Shop *</label>
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                >
                  {shops.map((s) => (
                    <option key={s.shopId} value={s.shopId}>
                      {s.shopName} ({s.shopId})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Refund Amount (LKR) *</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="4500"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Refund Method</label>
                  <select
                    value={method}
                    onChange={(e) =>
                      setMethod(e.target.value as RootRefundRecord["refundMethod"])
                    }
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="original_method">Original Payment Method</option>
                    <option value="wallet_credit">Shop Credit</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Reason *</label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Duplicate monthly billing reversal"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Original Invoice Reference (Optional)
                </label>
                <input
                  type="text"
                  value={originalRef}
                  onChange={(e) => setOriginalRef(e.target.value)}
                  placeholder="SUB-202611-..."
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.checked)}
                  className="accent-orange-500 w-4 h-4"
                />
                <span className="text-zinc-300">Approve & deduct from platform wallet immediately</span>
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
                {saving ? "Processing..." : "Issue Refund"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
