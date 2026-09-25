/**
 * lib/exporters/stockXmlExporter.ts
 *
 * Enterprise XML Exporter for Normalized Stock Reports.
 * Consumes the decoupled NormalizedStockReport data set to guarantee 100% numerical parity with the PDF exporter.
 */

import { NormalizedStockReport } from "../types/stockReport";

/**
 * Escapes characters for safe inclusion in XML elements and attributes
 */
function escapeXml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) return "";
  const str = String(unsafe);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates well-formed XML string representing the complete stock report
 */
export function generateStockReportXml(report: NormalizedStockReport): string {
  const meta = report.metadata;
  const summary = report.summary;

  const xmlParts: string[] = [];

  xmlParts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  xmlParts.push(
    `<StockReport xmlns="urn:mobile-pos:stock-report:v1" version="1.0" id="${escapeXml(meta.reportId)}" generatedAt="${escapeXml(meta.generatedAtISO)}" shopId="${escapeXml(meta.shopId)}">`
  );

  // Metadata block
  xmlParts.push(`  <Metadata>`);
  xmlParts.push(`    <ReportId>${escapeXml(meta.reportId)}</ReportId>`);
  xmlParts.push(`    <ReportType>${escapeXml(meta.reportType)}</ReportType>`);
  xmlParts.push(`    <ReportTitle>${escapeXml(meta.reportTitle)}</ReportTitle>`);
  xmlParts.push(`    <ShopId>${escapeXml(meta.shopId)}</ShopId>`);
  xmlParts.push(`    <ShopName>${escapeXml(meta.shopName)}</ShopName>`);
  xmlParts.push(`    <BranchName>${escapeXml(meta.branchName || "Main Branch")}</BranchName>`);
  xmlParts.push(`    <GeneratedAt timestamp="${meta.generatedAt}">${escapeXml(meta.generatedAtISO)}</GeneratedAt>`);
  xmlParts.push(`    <GeneratedBy>`);
  xmlParts.push(`      <UserId>${escapeXml(meta.generatedBy.userId)}</UserId>`);
  xmlParts.push(`      <Username>${escapeXml(meta.generatedBy.username)}</Username>`);
  xmlParts.push(`      <Role>${escapeXml(meta.generatedBy.role)}</Role>`);
  xmlParts.push(`      <DisplayName>${escapeXml(meta.generatedBy.displayName || meta.generatedBy.username)}</DisplayName>`);
  xmlParts.push(`    </GeneratedBy>`);
  xmlParts.push(`    <FiltersApplied>`);
  xmlParts.push(`      <DateRange>${escapeXml(meta.filtersApplied.dateRangeLabel)}</DateRange>`);
  xmlParts.push(`      <Status>${escapeXml(meta.filtersApplied.statusLabel)}</Status>`);
  xmlParts.push(`      <Category>${escapeXml(meta.filtersApplied.categoryLabel)}</Category>`);
  if (meta.filtersApplied.movementTypeLabel) {
    xmlParts.push(`      <MovementType>${escapeXml(meta.filtersApplied.movementTypeLabel)}</MovementType>`);
  }
  if (meta.filtersApplied.searchQuery) {
    xmlParts.push(`      <SearchQuery>${escapeXml(meta.filtersApplied.searchQuery)}</SearchQuery>`);
  }
  xmlParts.push(`    </FiltersApplied>`);
  xmlParts.push(`  </Metadata>`);

  // Summary block
  xmlParts.push(`  <Summary>`);
  xmlParts.push(`    <TotalProducts>${summary.totalProducts}</TotalProducts>`);
  xmlParts.push(`    <TotalUnits>${summary.totalUnits}</TotalUnits>`);
  xmlParts.push(`    <TotalCostValue currency="LKR">${summary.totalCostValue.toFixed(2)}</TotalCostValue>`);
  xmlParts.push(`    <TotalRetailValue currency="LKR">${summary.totalRetailValue.toFixed(2)}</TotalRetailValue>`);
  xmlParts.push(`    <PotentialProfit currency="LKR">${summary.potentialProfit.toFixed(2)}</PotentialProfit>`);
  xmlParts.push(`    <MarginPercentage unit="percent">${summary.marginPercentage.toFixed(2)}</MarginPercentage>`);
  xmlParts.push(`    <StockHealth>`);
  xmlParts.push(`      <HealthyCount>${summary.healthyCount}</HealthyCount>`);
  xmlParts.push(`      <LowStockCount>${summary.lowStockCount}</LowStockCount>`);
  xmlParts.push(`      <OutOfStockCount>${summary.outOfStockCount}</OutOfStockCount>`);
  xmlParts.push(`    </StockHealth>`);
  xmlParts.push(`    <DamagedStock>`);
  xmlParts.push(`      <Units>${summary.damagedUnits}</Units>`);
  xmlParts.push(`      <Value currency="LKR">${summary.damagedValue.toFixed(2)}</Value>`);
  xmlParts.push(`    </DamagedStock>`);
  xmlParts.push(`  </Summary>`);

  // Items block
  xmlParts.push(`  <Items count="${report.items.length}">`);
  report.items.forEach((item) => {
    xmlParts.push(`    <Item id="${escapeXml(item.productId)}">`);
    xmlParts.push(`      <Name>${escapeXml(item.name)}</Name>`);
    xmlParts.push(`      <SKU>${escapeXml(item.sku)}</SKU>`);
    xmlParts.push(`      <Barcode>${escapeXml(item.barcode)}</Barcode>`);
    xmlParts.push(`      <Category>${escapeXml(item.category)}</Category>`);
    xmlParts.push(`      <Unit>${escapeXml(item.unit)}</Unit>`);
    xmlParts.push(`      <StockQuantity>${item.stockQuantity}</StockQuantity>`);
    xmlParts.push(`      <MinStockLevel>${item.minStockLevel}</MinStockLevel>`);
    xmlParts.push(`      <Status>${escapeXml(item.status)}</Status>`);
    xmlParts.push(`      <CostPrice currency="LKR">${item.costPrice.toFixed(2)}</CostPrice>`);
    xmlParts.push(`      <SellingPrice currency="LKR">${item.sellingPrice.toFixed(2)}</SellingPrice>`);
    xmlParts.push(`      <TotalCostValue currency="LKR">${item.totalCostValue.toFixed(2)}</TotalCostValue>`);
    xmlParts.push(`      <TotalRetailValue currency="LKR">${item.totalRetailValue.toFixed(2)}</TotalRetailValue>`);
    xmlParts.push(`      <ProfitContribution currency="LKR">${item.profitContribution.toFixed(2)}</ProfitContribution>`);
    xmlParts.push(`    </Item>`);
  });
  xmlParts.push(`  </Items>`);

  // Movements block (if applicable)
  if (report.movements && report.movements.length > 0) {
    xmlParts.push(`  <Movements count="${report.movements.length}">`);
    report.movements.forEach((m) => {
      xmlParts.push(`    <Movement id="${escapeXml(m.id)}">`);
      xmlParts.push(`      <Timestamp>${m.timestamp}</Timestamp>`);
      xmlParts.push(`      <TimestampISO>${escapeXml(m.timestampISO)}</TimestampISO>`);
      xmlParts.push(`      <Type>${escapeXml(m.type)}</Type>`);
      xmlParts.push(`      <ProductId>${escapeXml(m.productId)}</ProductId>`);
      xmlParts.push(`      <ProductName>${escapeXml(m.productName)}</ProductName>`);
      xmlParts.push(`      <SKU>${escapeXml(m.sku)}</SKU>`);
      if (m.barcode) xmlParts.push(`      <Barcode>${escapeXml(m.barcode)}</Barcode>`);
      xmlParts.push(`      <QuantityDelta>${m.quantityDelta}</QuantityDelta>`);
      xmlParts.push(`      <PreviousStock>${m.previousStock}</PreviousStock>`);
      xmlParts.push(`      <NewStock>${m.newStock}</NewStock>`);
      xmlParts.push(`      <Reason>${escapeXml(m.reason)}</Reason>`);
      if (m.referenceNumber) xmlParts.push(`      <ReferenceNumber>${escapeXml(m.referenceNumber)}</ReferenceNumber>`);
      xmlParts.push(`      <UnitCost currency="LKR">${m.unitCost.toFixed(2)}</UnitCost>`);
      xmlParts.push(`      <UnitSellingPrice currency="LKR">${m.unitSellingPrice.toFixed(2)}</UnitSellingPrice>`);
      xmlParts.push(`      <TotalValueChange currency="LKR">${m.totalValueChange.toFixed(2)}</TotalValueChange>`);
      xmlParts.push(`      <PerformedBy role="${escapeXml(m.performedByRole)}">${escapeXml(m.performedBy)}</PerformedBy>`);
      if (m.notes) xmlParts.push(`      <Notes>${escapeXml(m.notes)}</Notes>`);
      xmlParts.push(`    </Movement>`);
    });
    xmlParts.push(`  </Movements>`);
  }

  xmlParts.push(`</StockReport>`);

  return xmlParts.join("\n");
}

/**
 * Triggers client-side download of the generated XML report
 */
export function downloadStockReportXml(report: NormalizedStockReport, filename?: string): void {
  const xmlContent = generateStockReportXml(report);
  const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const cleanShop = report.metadata.shopId.replace(/[^a-zA-Z0-9]/g, "_");
  const typeStr = report.metadata.reportType.toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalName = filename || `stock_report_${cleanShop}_${typeStr}_${dateStr}.xml`;

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", finalName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
