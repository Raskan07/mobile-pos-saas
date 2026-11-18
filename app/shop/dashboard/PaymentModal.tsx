"use client";

import React, { useState, useEffect } from "react";
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
  initialMethod?: "cash" | "card" | "bank" | "mobile";
  initialCashTendered?: string;
  currency?: string;
}

export default function PaymentModal({
  isOpen,
  onClose,
  onCompleteSale,
  cart,
  grandTotal,
  initialMethod = "cash",
  initialCashTendered,
  currency = "LKR",
}: PaymentModalProps) {
  const [activeTab, setActiveTab] = useState<"cash" | "card" | "bank" | "mobile">(initialMethod);
  const [cashTendered, setCashTendered] = useState<string>(grandTotal.toFixed(2));
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const [cardApproved, setCardApproved] = useState(false);

  // Sync when modal opens or grandTotal / initialMethod changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMethod);
      if (initialCashTendered !== undefined && initialCashTendered !== "") {
        setCashTendered(initialCashTendered);
      } else {
        setCashTendered(grandTotal.toFixed(2));
      }
      setIsProcessingCard(false);
      setCardApproved(false);
    }
  }, [isOpen, grandTotal, initialMethod, initialCashTendered]);

  if (!isOpen) return null;

  const tenderedVal = parseFloat(cashTendered) || 0;
  const diff = tenderedVal - grandTotal;
  const changeDue = Math.max(0, diff);
  const shortfall = Math.max(0, -diff);
  const isCashSufficient = tenderedVal >= grandTotal - 0.001;
  const totalItems = cart.reduce((acc, c) => acc + c.quantity, 0);

  // Compute smart minimalistic quick cash presets
  const roundedTen = Math.ceil(grandTotal / 10) * 10;
  const roundedHundred = Math.ceil(grandTotal / 100) * 100;
  const presetCandidates = [
    roundedTen > grandTotal ? roundedTen : null,
    roundedHundred > grandTotal ? roundedHundred : null,
    500,
    1000,
    2000,
    5000,
  ].filter((v): v is number => v !== null && v >= grandTotal);
  const uniquePresets = Array.from(new Set(presetCandidates)).slice(0, 4);

  const handleQuickCash = (amount: number) => {
    setCashTendered(amount.toFixed(2));
  };

  const handleCardSimulate = () => {
    setIsProcessingCard(true);
    setTimeout(() => {
      setIsProcessingCard(false);
      setCardApproved(true);
      setTimeout(() => {
        onCompleteSale("card", grandTotal, 0);
      }, 600);
    }, 900);
  };

  const handleConfirmCash = () => {
    if (!isCashSufficient) return;
    onCompleteSale("cash", tenderedVal, changeDue);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0e1017] border border-white/[0.09] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimalist Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <h2 className="text-sm font-bold text-white tracking-tight">Checkout</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-zinc-400 border border-white/[0.07]">
              {totalItems} {totalItems === 1 ? "item" : "items"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sleek Segmented Payment Method Bar */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/40 border border-white/[0.07]">
          {[
            { id: "cash", label: "Cash", icon: Banknote, dot: "text-emerald-400" },
            { id: "card", label: "Card", icon: CreditCard, dot: "text-sky-400" },
            { id: "bank", label: "Transfer", icon: Building2, dot: "text-amber-400" },
            { id: "mobile", label: "QR Pay", icon: Smartphone, dot: "text-purple-400" },
          ].map((m) => {
            const Icon = m.icon;
            const active = activeTab === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveTab(m.id as any)}
                className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  active
                    ? "bg-white/[0.1] text-white border border-white/[0.12] shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? m.dot : "text-zinc-500"}`} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── CASH TAB: Minimalist Split Cash Balance View ── */}
        {activeTab === "cash" && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* 3-Column Unified Live Cash Balance Card */}
            <div className="grid grid-cols-3 gap-2 p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.08]">
              {/* Col 1: Bill Total */}
              <div className="pr-2 border-r border-white/[0.07] flex flex-col justify-between">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
                  Total Due
                </span>
                <div className="text-sm sm:text-base font-bold font-mono text-white tracking-tight mt-1.5">
                  <span className="text-[10px] text-zinc-500 mr-1">{currency}</span>
                  {grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Col 2: Cash Received (Editable inline) */}
              <div className="px-2 border-r border-white/[0.07] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-300">
                    Cash Given
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuickCash(grandTotal)}
                    className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    Exact
                  </button>
                </div>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-[10px] font-mono text-zinc-500">{currency}</span>
                  <input
                    type="number"
                    step="any"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isCashSufficient) {
                        e.preventDefault();
                        handleConfirmCash();
                      }
                    }}
                    className="w-full bg-transparent font-mono text-sm sm:text-base font-bold text-white focus:outline-none border-b border-dashed border-white/25 focus:border-emerald-400 pb-0.5"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              {/* Col 3: Live Cash Balance / Change */}
              <div className="pl-2 flex flex-col justify-between">
                <span
                  className={`text-[10px] uppercase tracking-wider font-bold ${
                    isCashSufficient ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {isCashSufficient ? "Cash Balance" : "Shortfall"}
                </span>
                <div
                  className={`text-sm sm:text-base font-black font-mono tracking-tight mt-1.5 ${
                    isCashSufficient ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  <span className="text-[10px] opacity-75 mr-1">
                    {isCashSufficient ? currency : `-${currency}`}
                  </span>
                  {(isCashSufficient ? changeDue : shortfall).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            {/* Single-Row Smart Quick Tender Chips */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <span className="text-[11px] text-zinc-500 font-medium">Quick:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleQuickCash(grandTotal)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer ${
                    Math.abs(tenderedVal - grandTotal) < 0.01
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300"
                  }`}
                >
                  Exact
                </button>
                {uniquePresets.map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => handleQuickCash(bill)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer ${
                      Math.abs(tenderedVal - bill) < 0.01
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300"
                    }`}
                  >
                    {bill.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Minimalist Action Footer */}
            <div className="pt-1 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-400 truncate">
                {isCashSufficient ? (
                  changeDue > 0 ? (
                    <>
                      Return{" "}
                      <span className="font-mono font-bold text-emerald-400">
                        {currency} {changeDue.toFixed(2)}
                      </span>{" "}
                      balance
                    </>
                  ) : (
                    <span>Exact tender received</span>
                  )
                ) : (
                  <>
                    Need{" "}
                    <span className="font-mono font-bold text-rose-400">
                      {currency} {shortfall.toFixed(2)}
                    </span>{" "}
                    more
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={!isCashSufficient}
                onClick={handleConfirmCash}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 text-white text-xs font-bold font-mono flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer shrink-0"
              >
                <span>Complete • {currency} {grandTotal.toFixed(2)}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ── CARD TAB: Minimalist Card Tap ── */}
        {activeTab === "card" && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Tap, Insert or Swipe Card</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>Terminal Ready • No surcharge</span>
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[10px] text-zinc-500 uppercase">Amount</div>
                <div className="text-sm font-bold text-white">{currency} {grandTotal.toFixed(2)}</div>
              </div>
            </div>

            <button
              type="button"
              disabled={isProcessingCard || cardApproved}
              onClick={handleCardSimulate}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold font-mono flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 transition-all cursor-pointer"
            >
              {isProcessingCard ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Authorizing Card…</span>
                </>
              ) : cardApproved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Approved! Finalizing…</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Charge Card • {currency} {grandTotal.toFixed(2)}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── BANK TRANSFER TAB: Minimalist Wire Settlement ── */}
        {activeTab === "bank" && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.08] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Direct Bank Transfer</div>
                <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                  HM Mobile Hub • Acct •••• 8492
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[10px] text-zinc-500 uppercase">Amount</div>
                <div className="text-sm font-bold text-white">{currency} {grandTotal.toFixed(2)}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onCompleteSale("bank-transfer", grandTotal, 0)}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold font-mono flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Transfer • {currency} {grandTotal.toFixed(2)}</span>
            </button>
          </div>
        )}

        {/* ── MOBILE / QR TAB: Minimalist QR Settlement ── */}
        {activeTab === "mobile" && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 p-1.5 rounded-lg bg-white flex items-center justify-center shrink-0">
                  <div className="w-full h-full border border-black grid grid-cols-4 gap-0.5 p-0.5 bg-white">
                    <div className="bg-black col-span-2 row-span-2" />
                    <div className="bg-black" />
                    <div className="bg-black" />
                    <div className="bg-black" />
                    <div className="bg-black col-span-2" />
                    <div className="bg-black" />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Scan Merchant QR</div>
                  <div className="text-[11px] text-zinc-400">Instant digital wallet settlement</div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[10px] text-zinc-500 uppercase">Amount</div>
                <div className="text-sm font-bold text-white">{currency} {grandTotal.toFixed(2)}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onCompleteSale("mobile-qr", grandTotal, 0)}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm QR Payment • {currency} {grandTotal.toFixed(2)}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
