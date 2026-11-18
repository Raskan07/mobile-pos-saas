"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  CheckCircle2,
  Printer,
  RotateCcw,
  Store,
  X,
  CloudCheck,
  MessageCircle,
  ExternalLink,
  Copy,
  Check,
  Phone,
  ShieldCheck,
  Info,
} from "lucide-react";
import { CartItem, DiscountSetting } from "./posData";
import { SaleRecord } from "@/lib/types/sale";
import { ReceiptSettings } from "@/lib/types/receiptSettings";
import {
  getStoredReceiptSettings,
  fetchReceiptSettings,
} from "@/lib/services/receiptSettingsService";
import {
  initiateWhatsAppEReceiptHandoff,
  InitiateWhatsAppHandoffResult,
  normalizeWhatsAppPhone,
} from "@/lib/services/whatsappReceiptService";

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSale?: () => void;
  persistedSale?: SaleRecord | null;
  customer?: {
    customerId?: string;
    name?: string;
    phone?: string;
    email?: string;
  } | null;
  cart?: CartItem[];
  subtotal?: number;
  discountSetting?: DiscountSetting;
  discountAmount?: number;
  taxAmount?: number;
  grandTotal?: number;
  paymentMethod?: "Cash" | "Card" | string;
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
  customer,
  cart = [],
  subtotal = 0,
  discountSetting = { type: "fixed", value: 0 },
  discountAmount = 0,
  taxAmount = 0,
  grandTotal = 0,
  paymentMethod = "Cash",
  cashTendered,
  changeDue,
  cashierName = "Staff",
  shopName = "SKYFOX POS",
  shopId = "DEFAULT",
  branchName = "Main Branch",
}: ReceiptModalProps) {
  // Always pull immutable values from the persisted Firestore SaleRecord if available
  const finalShopName = persistedSale?.shopName || shopName;
  const finalShopId = persistedSale?.shopId || shopId;
  const finalBranchName = persistedSale?.branchName || branchName;
  const finalCashierName = persistedSale?.cashierName || cashierName;
  const finalSubtotal = persistedSale ? persistedSale.subtotal : subtotal;
  const finalDiscountAmount = persistedSale ? persistedSale.discountAmount : discountAmount;
  const finalTaxAmount = persistedSale ? persistedSale.taxAmount : taxAmount;
  const finalGrandTotal = persistedSale ? persistedSale.grandTotal : grandTotal;
  const finalPaymentMethod = persistedSale
    ? persistedSale.paymentMethod === "cash"
      ? "Cash"
      : persistedSale.paymentMethod === "card"
      ? "Card"
      : persistedSale.paymentMethod
    : paymentMethod;
  const finalCashTendered =
    persistedSale?.cashReceived !== undefined ? persistedSale.cashReceived : cashTendered;
  const finalChangeDue =
    persistedSale?.change !== undefined ? persistedSale.change : changeDue;

  // Retrieve saved customer name & phone from completed sale record or attached customer
  const savedCustomerName =
    persistedSale?.customer?.name || customer?.name || "";
  const savedCustomerPhone =
    persistedSale?.customer?.phone || customer?.phone || "";

  // Load customizable receipt layout settings for this shop (Firestore + local cache)
  const [fetchedSettings, setFetchedSettings] = useState<ReceiptSettings | null>(null);

  // WhatsApp E-Receipt Handoff State
  const [whatsappPhone, setWhatsappPhone] = useState<string>(savedCustomerPhone);
  const [isEditingPhone, setIsEditingPhone] = useState<boolean>(false);
  const [isInitiatingWhatsApp, setIsInitiatingWhatsApp] = useState<boolean>(false);
  const [handoffResult, setHandoffResult] =
    useState<InitiateWhatsAppHandoffResult | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !finalShopId) return;
    let active = true;
    fetchReceiptSettings(finalShopId, finalShopName).then((remote) => {
      if (active) setFetchedSettings(remote);
    });
    return () => {
      active = false;
    };
  }, [isOpen, finalShopId, finalShopName]);

  // Reset WhatsApp state and populate saved customer phone whenever a sale completes / modal opens
  useEffect(() => {
    if (isOpen) {
      setWhatsappPhone(savedCustomerPhone);
      setIsEditingPhone(false);
      setIsInitiatingWhatsApp(false);
      setHandoffResult(null);
      setHandoffError(null);
      setCopiedLink(false);
    }
  }, [isOpen, persistedSale?.saleId, savedCustomerPhone]);

  const receiptSettings: ReceiptSettings = useMemo(() => {
    if (fetchedSettings && fetchedSettings.shopId === finalShopId) {
      return fetchedSettings;
    }
    return getStoredReceiptSettings(finalShopId, finalShopName);
  }, [fetchedSettings, finalShopId, finalShopName, isOpen]);

  const currency = receiptSettings.currency || "LKR";
  const formatMoney = (amount: number) =>
    `${currency} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const receiptMeta = useMemo(() => {
    const dateObj = persistedSale ? new Date(persistedSale.createdAt) : new Date();
    const invoiceNo =
      persistedSale?.invoiceNumber ||
      `INV-${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(
        2,
        "0"
      )}${String(dateObj.getDate()).padStart(2, "0")}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    const formattedTime = dateObj.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      invoiceNo,
      formattedDate,
      formattedTime,
      createdAt: dateObj.getTime(),
    };
  }, [isOpen, persistedSale]);

  // Unified printable line items from immutable snapshot or active cart fallback
  const printableItems = useMemo(() => {
    if (persistedSale && persistedSale.items.length > 0) {
      return persistedSale.items.map((item, idx) => ({
        key: `${item.productId}-${idx}`,
        name: item.name,
        variant: item.variant || "",
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        subtotal: item.subtotal,
      }));
    }
    return cart.map((item) => {
      const unitPrice = item.customPrice ?? item.product.price;
      const lineGross = unitPrice * item.quantity;
      const itemDisc =
        item.itemDiscountType === "percentage"
          ? Math.min(lineGross, (lineGross * (item.itemDiscountValue || 0)) / 100)
          : Math.min(lineGross, item.itemDiscountValue || 0);
      return {
        key: item.product.id,
        name: item.product.name,
        variant: item.product.specs,
        sku: item.product.sku,
        quantity: item.quantity,
        unitPrice,
        discount: Math.round(itemDisc * 100) / 100,
        subtotal: Math.max(0, Math.round((lineGross - itemDisc) * 100) / 100),
      };
    });
  }, [persistedSale, cart]);

  const totalItems = persistedSale
    ? persistedSale.itemCount
    : cart.reduce((acc, i) => acc + i.quantity, 0);

  if (!isOpen) return null;

  const activeDiscountSetting = persistedSale?.discountSetting || discountSetting;
  const taxRateDisplay = persistedSale
    ? Math.round((persistedSale.taxRate || 0) * 100)
    : receiptSettings.taxRate ?? 0;

  const normalizedCustomerPhone = normalizeWhatsAppPhone(whatsappPhone);
  const hasCustomerPhone = normalizedCustomerPhone.length >= 8;

  const handlePrint = () => {
    window.print();
  };

  const handleSendWhatsAppReceipt = async () => {
    if (!hasCustomerPhone) {
      setHandoffError("Please enter a valid customer phone number.");
      return;
    }

    setHandoffError(null);
    setIsInitiatingWhatsApp(true);

    try {
      const discountLabel =
        activeDiscountSetting.scope === "item"
          ? "Per-Item"
          : activeDiscountSetting.type === "percentage"
          ? `${activeDiscountSetting.value}%`
          : undefined;

      const result = await initiateWhatsAppEReceiptHandoff({
        saleId: persistedSale?.saleId,
        existingToken: handoffResult?.token || persistedSale?.eReceiptToken,
        shopId: finalShopId,
        shopName: finalShopName,
        branchName: finalBranchName,
        invoiceNumber: receiptMeta.invoiceNo,
        createdAt: receiptMeta.createdAt,
        cashierName: finalCashierName,
        cashierId: persistedSale?.cashierId,
        paymentMethod: String(finalPaymentMethod),
        customerName: savedCustomerName || undefined,
        customerPhone: whatsappPhone,
        items: printableItems.map((it) => ({
          name: it.name,
          variant: it.variant,
          sku: it.sku,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: it.discount,
          subtotal: it.subtotal,
        })),
        itemCount: totalItems,
        subtotal: finalSubtotal,
        discountLabel,
        discountAmount: finalDiscountAmount,
        taxName: receiptSettings.taxName || "Tax / SST",
        taxRateDisplay,
        taxAmount: finalTaxAmount,
        grandTotal: finalGrandTotal,
        cashReceived: finalCashTendered,
        change: finalChangeDue,
        currency,
        receiptSettings,
      });

      setHandoffResult(result);
      setIsEditingPhone(false);

      // Redirect / open WhatsApp with the pre-filled message and secure digital receipt URL
      window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setHandoffError(
        err?.message || "Failed to initiate WhatsApp receipt handoff."
      );
    } finally {
      setIsInitiatingWhatsApp(false);
    }
  };

  const handleCopyReceiptLink = async () => {
    if (!handoffResult?.publicReceiptUrl) return;
    try {
      await navigator.clipboard.writeText(handoffResult.publicReceiptUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <>
      {/* Print-Only Stylesheet so window.print() outputs clean thermal paper format */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #pos-receipt-print-area,
          #pos-receipt-print-area * {
            visibility: visible !important;
          }
          #pos-receipt-print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
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

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
        <div className="w-full max-w-md rounded-2xl bg-[#11131a] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Success Top Banner */}
          <div className="no-print px-5 py-4 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white leading-tight">
                    Sale Completed
                  </h3>
                  {persistedSale && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CloudCheck className="w-2.5 h-2.5" />
                      Synced
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-400 font-mono">
                  {receiptMeta.invoiceNo}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Thermal Receipt Preview */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-[#0c0d13]">
            <div
              id="pos-receipt-print-area"
              style={{ backgroundColor: "#ffffff", color: "#18181b" }}
              className={`mx-auto h-fit bg-white text-zinc-900 rounded-xl p-6 shadow-xl font-mono text-xs leading-relaxed transition-all ${
                receiptSettings.paperWidth === "58mm" ? "w-[280px]" : "w-full"
              }`}
            >
              {/* Store Branding Header */}
              <div
                className={`border-b border-dashed border-zinc-300 pb-4 mb-3 flex flex-col ${
                  receiptSettings.alignment === "left"
                    ? "items-start text-left"
                    : "items-center text-center"
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
                    {receiptSettings.headerTitle || finalShopName}
                  </h2>
                )}
                {receiptSettings.tagline && (
                  <p className="text-[11px] text-zinc-600 font-sans mt-0.5">
                    {receiptSettings.tagline}
                  </p>
                )}
                {receiptSettings.address && (
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {receiptSettings.address}
                  </p>
                )}
                {(receiptSettings.phone || receiptSettings.email) && (
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {[receiptSettings.phone, receiptSettings.email]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                )}
                {receiptSettings.taxNumber && (
                  <p className="text-[10px] text-zinc-700 font-semibold mt-0.5">
                    {receiptSettings.taxNumber}
                  </p>
                )}
                {(receiptSettings.showBranchName || receiptSettings.showShopId) && (
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {receiptSettings.showBranchName ? finalBranchName : ""}
                    {receiptSettings.showBranchName && receiptSettings.showShopId
                      ? " • "
                      : ""}
                    {receiptSettings.showShopId ? `ID: ${finalShopId}` : ""}
                  </p>
                )}
              </div>

              {/* Metadata Grid */}
              <div className="border-b border-dashed border-zinc-300 pb-3 mb-3 space-y-1 text-[11px]">
                {receiptSettings.showInvoiceNumber && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Invoice #:</span>
                    <span className="font-bold text-zinc-900">
                      {receiptMeta.invoiceNo}
                    </span>
                  </div>
                )}
                {receiptSettings.showDate && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Date:</span>
                    <span className="text-zinc-800">
                      {receiptMeta.formattedDate} {receiptMeta.formattedTime}
                    </span>
                  </div>
                )}
                {receiptSettings.showCashierName && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Cashier:</span>
                    <span className="text-zinc-800">{finalCashierName}</span>
                  </div>
                )}
                {receiptSettings.showPaymentMethod && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Payment:</span>
                    <span className="font-bold uppercase text-zinc-900">
                      {finalPaymentMethod}
                    </span>
                  </div>
                )}
                {receiptSettings.showCustomerInfo &&
                  (savedCustomerName || whatsappPhone) && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Customer:</span>
                      <span className="font-bold text-zinc-900">
                        {savedCustomerName || "Customer"}
                        {whatsappPhone ? ` (${whatsappPhone})` : ""}
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
                {printableItems.map((item) => (
                  <div key={item.key} className="text-[11px]">
                    <div className="font-bold text-zinc-900 leading-snug">
                      {item.name}
                    </div>
                    {(receiptSettings.showItemVariant ||
                      receiptSettings.showItemSku) && (
                      <div className="text-[10px] text-zinc-500">
                        {receiptSettings.showItemVariant && item.variant
                          ? item.variant
                          : ""}
                        {receiptSettings.showItemVariant &&
                        item.variant &&
                        receiptSettings.showItemSku &&
                        item.sku
                          ? " • "
                          : ""}
                        {receiptSettings.showItemSku && item.sku
                          ? `SKU: ${item.sku}`
                          : ""}
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
                  <span>{formatMoney(finalSubtotal)}</span>
                </div>
                {receiptSettings.showDiscount && finalDiscountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>
                      Discount{" "}
                      {activeDiscountSetting.scope === "item"
                        ? "(Per-Item)"
                        : activeDiscountSetting.type === "percentage"
                        ? `(${activeDiscountSetting.value}%)`
                        : ""}
                    </span>
                    <span>-{formatMoney(finalDiscountAmount)}</span>
                  </div>
                )}
                {receiptSettings.showTaxBreakdown && (
                  <div className="flex justify-between text-zinc-700">
                    <span>
                      {receiptSettings.taxName} ({taxRateDisplay}%)
                    </span>
                    <span>{formatMoney(finalTaxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-zinc-900 pt-1.5 border-t border-zinc-300">
                  <span>TOTAL ({totalItems} items)</span>
                  <span>{formatMoney(finalGrandTotal)}</span>
                </div>
              </div>

              {/* Cash Tendered / Change */}
              {receiptSettings.showTenderedAndChange &&
                finalPaymentMethod === "Cash" && (
                  <div className="border-b border-dashed border-zinc-300 pb-3 mb-3 space-y-1 text-[11px]">
                    <div className="flex justify-between text-zinc-700">
                      <span>Cash Tendered</span>
                      <span>
                        {formatMoney(finalCashTendered ?? finalGrandTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-zinc-900">
                      <span>Change Due</span>
                      <span>{formatMoney(finalChangeDue ?? 0)}</span>
                    </div>
                  </div>
                )}

              {/* Footer */}
              <div
                className={`pt-1 space-y-1 flex flex-col ${
                  receiptSettings.alignment === "left"
                    ? "items-start text-left"
                    : "items-center text-center"
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
                            width:
                              i % 4 === 0
                                ? "2.5px"
                                : i % 2 === 0
                                ? "1.5px"
                                : "1px",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] tracking-[0.2em] text-zinc-400">
                      {receiptMeta.invoiceNo}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Minimal Actions Footer */}
          <div className="no-print p-4 bg-[#11131a] border-t border-white/10 space-y-2.5 shrink-0">
            {!savedCustomerPhone && (
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={whatsappPhone}
                  onChange={(e) => {
                    setWhatsappPhone(e.target.value);
                    setHandoffError(null);
                  }}
                  placeholder="WhatsApp number (e.g. 0771234567)"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 font-mono"
                />
              </div>
            )}

            <div className={`grid ${hasCustomerPhone ? "grid-cols-3" : "grid-cols-2"} gap-2.5`}>
              <button
                onClick={handlePrint}
                className="py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>Print</span>
              </button>

              {hasCustomerPhone && (
                <button
                  type="button"
                  onClick={handleSendWhatsAppReceipt}
                  disabled={isInitiatingWhatsApp}
                  className="py-2.5 px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/35 text-[#25D366] hover:text-emerald-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title={`Send receipt via WhatsApp (${whatsappPhone})`}
                >
                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>WhatsApp</span>
                </button>
              )}

              <button
                onClick={onNewSale || onClose}
                className="py-2.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>New Sale</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
