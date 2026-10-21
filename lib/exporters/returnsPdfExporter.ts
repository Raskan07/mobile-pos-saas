/**
 * lib/exporters/returnsPdfExporter.ts
 *
 * Professional PDF Exporter for Customer Returns & Refunds Audit Trail using jsPDF.
 */

import { jsPDF } from "jspdf";
import { SaleReturnRecord } from "../types/sale";

export interface ReturnReportExportOptions {
  shopName: string;
  shopId: string;
  branchName?: string;
  filterSummary: {
    dateRangeLabel: string;
    paymentLabel?: string;
    cashierLabel?: string;
    searchTerm?: string;
  };
}

export function generateReturnsPdf(
  returns: SaleReturnRecord[],
  options: ReturnReportExportOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  const fmt = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Header background bar
  doc.setFillColor(24, 24, 27);
  doc.rect(margin, y, contentWidth, 20, "F");

  // Shop Name & Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text((options.shopName || "RETAIL POS").toUpperCase(), margin + 4, y + 7.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(
    `${options.branchName || "Main Branch"} • Shop ID: ${options.shopId}`,
    margin + 4,
    y + 14
  );

  // Title (Right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("CUSTOMER RETURNS AUDIT REPORT", pageWidth - margin - 4, y + 7.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(161, 161, 170);
  doc.text(
    `Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`,
    pageWidth - margin - 4,
    y + 14,
    { align: "right" }
  );

  y += 24;

  // Metadata & Filters
  doc.setFillColor(244, 244, 245);
  doc.setDrawColor(228, 228, 231);
  doc.rect(margin, y, contentWidth, 10, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(63, 63, 70);
  const filterDesc = `Date Filter: ${options.filterSummary.dateRangeLabel} | Method: ${options.filterSummary.paymentLabel || "All"} | Operator: ${options.filterSummary.cashierLabel || "All"}`;
  doc.text(filterDesc, margin + 4, y + 6.5);

  y += 14;

  // KPI Summary Strip
  const totalRefundAmount = returns.reduce((acc, r) => acc + (r.totalRefundAmount || 0), 0);
  const totalUnitsReturned = returns.reduce(
    (acc, r) => acc + r.items.reduce((sum, it) => sum + it.quantity, 0),
    0
  );
  const totalUnitsRestocked = returns.reduce(
    (acc, r) =>
      acc +
      r.items.filter((it) => it.restock).reduce((sum, it) => sum + it.quantity, 0),
    0
  );

  const kpiBoxHeight = 16;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.rect(margin, y, contentWidth, kpiBoxHeight, "FD");

  const colW = contentWidth / 3;

  // Box 1: Returns Processed
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text("TOTAL RETURN EVENTS", margin + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(`${returns.length} Records`, margin + 4, y + 11.5);

  // Box 2: Total Units Returned
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text("UNITS RETURNED (RESTOCKED)", margin + colW + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(`${totalUnitsReturned} Units (${totalUnitsRestocked} back to stock)`, margin + colW + 4, y + 11.5);

  // Box 3: Total Refunds Issued
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text("TOTAL REFUNDS DISBURSED", margin + colW * 2 + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(fmt(totalRefundAmount), margin + colW * 2 + 4, y + 11.5);

  y += kpiBoxHeight + 6;

  // Table Column Definitions (Strictly spaced to prevent overlap)
  const colX = {
    returnId: margin + 2,     // 14mm
    date: margin + 26,        // 38mm
    invoice: margin + 48,     // 60mm
    operator: margin + 74,    // 86mm
    items: margin + 92,       // 104mm
    method: margin + 118,     // 130mm
    reason: margin + 134,     // 146mm (ends ~166mm)
    refund: pageWidth - margin - 2, // 196mm (right-aligned, starts ~172mm)
  };

  const drawTableHeader = () => {
    doc.setFillColor(39, 39, 42);
    doc.rect(margin, y, contentWidth, 7, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);

    doc.text("RETURN ID", colX.returnId, y + 4.8);
    doc.text("DATE & TIME", colX.date, y + 4.8);
    doc.text("ORIG. INVOICE", colX.invoice, y + 4.8);
    doc.text("STAFF", colX.operator, y + 4.8);
    doc.text("RETURNED ITEMS", colX.items, y + 4.8);
    doc.text("METHOD", colX.method, y + 4.8);
    doc.text("REASON", colX.reason, y + 4.8);
    doc.text("REFUND", colX.refund, y + 4.8, { align: "right" });

    y += 7;
  };

  drawTableHeader();

  const rowHeight = 7.5;

  returns.forEach((ret, index) => {
    if (y + rowHeight > pageHeight - 16) {
      doc.addPage();
      y = margin;
      drawTableHeader();
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 248, 250);
      doc.rect(margin, y, contentWidth, rowHeight, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(39, 39, 42);

    // Return ID
    doc.setFont("helvetica", "bold");
    doc.text(ret.returnId.slice(0, 10), colX.returnId, y + 5);

    // Date
    doc.setFont("helvetica", "normal");
    const dt = new Date(ret.returnDate);
    const dateStr = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;
    doc.text(dateStr, colX.date, y + 5);

    // Original Invoice
    doc.text(ret.invoiceNumber || ret.originalSaleId.slice(0, 10), colX.invoice, y + 5);

    // Operator
    doc.text((ret.processedBy?.username || "Staff").slice(0, 10), colX.operator, y + 5);

    // Items
    const itemsSummary = ret.items.map((it) => `${it.quantity}x ${it.name}`).join(", ").slice(0, 14);
    doc.text(itemsSummary, colX.items, y + 5);

    // Method
    doc.text((ret.refundMethod || "cash").toUpperCase().slice(0, 7), colX.method, y + 5);

    // Reason
    doc.text((ret.reason || "Return").slice(0, 14), colX.reason, y + 5);

    // Refund Amount (Right aligned)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(fmt(ret.totalRefundAmount), colX.refund, y + 5, { align: "right" });

    y += rowHeight;
  });

  // Footer / Page numbers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(161, 161, 170);
    doc.text(
      `Confidential & Proprietary • ${options.shopName} • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  return doc;
}

export function downloadReturnsPdf(
  returns: SaleReturnRecord[],
  options: ReturnReportExportOptions,
  filename?: string
): void {
  const doc = generateReturnsPdf(returns, options);
  const now = new Date().toISOString().slice(0, 10);
  doc.save(filename || `returns_audit_report_${now}.pdf`);
}
