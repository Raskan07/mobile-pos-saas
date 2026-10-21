/**
 * lib/exporters/salesXmlExporter.ts
 *
 * Enterprise XML Exporter for Sales Ledger & Invoices.
 */

import { SaleRecord } from "../types/sale";
import { SalesReportExportOptions } from "./salesPdfExporter";

function escapeXml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateSalesXml(
  sales: SaleRecord[],
  options: SalesReportExportOptions
): string {
  const parts: string[] = [];
  const now = new Date();

  const totalRevenue = sales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
  const totalRefunded = sales.reduce((acc, s) => acc + (s.totalRefunded || 0), 0);
  const totalItemsSold = sales.reduce((acc, s) => acc + (s.itemCount || 0), 0);

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<SalesLedgerReport xmlns="urn:mobile-pos:sales-ledger:v1" version="1.0" generatedAt="${escapeXml(now.toISOString())}" shopId="${escapeXml(options.shopId)}" shopName="${escapeXml(options.shopName)}">`
  );

  // Metadata
  parts.push(`  <Metadata>`);
  parts.push(`    <ReportTitle>Sales Ledger Audit Report</ReportTitle>`);
  parts.push(`    <ShopId>${escapeXml(options.shopId)}</ShopId>`);
  parts.push(`    <ShopName>${escapeXml(options.shopName)}</ShopName>`);
  parts.push(`    <BranchName>${escapeXml(options.branchName || "Main Branch")}</BranchName>`);
  parts.push(`    <GeneratedAtISO>${escapeXml(now.toISOString())}</GeneratedAtISO>`);
  if (options.generatedBy) {
    parts.push(`    <GeneratedBy>`);
    parts.push(`      <Username>${escapeXml(options.generatedBy.username)}</Username>`);
    parts.push(`      <Role>${escapeXml(options.generatedBy.role)}</Role>`);
    parts.push(`    </GeneratedBy>`);
  }
  parts.push(`    <FiltersApplied>`);
  parts.push(`      <DateRange>${escapeXml(options.filterSummary.dateRangeLabel)}</DateRange>`);
  parts.push(`      <Status>${escapeXml(options.filterSummary.statusLabel || "All")}</Status>`);
  parts.push(`      <Payment>${escapeXml(options.filterSummary.paymentLabel || "All")}</Payment>`);
  parts.push(`      <Cashier>${escapeXml(options.filterSummary.cashierLabel || "All")}</Cashier>`);
  if (options.filterSummary.searchTerm) {
    parts.push(`      <SearchTerm>${escapeXml(options.filterSummary.searchTerm)}</SearchTerm>`);
  }
  parts.push(`    </FiltersApplied>`);
  parts.push(`  </Metadata>`);

  // Summary
  parts.push(`  <Summary>`);
  parts.push(`    <TotalInvoices>${sales.length}</TotalInvoices>`);
  parts.push(`    <TotalItemsDispensed>${totalItemsSold}</TotalItemsDispensed>`);
  parts.push(`    <GrossRevenue currency="LKR">${totalRevenue.toFixed(2)}</GrossRevenue>`);
  parts.push(`    <TotalRefunded currency="LKR">${totalRefunded.toFixed(2)}</TotalRefunded>`);
  parts.push(`    <NetRevenue currency="LKR">${(totalRevenue - totalRefunded).toFixed(2)}</NetRevenue>`);
  parts.push(`  </Summary>`);

  // Sales items
  parts.push(`  <Sales>`);
  for (const sale of sales) {
    parts.push(
      `    <Sale id="${escapeXml(sale.saleId)}" invoiceNumber="${escapeXml(sale.invoiceNumber)}" status="${escapeXml(sale.status)}" createdAt="${escapeXml(new Date(sale.createdAt).toISOString())}">`
    );
    parts.push(
      `      <Operator userId="${escapeXml(sale.cashierId)}" username="${escapeXml(sale.cashierName)}" role="${escapeXml(sale.cashierRole)}" />`
    );
    if (sale.customer?.name || sale.customer?.phone) {
      parts.push(
        `      <Customer customerId="${escapeXml(sale.customer.customerId || "")}" name="${escapeXml(sale.customer.name || "")}" phone="${escapeXml(sale.customer.phone || "")}" email="${escapeXml(sale.customer.email || "")}" />`
      );
    }
    parts.push(
      `      <Payment method="${escapeXml(sale.paymentMethod)}" cashReceived="${escapeXml(sale.cashReceived ?? "")}" change="${escapeXml(sale.change ?? "")}" />`
    );
    parts.push(
      `      <Financials subtotal="${sale.subtotal.toFixed(2)}" discount="${sale.discountAmount.toFixed(2)}" tax="${sale.taxAmount.toFixed(2)}" grandTotal="${sale.grandTotal.toFixed(2)}" refunded="${(sale.totalRefunded || 0).toFixed(2)}" />`
    );

    // Line items
    parts.push(`      <LineItems count="${sale.items.length}">`);
    for (const it of sale.items) {
      parts.push(
        `        <Item productId="${escapeXml(it.productId)}" sku="${escapeXml(it.sku)}" name="${escapeXml(it.name)}" variant="${escapeXml(it.variant || "")}" quantity="${it.quantity}" unitPrice="${it.unitPrice.toFixed(2)}" discount="${it.discount.toFixed(2)}" subtotal="${it.subtotal.toFixed(2)}" />`
      );
    }
    parts.push(`      </LineItems>`);

    // Returns if any
    if (sale.returns && sale.returns.length > 0) {
      parts.push(`      <Returns count="${sale.returns.length}">`);
      for (const ret of sale.returns) {
        parts.push(
          `        <Return returnId="${escapeXml(ret.returnId)}" date="${escapeXml(ret.returnDateISO || new Date(ret.returnDate).toISOString())}" refundAmount="${ret.totalRefundAmount.toFixed(2)}" method="${escapeXml(ret.refundMethod)}" reason="${escapeXml(ret.reason)}" operator="${escapeXml(ret.processedBy.username)}">`
        );
        for (const retItem of ret.items) {
          parts.push(
            `          <ReturnedItem productId="${escapeXml(retItem.productId)}" sku="${escapeXml(retItem.sku)}" name="${escapeXml(retItem.name)}" quantity="${retItem.quantity}" refund="${retItem.refundAmount.toFixed(2)}" restocked="${retItem.restock}" />`
          );
        }
        parts.push(`        </Return>`);
      }
      parts.push(`      </Returns>`);
    }

    parts.push(`    </Sale>`);
  }
  parts.push(`  </Sales>`);
  parts.push(`</SalesLedgerReport>`);

  return parts.join("\n");
}

export function downloadSalesXml(
  sales: SaleRecord[],
  options: SalesReportExportOptions,
  filename?: string
): void {
  const xml = generateSalesXml(sales, options);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const now = new Date().toISOString().slice(0, 10);
  a.download = filename || `sales_ledger_report_${now}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
