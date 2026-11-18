"use client";

/**
 * app/r/[token]/page.tsx
 *
 * Customer-Facing Public Digital Receipt Page for Skyfox POS.
 *
 * Security & Experience Design:
 * - Accessible ONLY via a cryptographically secure, unguessable 32-character token (`/r/<token>`).
 * - Displays ONLY customer-intended receipt data from `public_receipts/{token}` (zero internal cost prices,
 *   zero profit margins, zero internal staff permissions).
 * - Renders the exact same physical thermal receipt layout as `ReceiptModal.tsx` so the customer gets
 *   an identical receipt experience whether on paper or via WhatsApp.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, Store, ShieldCheck, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import {
  fetchPublicDigitalReceiptByToken,
  PublicDigitalReceipt,
} from "@/lib/services/whatsappReceiptService";
import { DEFAULT_RECEIPT_SETTINGS } from "@/lib/types/receiptSettings";

export default function PublicDigitalReceiptPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";

  const [receipt, setReceipt] = useState<PublicDigitalReceipt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadReceipt() {
      setLoading(true);
      const data = await fetchPublicDigitalReceiptByToken(token);
      if (active) {
        setReceipt(data);
        setLoading(false);
      }
    }
    if (token) {
      loadReceipt();
    } else {
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080d] text-white flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin mb-4" />
        <p className="text-sm font-medium text-white/70">Loading secure digital receipt...</p>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen bg-[#07080d] text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#11131a] border border-white/10 p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Digital Receipt Not Found</h1>
          <p className="text-xs text-white/60 leading-relaxed">
            This receipt link may be invalid or incomplete. Skyfox POS protects customer receipts using secure, unguessable tokens. Please check the link shared with you on WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  const receiptSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...(receipt.receiptSettings || {}),
  };

  const currency = receipt.currency || receiptSettings.currency || "LKR";
  const formatMoney = (amount: number) =>
    `${currency} ${Number(amount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const dateObj = new Date(receipt.createdAt);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const formattedTime = dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isLeftAligned = receiptSettings.alignment === "left";

  return (
    <div className="min-h-screen bg-[#07080d] text-white py-8 px-4 flex flex-col items-center">
      {/* Print Stylesheet matching physical thermal paper output */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #pos-digital-receipt-print-area,
          #pos-digital-receipt-print-area * {
            visibility: visible !important;
          }
          #pos-digital-receipt-print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: ${receiptSettings.paperWidth === "58mm" ? "58mm" : "80mm"} !important;
            max-width: ${receiptSettings.paperWidth === "58mm" ? "58mm" : "80mm"} !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Verification Badge & Print Bar */}
      <div className="no-print w-full max-w-[400px] mb-4 flex items-center justify-between gap-3 bg-[#11131a] border border-white/10 rounded-xl px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">Official E-Receipt</div>
            <div className="text-[10px] text-white/50 truncate flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
              Verified by Skyfox POS
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-all cursor-pointer shrink-0"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / PDF
        </button>
      </div>

      {/* Physical Thermal Receipt Paper Layout (Identical to ReceiptModal.tsx) */}
      <div className="w-full">
        <div
          id="pos-digital-receipt-print-area"
          style={{ backgroundColor: "#ffffff", color: "#18181b" }}
          className={`mx-auto h-fit bg-white text-zinc-900 rounded-xl p-6 shadow-2xl font-mono text-xs leading-relaxed transition-all ${
            receiptSettings.paperWidth === "58mm"
              ? "max-w-[280px] w-full"
              : "max-w-[400px] w-full"
          }`}
        >
          {/* Store Branding Header */}
          <div
            className={`border-b border-dashed border-zinc-300 pb-4 mb-3 flex flex-col ${
              isLeftAligned ? "items-start text-left" : "items-center text-center"
            }`}
          >
            {receiptSettings.showLogo &&
              (receiptSettings.logoUrl ? (
                <div className="mb-2.5">
                  <img
                    src={receiptSettings.logoUrl}
                    alt="Store Logo"
                    className="max-h-14 max-w-[160px] object-contain"
                  />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-lg bg-zinc-900 text-white flex items-center justify-center mb-2">
                  <Store className="w-4 h-4" />
                </div>
              ))}

            {receiptSettings.showShopName && (
              <h2 className="text-base font-black tracking-tight uppercase text-zinc-900">
                {receiptSettings.headerTitle || receipt.shopName}
              </h2>
            )}

            {receiptSettings.tagline && (
              <p className="text-[11px] text-zinc-600 font-sans mt-0.5">
                {receiptSettings.tagline}
              </p>
            )}

            {receiptSettings.address && (
              <p className="text-[10px] text-zinc-500 mt-1">{receiptSettings.address}</p>
            )}

            {(receiptSettings.phone || receiptSettings.email) && (
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {[receiptSettings.phone, receiptSettings.email].filter(Boolean).join(" • ")}
              </p>
            )}

            {receiptSettings.taxNumber && (
              <p className="text-[10px] text-zinc-700 font-semibold mt-0.5">
                {receiptSettings.taxNumber}
              </p>
            )}

            {(receiptSettings.showBranchName || receiptSettings.showShopId) && (
              <p className="text-[10px] text-zinc-500 mt-1">
                {receiptSettings.showBranchName ? receipt.branchName : ""}
                {receiptSettings.showBranchName && receiptSettings.showShopId ? " • " : ""}
                {receiptSettings.showShopId ? `ID: ${receipt.shopId}` : ""}
              </p>
            )}
          </div>

          {/* Metadata Grid */}
          <div className="border-b border-dashed border-zinc-300 pb-3 mb-3 space-y-1 text-[11px]">
            {receiptSettings.showInvoiceNumber && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Invoice #:</span>
                <span className="font-bold text-zinc-900">{receipt.invoiceNumber}</span>
              </div>
            )}
            {receiptSettings.showDate && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Date:</span>
                <span className="text-zinc-800">
                  {formattedDate} {formattedTime}
                </span>
              </div>
            )}
            {receiptSettings.showCashierName && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Cashier:</span>
                <span className="text-zinc-800">{receipt.cashierName}</span>
              </div>
            )}
            {receiptSettings.showPaymentMethod && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Payment:</span>
                <span className="font-bold uppercase text-zinc-900">
                  {receipt.paymentMethod}
                </span>
              </div>
            )}
            {receiptSettings.showCustomerInfo && receipt.customerName && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Customer:</span>
                <span className="font-bold text-zinc-900">
                  {receipt.customerName}
                  {receipt.customerPhoneMasked ? ` (${receipt.customerPhoneMasked})` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Line Items Header */}
          <div className="border-b border-zinc-300 pb-1.5 mb-2 flex justify-between text-[10px] font-bold uppercase text-zinc-500">
            <span>Item / Qty × Price</span>
            <span>Amount</span>
          </div>

          {/* Line Items List */}
          <div className="border-b border-dashed border-zinc-300 pb-3 mb-3 space-y-2.5">
            {receipt.items.map((item, idx) => (
              <div key={`${item.sku || item.name}-${idx}`} className="text-[11px]">
                <div className="font-bold text-zinc-900 leading-snug">{item.name}</div>
                {(receiptSettings.showItemVariant || receiptSettings.showItemSku) && (
                  <div className="text-[10px] text-zinc-500">
                    {receiptSettings.showItemVariant && item.variant ? item.variant : ""}
                    {receiptSettings.showItemVariant &&
                    item.variant &&
                    receiptSettings.showItemSku &&
                    item.sku
                      ? " • "
                      : ""}
                    {receiptSettings.showItemSku && item.sku ? `SKU: ${item.sku}` : ""}
                  </div>
                )}
                <div className="flex justify-between items-center mt-0.5 text-zinc-700">
                  <span>
                    {item.quantity} × {formatMoney(item.unitPrice)}
                  </span>
                  <span className="font-bold text-zinc-900">
                    {formatMoney(item.subtotal)}
                  </span>
                </div>
                {item.discount > 0 && (
                  <div className="text-[10px] text-emerald-700">
                    - {formatMoney(item.discount)} (Item Disc.)
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totals Breakdown */}
          <div className="border-b border-dashed border-zinc-300 pb-3 mb-3 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-zinc-700">
              <span>Subtotal</span>
              <span>{formatMoney(receipt.subtotal)}</span>
            </div>

            {receiptSettings.showDiscount && receipt.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>
                  Discount{receipt.discountLabel ? ` (${receipt.discountLabel})` : ""}
                </span>
                <span>-{formatMoney(receipt.discountAmount)}</span>
              </div>
            )}

            {receiptSettings.showTaxBreakdown && (
              <div className="flex justify-between text-zinc-700">
                <span>
                  {receipt.taxName || receiptSettings.taxName} ({receipt.taxRateDisplay}%)
                </span>
                <span>{formatMoney(receipt.taxAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-black text-zinc-900 pt-1.5 border-t border-zinc-300">
              <span>TOTAL ({receipt.itemCount} items)</span>
              <span>{formatMoney(receipt.grandTotal)}</span>
            </div>
          </div>

          {/* Cash Tendered / Change */}
          {receiptSettings.showTenderedAndChange &&
            receipt.paymentMethod.toLowerCase() === "cash" && (
              <div className="border-b border-dashed border-zinc-300 pb-3 mb-3 space-y-1 text-[11px]">
                <div className="flex justify-between text-zinc-700">
                  <span>Cash Tendered</span>
                  <span>
                    {formatMoney(receipt.cashReceived ?? receipt.grandTotal)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-zinc-900">
                  <span>Change Due</span>
                  <span>{formatMoney(receipt.change ?? 0)}</span>
                </div>
              </div>
            )}

          {/* Footer */}
          <div
            className={`pt-1 space-y-1 flex flex-col ${
              isLeftAligned ? "items-start text-left" : "items-center text-center"
            }`}
          >
            {receiptSettings.footerNote && (
              <p className="text-[11px] font-bold text-zinc-800">
                {receiptSettings.footerNote}
              </p>
            )}
            {receiptSettings.warrantyPolicy && (
              <p className="text-[10px] text-zinc-500">
                {receiptSettings.warrantyPolicy}
              </p>
            )}

            {receiptSettings.showBarcode && (
              <div className="pt-2 flex flex-col items-center justify-center gap-0.5 self-center">
                <div className="flex items-center justify-center gap-[1.5px] h-7 px-2">
                  {Array.from({ length: 34 }).map((_, i) => (
                    <span
                      key={i}
                      className="bg-zinc-900 inline-block h-full"
                      style={{
                        width: i % 4 === 0 ? "2.5px" : i % 2 === 0 ? "1.5px" : "1px",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[9px] tracking-[0.2em] text-zinc-400">
                  {receipt.invoiceNumber}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="no-print w-full max-w-[400px] mt-4 flex items-center justify-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Download / Print Receipt
        </button>
      </div>
    </div>
  );
}
