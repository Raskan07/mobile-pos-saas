/**
 * lib/exporters/returnsXmlExporter.ts
 *
 * Enterprise XML Exporter for Customer Returns & Refunds Audit Trail.
 */

import { SaleReturnRecord } from "../types/sale";
import { ReturnReportExportOptions } from "./returnsPdfExporter";

function escapeXml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateReturnsXml(
  returns: SaleReturnRecord[],
  options: ReturnReportExportOptions
): string {
  const parts: string[] = [];
  const now = new Date();

  const totalRefundAmount = returns.reduce((acc, r) => acc + (r.totalRefundAmount || 0), 0);
  const totalUnitsReturned = returns.reduce(
    (acc, r) => acc + r.items.reduce((sum, it) => sum + it.quantity, 0),
    0
  );

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<ReturnsAuditReport xmlns="urn:mobile-pos:returns-audit:v1" version="1.0" generatedAt="${escapeXml(now.toISOString())}" shopId="${escapeXml(options.shopId)}" shopName="${escapeXml(options.shopName)}">`
  );

  // Metadata
  parts.push(`  <Metadata>`);
  parts.push(`    <ReportTitle>Customer Returns &amp; Refunds Audit Report</ReportTitle>`);
  parts.push(`    <ShopId>${escapeXml(options.shopId)}</ShopId>`);
  parts.push(`    <ShopName>${escapeXml(options.shopName)}</ShopName>`);
  parts.push(`    <BranchName>${escapeXml(options.branchName || "Main Branch")}</BranchName>`);
  parts.push(`    <GeneratedAtISO>${escapeXml(now.toISOString())}</GeneratedAtISO>`);
  parts.push(`    <FiltersApplied>`);
  parts.push(`      <DateRange>${escapeXml(options.filterSummary.dateRangeLabel)}</DateRange>`);
  parts.push(`      <PaymentMethod>${escapeXml(options.filterSummary.paymentLabel || "All")}</PaymentMethod>`);
  parts.push(`      <Cashier>${escapeXml(options.filterSummary.cashierLabel || "All")}</Cashier>`);
  if (options.filterSummary.searchTerm) {
    parts.push(`      <SearchTerm>${escapeXml(options.filterSummary.searchTerm)}</SearchTerm>`);
  }
  parts.push(`    </FiltersApplied>`);
  parts.push(`  </Metadata>`);

  // Summary
  parts.push(`  <Summary>`);
  parts.push(`    <TotalReturnRecords>${returns.length}</TotalReturnRecords>`);
  parts.push(`    <TotalUnitsReturned>${totalUnitsReturned}</TotalUnitsReturned>`);
  parts.push(`    <TotalRefundDisbursed currency="LKR">${totalRefundAmount.toFixed(2)}</TotalRefundDisbursed>`);
  parts.push(`  </Summary>`);

  // Returns list
  parts.push(`  <Returns>`);
  for (const ret of returns) {
    parts.push(
      `    <Return returnId="${escapeXml(ret.returnId)}" originalSaleId="${escapeXml(ret.originalSaleId)}" invoiceNumber="${escapeXml(ret.invoiceNumber)}" returnDate="${escapeXml(ret.returnDateISO || new Date(ret.returnDate).toISOString())}">`
    );
    parts.push(
      `      <Operator userId="${escapeXml(ret.processedBy.userId)}" username="${escapeXml(ret.processedBy.username)}" role="${escapeXml(ret.processedBy.role)}" />`
    );
    parts.push(
      `      <Refund method="${escapeXml(ret.refundMethod)}" totalAmount="${ret.totalRefundAmount.toFixed(2)}" />`
    );
    parts.push(`      <Reason>${escapeXml(ret.reason)}</Reason>`);

    // Returned items
    parts.push(`      <ReturnedItems count="${ret.items.length}">`);
    for (const item of ret.items) {
      parts.push(
        `        <Item productId="${escapeXml(item.productId)}" sku="${escapeXml(item.sku)}" name="${escapeXml(item.name)}" quantity="${item.quantity}" unitPrice="${item.unitPrice.toFixed(2)}" refundAmount="${item.refundAmount.toFixed(2)}" restocked="${item.restock}" condition="${escapeXml(item.condition || "good")}" />`
      );
    }
    parts.push(`      </ReturnedItems>`);
    parts.push(`    </Return>`);
  }
  parts.push(`  </Returns>`);
  parts.push(`</ReturnsAuditReport>`);

  return parts.join("\n");
}

export function downloadReturnsXml(
  returns: SaleReturnRecord[],
  options: ReturnReportExportOptions,
  filename?: string
): void {
  const xml = generateReturnsXml(returns, options);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const now = new Date().toISOString().slice(0, 10);
  a.download = filename || `returns_audit_report_${now}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
