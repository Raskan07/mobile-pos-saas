/**
 * lib/exporters/exchangesPdfExporter.ts
 *
 * Professional PDF Exporter for Product Exchanges Audit Trail using jsPDF.
 */

import { jsPDF } from "jspdf";
import { SaleExchangeRecord } from "../types/sale";

export interface ExchangeReportExportOptions {
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

export function generateExchangesPdf(
  exchanges: SaleExchangeRecord[],
  options: ExchangeReportExportOptions
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("PRODUCT EXCHANGES REPORT", pageWidth - margin - 4, y + 8, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(161, 161, 170);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    pageWidth - margin - 4,
    y + 14,
    { align: "right" }
  );

  y += 24;

  // Filter & Metric Summary Block
  const totalCustomerPaid = exchanges
    .filter((e) => e.settlementType === "customer_paid")
    .reduce((acc, e) => acc + e.amountSettled, 0);
  const totalStoreRefunded = exchanges
    .filter((e) => e.settlementType === "store_refunded")
    .reduce((acc, e) => acc + e.amountSettled, 0);

  doc.setFillColor(244, 244, 245);
  doc.rect(margin, y, contentWidth, 14, "F");
  doc.setDrawColor(228, 228, 231);
  doc.rect(margin, y, contentWidth, 14, "S");

  doc.setFontSize(7.5);
  doc.setTextColor(82, 82, 91);
  doc.text(
    `Date Scope: ${options.filterSummary.dateRangeLabel} | Exchanges: ${exchanges.length} | Customer Paid: ${fmt(totalCustomerPaid)} | Store Refunded: ${fmt(totalStoreRefunded)}`,
    margin + 4,
    y + 8.5
  );

  y += 18;

  // Table Column Headers
  const colX = {
    exchangeId: margin + 2,
    date: margin + 34,
    origInv: margin + 62,
    operator: margin + 92,
    settlement: margin + 118,
    diff: pageWidth - margin - 2,
  };

  const drawTableHeader = () => {
    doc.setFillColor(39, 39, 42);
    doc.rect(margin, y, contentWidth, 7, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(244, 244, 245);

    doc.text("EXCHANGE ID", colX.exchangeId, y + 4.8);
    doc.text("DATE", colX.date, y + 4.8);
    doc.text("ORIGINAL INVOICE", colX.origInv, y + 4.8);
    doc.text("OPERATOR", colX.operator, y + 4.8);
    doc.text("SETTLEMENT", colX.settlement, y + 4.8);
    doc.text("DIFFERENCE", colX.diff, y + 4.8, { align: "right" });

    y += 7;
  };

  drawTableHeader();

  // Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  if (exchanges.length === 0) {
    doc.setTextColor(113, 113, 122);
    doc.text("No exchange records found for the selected criteria.", margin + 4, y + 8);
    return doc;
  }

  exchanges.forEach((exc, index) => {
    // Check page overflow
    if (y > pageHeight - 22) {
      doc.addPage();
      y = margin;
      drawTableHeader();
    }

    if (index % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, 7.5, "F");
    }

    doc.setTextColor(24, 24, 27);
    doc.text(exc.exchangeInvoiceNumber, colX.exchangeId, y + 5);

    const d = new Date(exc.exchangeDate);
    const dateFormatted = `${d.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
    })} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    doc.setTextColor(82, 82, 91);
    doc.text(dateFormatted, colX.date, y + 5);

    doc.setTextColor(24, 24, 27);
    doc.text(exc.originalInvoiceNumber, colX.origInv, y + 5);

    doc.setTextColor(82, 82, 91);
    doc.text((exc.operator.username || "Operator").slice(0, 14), colX.operator, y + 5);

    const settlementText =
      exc.settlementType === "customer_paid"
        ? `Paid (${exc.settlementMethod})`
        : exc.settlementType === "store_refunded"
        ? `Refund (${exc.settlementMethod})`
        : "Even Exchange";
    doc.text(settlementText, colX.settlement, y + 5);

    const diffPrefix = exc.difference > 0 ? "+" : exc.difference < 0 ? "-" : "";
    const diffText = `${diffPrefix}${fmt(Math.abs(exc.difference))}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(24, 24, 27);
    doc.text(diffText, colX.diff, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += 7.5;
  });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(
      `Confidential Product Exchanges Ledger • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  return doc;
}

export function downloadExchangesPdf(
  exchanges: SaleExchangeRecord[],
  options: ExchangeReportExportOptions,
  filename?: string
): void {
  const doc = generateExchangesPdf(exchanges, options);
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalFilename = filename || `Product_Exchanges_${options.shopId}_${dateStr}.pdf`;
  doc.save(finalFilename);
}
