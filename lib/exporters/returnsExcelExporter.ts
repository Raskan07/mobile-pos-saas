/**
 * lib/exporters/returnsExcelExporter.ts
 *
 * Enterprise Excel (.xlsx) Exporter for Customer Returns & Refunds using SheetJS (xlsx).
 */

import * as XLSX from "xlsx";
import { SaleReturnRecord } from "../types/sale";
import { ReturnReportExportOptions } from "./returnsPdfExporter";

export function downloadReturnsExcel(
  returns: SaleReturnRecord[],
  options: ReturnReportExportOptions,
  filename?: string
): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Return Events Summary ──
  const returnRows = returns.map((ret) => {
    const d = new Date(ret.returnDate);
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    const itemsSummary = ret.items
      .map((it) => `${it.quantity}x ${it.name}${it.restock ? " [Restocked]" : ""}`)
      .join("; ");

    return {
      "Return ID": ret.returnId,
      "Return Date": dateFormatted,
      "Original Invoice": ret.invoiceNumber,
      "Operator Name": ret.processedBy.displayName || ret.processedBy.username,
      "Operator Role": ret.processedBy.role,
      "Refund Method": (ret.refundMethod || "cash").toUpperCase(),
      Reason: ret.reason || "",
      "Items Summary": itemsSummary,
      "Units Returned": ret.items.reduce((s, it) => s + it.quantity, 0),
      "Refund Disbursed (LKR)": Number(ret.totalRefundAmount || 0).toFixed(2),
    };
  });

  const wsReturns = XLSX.utils.json_to_sheet(returnRows);
  wsReturns["!cols"] = [
    { wch: 22 }, // Return ID
    { wch: 18 }, // Return Date
    { wch: 18 }, // Original Invoice
    { wch: 18 }, // Operator Name
    { wch: 14 }, // Operator Role
    { wch: 16 }, // Refund Method
    { wch: 26 }, // Reason
    { wch: 35 }, // Items Summary
    { wch: 14 }, // Units Returned
    { wch: 22 }, // Refund Disbursed
  ];
  XLSX.utils.book_append_sheet(wb, wsReturns, "Return Events");

  // ── Sheet 2: Returned Line Items Detail ──
  const lineItemRows: any[] = [];
  returns.forEach((ret) => {
    ret.items.forEach((item) => {
      lineItemRows.push({
        "Return ID": ret.returnId,
        "Original Invoice": ret.invoiceNumber,
        "Product Name": item.name,
        SKU: item.sku || "",
        "Unit Price (LKR)": Number(item.unitPrice || 0).toFixed(2),
        Quantity: item.quantity,
        "Line Refund (LKR)": Number(item.refundAmount || 0).toFixed(2),
        Restocked: item.restock ? "YES" : "NO",
        Condition: (item.condition || "good").toUpperCase(),
      });
    });
  });

  const wsItems = XLSX.utils.json_to_sheet(lineItemRows);
  wsItems["!cols"] = [
    { wch: 22 }, // Return ID
    { wch: 18 }, // Original Invoice
    { wch: 28 }, // Product Name
    { wch: 16 }, // SKU
    { wch: 16 }, // Unit Price
    { wch: 10 }, // Quantity
    { wch: 16 }, // Line Refund
    { wch: 12 }, // Restocked
    { wch: 14 }, // Condition
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, "Returned Items");

  // ── Sheet 3: Summary ──
  const totalRefundAmount = returns.reduce((acc, r) => acc + (r.totalRefundAmount || 0), 0);
  const totalUnits = returns.reduce(
    (acc, r) => acc + r.items.reduce((s, it) => s + it.quantity, 0),
    0
  );

  const summaryData = [
    ["RETURNS AUDIT METADATA", ""],
    ["Shop Name", options.shopName],
    ["Shop ID", options.shopId],
    ["Branch", options.branchName || "Main Branch"],
    ["Generated At", new Date().toISOString()],
    ["Date Filter Range", options.filterSummary.dateRangeLabel],
    ["Payment Filter", options.filterSummary.paymentLabel || "All"],
    ["Cashier Filter", options.filterSummary.cashierLabel || "All"],
    ["Search Filter", options.filterSummary.searchTerm || "None"],
    ["", ""],
    ["AGGREGATE METRICS", ""],
    ["Total Return Records", returns.length],
    ["Total Units Returned", totalUnits],
    ["Total Refund Disbursed (LKR)", totalRefundAmount.toFixed(2)],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 26 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // Save File
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalFilename = filename || `Returns_Audit_${options.shopId}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, finalFilename);
}
