"use client";

/**
 * app/shop/purchases/PurchaseDetailDrawer.tsx
 *
 * Slide-over detail drawer for an active Purchase Record.
 * Features:
 * 1. Visual representation of all 3 decoupled statuses (Purchase, Stock, Payment)
 * 2. Order Line Items with instant partial or full stock receiving
 * 3. Payment history, installment schedule, and Cheque Clearance / Bounced Reversals
 * 4. Supplier Returns (Debit Notes) with automatic catalog stock deduction
 * 5. Complete chronological audit trail capturing staff user, role, and actions
 */

import React, { useState } from "react";
import {
  X,
  Package,
  Calendar,
  Building2,
  CreditCard,
  Banknote,
  Clock,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Truck,
  RotateCcw,
  ShieldCheck,
  Check,
  AlertOctagon,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  User,
  Plus,
  ArrowRight,
  FileText,
  Trash2,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  recordPurchasePayment,
  updateChequeStatus,
  receivePurchaseStock,
  createPurchaseReturn,
  deletePurchase,
  canUserManagePurchases,
} from "@/lib/services/purchaseService";
import {
  PurchaseRecord,
  PurchaseStatus,
  PurchaseStockStatus,
  PurchasePaymentStatus,
  ChequeStatus,
  PaymentMethod,
  PurchaseReturnRefundType,
} from "@/lib/types/purchase";

interface PurchaseDetailDrawerProps {
  purchase: PurchaseRecord | null;
  onClose: () => void;
  onUpdated: () => void;
}

type TabType = "ITEMS" | "PAYMENTS" | "RETURNS" | "AUDIT";

