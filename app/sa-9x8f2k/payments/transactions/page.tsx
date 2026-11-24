"use client";

/**
 * app/sa-9x8f2k/payments/transactions/page.tsx
 *
 * Root Platform Transactions Ledger.
 * - Real-time view of all subscription payments across all shops (`shopId`)
 * - Allows recording a new payment for any shop or initiating a 1-click refund from any transaction.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Receipt,
  Search,
  Plus,
  RefreshCw,
  Crown,
  CheckCircle2,
  Sparkles,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Shop } from "@/lib/types/shop";
import { subscribeToShops } from "@/lib/services/shopService";
import { SubscriptionPaymentRecord, BillingCycle } from "@/lib/types/subscription";
import { recordShopSubscriptionPayment } from "@/lib/services/subscriptionService";
import {
  subscribeToAllSubscriptionPayments,
  createRootRefundRequest,
} from "@/lib/services/rootPaymentsService";

export default function RootTransactionsPage() {
  const [payments, setPayments] = useState<SubscriptionPaymentRecord[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  // New Payment Modal
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeToAllSubscriptionPayments(setPayments);
    const u2 = subscribeToShops((list) => {
      setShops(list);
      if (list.length > 0 && !selectedShopId) {
        setSelectedShopId(list[0].shopId);
        setAmount(String(list[0].subscription?.effectiveBillingAmount || 9500));
      }
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (methodFilter !== "all" && p.paymentMethod !== methodFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        p.shopId.toLowerCase().includes(q) ||
        p.shopName.toLowerCase().includes(q) ||
        p.referenceNumber.toLowerCase().includes(q) ||
        p.planName.toLowerCase().includes(q)
      );
    });
  }, [payments, methodFilter, searchQuery]);

  const totalVolume = useMemo(
    () => filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [filtered]
  );

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetShop = shops.find((s) => s.shopId === selectedShopId);
    if (!targetShop) return;
    setSaving(true);
    try {
      const { paymentRecord } = await recordShopSubscriptionPayment({
        shop: targetShop,
        amount: Number(amount) || 0,
        billingCycle: cycle,
        paymentMethod: method,
        referenceNumber: reference,
      });
      setIsNewPaymentOpen(false);
      setReference("");
      setToast(
        `Recorded ${paymentRecord.currency} ${paymentRecord.amount.toLocaleString()} for ${targetShop.shopName} (${targetShop.shopId}).`
      );
      setTimeout(() => setToast(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickRefund = async (payment: SubscriptionPaymentRecord) => {
    if (
      !confirm(
        `Issue a refund of ${payment.currency} ${payment.amount.toLocaleString()} for ${payment.shopName} (${payment.referenceNumber})?`
      )
    ) {
      return;
    }
    await createRootRefundRequest({
      shopId: payment.shopId,
      shopName: payment.shopName,
      originalPaymentId: payment.paymentId,
      originalReference: payment.referenceNumber,
      amount: payment.amount,
      currency: payment.currency,
      reason: `Refund for invoice ${payment.referenceNumber}`,
      refundMethod: "original_method",
      autoApprove: true,
    });
    setToast(`Refund issued for ${payment.referenceNumber}.`);
    setTimeout(() => setToast(null), 3500);
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
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Subscription Transactions</h1>
              <p className="text-xs text-zinc-400">
                Complete audit ledger of monthly & annual subscription payments across all isolated Shop IDs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsNewPaymentOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Record Subscription Payment</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.025] border border-white/[0.08] p-3.5 rounded-2xl">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shopId, shop name, reference #, plan..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white"
            >
              <option value="all">All Methods</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card / Online</option>
              <option value="cash">Cash</option>
            </select>
            <div className="text-xs font-mono text-zinc-300 px-3 py-2 rounded-xl bg-black/40 border border-white/10">
              Volume: <strong className="text-emerald-400">LKR {totalVolume.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="rounded-2xl bg-white/[0.025] border border-white/[0.08] overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              No transactions found. Click &ldquo;Record Subscription Payment&rdquo; to log a payment.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filtered.map((tx) => (
                <div
                  key={tx.paymentId}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{tx.shopName}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-orange-300 font-bold">
                        {tx.shopId}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {tx.referenceNumber}
                      </span>
                      {tx.isFoundingCustomerRate && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300">
                          <Crown className="w-3 h-3" />
                          Founding Rate
                        </span>
                      )}
                      {tx.triggeredReactivation && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Auto-Reactivated
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Plan: <strong className="text-zinc-200">{tx.planName}</strong> ({tx.billingCycle}) • Method:{" "}
                      <span className="uppercase">{tx.paymentMethod}</span> • Paid on{" "}
                      {new Date(tx.createdAt).toLocaleString()} • Valid until{" "}
                      {new Date(tx.periodEnd).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-base font-black font-mono text-emerald-400">
                      +{tx.currency} {tx.amount.toLocaleString()}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickRefund(tx)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-[11px] font-semibold text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Refund</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {isNewPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-md rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Record Subscription Payment</h3>
              <button
                type="button"
                onClick={() => setIsNewPaymentOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Select Shop *</label>
                <select
                  value={selectedShopId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedShopId(id);
                    const s = shops.find((x) => x.shopId === id);
                    if (s?.subscription) {
                      setAmount(String(s.subscription.effectiveBillingAmount));
                    }
                  }}
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
                  <label className="block text-[11px] text-zinc-400 mb-1">Amount (LKR)</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Cycle</label>
                  <select
                    value={cycle}
                    onChange={(e) => setCycle(e.target.value as BillingCycle)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  >
                    <option value="monthly">Monthly (+30d)</option>
                    <option value="annual">Annual (+365d)</option>
                  </select>
                </div>
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
                onClick={() => setIsNewPaymentOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer"
              >
                {saving ? "Recording..." : "Confirm Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
