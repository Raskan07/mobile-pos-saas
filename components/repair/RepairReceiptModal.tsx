"use client";

/**
 * components/repair/RepairReceiptModal.tsx
 *
 * Customer-Facing Printable Receipt Modal for Repair Management.
 * Uses the existing ReceiptSettings engine (`getStoredReceiptSettings`) for consistent shop branding,
 * thermal paper width (80mm / 58mm), and print layout.
 *
 * Supports two distinct customer receipt modes:
 * 1. "intake" — Job Receiving Receipt (Generated when the device is physically received)
 * 2. "billing" — Final Billing Receipt (Generated when the repair is completed and ready for collection / collected)
 *
 * CRITICAL SECURITY & PRIVACY RULE:
 * Never exposes internal financial metrics (component purchase cost, supplier price,
 * internal labor cost, profit margin, or stock valuation) on any customer receipt.
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2,
  Printer,
  Download,
  X,
  Smartphone,
  ShieldCheck,
  Receipt,
  FileText,
  Wrench,
} from "lucide-react";
import { FullRepairTicketDetails, RepairTicket } from "@/lib/types/repair";
import { getRepairTicketDetails } from "@/lib/services/repairService";
import { getStoredReceiptSettings } from "@/lib/services/receiptSettingsService";
import { ReceiptSettings } from "@/lib/types/receiptSettings";
import { generateJobCardPdf, generateFinalBillingPdf } from "@/lib/exporters/repairPdfExporter";

export type RepairReceiptMode = "intake" | "billing";

interface RepairReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: RepairReceiptMode;
  ticket: RepairTicket;
  bundle?: FullRepairTicketDetails | null;
  shopName?: string;
  shopId?: string;
  branchName?: string;
  cashierName?: string;
}

const fmtLKR = (n: number) =>
  `LKR ${(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function RepairReceiptModal({
  isOpen,
  onClose,
  initialMode = "intake",
  ticket,
  bundle,
  shopName = "Repair Workshop",
  shopId = "",
  branchName = "Main Workshop",
  cashierName = "Technician",
}: RepairReceiptModalProps) {
  const [mode, setMode] = useState<RepairReceiptMode>(initialMode);
  const [fetchedBundle, setFetchedBundle] = useState<FullRepairTicketDetails | null>(bundle || null);

  const finalShopName = ticket.shopName || shopName;
  const finalShopId = ticket.shopId || shopId;
  const finalBranch = ticket.branchName || branchName;

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (bundle) {
      setFetchedBundle(bundle);
      return;
    }
    if (isOpen && finalShopId && ticket?.id) {
      getRepairTicketDetails(finalShopId, ticket.id)
        .then((res: FullRepairTicketDetails) => {
          if (res) setFetchedBundle(res);
        })
        .catch(() => {});
    }
  }, [isOpen, bundle, finalShopId, ticket?.id]);

  const activeBundle = bundle || fetchedBundle;

  const receiptSettings: ReceiptSettings = useMemo(() => {
    return getStoredReceiptSettings(finalShopId, finalShopName);
  }, [finalShopId, finalShopName]);

  // Extract customer-safe billing line items (ONLY selling prices & service charges)
  const billingData = useMemo(() => {
    const estimates = activeBundle?.estimates || [];
    const partsUsage = activeBundle?.partsUsage || [];
    const payments = activeBundle?.payments || [];
    const warranties = activeBundle?.warranties || [];

    // Prefer the latest estimate version so newly added service charges / quotes appear immediately
    const latestEstimate = estimates[0] || null;
    const activeWarranty = warranties[0] || null;

    const components: { name: string; qty: number; unitPrice: number; total: number }[] = [];
    const services: { name: string; qty: number; unitPrice: number; total: number }[] = [];

    const sourceItems =
      latestEstimate && latestEstimate.items.length > 0
        ? latestEstimate.items
        : ticket.intakeLineItems || [];

    const hasServiceFeeInSource = sourceItems.some((it) => it.type === "service_fee");

    if (sourceItems.length > 0) {
      sourceItems.forEach((it) => {
        if (it.type === "part") {
          components.push({
            name: it.description,
            qty: it.quantity || 1,
            unitPrice: it.unitSellingPrice,
            total: it.totalPrice,
          });
        } else {
          services.push({
            name: it.description,
            qty: it.quantity || 1,
            unitPrice: it.unitSellingPrice,
            total: it.totalPrice,
          });
        }
      });

      // Also include any consumed/reserved parts added in Work & Parts that aren't already in components
      partsUsage
        .filter((p) => p.status !== "returned_to_stock")
        .forEach((p) => {
          const alreadyListed = components.some((c) =>
            c.name.toLowerCase().includes(p.productName.toLowerCase())
          );
          if (!alreadyListed) {
            const lineTotal = p.unitSellingPrice * p.quantity;
            components.push({
              name: p.productName,
              qty: p.quantity,
              unitPrice: p.unitSellingPrice,
              total: lineTotal,
            });
          }
        });
    } else if (partsUsage.filter((p) => p.status !== "returned_to_stock").length > 0) {
      partsUsage
        .filter((p) => p.status !== "returned_to_stock")
        .forEach((p) => {
          const lineTotal = p.unitSellingPrice * p.quantity;
          components.push({
            name: p.productName,
            qty: p.quantity,
            unitPrice: p.unitSellingPrice,
            total: lineTotal,
          });
        });
    } else if ((ticket.estimatedCost || 0) > 0) {
      const estBase = (ticket.estimatedCost || 0) + (ticket.discountAmount || 0);
      services.push({
        name:
          (ticket.reportedFaults || []).length > 0
            ? (ticket.reportedFaults || []).join(", ")
            : `Repair Service (${ticket.brand} ${ticket.model})`,
        qty: 1,
        unitPrice: estBase,
        total: estBase,
      });
    }

    // Only add ticket.serviceChargeAmount if it was manually added in Billing and not already in services
    const alreadyHasServiceCharge =
      hasServiceFeeInSource ||
      services.some(
        (s) =>
          Math.abs(s.total - (ticket.serviceChargeAmount || 0)) < 0.01 ||
          s.name.toLowerCase().includes("labor") ||
          s.name.toLowerCase().includes("labour") ||
          s.name.toLowerCase().includes("service fee") ||
          s.name.toLowerCase().includes("service charge")
      );

    if (ticket.serviceChargeAmount && ticket.serviceChargeAmount > 0 && !alreadyHasServiceCharge) {
      services.push({
        name: "Service / Labour Charge",
        qty: 1,
        unitPrice: ticket.serviceChargeAmount,
        total: ticket.serviceChargeAmount,
      });
    }

    const componentsTotal = components.reduce((s, c) => s + c.total, 0);
    const servicesTotal = services.reduce((s, c) => s + c.total, 0);
    const additionalCharges = ticket.additionalCharges || 0;
    const discountAmount = ticket.discountAmount || latestEstimate?.discountAmount || 0;

    const grossSubtotal = componentsTotal + servicesTotal + additionalCharges;
    const finalPayable = Math.max(0, grossSubtotal - discountAmount);
    const amountPaid = ticket.totalPaid || 0;
    const outstandingBalance = Math.max(0, finalPayable - amountPaid);

    const lastPaymentMethod =
      payments.length > 0
        ? payments[0].paymentMethod.replace(/_/g, " ").toUpperCase()
        : "CASH";

    return {
      components,
      services,
      componentsTotal,
      servicesTotal,
      additionalCharges,
      discountAmount,
      grossSubtotal,
      finalPayable,
      amountPaid,
      outstandingBalance,
      lastPaymentMethod,
      activeWarranty,
    };
  }, [activeBundle, ticket]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    const fullBundle: FullRepairTicketDetails = activeBundle || {
      ticket,
      diagnostics: [],
      estimates: [],
      tasks: [],
      partsUsage: [],
      payments: [],
      statusHistory: [],
      qcChecks: [],
      warranties: [],
    };
    const opts = {
      shopName: receiptSettings.headerTitle || finalShopName,
      shopPhone: receiptSettings.phone || undefined,
      shopAddress: receiptSettings.address || undefined,
    };

    if (mode === "intake") {
      const doc = generateJobCardPdf(fullBundle, opts);
      doc.save(`JobReceipt_${ticket.ticketNumber}.pdf`);
    } else {
      const doc = generateFinalBillingPdf(fullBundle, opts);
      doc.save(`BillingReceipt_${ticket.finalInvoiceNumber || ticket.ticketNumber}.pdf`);
    }
  };

  // Format accessories received
  const accessoriesList: string[] = [];
  const acc = ticket.accessories;
  if (acc) {
    if (acc.simTray) accessoriesList.push("SIM Tray");
    if (acc.simCard) accessoriesList.push("SIM Card");
    if (acc.sdCard) accessoriesList.push("Memory Card");
    if (acc.protectiveCase) accessoriesList.push("Case/Cover");
    if (acc.chargerAdapter) accessoriesList.push("Charger Adapter");
    if (acc.chargingCable) accessoriesList.push("Cable");
    if (acc.originalBox) accessoriesList.push("Box");
    if (acc.otherItems) accessoriesList.push(acc.otherItems);
  }

  const receivedDateFormatted = new Date(ticket.createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const conditionSummary = ticket.condition
    ? [
        `Screen: ${ticket.condition.screenCondition?.replace(/_/g, " ")}`,
        `Frame: ${ticket.condition.frameCondition?.replace(/_/g, " ")}`,
        ticket.condition.liquidDamageIndicator === "triggered" ? "Liquid Indicator: Triggered" : "Liquid: Intact",
      ].join(" • ")
    : "Standard inspection recorded";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      {/* ── Print Specific Styles (Matches ReceiptModal.tsx engine) ── */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #pos-receipt-print-area,
          #pos-receipt-print-area * {
            visibility: visible;
          }
          #pos-receipt-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 10px !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-lg bg-[#10121a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] text-zinc-100">
        {/* Top Header & Mode Switcher */}
        <div className="bg-zinc-900/90 border-b border-zinc-800 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white leading-tight">
                {mode === "intake" ? "Receipt 1: Job Receiving Receipt" : "Receipt 2: Final Billing Receipt"}
              </h3>
              <p className="text-[11px] text-zinc-400">
                Customer-safe printable receipt • Internal costs hidden
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switch between Receipt 1 and Receipt 2 */}
            <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
              <button
                type="button"
                onClick={() => setMode("intake")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  mode === "intake"
                    ? "bg-teal-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Job Receipt
              </button>
              <button
                type="button"
                onClick={() => setMode("billing")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  mode === "billing"
                    ? "bg-teal-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Final Billing
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-black/50">
          <div
            id="pos-receipt-print-area"
            className={`p-5 rounded-xl bg-white border border-zinc-200 font-mono shadow-sm mx-auto w-full transition-all text-zinc-900 ${
              receiptSettings.paperWidth === "58mm" ? "max-w-[290px] text-[10px]" : "max-w-sm text-xs"
            }`}
          >
            {/* 1. Shop Branding (Shared from ReceiptSettings) */}
            <div
              className={`pb-3 border-b border-dashed border-zinc-300 space-y-1 ${
                receiptSettings.alignment === "left" ? "text-left" : "text-center"
              }`}
            >
              {receiptSettings.showLogo &&
                (receiptSettings.logoUrl ? (
                  <div className={`mb-1.5 ${receiptSettings.alignment === "left" ? "" : "flex justify-center"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receiptSettings.logoUrl}
                      alt="Shop Logo"
                      className="h-9 max-w-[140px] object-contain rounded"
                    />
                  </div>
                ) : (
                  <div
                    className={`flex items-center gap-1.5 font-sans font-black text-zinc-950 text-base tracking-wider mb-1 ${
                      receiptSettings.alignment === "left" ? "justify-start" : "justify-center"
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-zinc-700" />
                    <span>{(receiptSettings.headerTitle || finalShopName).toUpperCase()}</span>
                  </div>
                ))}

              {(!receiptSettings.showLogo || receiptSettings.logoUrl) && receiptSettings.showShopName && (
                <div className="font-sans font-black text-zinc-950 text-base tracking-wider uppercase">
                  {receiptSettings.headerTitle || finalShopName}
                </div>
              )}

              {receiptSettings.tagline && (
                <div className="text-[10px] text-zinc-600 italic">{receiptSettings.tagline}</div>
              )}
              {receiptSettings.address && (
                <div className="text-[10px] text-zinc-600 leading-tight">{receiptSettings.address}</div>
              )}
              {receiptSettings.phone && (
                <div className="text-[10px] text-zinc-600">Tel: {receiptSettings.phone}</div>
              )}
              {receiptSettings.email && (
                <div className="text-[10px] text-zinc-600">{receiptSettings.email}</div>
              )}
              {receiptSettings.showBranchName && (
                <div className="text-[10px] text-zinc-500 font-sans">{finalBranch}</div>
              )}

              <div className="pt-1">
                <span className="inline-block px-2 py-0.5 rounded bg-zinc-900 text-white font-sans font-bold text-[10px] uppercase tracking-wider">
                  {mode === "intake" ? "JOB RECEIVING RECEIPT" : "FINAL REPAIR BILLING RECEIPT"}
                </span>
              </div>
            </div>

            {/* 2. Ticket & Customer Details */}
            <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">Ticket No:</span>
                <span className="text-zinc-950 font-bold">{ticket.ticketNumber}</span>
              </div>
              {mode === "billing" && ticket.finalInvoiceNumber && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Invoice No:</span>
                  <span className="text-zinc-950 font-bold">{ticket.finalInvoiceNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-500">
                  {mode === "intake" ? "Received:" : "Date:"}
                </span>
                <span className="text-zinc-800">{receivedDateFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Customer:</span>
                <span className="text-zinc-900 font-semibold">{ticket.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Phone:</span>
                <span className="text-zinc-800">{ticket.customerPhone || "N/A"}</span>
              </div>
            </div>

            {/* 3. Device Information */}
            <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-1 text-[11px]">
              <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Device Details</div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Model:</span>
                <span className="text-zinc-950 font-bold">
                  {ticket.brand} {ticket.model}
                </span>
              </div>
              {(ticket.imei1 || ticket.serialNumber) && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">IMEI / Serial:</span>
                  <span className="text-zinc-800">{ticket.imei1 || ticket.serialNumber}</span>
                </div>
              )}
              {mode === "intake" && (
                <>
                  <div className="pt-1">
                    <span className="text-zinc-500 block text-[10px]">Device Condition:</span>
                    <span className="text-zinc-800 text-[10px] leading-snug block">{conditionSummary}</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-zinc-500 block text-[10px]">Accessories Received:</span>
                    <span className="text-zinc-800 text-[10px] leading-snug block">
                      {accessoriesList.length > 0 ? accessoriesList.join(", ") : "Device Only (No Accessories)"}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* ══ MODE 1: JOB RECEIVING RECEIPT BODY ══ */}
            {mode === "intake" && (
              <>
                {/* Reported Problems */}
                <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-1.5 text-[11px]">
                  <div className="text-[10px] font-bold uppercase text-zinc-500">Reported Problems / Services</div>
                  {(ticket.reportedFaults || []).map((fault, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-zinc-900 font-medium">
                      <span>•</span>
                      <span>{fault}</span>
                    </div>
                  ))}
                  {ticket.intakeNotes && (
                    <div className="text-[10px] text-zinc-600 italic pt-1">
                      Note: {ticket.intakeNotes}
                    </div>
                  )}
                </div>

                {/* Itemized Service Charges & Components Breakdown on Job Receipt */}
                {(billingData.services.length > 0 ||
                  billingData.components.length > 0 ||
                  billingData.additionalCharges > 0) && (
                  <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-zinc-500">
                      <span>Service & Component Charges</span>
                      <span>Amount</span>
                    </div>

                    {billingData.components.map((comp, idx) => (
                      <div key={`ic_${idx}`} className="flex justify-between items-start">
                        <span className="text-zinc-800 pr-2">
                          {comp.name} {comp.qty > 1 ? `(x${comp.qty})` : ""}
                        </span>
                        <span className="text-zinc-950 font-semibold whitespace-nowrap">
                          {fmtLKR(comp.total)}
                        </span>
                      </div>
                    ))}

                    {billingData.services.map((svc, idx) => (
                      <div key={`is_${idx}`} className="flex justify-between items-start">
                        <span className="text-zinc-800 pr-2">
                          {svc.name} {svc.qty > 1 ? `(x${svc.qty})` : ""}
                        </span>
                        <span className="text-zinc-950 font-semibold whitespace-nowrap">
                          {fmtLKR(svc.total)}
                        </span>
                      </div>
                    ))}

                    {billingData.additionalCharges > 0 && (
                      <div className="flex justify-between items-start">
                        <span className="text-zinc-800 pr-2">Additional Service Charges</span>
                        <span className="text-zinc-950 font-semibold whitespace-nowrap">
                          {fmtLKR(billingData.additionalCharges)}
                        </span>
                      </div>
                    )}

                    {billingData.discountAmount > 0 && (
                      <div className="flex justify-between items-start text-emerald-700 font-medium">
                        <span>Discount</span>
                        <span>- {fmtLKR(billingData.discountAmount)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Estimated Charges & Completion Date */}
                <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-zinc-900 font-bold">
                    <span>Estimated Total Payable:</span>
                    <span>
                      {billingData.finalPayable > 0
                        ? fmtLKR(billingData.finalPayable)
                        : ticket.estimatedCost > 0
                        ? fmtLKR(ticket.estimatedCost)
                        : "Subject to Diagnosis"}
                    </span>
                  </div>
                  {ticket.depositPaid > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Advance Deposit Paid:</span>
                      <span>{fmtLKR(ticket.depositPaid)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-zinc-950 font-bold pt-1 border-t border-zinc-200">
                    <span>Estimated Balance:</span>
                    <span>{fmtLKR(billingData.outstandingBalance)}</span>
                  </div>
                  {ticket.estimatedCompletionDate && (
                    <div className="flex justify-between text-[10px] text-zinc-600 pt-1">
                      <span>Expected Completion:</span>
                      <span className="font-semibold text-zinc-900">{ticket.estimatedCompletionDate}</span>
                    </div>
                  )}
                </div>

                {/* Terms & Conditions */}
                <div className="pt-2.5 pb-1 text-left space-y-1 text-[9px] text-zinc-600 leading-snug">
                  <div className="font-bold text-zinc-800 uppercase text-[9px]">Terms & Conditions:</div>
                  <p>
                    1. Please present this job receipt when collecting your device.
                  </p>
                  <p>
                    2. Customer is responsible for data backup prior to repair. The workshop is not liable for data loss.
                  </p>
                  <p>
                    3. Devices uncollected within 60 days of completion notification may be disposed of to recover repair costs.
                  </p>
                </div>
              </>
            )}

            {/* ══ MODE 2: FINAL BILLING RECEIPT BODY ══ */}
            {mode === "billing" && (
              <>
                {/* Replacement Components & Service Charges (Selling Prices Only) */}
                <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-2 text-[11px]">
                  <div className="flex justify-between text-[10px] uppercase text-zinc-500 font-bold">
                    <span>Description</span>
                    <span>Amount</span>
                  </div>

                  {billingData.components.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase">
                        Replacement Components
                      </div>
                      {billingData.components.map((comp, idx) => (
                        <div key={idx} className="flex justify-between items-start">
                          <div className="pr-2">
                            <div className="text-zinc-900 font-medium">{comp.name}</div>
                            <div className="text-[10px] text-zinc-500">
                              {comp.qty} x {fmtLKR(comp.unitPrice)}
                            </div>
                          </div>
                          <div className="text-zinc-950 font-semibold whitespace-nowrap">
                            {fmtLKR(comp.total)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {billingData.services.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase">
                        Service & Labour Charges
                      </div>
                      {billingData.services.map((svc, idx) => (
                        <div key={idx} className="flex justify-between items-start">
                          <div className="pr-2">
                            <div className="text-zinc-900 font-medium">{svc.name}</div>
                            {svc.qty > 1 && (
                              <div className="text-[10px] text-zinc-500">
                                {svc.qty} x {fmtLKR(svc.unitPrice)}
                              </div>
                            )}
                          </div>
                          <div className="text-zinc-950 font-semibold whitespace-nowrap">
                            {fmtLKR(svc.total)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {billingData.additionalCharges > 0 && (
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-zinc-800">Additional Charges</span>
                      <span className="text-zinc-950 font-semibold">
                        {fmtLKR(billingData.additionalCharges)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Final Payable & Payment Breakdown */}
                <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-zinc-600">
                    <span>Subtotal</span>
                    <span>{fmtLKR(billingData.grossSubtotal)}</span>
                  </div>
                  {billingData.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Discount</span>
                      <span>- {fmtLKR(billingData.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-zinc-950 pt-1.5 border-t border-zinc-300">
                    <span>Final Payable</span>
                    <span>{fmtLKR(billingData.finalPayable)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-700 pt-1">
                    <span>Payment Method</span>
                    <span className="font-bold uppercase">{billingData.lastPaymentMethod}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Amount Paid</span>
                    <span>{fmtLKR(billingData.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-zinc-950">
                    <span>Outstanding Balance</span>
                    <span>{fmtLKR(billingData.outstandingBalance)}</span>
                  </div>
                </div>

                {/* Warranty & Terms */}
                <div className="pt-2.5 pb-1 space-y-1.5 text-[10px] text-zinc-700">
                  <div className="p-2 rounded bg-zinc-100 border border-zinc-200 space-y-0.5">
                    <div className="font-bold text-zinc-900 uppercase text-[10px]">
                      Warranty Information
                    </div>
                    {billingData.activeWarranty ? (
                      <>
                        <div className="text-[10px] font-semibold text-zinc-800">
                          Code: {billingData.activeWarranty.warrantyCode} ({billingData.activeWarranty.durationDays} Days)
                        </div>
                        <div className="text-[9px] text-zinc-600">
                          Valid: {billingData.activeWarranty.startDate} to {billingData.activeWarranty.expiryDate}
                        </div>
                        <div className="text-[9px] text-zinc-600 leading-tight">
                          {billingData.activeWarranty.terms}
                        </div>
                      </>
                    ) : (
                      <div className="text-[9px] text-zinc-600 leading-tight">
                        {receiptSettings.warrantyPolicy ||
                          "Standard warranty covers replaced components and workmanship. Physical or liquid damage excluded."}
                      </div>
                    )}
                  </div>

                  {receiptSettings.footerNote && (
                    <div className="text-center text-[10px] text-zinc-800 font-medium pt-1">
                      {receiptSettings.footerNote}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Footer Barcode */}
            {receiptSettings.showBarcode && (
              <div className="pt-2 pb-1 text-center">
                <div className="h-7 w-48 mx-auto bg-zinc-900 rounded-md flex items-center justify-center text-[10px] tracking-[0.2em] text-white font-mono select-none">
                  {ticket.ticketNumber}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
          >
            <Printer className="w-4 h-4" />
            <span>Print {mode === "intake" ? "Job Receipt" : "Billing Receipt"}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-teal-400" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