export default function PurchaseDetailDrawer({
  purchase,
  onClose,
  onUpdated,
}: PurchaseDetailDrawerProps) {
  const { shop, user } = useShopAuth();
  const [activeTab, setActiveTab] = useState<TabType>("ITEMS");

  // Receive stock modal state
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

  // Record payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payRef, setPayRef] = useState("");
  const [payInstallmentId, setPayInstallmentId] = useState("");
  const [chequeNum, setChequeNum] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDt, setChequeDt] = useState(new Date().toISOString().slice(0, 10));

  // Bounce cheque modal state
  const [bouncingPaymentId, setBouncingPaymentId] = useState<string | null>(null);
  const [bounceReason, setBounceReason] = useState("");

  // Return modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("Defective / Damaged");
  const [returnRefundType, setReturnRefundType] =
    useState<PurchaseReturnRefundType>("REDUCE_PAYABLE_BALANCE");

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [revertStockOnDelete, setRevertStockOnDelete] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  if (!purchase) return null;

  const canManage = canUserManagePurchases(user?.role, user?.permissions);

  // Status Badge Configs
  const getPurchaseStatusBadge = (status: PurchaseStatus) => {
    switch (status) {
      case "ORDERED":
        return { label: "Ordered", bg: "bg-zinc-800", text: "text-zinc-300", border: "border-zinc-700" };
      case "PARTIALLY_RECEIVED":
        return { label: "Partial Delivery", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/25" };
      case "RECEIVED":
        return { label: "Fully Received", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25" };
      case "CANCELLED":
        return { label: "Cancelled", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/25" };
    }
  };

  const getStockStatusBadge = (status: PurchaseStockStatus) => {
    switch (status) {
      case "PENDING":
        return { label: "Stock: Pending", bg: "bg-zinc-900", text: "text-zinc-400", border: "border-zinc-800" };
      case "PARTIALLY_STOCKED":
        return { label: "Stock: Partial", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/25" };
      case "STOCKED":
        return { label: "Stock: In Catalog", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25" };
      case "PARTIALLY_RETURNED":
        return { label: "Stock: Partial Return", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/25" };
      case "RETURNED":
        return { label: "Stock: Returned", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/25" };
    }
  };

  const getPaymentStatusBadge = (status: PurchasePaymentStatus) => {
    switch (status) {
      case "UNPAID":
        return { label: "Payment: Unpaid", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/25" };
      case "PARTIALLY_PAID":
        return { label: "Payment: Partial", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/25" };
      case "PAID":
        return { label: "Payment: Paid", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25" };
      case "REFUNDED":
        return { label: "Payment: Refunded", bg: "bg-zinc-800", text: "text-zinc-300", border: "border-zinc-700" };
      case "OVERPAID":
        return { label: "Payment: Overpaid", bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/25" };
    }
  };

  const pBadge = getPurchaseStatusBadge(purchase.purchaseStatus);
  const sBadge = getStockStatusBadge(purchase.stockStatus);
  const payBadge = getPaymentStatusBadge(purchase.paymentStatus);

  // ── Receive Stock Action ──
  const handleOpenReceiveModal = () => {
    const initial: Record<string, number> = {};
    purchase.items.forEach((item) => {
      const remaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
      initial[item.productId] = remaining;
    });
    setReceiveQuantities(initial);
    setShowReceiveModal(true);
    setActionError("");
  };

  const handleConfirmReceiveStock = async () => {
    if (!shop?.shopId || !user) return;
    setIsSubmitting(true);
    setActionError("");

    try {
      const itemsToReceive = Object.entries(receiveQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([productId, receiveQuantity]) => ({
          productId,
          receiveQuantity,
        }));

      if (itemsToReceive.length === 0) {
        throw new Error("Please specify at least one quantity to receive.");
      }

      await receivePurchaseStock(
        shop.shopId,
        purchase.id,
        itemsToReceive,
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );

      setShowReceiveModal(false);
      onUpdated();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to receive stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Record Payment Action ──
  const handleOpenPaymentModal = (installmentId?: string, defaultAmt?: number) => {
    setPayInstallmentId(installmentId || "");
    setPayAmount(defaultAmt !== undefined ? defaultAmt : purchase.balanceDue);
    setPayMethod("CASH");
    setPayRef("");
    setShowPaymentModal(true);
    setActionError("");
  };

  const handleConfirmPayment = async () => {
    if (!shop?.shopId || !user) return;
    if (payAmount <= 0) {
      setActionError("Amount must be greater than zero.");
      return;
    }

    setIsSubmitting(true);
    setActionError("");

    try {
      await recordPurchasePayment(
        shop.shopId,
        purchase.id,
        {
          amount: payAmount,
          paymentMethod: payMethod,
          reference: payRef,
          installmentId: payInstallmentId || undefined,
          cheque:
            payMethod === "CHEQUE"
              ? {
                  chequeNumber: chequeNum,
                  bankName: chequeBank,
                  chequeDate: new Date(chequeDt).getTime(),
                }
              : undefined,
        },
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );

      setShowPaymentModal(false);
      onUpdated();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Cheque Actions ──
  const handleClearCheque = async (paymentId: string) => {
    if (!shop?.shopId || !user) return;
    setIsSubmitting(true);
    try {
      await updateChequeStatus(
        shop.shopId,
        purchase.id,
        paymentId,
        "CLEARED",
        undefined,
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );
      onUpdated();
    } catch (err: unknown) {
      console.error("Error clearing cheque:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmBounceCheque = async () => {
    if (!shop?.shopId || !user || !bouncingPaymentId) return;
    setIsSubmitting(true);
    try {
      await updateChequeStatus(
        shop.shopId,
        purchase.id,
        bouncingPaymentId,
        "BOUNCED",
        bounceReason || "Bounced / Dishonoured",
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );
      setBouncingPaymentId(null);
      setBounceReason("");
      onUpdated();
    } catch (err: unknown) {
      console.error("Error bouncing cheque:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Return Action ──
  const handleOpenReturnModal = () => {
    const initial: Record<string, number> = {};
    purchase.items.forEach((item) => {
      initial[item.productId] = 0;
    });
    setReturnQuantities(initial);
    setShowReturnModal(true);
    setActionError("");
  };

  const handleConfirmReturn = async () => {
    if (!shop?.shopId || !user) return;
    setIsSubmitting(true);
    setActionError("");

    try {
      const itemsToReturn = Object.entries(returnQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([productId, returnQuantity]) => ({
          productId,
          returnQuantity,
          reason: returnReason,
        }));

      if (itemsToReturn.length === 0) {
        throw new Error("Please specify at least one item quantity to return.");
      }

      await createPurchaseReturn(
        shop.shopId,
        purchase.id,
        {
          items: itemsToReturn,
          reason: returnReason,
          refundType: returnRefundType,
        },
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );

      setShowReturnModal(false);
      onUpdated();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to issue return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete Purchase Action ──
  const handleConfirmDelete = async () => {
    if (!shop?.shopId || !user) return;
    setIsSubmitting(true);
    setActionError("");

    try {
      await deletePurchase(
        shop.shopId,
        purchase.id,
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        },
        revertStockOnDelete
      );

      setShowDeleteModal(false);
      onUpdated();
      onClose();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to delete purchase order.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl text-zinc-200">
        {/* Drawer Header (Clean, sleek gray secondary styling) */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold font-mono text-white">
                  {purchase.purchaseOrderNumber}
                </span>
                {purchase.supplierInvoiceNumber && (
                  <span className="text-[10px] text-zinc-400 font-mono px-1.5 py-0.2 rounded bg-zinc-800">
                    Bill #{purchase.supplierInvoiceNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate font-medium">
                {purchase.supplierName}{" "}
                {purchase.supplierPhone ? `• ${purchase.supplierPhone}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {canManage && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-rose-500/20 hover:border-rose-500/40 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Delete Purchase Order"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Decoupled Status Badges Strip */}
          <div className="flex items-center gap-2 mt-3 flex-wrap text-[10px] font-mono">
            {/* Purchase Status */}
            <span className={`px-2 py-0.5 rounded-full border ${pBadge.bg} ${pBadge.text} ${pBadge.border}`}>
              {pBadge.label}
            </span>

            {/* Stock Status */}
            <span className={`px-2 py-0.5 rounded-full border ${sBadge.bg} ${sBadge.text} ${sBadge.border}`}>
              {sBadge.label}
            </span>

            {/* Payment Status */}
            <span className={`px-2 py-0.5 rounded-full border ${payBadge.bg} ${payBadge.text} ${payBadge.border}`}>
              {payBadge.label}
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 mt-4 border-b border-zinc-800/80 -mb-4 sm:-mb-5 pb-0">
            {[
              { id: "ITEMS", label: `Items (${purchase.items.length})` },
              { id: "PAYMENTS", label: `Payments & Cheques (${purchase.payments.length})` },
              { id: "RETURNS", label: `Returns (${purchase.returns?.length || 0})` },
              { id: "AUDIT", label: `Audit Trail (${purchase.auditTrail?.length || 0})` },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as TabType)}
                className={`px-3 py-2 text-xs font-mono transition-colors border-b-2 cursor-pointer ${
                  activeTab === t.id
                    ? "border-zinc-300 text-white font-semibold"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drawer Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs font-sans">
          {actionError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* TAB 1: ORDER ITEMS & DELIVERY                           */}
          {/* ═══════════════════════════════════════════════════════ */}
          {activeTab === "ITEMS" && (
            <div className="space-y-4">
              {/* Quick Action: Receive Stock */}
              {canManage && purchase.purchaseStatus !== "RECEIVED" && (
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-zinc-200 block">
                      Goods Delivery Received?
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Record received quantities to increment catalog inventory.
                    </span>
                  </div>
                  <button
                    onClick={handleOpenReceiveModal}
                    className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 font-bold font-mono text-xs cursor-pointer shadow transition-all"
                  >
                    Receive Stock
                  </button>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2">
                {purchase.items.map((item) => {
                  const pendingQty = Math.max(0, item.orderedQuantity - item.receivedQuantity);
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-zinc-200 block truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            #{item.sku}
                          </span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-zinc-100 font-bold block">
                            LKR {item.totalCost.toFixed(2)}
                          </span>
                          <span className="text-[10.5px] text-zinc-500">
                            @ {item.unitCost.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Quantities breakdown strip */}
                      <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-3 text-center text-[10.5px] font-mono">
                        <div className="bg-zinc-900/80 p-1 rounded">
                          <span className="text-zinc-500 block">Ordered</span>
                          <span className="font-bold text-zinc-200">
                            {item.orderedQuantity}
                          </span>
                        </div>
                        <div className="bg-zinc-900/80 p-1 rounded">
                          <span className="text-zinc-500 block">Received</span>
                          <span className="font-bold text-emerald-400">
                            {item.receivedQuantity}
                          </span>
                        </div>
                        <div className="bg-zinc-900/80 p-1 rounded">
                          <span className="text-zinc-500 block">Returned</span>
                          <span className="font-bold text-rose-400">
                            {item.returnedQuantity || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order Cost Breakdown */}
              <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-1.5 font-mono text-right text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal:</span>
                  <span>LKR {purchase.subtotalAmount.toFixed(2)}</span>
                </div>
                {purchase.shippingCost > 0 && (
                  <div className="flex justify-between text-zinc-400">
                    <span>Shipping:</span>
                    <span>LKR {purchase.shippingCost.toFixed(2)}</span>
                  </div>
                )}
                {purchase.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount:</span>
                    <span>- LKR {purchase.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-1.5 border-t border-zinc-800 flex justify-between font-bold text-zinc-100 text-sm">
                  <span>Grand Total Payable:</span>
                  <span>LKR {purchase.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* TAB 2: PAYMENTS, INSTALLMENTS & CHEQUES                 */}
          {/* ═══════════════════════════════════════════════════════ */}
          {activeTab === "PAYMENTS" && (
            <div className="space-y-4">
              {/* Financial Balance Summary */}
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 font-mono text-center">
                <div>
                  <span className="text-[10px] text-zinc-500 block">Total</span>
                  <span className="text-sm font-bold text-zinc-200">
                    {purchase.totalAmount.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Paid</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {purchase.amountPaid.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Balance Due</span>
                  <span className={`text-sm font-bold ${purchase.balanceDue > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                    {purchase.balanceDue.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Record Payment Button */}
              {canManage && purchase.balanceDue > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => handleOpenPaymentModal()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-bold font-mono cursor-pointer shadow transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                </div>
              )}

              {/* Installments Schedule Section */}
              {purchase.hasInstallments && purchase.installments.length > 0 && (
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Installment Schedule
                  </span>
                  <div className="space-y-1.5">
                    {purchase.installments.map((inst) => {
                      const isOverdue = inst.status === "OVERDUE" || (inst.status === "PENDING" && inst.dueDate < Date.now());
                      const isPaid = inst.status === "PAID";
                      return (
                        <div
                          key={inst.id}
                          className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3 text-xs font-mono"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-200">
                                #{inst.installmentNumber}
                              </span>
                              <span
                                className={`text-[9.5px] px-1.5 py-0.2 rounded border ${
                                  isPaid
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                    : isOverdue
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                }`}
                              >
                                {isPaid ? "Paid" : isOverdue ? "Overdue" : "Pending"}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500">
                              Due: {new Date(inst.dueDate).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="font-bold text-zinc-100 block">
                              LKR {inst.amountDue.toFixed(2)}
                            </span>
                            {!isPaid && canManage && (
                              <button
                                onClick={() =>
                                  handleOpenPaymentModal(
                                    inst.id,
                                    inst.amountDue - inst.amountPaid
                                  )
                                }
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                              >
                                Pay Installment
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Payments History List */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Payment History & Cheques ({purchase.payments.length})
                </span>

                {purchase.payments.length === 0 ? (
                  <div className="py-6 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg font-mono">
                    No payments recorded yet.
                  </div>
                ) : (
                  purchase.payments.map((p) => {
                    const isCheque = p.paymentMethod === "CHEQUE" && p.cheque;
                    const chequeStatus = p.cheque?.chequeStatus;

                    return (
                      <div
                        key={p.id}
                        className={`p-3 rounded-xl border flex flex-col gap-2 ${
                          chequeStatus === "BOUNCED"
                            ? "bg-rose-950/20 border-rose-500/30"
                            : "bg-zinc-900/40 border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-200 font-mono">
                              {p.paymentMethod}
                            </span>
                            {p.reference && (
                              <span className="text-[10px] text-zinc-500 font-mono">
                                Ref: {p.reference}
                              </span>
                            )}
                          </div>
                          <span
                            className={`font-bold font-mono text-sm ${
                              chequeStatus === "BOUNCED"
                                ? "text-rose-400 line-through"
                                : "text-emerald-400"
                            }`}
                          >
                            LKR {p.amount.toFixed(2)}
                          </span>
                        </div>

                        {/* Cheque Management details */}
                        {isCheque && p.cheque && (
                          <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80 flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono">
                            <div>
                              <span className="text-zinc-300 font-medium">
                                Cheque #{p.cheque.chequeNumber} ({p.cheque.bankName})
                              </span>
                              <span className="text-zinc-500 block text-[10px]">
                                Date: {new Date(p.cheque.chequeDate).toLocaleDateString()}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Cheque Status Badge */}
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] border ${
                                  chequeStatus === "CLEARED"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                    : chequeStatus === "BOUNCED"
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                }`}
                              >
                                {chequeStatus}
                              </span>

                              {/* Cheque Action Buttons (Only for PENDING) */}
                              {canManage && chequeStatus === "PENDING" && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleClearCheque(p.id)}
                                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                  <button
                                    onClick={() => setBouncingPaymentId(p.id)}
                                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    Bounce
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1">
                          <span>By: {p.performedBy?.displayName || p.performedBy?.username}</span>
                          <span>{new Date(p.paidAt).toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* TAB 3: SUPPLIER RETURNS (DEBIT NOTES)                   */}
          {/* ═══════════════════════════════════════════════════════ */}
          {activeTab === "RETURNS" && (
            <div className="space-y-4">
              {/* Issue Return Button */}
              {canManage && purchase.totalReceivedQuantity > 0 && (
                <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div>
                    <span className="font-semibold text-zinc-200 block">
                      Supplier Return (Debit Note)
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Returns deduct stock from inventory without erasing original records.
                    </span>
                  </div>
                  <button
                    onClick={handleOpenReturnModal}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold font-mono cursor-pointer transition-all"
                  >
                    Issue Return
                  </button>
                </div>
              )}

              {/* Returns List */}
              {(!purchase.returns || purchase.returns.length === 0) ? (
                <div className="py-8 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg font-mono">
                  No supplier returns issued for this purchase order.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {purchase.returns.map((ret) => (
                    <div
                      key={ret.id}
                      className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 flex flex-col gap-2 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-200">
                            {ret.returnNumber}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-400">
                            {ret.refundType}
                          </span>
                        </div>
                        <span className="font-bold text-rose-400">
                          - LKR {ret.totalRefundAmount.toFixed(2)}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-400">
                        Reason: <span className="text-zinc-300 font-medium">{ret.reason}</span>
                      </div>

                      {/* Items in Return */}
                      <div className="space-y-1 pt-1">
                        {ret.items.map((ri, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between text-[10.5px] p-1 rounded bg-zinc-950 border border-zinc-800/80"
                          >
                            <span className="text-zinc-300">{ri.name} (#{ri.sku})</span>
                            <span className="text-zinc-400">
                              {ri.returnQuantity} units @ {ri.unitCost} = {ri.totalRefund.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                        <span>Issued By: {ret.performedBy?.displayName || ret.performedBy?.username}</span>
                        <span>{new Date(ret.returnedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* TAB 4: AUDIT TRAIL                                      */}
          {/* ═══════════════════════════════════════════════════════ */}
          {activeTab === "AUDIT" && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Chronological Audit History
              </span>

              {purchase.auditTrail?.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col gap-1 text-xs"
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-zinc-200 text-[11px]">
                      {entry.action}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {entry.details}
                  </p>
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    User: {entry.performedBy?.displayName || entry.performedBy?.username} ({entry.performedBy?.role})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Submodal: Receive Stock ── */}
        {showReceiveModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
            <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs space-y-3">
              <h3 className="text-sm font-bold text-white">Receive Stock Items</h3>
              <p className="text-zinc-400 text-[11px]">
                Enter quantities delivered. This will automatically update your catalog stock.
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {purchase.items.map((item) => {
                  const maxRemaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
                  return (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between gap-2 p-2 rounded bg-zinc-900 border border-zinc-800"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-zinc-200 block truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Ordered: {item.orderedQuantity} • Recv: {item.receivedQuantity}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={maxRemaining}
                        value={receiveQuantities[item.productId] ?? 0}
                        onChange={(e) =>
                          setReceiveQuantities({
                            ...receiveQuantities,
                            [item.productId]: Math.min(maxRemaining, Math.max(0, parseInt(e.target.value) || 0)),
                          })
                        }
                        className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-center font-mono text-zinc-100"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800">
                <button
                  onClick={() => setShowReceiveModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReceiveStock}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 text-zinc-900 font-bold"
                >
                  {isSubmitting ? "Updating Stock..." : "Confirm Receipt"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Submodal: Record Payment ── */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
            <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs space-y-3">
              <h3 className="text-sm font-bold text-white">Record Purchase Payment</h3>

              <div>
                <label className="text-zinc-400 block mb-1">Amount (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 font-mono text-white text-sm"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 font-mono text-zinc-200"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CARD">Card</option>
                </select>
              </div>

              {payMethod === "CHEQUE" && (
                <div className="space-y-2 p-2.5 rounded bg-zinc-900 border border-zinc-800">
                  <input
                    type="text"
                    placeholder="Cheque Number"
                    value={chequeNum}
                    onChange={(e) => setChequeNum(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 font-mono text-zinc-200"
                  />
                  <input
                    type="text"
                    placeholder="Bank Name"
                    value={chequeBank}
                    onChange={(e) => setChequeBank(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 font-mono text-zinc-200"
                  />
                  <input
                    type="date"
                    value={chequeDt}
                    onChange={(e) => setChequeDt(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 font-mono text-zinc-200"
                  />
                </div>
              )}

              <div>
                <label className="text-zinc-400 block mb-1">Reference</label>
                <input
                  type="text"
                  placeholder="Slip # or Transaction ID"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 font-mono text-zinc-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 text-zinc-900 font-bold"
                >
                  {isSubmitting ? "Recording..." : "Save Payment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Submodal: Bounce Cheque ── */}
        {bouncingPaymentId && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
            <div className="w-full max-w-sm bg-zinc-950 border border-rose-500/30 rounded-xl p-4 text-xs space-y-3">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4" />
                Mark Cheque as Bounced
              </h3>
              <p className="text-zinc-400 text-[11px]">
                This will reverse the paid amount, restore the balance due, and record an audit entry. The record will NOT be deleted.
              </p>

              <div>
                <label className="text-zinc-400 block mb-1">Reason for Bounce</label>
                <input
                  type="text"
                  placeholder="e.g. Insufficient Funds / Signature mismatch"
                  value={bounceReason}
                  onChange={(e) => setBounceReason(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-zinc-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800">
                <button
                  onClick={() => setBouncingPaymentId(null)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBounceCheque}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  {isSubmitting ? "Processing..." : "Confirm Bounce"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Submodal: Issue Return ── */}
        {showReturnModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
            <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs space-y-3">
              <h3 className="text-sm font-bold text-white">Issue Supplier Return</h3>
              <p className="text-zinc-400 text-[11px]">
                Specify items to return. If items are in catalog inventory, stock will be safely deducted.
              </p>

              <div className="space-y-2 max-h-52 overflow-y-auto">
                {purchase.items.map((item) => {
                  const maxReturnable = Math.max(0, item.receivedQuantity - item.returnedQuantity);
                  if (maxReturnable <= 0) return null;

                  return (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between gap-2 p-2 rounded bg-zinc-900 border border-zinc-800"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-zinc-200 block truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Max Returnable: {maxReturnable}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={maxReturnable}
                        value={returnQuantities[item.productId] ?? 0}
                        onChange={(e) =>
                          setReturnQuantities({
                            ...returnQuantities,
                            [item.productId]: Math.min(maxReturnable, Math.max(0, parseInt(e.target.value) || 0)),
                          })
                        }
                        className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-center font-mono text-zinc-100"
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Reason for Return</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-zinc-200 font-mono"
                >
                  <option value="Defective / Damaged">Defective / Damaged</option>
                  <option value="Expired Goods">Expired Goods</option>
                  <option value="Wrong Item Shipped">Wrong Item Shipped</option>
                  <option value="Excess Quantity">Excess Quantity</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Refund Treatment</label>
                <select
                  value={returnRefundType}
                  onChange={(e) => setReturnRefundType(e.target.value as PurchaseReturnRefundType)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-zinc-200 font-mono"
                >
                  <option value="REDUCE_PAYABLE_BALANCE">Reduce Payable Balance</option>
                  <option value="CASH_REFUND">Cash Refund Received</option>
                  <option value="SUPPLIER_CREDIT">Supplier Credit Note</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800">
                <button
                  onClick={() => setShowReturnModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReturn}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  {isSubmitting ? "Processing..." : "Confirm Return"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Submodal: Delete Confirmation ── */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
            <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-xs space-y-4 shadow-2xl">
              <div className="flex items-center gap-3 text-rose-400">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Delete Purchase Order</h3>
                  <p className="text-zinc-400 text-[11px] font-mono">{purchase.purchaseOrderNumber}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-zinc-400">
                  <span>Supplier:</span>
                  <span className="text-zinc-200 font-semibold">{purchase.supplierName}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Total Amount:</span>
                  <span className="text-zinc-200 font-semibold">LKR {purchase.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Received Units:</span>
                  <span className="text-zinc-200 font-semibold">
                    {purchase.totalReceivedQuantity} / {purchase.totalOrderedQuantity}
                  </span>
                </div>
                {purchase.amountPaid > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Recorded Payments:</span>
                    <span className="font-semibold">LKR {purchase.amountPaid.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {purchase.totalReceivedQuantity > 0 && (
                <label className="flex items-start gap-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={revertStockOnDelete}
                    onChange={(e) => setRevertStockOnDelete(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 mt-0.5"
                  />
                  <span>
                    Reverse received catalog inventory (automatically deduct {purchase.totalReceivedQuantity} received units via Stock Out)
                  </span>
                </label>
              )}

              <p className="text-zinc-400 text-[11px]">
                Are you sure you want to permanently delete this purchase record? This operation cannot be undone.
              </p>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5"
                >
                  {isSubmitting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
