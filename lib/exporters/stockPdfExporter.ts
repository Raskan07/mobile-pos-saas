/**
 * lib/exporters/stockPdfExporter.ts
 *
 * Enterprise PDF Exporter for Normalized Stock Reports using jsPDF.
 * Consumes the decoupled NormalizedStockReport data set to guarantee 100% numerical parity.
 */

import { jsPDF } from "jspdf";
import { NormalizedStockReport } from "../types/stockReport";

export function generateStockReportPdf(report: NormalizedStockReport): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  // Currency formatter
  const fmt = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // --- HEADER ---
  // Background brand bar
  doc.setFillColor(18, 20, 29);
  doc.rect(margin, y, contentWidth, 22, "F");

  // Shop Name & Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(report.metadata.shopName.toUpperCase(), margin + 4, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 205, 215);
  doc.text(
    `${report.metadata.branchName || "Main Branch"} • Shop ID: ${report.metadata.shopId}`,
    margin + 4,
    y + 14
  );

  // Report Title (Right-aligned in header)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(report.metadata.reportTitle, pageWidth - margin - 4, y + 8, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(170, 175, 190);
  doc.text(
    `Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}`,
    pageWidth - margin - 4,
    y + 14,
    { align: "right" }
  );

  y += 26;

  // --- METADATA & FILTERS BAR ---
  doc.setFillColor(245, 246, 248);
  doc.rect(margin, y, contentWidth, 12, "F");
  doc.setDrawColor(220, 225, 230);
  doc.rect(margin, y, contentWidth, 12, "S");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(70, 75, 85);

  const filterText = `Date Range: ${report.metadata.filtersApplied.dateRangeLabel}  |  Category: ${report.metadata.filtersApplied.categoryLabel}  |  Status: ${report.metadata.filtersApplied.statusLabel}  |  Staff: ${report.metadata.generatedBy.displayName || report.metadata.generatedBy.username}`;
  doc.text(filterText, margin + 4, y + 7.5);

  y += 16;

  // --- KPI SUMMARY CARDS BOX ---
  const kpiBoxHeight = 22;
  doc.setFillColor(250, 251, 253);
  doc.setDrawColor(215, 220, 230);
  doc.rect(margin, y, contentWidth, kpiBoxHeight, "FD");

  const colW = contentWidth / 4;

  // Metric 1: Total Cost Valuation
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 105, 115);
  doc.text("TOTAL COST VALUATION", margin + 4, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 25, 35);
  doc.text(fmt(report.summary.totalCostValue), margin + 4, y + 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(110, 115, 125);
  doc.text(`Asset Cost Basis`, margin + 4, y + 18);

  // Metric 2: Retail Potential
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 105, 115);
  doc.text("RETAIL VALUATION", margin + colW + 4, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 25, 35);
  doc.text(fmt(report.summary.totalRetailValue), margin + colW + 4, y + 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(110, 115, 125);
  doc.text(`Margin: ${report.summary.marginPercentage}%`, margin + colW + 4, y + 18);

  // Metric 3: Total Units & Items
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 105, 115);
  doc.text("TOTAL INVENTORY UNITS", margin + colW * 2 + 4, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 25, 35);
  doc.text(`${report.summary.totalUnits.toLocaleString()} units`, margin + colW * 2 + 4, y + 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(110, 115, 125);
  doc.text(`Across ${report.summary.totalProducts} catalog products`, margin + colW * 2 + 4, y + 18);

  // Metric 4: Health Breakdown
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 105, 115);
  doc.text("STOCK HEALTH STATUS", margin + colW * 3 + 4, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 25, 35);
  doc.text(
    `H: ${report.summary.healthyCount}  |  Low: ${report.summary.lowStockCount}  |  Out: ${report.summary.outOfStockCount}`,
    margin + colW * 3 + 4,
    y + 13
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(110, 115, 125);
  doc.text(`Damaged logged: ${report.summary.damagedUnits} units`, margin + colW * 3 + 4, y + 18);

  y += kpiBoxHeight + 8;

  // --- DATA TABLE ---
  const isMovementsReport = report.metadata.reportType === "STOCK_MOVEMENTS";

  const renderTableHeader = () => {
    doc.setFillColor(30, 35, 45);
    doc.rect(margin, y, contentWidth, 7.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    if (isMovementsReport) {
      doc.text("DATE & TIME", margin + 3, y + 5);
      doc.text("TYPE", margin + 34, y + 5);
      doc.text("PRODUCT / SKU", margin + 55, y + 5);
      doc.text("DELTA", margin + 115, y + 5, { align: "right" });
      doc.text("FLOW", margin + 130, y + 5);
      doc.text("REASON / REF", margin + 148, y + 5);
      doc.text("VALUE (LKR)", pageWidth - margin - 3, y + 5, { align: "right" });
    } else {
      doc.text("PRODUCT NAME", margin + 3, y + 5);
      doc.text("SKU", margin + 58, y + 5);
      doc.text("CATEGORY", margin + 85, y + 5);
      doc.text("STOCK", margin + 115, y + 5, { align: "right" });
      doc.text("MIN", margin + 128, y + 5, { align: "right" });
      doc.text("STATUS", margin + 134, y + 5);
      doc.text("COST (LKR)", margin + 158, y + 5, { align: "right" });
      doc.text("VALUATION (LKR)", pageWidth - margin - 3, y + 5, { align: "right" });
    }
    y += 7.5;
  };

  renderTableHeader();

  // Render Rows
  if (isMovementsReport) {
    report.movements.forEach((m, idx) => {
      // Check page break
      if (y > pageHeight - 20) {
        doc.addPage();
        y = margin;
        renderTableHeader();
      }

      // Alternate row background
      if (idx % 2 === 1) {
        doc.setFillColor(248, 249, 252);
        doc.rect(margin, y, contentWidth, 7, "F");
      }

      doc.setDrawColor(235, 238, 242);
      doc.line(margin, y + 7, pageWidth - margin, y + 7);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(40, 45, 55);

      const dateStr = new Date(m.timestamp).toLocaleDateString();
      const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      doc.text(`${dateStr} ${timeStr}`, margin + 3, y + 4.8);
      doc.text(m.type.replace("_", " "), margin + 34, y + 4.8);

      const prodLabel = m.productName.length > 25 ? `${m.productName.substring(0, 24)}...` : m.productName;
      doc.text(prodLabel, margin + 55, y + 4.8);

      doc.setFont("helvetica", "bold");
      const deltaStr = m.quantityDelta > 0 ? `+${m.quantityDelta}` : `${m.quantityDelta}`;
      doc.text(deltaStr, margin + 115, y + 4.8, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.text(`${m.previousStock} -> ${m.newStock}`, margin + 130, y + 4.8);

      const reasonLabel = (m.reason || "").length > 20 ? `${m.reason.substring(0, 19)}...` : m.reason;
      doc.text(reasonLabel, margin + 148, y + 4.8);

      doc.text(m.totalValueChange.toFixed(2), pageWidth - margin - 3, y + 4.8, { align: "right" });

      y += 7;
    });
  } else {
    report.items.forEach((item, idx) => {
      // Check page break
      if (y > pageHeight - 20) {
        doc.addPage();
        y = margin;
        renderTableHeader();
      }

      // Alternate row background
      if (idx % 2 === 1) {
        doc.setFillColor(248, 249, 252);
        doc.rect(margin, y, contentWidth, 7, "F");
      }

      doc.setDrawColor(235, 238, 242);
      doc.line(margin, y + 7, pageWidth - margin, y + 7);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(30, 35, 45);

      const nameStr = item.name.length > 30 ? `${item.name.substring(0, 29)}...` : item.name;
      doc.text(nameStr, margin + 3, y + 4.8);
      doc.text(item.sku, margin + 58, y + 4.8);

      const catStr = item.category.length > 16 ? `${item.category.substring(0, 15)}...` : item.category;
      doc.text(catStr, margin + 85, y + 4.8);

      doc.setFont("helvetica", "bold");
      doc.text(item.stockQuantity.toString(), margin + 115, y + 4.8, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.text(item.minStockLevel.toString(), margin + 128, y + 4.8, { align: "right" });

      doc.text(item.status.replace("_", " "), margin + 134, y + 4.8);
      doc.text(item.costPrice.toFixed(2), margin + 158, y + 4.8, { align: "right" });
      doc.text(item.totalCostValue.toFixed(2), pageWidth - margin - 3, y + 4.8, { align: "right" });

      y += 7;
    });
  }

  // --- FOOTER (Page X of Y on all pages) ---
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 225, 230);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 125, 135);
    doc.text(
      `Mobile POS SaaS • Stock Management System • Report ID: ${report.metadata.reportId}`,
      margin,
      pageHeight - 6
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  return doc;
}

export function downloadStockReportPdf(report: NormalizedStockReport, filename?: string): void {
  const doc = generateStockReportPdf(report);
  const cleanShop = report.metadata.shopId.replace(/[^a-zA-Z0-9]/g, "_");
  const typeStr = report.metadata.reportType.toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalName = filename || `stock_report_${cleanShop}_${typeStr}_${dateStr}.pdf`;
  doc.save(finalName);
}
