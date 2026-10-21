/**
 * lib/exporters/salesExcelExporter.ts
 *
 * Enterprise Excel (.xlsx) Exporter for Sales Ledger using SheetJS (xlsx).
 */

import * as XLSX from "xlsx";
import { SaleRecord } from "../types/sale";
import { SalesReportExportOptions } from "./salesPdfExporter";

export function downloadSalesExcel(
  sales: SaleRecord[],
  options: SalesReportExportOptions,
  filename?: string
): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Invoices Summary & Details ──
  const salesRows = sales.map((sale) => {
    const d = new Date(sale.createdAt);
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    const itemsSummary = sale.items
      .map((it) => `${it.quantity}x ${it.name}${it.sku ? ` (${it.sku})` : ""}`)
      .join("; ");

    return {
      "Invoice #": sale.invoiceNumber,
      "Date & Time": dateFormatted,
      Status: sale.status.toUpperCase(),
      "Operator Name": sale.cashierName,
      "Operator Role": sale.cashierRole,
      "Customer Name": sale.customer?.name || "Walk-in Guest",
      "Customer Phone": sale.customer?.phone || "",
      "Item Count": sale.itemCount || sale.items.reduce((s, it) => s + it.quantity, 0),
      "Items Summary": itemsSummary,
      "Subtotal (LKR)": Number(sale.subtotal || 0).toFixed(2),
      "Discount (LKR)": Number(sale.discountAmount || 0).toFixed(2),
      "Tax (LKR)": Number(sale.taxAmount || 0).toFixed(2),
      "Grand Total (LKR)": Number(sale.grandTotal || sale.total || 0).toFixed(2),
      "Payment Method": (sale.paymentMethod || "cash").toUpperCase(),
      Notes: sale.notes || "",
    };
  });

  const wsSales = XLSX.utils.json_to_sheet(salesRows);

  // Set column widths
  wsSales["!cols"] = [
    { wch: 18 }, // Invoice #
    { wch: 18 }, // Date & Time
    { wch: 14 }, // Status
    { wch: 18 }, // Operator Name
    { wch: 12 }, // Operator Role
    { wch: 20 }, // Customer Name
    { wch: 16 }, // Customer Phone
    { wch: 12 }, // Item Count
    { wch: 35 }, // Items Summary
    { wch: 14 }, // Subtotal
    { wch: 14 }, // Discount
    { wch: 14 }, // Tax
    { wch: 16 }, // Grand Total
    { wch: 16 }, // Payment Method
    { wch: 30 }, // Notes
  ];

  XLSX.utils.book_append_sheet(wb, wsSales, "Sales Invoices");

  // ── Sheet 2: Line Items Breakdown ──
  const lineItemRows: any[] = [];
  sales.forEach((sale) => {
    const d = new Date(sale.createdAt);
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

    sale.items.forEach((item) => {
      lineItemRows.push({
        "Invoice #": sale.invoiceNumber,
        Date: dateFormatted,
        "Product Name": item.name,
        SKU: item.sku || "",
        Variant: item.variant || "",
        "Unit Price (LKR)": Number(item.unitPrice || 0).toFixed(2),
        Quantity: item.quantity,
        "Line Total (LKR)": Number(item.subtotal || 0).toFixed(2),
      });
    });
  });

  const wsItems = XLSX.utils.json_to_sheet(lineItemRows);
  wsItems["!cols"] = [
    { wch: 18 }, // Invoice #
    { wch: 14 }, // Date
    { wch: 28 }, // Product Name
    { wch: 16 }, // SKU
    { wch: 14 }, // Variant
    { wch: 16 }, // Unit Price
    { wch: 10 }, // Quantity
    { wch: 16 }, // Line Total
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, "Line Items");

  // ── Sheet 3: Report Metadata & Financial Summary ──
  const totalGrandTotal = sales.reduce((acc, s) => acc + (s.grandTotal || s.total || 0), 0);
  const totalUnits = sales.reduce(
    (acc, s) => acc + (s.itemCount || s.items.reduce((sum, it) => sum + it.quantity, 0)),
    0
  );

  const summaryData = [
    ["REPORT METADATA", ""],
    ["Shop Name", options.shopName],
    ["Shop ID", options.shopId],
    ["Branch", options.branchName || "Main Branch"],
    ["Generated At", new Date().toISOString()],
    ["Date Filter Range", options.filterSummary.dateRangeLabel],
    ["Status Filter", options.filterSummary.statusLabel || "All"],
    ["Payment Filter", options.filterSummary.paymentLabel || "All"],
    ["Cashier Filter", options.filterSummary.cashierLabel || "All"],
    ["Search Filter", options.filterSummary.searchTerm || "None"],
    ["", ""],
    ["AGGREGATE METRICS", ""],
    ["Total Invoices", sales.length],
    ["Total Units Sold", totalUnits],
    ["Gross Revenue (LKR)", totalGrandTotal.toFixed(2)],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 24 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // Save File
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalFilename = filename || `Sales_Ledger_${options.shopId}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, finalFilename);
}
