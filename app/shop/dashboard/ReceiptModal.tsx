"use client";

import React, { useRef } from "react";
import { CheckCircle2, Printer, RotateCcw, X, Smartphone, ShieldCheck, Database } from "lucide-react";
import { CartItem, DiscountSetting } from "./posData";
import { SaleRecord } from "@/lib/types/sale";

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSale: () => void;
  persistedSale?: SaleRecord | null;
  cart?: CartItem[];
  subtotal?: number;
  discountSetting?: DiscountSetting;
  discountAmount?: number;
  taxAmount?: number;
  grandTotal?: number;
  paymentMethod?: string;
  cashTendered?: number;
  changeDue?: number;
  cashierName?: string;
  shopName?: string;
  shopId?: string;
  branchName?: string;
}

export default function ReceiptModal({
  isOpen,
  onClose,
  onNewSale,
  persistedSale,
  cart = [],
  subtotal = 0,
  discountSetting = { type: "fixed", value: 0 },
  discountAmount = 0,
  taxAmount = 0,
  grandTotal = 0,
  paymentMethod = "cash",
  cashTendered = 0,
  changeDue = 0,
  cashierName = "Cashier",
  shopName = "POS Store",
  shopId = "",
  branchName = "Main Branch",
}: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Use values from the persisted sale if available, falling back to passed props
  const finalInvoiceNumber = persistedSale?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;
  const finalSaleId = persistedSale?.saleId || "";
  const finalDate = persistedSale
    ? new Date(persistedSale.createdAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

  const finalCashier = persistedSale?.cashierName || cashierName;
  const finalShopName = persistedSale?.shopName || shopName;
  const finalShopId = persistedSale?.shopId || shopId;
  const finalBranch = persistedSale?.branchName || branchName;
  const finalPaymentMethod = persistedSale?.paymentMethod || paymentMethod;

  const finalSubtotal = persistedSale?.subtotal ?? subtotal;
  const finalDiscountAmount = persistedSale?.discountAmount ?? discountAmount;
  const finalTaxAmount = persistedSale?.taxAmount ?? taxAmount;
  const finalGrandTotal = persistedSale?.grandTotal ?? grandTotal;
  const finalCashReceived = persistedSale?.cashReceived ?? cashTendered;
  const finalChange = persistedSale?.change ?? changeDue;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Notification */}
        <div className="bg-gradient-to-r from-emerald-600/20 via-emerald-500/10 to-transparent border-b border-emerald-500/20 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Payment Complete</h3>
              <p className="text-[11px] text-zinc-400">Sale finalized & saved to cloud ledger</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Receipt Paper Body */}
        <div className="p-5 overflow-y-auto flex-1 text-zinc-300">
          {finalSaleId && (
            <div className="mb-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
              <span className="flex items-center gap-1.5 font-medium">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>Firestore Sales Record</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                {finalSaleId}
              </span>
            </div>
          )}

          <div
            ref={receiptRef}
            className="p-5 rounded-xl bg-zinc-950/80 border border-white/10 font-mono text-xs shadow-inner"
          >
            {/* Store Branding */}
            <div className="text-center pb-3 border-b border-dashed border-zinc-700">
              <div className="flex items-center justify-center gap-1.5 font-sans font-black text-white text-base tracking-wider mb-1">
                <Smartphone className="w-4 h-4 text-zinc-400" />
                <span>{finalShopName.toUpperCase()}</span>
              </div>
              <div className="text-[10px] text-zinc-400">{finalBranch}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Shop ID: {finalShopId}</div>
            </div>

            {/* Meta Information */}
            <div className="py-2.5 border-b border-dashed border-zinc-700 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">Invoice:</span>
                <span className="text-zinc-200 font-bold">{finalInvoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Date:</span>
                <span className="text-zinc-300">{finalDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Cashier:</span>
                <span className="text-zinc-300">{finalCashier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Payment:</span>
                <span className="text-zinc-300 font-bold uppercase">{finalPaymentMethod}</span>
              </div>
            </div>

            {/* Itemized List (Using Snapshot Items when persisted) */}
            <div className="py-3 border-b border-dashed border-zinc-700 space-y-2">
              <div className="flex justify-between text-[10px] uppercase text-zinc-500 font-bold">
                <span>Item / Qty</span>
                <span>Amount</span>
              </div>

              {persistedSale ? (
                persistedSale.items.map((item, idx) => (
                  <div key={item.productId + idx} className="flex justify-between items-start text-[11px]">
                    <div>
                      <div className="text-zinc-200 font-medium">
                        {item.name}
                        {item.variant ? ` (${item.variant})` : ""}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {item.sku ? `SKU: ${item.sku} • ` : ""}
                        {item.quantity} x LKR {item.unitPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-zinc-200 font-semibold">
                      LKR {item.subtotal.toFixed(2)}
                    </div>
                  </div>
                ))
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className="flex justify-between items-start text-[11px]">
                    <div>
                      <div className="text-zinc-200 font-medium">{item.product.name}</div>
                      <div className="text-[10px] text-zinc-500">
                        {item.product.sku ? `SKU: ${item.product.sku} • ` : ""}
                        {item.quantity} x LKR {(item.customPrice ?? item.product.price).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-zinc-200 font-semibold">
                      LKR {((item.customPrice ?? item.product.price) * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals Breakdown */}
            <div className="py-2.5 border-b border-dashed border-zinc-700 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>LKR {finalSubtotal.toFixed(2)}</span>
              </div>
              {finalDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount</span>
                  <span>-LKR {finalDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <span>Tax (8%)</span>
                <span>LKR {finalTaxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1.5 border-t border-zinc-800">
                <span>Total</span>
                <span>LKR {finalGrandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Cash Tendered / Change Details if Cash */}
            {finalPaymentMethod.toLowerCase() === "cash" && (
              <div className="py-2 space-y-1 text-[11px] text-zinc-400">
                <div className="flex justify-between">
                  <span>Tendered</span>
                  <span>LKR {finalCashReceived.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-400">
                  <span>Change Return</span>
                  <span>LKR {finalChange.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Footer Barcode */}
            <div className="pt-3 pb-1 text-center">
              <div className="h-7 w-44 mx-auto bg-white/[0.07] rounded-md flex items-center justify-center text-[10px] tracking-[0.25em] text-zinc-300 font-mono select-none">
                ||| | |||| | || |||| |
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 bg-zinc-900/60 border-t border-white/10 flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-zinc-400" />
            <span>Print Receipt</span>
          </button>
          <button
            onClick={onNewSale}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New Sale</span>
          </button>
        </div>
      </div>
    </div>
  );
}
