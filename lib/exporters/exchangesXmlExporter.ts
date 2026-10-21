/**
 * lib/exporters/exchangesXmlExporter.ts
 *
 * Enterprise XML Exporter for Product Exchanges Audit Trail.
 */

import { SaleExchangeRecord } from "../types/sale";
import { ExchangeReportExportOptions } from "./exchangesPdfExporter";

function escapeXml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateExchangesXml(
  exchanges: SaleExchangeRecord[],
  options: ExchangeReportExportOptions
): string {
  const parts: string[] = [];
  const now = new Date();

  const totalCustomerPaid = exchanges
    .filter((e) => e.settlementType === "customer_paid")
    .reduce((acc, e) => acc + e.amountSettled, 0);
  const totalStoreRefunded = exchanges
    .filter((e) => e.settlementType === "store_refunded")
    .reduce((acc, e) => acc + e.amountSettled, 0);

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<ExchangesAuditReport xmlns="urn:mobile-pos:exchanges-audit:v1" version="1.0" generatedAt="${escapeXml(now.toISOString())}" shopId="${escapeXml(options.shopId)}" shopName="${escapeXml(options.shopName)}">`
  );

  // Metadata
  parts.push(`  <Metadata>`);
  parts.push(`    <ReportTitle>Product Exchanges Audit Report</ReportTitle>`);
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
  parts.push(`    <TotalExchangeRecords>${exchanges.length}</TotalExchangeRecords>`);
  parts.push(`    <TotalCustomerPaid currency="LKR">${totalCustomerPaid.toFixed(2)}</TotalCustomerPaid>`);
  parts.push(`    <TotalStoreRefunded currency="LKR">${totalStoreRefunded.toFixed(2)}</TotalStoreRefunded>`);
  parts.push(`  </Summary>`);

  // Exchanges List
  parts.push(`  <Exchanges>`);
  for (const exc of exchanges) {
    parts.push(`    <Exchange exchangeId="${escapeXml(exc.exchangeId)}">`);
    parts.push(`      <ExchangeInvoiceNumber>${escapeXml(exc.exchangeInvoiceNumber)}</ExchangeInvoiceNumber>`);
    parts.push(`      <OriginalSaleId>${escapeXml(exc.originalSaleId)}</OriginalSaleId>`);
    parts.push(`      <OriginalInvoiceNumber>${escapeXml(exc.originalInvoiceNumber)}</OriginalInvoiceNumber>`);
    parts.push(`      <ExchangeDateISO>${escapeXml(exc.exchangeDateISO || new Date(exc.exchangeDate).toISOString())}</ExchangeDateISO>`);
    parts.push(`      <SettlementType>${escapeXml(exc.settlementType)}</SettlementType>`);
    parts.push(`      <SettlementMethod>${escapeXml(exc.settlementMethod)}</SettlementMethod>`);
    parts.push(`      <Difference currency="LKR">${exc.difference.toFixed(2)}</Difference>`);
    parts.push(`      <AmountSettled currency="LKR">${exc.amountSettled.toFixed(2)}</AmountSettled>`);
    parts.push(`      <Reason>${escapeXml(exc.reason)}</Reason>`);
    parts.push(`      <Operator userId="${escapeXml(exc.operator.userId)}" role="${escapeXml(exc.operator.role)}">${escapeXml(exc.operator.displayName || exc.operator.username)}</Operator>`);

    // Returned items
    parts.push(`      <ReturnedItems total="${exc.returnedTotal.toFixed(2)}">`);
    for (const item of exc.returnedItems) {
      parts.push(
        `        <Item productId="${escapeXml(item.productId)}" sku="${escapeXml(item.sku)}" quantity="${item.quantity}" unitPrice="${item.unitPrice.toFixed(2)}" credit="${item.refundAmount.toFixed(2)}" restocked="${item.restock}">${escapeXml(item.name)}</Item>`
      );
    }
    parts.push(`      </ReturnedItems>`);

    // Replacement items
    parts.push(`      <ReplacementItems total="${exc.replacementTotal.toFixed(2)}">`);
    for (const item of exc.replacementItems) {
      parts.push(
        `        <Item productId="${escapeXml(item.productId)}" sku="${escapeXml(item.sku)}" quantity="${item.quantity}" unitPrice="${item.unitPrice.toFixed(2)}" subtotal="${item.subtotal.toFixed(2)}">${escapeXml(item.name)}</Item>`
      );
    }
    parts.push(`      </ReplacementItems>`);

    parts.push(`    </Exchange>`);
  }
  parts.push(`  </Exchanges>`);
  parts.push(`</ExchangesAuditReport>`);

  return parts.join("\n");
}

export function downloadExchangesXml(
  exchanges: SaleExchangeRecord[],
  options: ExchangeReportExportOptions,
  filename?: string
): void {
  const xmlString = generateExchangesXml(exchanges, options);
  const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = filename || `Product_Exchanges_${options.shopId}_${dateStr}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
