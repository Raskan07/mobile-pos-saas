"use client";

import React, { useState } from "react";
import {
  X,
  Banknote,
  CreditCard,
  Building2,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { CartItem, DiscountSetting } from "./posData";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleteSale: (method: string, tendered: number, change: number) => void;
  cart: CartItem[];
  subtotal: number;
  discountSetting: DiscountSetting;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
}

export default function PaymentModal({
  isOpen,
  onClose,
  onCompleteSale,
  cart,
  subtotal,
  discountSetting,
  discountAmount,
  taxAmount,
  grandTotal,
}: PaymentModalProps) {
  const [activeTab, setActiveTab] = useState<"cash" | "card" | "bank" | "mobile">("cash");
  const [cashTendered, setCashTendered] = useState<string>(grandTotal.toFixed(2));
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const [cardApproved, setCardApproved] = useState(false);

  if (!isOpen) return null;

  const tenderedVal = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, tenderedVal - grandTotal);
  const isCashSufficient = tenderedVal >= grandTotal;

  const handleQuickCash = (amount: number) => {
    setCashTendered(amount.toFixed(2));
  };

  const handleAddCash = (amount: number) => {
    const current = parseFloat(cashTendered) || 0;
    setCashTendered((current + amount).toFixed(2));
  };

  const handleCardSimulate = () => {
    setIsProcessingCard(true);
    setTimeout(() => {
      setIsProcessingCard(false);
      setCardApproved(true);
      setTimeout(() => {
        onCompleteSale("card", grandTotal, 0);
      }, 700);
    }, 1200);
  };

  const handleConfirmCash = () => {
    if (!isCashSufficient) return;
    onCompleteSale("cash", tenderedVal, changeDue);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Checkout & Payment</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-300 border border-zinc-500/30">
                {cart.reduce((acc, c) => acc + c.quantity, 0)} Items
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Select customer payment method to finalize transaction</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grand Total Highlight Banner */}
        <div className="bg-gradient-to-r from-zinc-900/40 via-zinc-900/30 to-zinc-950/40 border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Grand Total Due</span>
            <div className="text-xs text-zinc-500">Includes 8% tax & discounts</div>
          </div>
          <div className="text-2xl font-black text-white font-mono tracking-tight">
            LKR {grandTotal.toFixed(2)}
          </div>
        </div>

        {/* Payment Method Selector Tabs */}
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("cash")}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "cash"
                  ? "bg-zinc-700/40 border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                  : "bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
              }`}
            >
              <Banknote className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-semibold">Cash</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("card")}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "card"
                  ? "bg-zinc-700/40 border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                  : "bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
              }`}
            >
              <CreditCard className="w-5 h-5 text-blue-400" />
              <span className="text-xs font-semibold">Card</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("bank")}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "bank"
                  ? "bg-zinc-700/40 border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                  : "bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
              }`}
            >
              <Building2 className="w-5 h-5 text-amber-400" />
              <span className="text-xs font-semibold">Transfer</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("mobile")}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "mobile"
                  ? "bg-zinc-700/40 border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                  : "bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
              }`}
            >
              <Smartphone className="w-5 h-5 text-purple-400" />
              <span className="text-xs font-semibold">Mobile / QR</span>
            </button>
          </div>

          {/* TAB CONTENT: CASH */}
          {activeTab === "cash" && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              {/* Cash Tendered Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex justify-between">
                  <span>Cash Received from Customer</span>
                  <span className="text-zinc-400 font-mono text-[11px]">Due: LKR {grandTotal.toFixed(2)}</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">
                    LKR
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-full pl-14 pr-4 py-3 rounded-xl bg-black/40 border border-white/15 focus:border-zinc-500 focus:outline-none text-lg font-mono font-bold text-white"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              {/* Quick Cash Presets */}
              <div className="space-y-1.5">
                <div className="text-[11px] text-zinc-400 font-medium">Quick Tender Options</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickCash(grandTotal)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 transition-colors"
                  >
                    Exact (LKR {grandTotal.toFixed(2)})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickCash(Math.ceil(grandTotal / 10) * 10 || 10)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 transition-colors"
                  >
                    Round Up (LKR {(Math.ceil(grandTotal / 10) * 10 || 10).toFixed(2)})
                  </button>
                  {[50, 100, 200, 500, 1000, 1500, 2000].map(
                    (bill) =>
                      bill >= grandTotal && (
                        <button
                          key={bill}
                          type="button"
                          onClick={() => handleQuickCash(bill)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 transition-colors"
                        >
                          LKR {bill}
                        </button>
                      )
                  )}
                  <button
                    type="button"
                    onClick={() => handleAddCash(20)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs font-medium text-emerald-300 transition-colors"
                  >
                    +LKR 20
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddCash(50)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs font-medium text-emerald-300 transition-colors"
                  >
                    +LKR 50
                  </button>
                </div>
              </div>

              {/* Change Return Result Box */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                  isCashSufficient
                    ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                    : "bg-red-950/20 border-red-500/30 text-red-300"
                }`}
              >
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">
                    {isCashSufficient ? "Change Due to Customer" : "Insufficient Tender"}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {isCashSufficient
                      ? "Hand change to customer before closing drawer"
                      : `Missing LKR ${(grandTotal - tenderedVal).toFixed(2)}`}
                  </div>
                </div>
                <div className="text-xl font-black font-mono">
                  LKR {isCashSufficient ? changeDue.toFixed(2) : "0.00"}
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: CARD */}
          {activeTab === "card" && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-zinc-200">Terminal PAX A920 Ready</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">EMV / NFC Chip</span>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950 border border-white/5 flex flex-col items-center justify-center text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-semibold text-white">Tap, Insert or Swipe Card</div>
                  <div className="text-xs text-zinc-400 max-w-xs">
                    Ask customer to tap Apple Pay, Google Pay, or insert chip card on the terminal.
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    256-bit Encrypted
                  </span>
                  <span>Fee: $0.00 (Merchant Surcharge Waived)</span>
                </div>
              </div>

              <button
                type="button"
                disabled={isProcessingCard || cardApproved}
                onClick={handleCardSimulate}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
              >
                {isProcessingCard ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Authorizing with Bank Terminal…</span>
                  </>
                ) : cardApproved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Approved! Finalizing…</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Simulate Successful Card Tap (LKR {grandTotal.toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB CONTENT: BANK TRANSFER */}
          {activeTab === "bank" && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5 text-xs">
                <div className="font-semibold text-zinc-200">Wire & Direct Deposit Instructions</div>
                <div className="p-3 rounded-lg bg-black/40 font-mono text-[11px] space-y-1 text-zinc-300">
                  <div>Bank: Chase Commercial POS</div>
                  <div>Account Name: HM Mobile Hub LLC</div>
                  <div>Account Number: •••• •••• 8492</div>
                  <div>Routing: 021000021</div>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Verify reference invoice before approving direct bank transfers.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onCompleteSale("bank-transfer", grandTotal, 0)}
                className="w-full py-3 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Bank Wire Received (LKR {grandTotal.toFixed(2)})</span>
              </button>
            </div>
          )}

          {/* TAB CONTENT: MOBILE / QR */}
          {activeTab === "mobile" && (
            <div className="space-y-4 animate-in fade-in-50 duration-150 text-center">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center space-y-3">
                <div className="w-36 h-36 p-2 rounded-xl bg-white flex items-center justify-center shadow-lg">
                  {/* Stylized QR placeholder */}
                  <div className="w-full h-full border-2 border-black grid grid-cols-5 gap-1 p-1 bg-white">
                    <div className="bg-black col-span-2 row-span-2" />
                    <div className="bg-black" />
                    <div className="bg-black col-span-2 row-span-2" />
                    <div className="bg-black" />
                    <div className="bg-black col-span-2" />
                    <div className="bg-black col-span-2" />
                    <div className="bg-black" />
                    <div className="bg-black col-span-2" />
                    <div className="bg-black col-span-2" />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Scan to Pay via UPI / CashApp / Venmo</div>
                  <div className="text-[11px] text-zinc-400">Instant merchant verification</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCompleteSale("mobile-qr", grandTotal, 0)}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Mobile Payment (LKR {grandTotal.toFixed(2)})</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer for Cash Tender */}
        {activeTab === "cash" && (
          <div className="p-4 bg-zinc-900/60 border-t border-white/10 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isCashSufficient}
              onClick={handleConfirmCash}
              className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <span>Finalize Cash Sale (LKR {grandTotal.toFixed(2)})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
