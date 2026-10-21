/**
 * lib/exporters/salesPdfExporter.ts
 *
 * Professional PDF Exporter for Sales Ledger & Invoice Historical Records using jsPDF.
 */

import { jsPDF } from "jspdf";
import { SaleRecord } from "../types/sale";

export interface SalesReportExportOptions {
  shopName: string;
  shopId: string;
  branchName?: string;
  generatedBy?: {
    username: string;
    displayName?: string;
    role: string;
  };
  filterSummary: {
    dateRangeLabel: string;
    statusLabel?: string;
    paymentLabel?: string;
    cashierLabel?: string;
    searchTerm?: string;
  };
}

export function generateSalesPdf(
  sales: SaleRecord[],
  options: SalesReportExportOptions
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
  doc.setFillColor(24, 24, 27); // Dark zinc
  doc.rect(margin, y, contentWidth, 20, "F");

  // Shop Name & Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text((options.shopName || "RETAIL POS").toUpperCase(), margin + 4, y + 7.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170); // zinc-400
  doc.text(
    `${options.branchName || "Main Branch"} • Shop ID: ${options.shopId}`,
    margin + 4,
    y + 14
  );

  // Report Title (Right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("SALES LEDGER AUDIT REPORT", pageWidth - margin - 4, y + 7.5, { align: "right" });

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

  // Metadata & Filters Bar
  doc.setFillColor(244, 244, 245); // zinc-100
  doc.setDrawColor(228, 228, 231); // zinc-200
  doc.rect(margin, y, contentWidth, 10, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(63, 63, 70); // zinc-700
  const filterDesc = `Date Filter: ${options.filterSummary.dateRangeLabel} | Status: ${options.filterSummary.statusLabel || "All"} | Payment: ${options.filterSummary.paymentLabel || "All"} | Cashier: ${options.filterSummary.cashierLabel || "All"}`;
  doc.text(filterDesc, margin + 4, y + 6.5);

  y += 14;

  // KPI Summary Strip
  const totalRevenue = sales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
  const totalRefunded = sales.reduce((acc, s) => acc + (s.totalRefunded || 0), 0);
  const netRevenue = totalRevenue - totalRefunded;
  const totalItemsSold = sales.reduce((acc, s) => acc + (s.itemCount || 0), 0);

  const kpiBoxHeight = 16;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.rect(margin, y, contentWidth, kpiBoxHeight, "FD");

  const colW = contentWidth / 4;

  // Box 1: Total Sales
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text("TOTAL TRANSACTIONS", margin + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(`${sales.length} Invoices`, margin + 4, y + 11.5);

  // Box 2: Total Items
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text("ITEMS DISPENSED", margin + colW + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(`${totalItemsSold.toLocaleString()} Units`, margin + colW + 4, y + 11.5);

  // Box 3: Gross Revenue
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text("GROSS REVENUE", margin + colW * 2 + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(fmt(totalRevenue), margin + colW * 2 + 4, y + 11.5);

  // Box 4: Net Revenue
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text("NET REVENUE (LESS RETURNS)", margin + colW * 3 + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(fmt(netRevenue), margin + colW * 3 + 4, y + 11.5);

  y += kpiBoxHeight + 6;

  // Table Column Definitions (Strictly spaced to prevent overlap)
  const colX = {
    invoice: margin + 2,     // 14mm
    date: margin + 34,       // 46mm
    cashier: margin + 54,    // 66mm
    customer: margin + 74,   // 86mm
    items: margin + 94,      // 106mm
    payment: margin + 116,   // 128mm
    status: margin + 134,    // 146mm (ends ~160mm)
    total: pageWidth - margin - 2, // 196mm (right-aligned, starts ~172mm)
  };

  const drawTableHeader = () => {
    doc.setFillColor(39, 39, 42); // zinc-800
    doc.rect(margin, y, contentWidth, 7, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);

    doc.text("INVOICE #", colX.invoice, y + 4.8);
    doc.text("DATE & TIME", colX.date, y + 4.8);
    doc.text("OPERATOR", colX.cashier, y + 4.8);
    doc.text("CUSTOMER", colX.customer, y + 4.8);
    doc.text("ITEMS", colX.items, y + 4.8);
    doc.text("PAYMENT", colX.payment, y + 4.8);
    doc.text("STATUS", colX.status, y + 4.8);
    doc.text("TOTAL", colX.total, y + 4.8, { align: "right" });

    y += 7;
  };

  drawTableHeader();

  // Draw Table Rows
  const rowHeight = 7.5;

  sales.forEach((sale, index) => {
    if (y + rowHeight > pageHeight - 16) {
      doc.addPage();
      y = margin;
      drawTableHeader();
    }

    // Row zebra striping
    if (index % 2 === 1) {
      doc.setFillColor(248, 248, 250);
      doc.rect(margin, y, contentWidth, rowHeight, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(39, 39, 42);

    // Invoice
    doc.setFont("helvetica", "bold");
    doc.text(sale.invoiceNumber || sale.saleId.slice(0, 10), colX.invoice, y + 5);

    // Date
    doc.setFont("helvetica", "normal");
    const dt = new Date(sale.createdAt);
    const dateStr = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;
    doc.text(dateStr, colX.date, y + 5);

    // Operator
    const opText = (sale.cashierName || "Cashier").slice(0, 12);
    doc.text(opText, colX.cashier, y + 5);

    // Customer
    const custText = (sale.customer?.name || "Walk-in").slice(0, 12);
    doc.text(custText, colX.customer, y + 5);

    // Items
    const itemsSummary = `${sale.itemCount || sale.items.length} pcs`.slice(0, 10);
    doc.text(itemsSummary, colX.items, y + 5);

    // Payment
    doc.text((sale.paymentMethod || "cash").toUpperCase().slice(0, 7), colX.payment, y + 5);

    // Status (clean label & safe positioning)
    let statusText = "COMPLETED";
    if (sale.status === "partially_returned") statusText = "PART. RET";
    else if (sale.status === "refunded") statusText = "REFUNDED";
    else if (sale.status === "voided") statusText = "VOIDED";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(statusText, colX.status, y + 5);

    // Grand Total (Right aligned, safe margin)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(fmt(sale.grandTotal), colX.total, y + 5, { align: "right" });

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

export function downloadSalesPdf(
  sales: SaleRecord[],
  options: SalesReportExportOptions,
  filename?: string
): void {
  const doc = generateSalesPdf(sales, options);
  const now = new Date().toISOString().slice(0, 10);
  doc.save(filename || `sales_ledger_report_${now}.pdf`);
}
