/**
 * lib/exporters/exchangesExcelExporter.ts
 *
 * Enterprise Excel (.xlsx) Exporter for Product Exchanges using SheetJS (xlsx).
 */

import * as XLSX from "xlsx";
import { SaleExchangeRecord } from "../types/sale";
import { ExchangeReportExportOptions } from "./exchangesPdfExporter";

export function downloadExchangesExcel(
  exchanges: SaleExchangeRecord[],
  options: ExchangeReportExportOptions,
  filename?: string
): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Product Exchanges Summary ──
  const exchangeRows = exchanges.map((exc) => {
    const d = new Date(exc.exchangeDate);
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    const returnedSummary = exc.returnedItems
      .map((it) => `${it.quantity}x ${it.name}${it.restock ? " [Restocked]" : ""}`)
      .join("; ");

    const replacementSummary = exc.replacementItems
      .map((it) => `${it.quantity}x ${it.name}`)
      .join("; ");

    return {
      "Exchange ID": exc.exchangeId,
      "Exchange Invoice #": exc.exchangeInvoiceNumber,
      "Exchange Date": dateFormatted,
      "Original Invoice #": exc.originalInvoiceNumber,
      "Operator Name": exc.operator.displayName || exc.operator.username,
      "Operator Role": exc.operator.role,
      "Settlement Type": exc.settlementType.replace("_", " ").toUpperCase(),
      "Settlement Method": exc.settlementMethod.toUpperCase(),
      "Returned Total Credit (LKR)": Number(exc.returnedTotal || 0).toFixed(2),
      "Replacement Total Cost (LKR)": Number(exc.replacementTotal || 0).toFixed(2),
      "Differential (LKR)": Number(exc.difference || 0).toFixed(2),
      "Amount Settled (LKR)": Number(exc.amountSettled || 0).toFixed(2),
      "Returned Items": returnedSummary,
      "Replacement Items": replacementSummary,
      Reason: exc.reason || "",
    };
  });

  const wsExchanges = XLSX.utils.json_to_sheet(exchangeRows);
  wsExchanges["!cols"] = [
    { wch: 22 }, // Exchange ID
    { wch: 20 }, // Exchange Invoice #
    { wch: 18 }, // Exchange Date
    { wch: 18 }, // Original Invoice #
    { wch: 18 }, // Operator Name
    { wch: 14 }, // Operator Role
    { wch: 18 }, // Settlement Type
    { wch: 16 }, // Settlement Method
    { wch: 22 }, // Returned Total Credit
    { wch: 24 }, // Replacement Total Cost
    { wch: 16 }, // Differential
    { wch: 18 }, // Amount Settled
    { wch: 35 }, // Returned Items
    { wch: 35 }, // Replacement Items
    { wch: 26 }, // Reason
  ];
  XLSX.utils.book_append_sheet(wb, wsExchanges, "Exchanges");

  // ── Sheet 2: Returned Line Items Detail ──
  const returnedLineRows: any[] = [];
  exchanges.forEach((exc) => {
    exc.returnedItems.forEach((item) => {
      returnedLineRows.push({
        "Exchange Invoice #": exc.exchangeInvoiceNumber,
        "Original Invoice #": exc.originalInvoiceNumber,
        "Product Name": item.name,
        SKU: item.sku || "",
        "Unit Price (LKR)": Number(item.unitPrice || 0).toFixed(2),
        Quantity: item.quantity,
        "Credit Disbursed (LKR)": Number(item.refundAmount || 0).toFixed(2),
        Restocked: item.restock ? "YES" : "NO",
        Condition: (item.condition || "good").toUpperCase(),
      });
    });
  });

  const wsReturned = XLSX.utils.json_to_sheet(returnedLineRows);
  wsReturned["!cols"] = [
    { wch: 20 },
    { wch: 18 },
    { wch: 28 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsReturned, "Returned Items");

  // ── Sheet 3: Replacement Line Items Detail ──
  const repLineRows: any[] = [];
  exchanges.forEach((exc) => {
    exc.replacementItems.forEach((item) => {
      repLineRows.push({
        "Exchange Invoice #": exc.exchangeInvoiceNumber,
        "Original Invoice #": exc.originalInvoiceNumber,
        "Product Name": item.name,
        SKU: item.sku || "",
        Variant: item.variant || "",
        "Unit Price (LKR)": Number(item.unitPrice || 0).toFixed(2),
        Quantity: item.quantity,
        "Subtotal (LKR)": Number(item.subtotal || 0).toFixed(2),
      });
    });
  });

  const wsReplacement = XLSX.utils.json_to_sheet(repLineRows);
  wsReplacement["!cols"] = [
    { wch: 20 },
    { wch: 18 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsReplacement, "Replacement Items");

  // ── Sheet 4: Summary ──
  const totalCustomerPaid = exchanges
    .filter((e) => e.settlementType === "customer_paid")
    .reduce((acc, e) => acc + e.amountSettled, 0);
  const totalStoreRefunded = exchanges
    .filter((e) => e.settlementType === "store_refunded")
    .reduce((acc, e) => acc + e.amountSettled, 0);

  const summaryData = [
    ["EXCHANGES AUDIT METADATA", ""],
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
    ["Total Exchanges", exchanges.length],
    ["Total Customer Paid Differential (LKR)", totalCustomerPaid.toFixed(2)],
    ["Total Store Refunded Differential (LKR)", totalStoreRefunded.toFixed(2)],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 32 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // Save File
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalFilename = filename || `Product_Exchanges_${options.shopId}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, finalFilename);
}
