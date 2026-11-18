"use client";

import React from "react";
import {
  X,
  Printer,
  Download,
  FileText,
  Smartphone,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import {
  InstallmentPlanRecord,
  InstallmentPaymentRecord,
} from "@/lib/types/installment";
import { exportInstallmentAgreementToPdf } from "@/lib/services/installmentService";

interface InstallmentAgreementModalProps {
  plan: InstallmentPlanRecord | null;
  onClose: () => void;
  currency?: string;
  shopAddress?: string;
  shopPhone?: string;
}

export function InstallmentAgreementModal({
  plan,
  onClose,
  currency = "LKR",
  shopAddress = "",
  shopPhone = "",
}: InstallmentAgreementModalProps) {
  if (!plan) return null;

  const fmt = (val: number) =>
    `${currency} ${(val || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    await exportInstallmentAgreementToPdf(plan, currency, {
      address: shopAddress,
      phone: shopPhone,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden !important;
              }
              #installment-agreement-paper,
              #installment-agreement-paper * {
                visibility: visible !important;
              }
              #installment-agreement-paper {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 210mm !important;
                margin: 0 auto !important;
                padding: 12mm !important;
                background: #ffffff !important;
                color: #000000 !important;
                box-shadow: none !important;
                border: none !important;
              }
            }
          `,
        }}
      />

      <div
        className="relative w-full max-w-4xl bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Bar */}
        <div className="px-5 py-3.5 bg-white border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 leading-tight">
                Customer Installment Agreement — {plan.agreementNumber}
              </h3>
              <p className="text-[11px] text-zinc-500">
                Official Hire-Purchase / Installment Contract &bull; Sri Lanka Retail Standard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 text-zinc-900 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Agreement</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Physical White Paper Sheet */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-white flex justify-center">
          <div
            id="installment-agreement-paper"
            className="w-full max-w-[794px] bg-white text-zinc-900 rounded-sm border border-zinc-300 p-6 sm:p-10 space-y-6 font-sans"
          >
            {/* 1. Shop Information & Branding Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-zinc-900 bg-white">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-zinc-900" />
                  <h1 className="text-xl font-black uppercase tracking-tight text-zinc-950">
                    {plan.shopName}
                  </h1>
                </div>
                {shopAddress && (
                  <p className="text-xs text-zinc-600 mt-1">{shopAddress}</p>
                )}
                <p className="text-xs text-zinc-600">
                  {shopPhone ? `Tel: ${shopPhone} • ` : ""}Branch: {plan.branchName} ({plan.shopId})
                </p>
              </div>

              <div className="sm:text-right">
                <div className="inline-block px-3 py-1 bg-white border-2 border-zinc-900 text-zinc-900 text-xs font-extrabold uppercase tracking-widest">
                  INSTALLMENT SALE AGREEMENT
                </div>
                <div className="mt-2 text-xs font-mono space-y-0.5 text-zinc-800">
                  <div>
                    <span className="text-zinc-500">AGREEMENT ID:</span>{" "}
                    <strong className="text-zinc-950">{plan.agreementNumber}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500">START DATE:</span> {plan.startDate}
                  </div>
                  <div>
                    <span className="text-zinc-500">FINAL MATURITY:</span> {plan.endDate}
                  </div>
                </div>
              </div>
            </div>

            {/* 2 & 3. Customer, NIC & Guarantor Information + 4. Device & IMEI Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white">
              {/* Customer & Guarantor Block */}
              <div className="p-4 border border-zinc-300 rounded-md bg-white space-y-2.5 text-xs">
                <div className="font-bold uppercase tracking-wider text-[11px] text-zinc-900 border-b border-zinc-300 pb-1.5 flex items-center justify-between">
                  <span>1. Customer &amp; NIC Identification</span>
                  <UserCheck className="w-3.5 h-3.5 text-zinc-700" />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-zinc-500">Full Name:</span>
                  <span className="col-span-2 font-bold text-zinc-950">{plan.customer.fullName}</span>

                  <span className="text-zinc-500">NIC Number:</span>
                  <span className="col-span-2 font-mono font-bold text-zinc-900">
                    {plan.customer.nicNumber}
                  </span>

                  <span className="text-zinc-500">Mobile No:</span>
                  <span className="col-span-2 font-mono text-zinc-900">
                    {plan.customer.mobileNumber}
                  </span>

                  <span className="text-zinc-500">Address:</span>
                  <span className="col-span-2 text-zinc-800">{plan.customer.address}</span>
                </div>

                {plan.guarantor && plan.guarantor.fullName && (
                  <div className="pt-2 mt-2 border-t border-dashed border-zinc-300 space-y-1">
                    <div className="font-bold text-[10px] uppercase tracking-wider text-zinc-700">
                      Guarantor / Emergency Contact
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      <span className="text-zinc-500">Name:</span>
                      <span className="col-span-2 font-semibold text-zinc-900">
                        {plan.guarantor.fullName} ({plan.guarantor.relationship})
                      </span>
                      <span className="text-zinc-500">NIC &amp; Tel:</span>
                      <span className="col-span-2 font-mono text-zinc-800">
                        {plan.guarantor.nicNumber} • {plan.guarantor.mobileNumber}
                      </span>
                      {plan.guarantor.address && (
                        <>
                          <span className="text-zinc-500">Address:</span>
                          <span className="col-span-2 text-zinc-800">{plan.guarantor.address}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Device, IMEI & Ownership Details */}
              <div className="p-4 border border-zinc-300 rounded-md bg-white space-y-2.5 text-xs">
                <div className="font-bold uppercase tracking-wider text-[11px] text-zinc-900 border-b border-zinc-300 pb-1.5 flex items-center justify-between">
                  <span>2. Device, IMEI &amp; Delivery Record</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-zinc-700" />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-zinc-500">Product Name:</span>
                  <span className="col-span-2 font-bold text-zinc-950">
                    {plan.product.productName}
                  </span>

                  <span className="text-zinc-500">Model / SKU:</span>
                  <span className="col-span-2 font-mono text-zinc-900">
                    {plan.product.model} ({plan.product.sku})
                  </span>

                  <span className="text-zinc-500">IMEI Number:</span>
                  <span className="col-span-2 font-mono font-bold text-zinc-950">
                    {plan.product.imeiNumber || "N/A"}
                  </span>

                  <span className="text-zinc-500">Serial Number:</span>
                  <span className="col-span-2 font-mono text-zinc-900">
                    {plan.product.serialNumber || "N/A"}
                  </span>

                  <span className="text-zinc-500">Delivery Date:</span>
                  <span className="col-span-2 text-zinc-900">{plan.product.deliveryDate}</span>

                  <span className="text-zinc-500">Warranty:</span>
                  <span className="col-span-2 text-zinc-800">{plan.product.warrantyDetails}</span>
                </div>
              </div>
            </div>

            {/* 5, 6, 7 & 8. Plain Financial Breakdown (Original Cash Price vs Installment Charges vs Payable) */}
            <div className="border border-zinc-300 rounded-md overflow-hidden bg-white">
              <div className="bg-white border-b border-zinc-300 text-zinc-950 px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                <span>3. Transparent Financial Breakdown (No Hidden Charges)</span>
                <span className="font-mono text-[11px] text-zinc-700">
                  Duration: {plan.durationMonths} Monthly Installments
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-zinc-300 text-xs bg-white">
                <div className="p-3 bg-white">
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">
                    Original Cash Price
                  </div>
                  <div className="font-mono font-bold text-zinc-900 text-sm mt-1">
                    {fmt(plan.originalCashPrice)}
                  </div>
                </div>
                <div className="p-3 bg-white">
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">
                    Installment &amp; Service Fee
                  </div>
                  <div className="font-mono font-bold text-zinc-800 text-sm mt-1">
                    {fmt(
                      (plan.installmentFeeAmount || 0) +
                        (plan.serviceChargeAmount || 0) -
                        (plan.discountAmount || 0)
                    )}
                  </div>
                </div>
                <div className="p-3 bg-white">
                  <div className="text-[10px] uppercase text-zinc-700 font-bold">
                    Total Agreed Payable
                  </div>
                  <div className="font-mono font-black text-zinc-950 text-sm mt-1">
                    {fmt(plan.totalAgreedPayable)}
                  </div>
                </div>
                <div
                  className={`p-3 ${
                    plan.initialDownPayment > 0 ? "bg-emerald-50" : "bg-white"
                  }`}
                >
                  <div className="text-[10px] uppercase text-emerald-800 font-bold">
                    Initial Down Payment (Paid)
                  </div>
                  <div className="font-mono font-bold text-emerald-700 text-sm mt-1">
                    {fmt(plan.initialDownPayment)}
                  </div>
                </div>
                <div className="p-3 bg-white">
                  <div className="text-[10px] uppercase text-zinc-600 font-semibold">
                    Financed Balance
                  </div>
                  <div className="font-mono font-bold text-zinc-900 text-sm mt-1">
                    {fmt(plan.financedPrincipalBalance)}
                  </div>
                </div>
                <div className="p-3 bg-white">
                  <div className="text-[10px] uppercase text-zinc-900 font-bold">
                    Monthly Installment
                  </div>
                  <div className="font-mono font-black text-zinc-950 text-sm mt-1">
                    {fmt(plan.monthlyInstallmentAmount)}
                  </div>
                </div>
              </div>
            </div>

            {/* 9. Payment Schedule Table */}
            <div className="space-y-2 bg-white">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                  4. Monthly Installment Payment Schedule ({plan.durationMonths} Months)
                </h4>
                <span className="text-[11px] font-mono text-zinc-600">
                  Monthly Due Day: {plan.paymentDueDayOfMonth}th of each month
                </span>
              </div>

              <div className="border border-zinc-300 rounded overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs bg-white">
                  <thead>
                    <tr className="bg-white border-b border-zinc-300 text-[10px] uppercase text-zinc-700 font-bold">
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3">Due Date</th>
                      <th className="py-2 px-3 text-right">Installment Amount</th>
                      <th className="py-2 px-3 text-right">Paid</th>
                      <th className="py-2 px-3 text-right">Balance</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 font-mono text-[11px] bg-white">
                    {plan.schedule.map((item) => {
                      const isPaid = item.status === "paid";
                      const isPartial = item.status === "partially_paid";
                      return (
                        <tr
                          key={item.installmentNumber}
                          className={
                            isPaid
                              ? "bg-emerald-100/90 text-emerald-950 font-semibold"
                              : isPartial
                              ? "bg-emerald-50/60"
                              : "bg-white"
                          }
                        >
                          <td className="py-1.5 px-3 font-bold text-zinc-900">
                            {String(item.installmentNumber).padStart(2, "0")}
                          </td>
                          <td className="py-1.5 px-3 text-zinc-800">{item.dueDate}</td>
                          <td className="py-1.5 px-3 text-right font-semibold text-zinc-900">
                            {fmt(item.scheduledAmount)}
                          </td>
                          <td
                            className={`py-1.5 px-3 text-right font-bold ${
                              item.paidAmount > 0 ? "text-emerald-700" : "text-zinc-500"
                            }`}
                          >
                            {fmt(item.paidAmount)}
                          </td>
                          <td className="py-1.5 px-3 text-right text-zinc-800">
                            {fmt(item.remainingAmount)}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[9px] font-sans font-bold uppercase ${
                                isPaid
                                  ? "bg-emerald-600 text-white"
                                  : isPartial
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  : item.status === "overdue"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-white border border-zinc-300 text-zinc-700"
                              }`}
                            >
                              {isPaid ? "✓ PAID" : item.status.replace("_", " ")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 10 & 11. Late-Payment Conditions & Terms and Conditions */}
            <div className="space-y-3 pt-2 border-t border-zinc-300 text-[11px] leading-relaxed text-zinc-700 bg-white">
              <div>
                <span className="font-bold uppercase text-zinc-900">
                  5. Late-Payment Conditions (Grace Period: {plan.lateFeeGraceDays} Days
                  {plan.lateFeePerMonthPct > 0 ? ` • Late Fee: ${plan.lateFeePerMonthPct}%` : ""}):{" "}
                </span>
                <span>{plan.latePaymentConditions}</span>
              </div>
              <div>
                <div className="font-bold uppercase text-zinc-900 mb-1">
                  6. Terms &amp; Conditions of Installment Sale:
                </div>
                <div className="whitespace-pre-line text-[10.5px] text-zinc-700 bg-white p-3 rounded border border-zinc-300">
                  {plan.termsAndConditions}
                </div>
              </div>
            </div>

            {/* 12 & 13. Customer, Guarantor & Shop Representative Signatures */}
            <div className="pt-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-xs text-center">
              <div className="border-t border-zinc-900 pt-2">
                <div className="font-bold text-zinc-950">Customer Signature</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">
                  {plan.customer.fullName} (NIC: {plan.customer.nicNumber})
                </div>
              </div>
              <div className="border-t border-zinc-900 pt-2">
                <div className="font-bold text-zinc-950">Guarantor / Witness Signature</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">
                  {plan.guarantor?.fullName
                    ? `${plan.guarantor.fullName} (${plan.guarantor.nicNumber})`
                    : "Optional Guarantor / Witness"}
                </div>
              </div>
              <div className="border-t border-zinc-900 pt-2">
                <div className="font-bold text-zinc-950">Authorized Shop Representative</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">
                  {plan.createdBy?.displayName || plan.shopName}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InstallmentPaymentReceiptModalProps {
  plan: InstallmentPlanRecord | null;
  payment: InstallmentPaymentRecord | null;
  onClose: () => void;
  currency?: string;
  shopAddress?: string;
  shopPhone?: string;
}

export function InstallmentPaymentReceiptModal({
  plan,
  payment,
  onClose,
  currency = "LKR",
  shopAddress = "",
  shopPhone = "",
}: InstallmentPaymentReceiptModalProps) {
  if (!plan || !payment) return null;

  const fmt = (val: number) =>
    `${currency} ${(val || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden !important;
              }
              #installment-thermal-receipt,
              #installment-thermal-receipt * {
                visibility: visible !important;
              }
              #installment-thermal-receipt {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 80mm !important;
                padding: 4mm !important;
                background: #ffffff !important;
                color: #000000 !important;
                box-shadow: none !important;
              }
            }
          `,
        }}
      />

      <div
        className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-emerald-50">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Installment Receipt Ready</h3>
              <p className="text-[11px] text-emerald-700 font-mono font-semibold">{payment.receiptNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 bg-white flex justify-center overflow-y-auto max-h-[70vh]">
          <div
            id="installment-thermal-receipt"
            className="w-[330px] bg-white text-black font-mono text-xs p-5 rounded border border-zinc-300 space-y-2.5"
          >
            <div className="text-center border-b border-dashed border-black pb-2.5 space-y-0.5">
              <div className="font-sans font-black text-sm uppercase">{plan.shopName}</div>
              {shopAddress && <div className="text-[10px] text-zinc-700">{shopAddress}</div>}
              {shopPhone && <div className="text-[10px] text-zinc-700">Tel: {shopPhone}</div>}
              <div className="pt-1.5">
                <span className="border-y border-black py-0.5 px-2 font-sans font-bold text-[10px] uppercase tracking-widest">
                  INSTALLMENT PAYMENT RECEIPT
                </span>
              </div>
            </div>

            <div className="space-y-1 text-[11px] border-b border-dashed border-black pb-2.5">
              <div className="flex justify-between">
                <span>Receipt No:</span>
                <span className="font-bold">{payment.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Agreement ID:</span>
                <span className="font-bold">{plan.agreementNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(payment.paidAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-bold">{plan.customer.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span>NIC:</span>
                <span>{plan.customer.nicNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Device:</span>
                <span className="text-right">{plan.product.productName}</span>
              </div>
              <div className="flex justify-between">
                <span>IMEI:</span>
                <span>{plan.product.imeiNumber}</span>
              </div>
            </div>

            <div className="space-y-1 text-[11px] border-b border-dashed border-black pb-2.5">
              <div className="flex justify-between">
                <span>Payment Type:</span>
                <span className="uppercase font-bold">
                  {payment.paymentType.replace("_", " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Method:</span>
                <span className="uppercase">{payment.paymentMethod.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span>Previous Balance:</span>
                <span>{fmt(payment.balanceBefore)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold bg-emerald-100 text-emerald-950 border-y border-emerald-400 px-2 py-1.5 my-1 rounded">
                <span>AMOUNT PAID:</span>
                <span>{fmt(payment.amount)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>REMAINING BALANCE:</span>
                <span>{fmt(payment.balanceAfter)}</span>
              </div>
            </div>

            {payment.appliedToInstallments && payment.appliedToInstallments.length > 0 && (
              <div className="text-[10px] border-b border-dashed border-black pb-2 space-y-0.5">
                <div className="font-bold uppercase">Applied To Schedule:</div>
                {payment.appliedToInstallments.map((ap) => (
                  <div key={ap.installmentNumber} className="flex justify-between bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded font-semibold">
                    <span>Installment #{String(ap.installmentNumber).padStart(2, "0")}</span>
                    <span>✓ {fmt(ap.amountApplied)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center text-[10px] pt-1 space-y-1">
              <div>Collected by: {payment.collectedBy.displayName}</div>
              {plan.nextDueDate && payment.balanceAfter > 0 && (
                <div className="font-bold">
                  Next Due: {plan.nextDueDate} ({fmt(plan.nextDueAmount)})
                </div>
              )}
              <div className="text-[9px] text-zinc-600 pt-1">
                Thank you! Please retain this slip for your installment records.
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-200 flex items-center gap-3 bg-white">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print 80mm Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

