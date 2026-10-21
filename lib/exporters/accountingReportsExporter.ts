/**
 * lib/exporters/accountingReportsExporter.ts
 *
 * Enterprise Exporter for Accounting Reports & SST statements.
 * Provides:
 * 1. `exportAccountingReportToPdf` using `jspdf`
 * 2. `exportAccountingReportToExcel` using `xlsx` (SheetJS)
 *
 * Supports all 12 accounting report types:
 * - pnl
 * - balance_sheet
 * - cash_flow
 * - trial_balance
 * - sales_statement
 * - inventory_valuation
 * - purchase_statement
 * - accounts_receivable
 * - accounts_payable
 * - expense_statement
 * - bank_cash_reconciliation
 * - tax_statement
 */

import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import {
  AccountingReportType,
  MasterAccountingReportsData,
} from "../types/accountingReport";

export interface ReportExportOptions {
  reportType: AccountingReportType;
  reportTitle: string;
  reportData: MasterAccountingReportsData;
  operatorName?: string;
  currency?: string;
}

const fmtCurrency = (val: number, cur: string = "LKR") =>
  `${cur} ${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─────────────────────────────────────────────────────────────
// 1. PDF EXPORT IMPLEMENTATION
// ─────────────────────────────────────────────────────────────

export function exportAccountingReportToPdf(options: ReportExportOptions): void {
  const { reportType, reportTitle, reportData, operatorName = "Admin", currency = "LKR" } = options;
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

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 15) {
      doc.addPage();
      y = margin;
      drawHeaderBar();
    }
  };

  const drawHeaderBar = () => {
    // Top banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text((reportData.shopName || "ENTERPRISE POS").toUpperCase(), margin + 5, y + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(56, 189, 248); // sky-400
    doc.text(reportTitle.toUpperCase(), margin + 5, y + 16);

    // Meta right-aligned
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    const genDate = new Date(reportData.generatedAt).toLocaleString();
    doc.text(`Period: ${reportData.dateFilter.label} (${reportData.dateFilter.startDate} ~ ${reportData.dateFilter.endDate})`, pageWidth - margin - 5, y + 8, { align: "right" });
    doc.text(`Generated: ${genDate} | Op: ${operatorName}`, pageWidth - margin - 5, y + 16, { align: "right" });

    y += 28;
  };

  drawHeaderBar();

  // Draw Specific Report Body
  switch (reportType) {
    case "pnl": {
      const p = reportData.pnl;
      drawSectionHeading("REVENUE CHANNELS");
      drawTableRow("Product Invoices Revenue (Sales revenue)", fmtCurrency(p.netRevenue > 0 ? p.netRevenue : p.grossSales, currency));
      drawTableRow("Wholesale cost of goods sold (COGS)", `- ${fmtCurrency(p.cogs, currency)}`, 14);
      drawTotalRow("GROSS PROFIT", fmtCurrency(p.grossProfit, currency), `Gross Margin: ${p.grossMarginPct.toFixed(1)}%`);

      y += 5;
      drawSectionHeading("OPERATING EXPENSES (OPEX)");
      p.operatingExpenses.forEach((exp) => {
        drawTableRow(exp.category, fmtCurrency(exp.amount, currency), 14, `${exp.pctOfRevenue.toFixed(1)}% rev`);
      });
      drawTotalRow("TOTAL OPEX", `- ${fmtCurrency(p.totalOperatingExpenses, currency)}`);

      y += 5;
      drawSectionHeading("NET EARNINGS");
      drawDoubleUnderlineTotal("NET BUSINESS PROFIT (Profit after listed expenses)", fmtCurrency(p.netProfit, currency), `Net Margin: ${p.netMarginPct.toFixed(1)}%`);
      break;
    }

    case "balance_sheet": {
      const b = reportData.balanceSheet;
      drawSectionHeading(`ASSETS (As of ${b.asOfDate})`);
      b.currentAssets.forEach((a) => drawTableRow(`${a.accountCode} - ${a.name}`, fmtCurrency(a.amount, currency), 14));
      drawTotalRow("TOTAL CURRENT ASSETS", fmtCurrency(b.totalCurrentAssets, currency));

      y += 3;
      b.nonCurrentAssets.forEach((a) => drawTableRow(`${a.accountCode} - ${a.name}`, fmtCurrency(a.amount, currency), 14));
      drawTotalRow("TOTAL NON-CURRENT ASSETS", fmtCurrency(b.totalNonCurrentAssets, currency));
      drawDoubleUnderlineTotal("TOTAL ASSETS", fmtCurrency(b.totalAssets, currency));

      y += 5;
      drawSectionHeading("LIABILITIES & OWNER'S EQUITY");
      b.currentLiabilities.forEach((l) => drawTableRow(`${l.accountCode} - ${l.name}`, fmtCurrency(l.amount, currency), 14));
      drawTotalRow("TOTAL CURRENT LIABILITIES", fmtCurrency(b.totalCurrentLiabilities, currency));

      y += 3;
      b.nonCurrentLiabilities.forEach((l) => drawTableRow(`${l.accountCode} - ${l.name}`, fmtCurrency(l.amount, currency), 14));
      drawTotalRow("TOTAL LIABILITIES", fmtCurrency(b.totalLiabilities, currency));

      y += 3;
      b.equityItems.forEach((e) => drawTableRow(`${e.accountCode} - ${e.name}`, fmtCurrency(e.amount, currency), 14));
      drawTotalRow("TOTAL OWNER'S EQUITY", fmtCurrency(b.totalEquity, currency));
      drawDoubleUnderlineTotal("TOTAL LIABILITIES & EQUITY", fmtCurrency(b.totalLiabilitiesAndEquity, currency), b.isBalanced ? "BALANCED" : `Variance: ${fmtCurrency(b.variance, currency)}`);
      break;
    }

    case "cash_flow": {
      const cf = reportData.cashFlow;
      drawSectionHeading("1. CASH FLOW FROM OPERATING ACTIVITIES");
      cf.operatingActivities.forEach((a) => drawTableRow(a.name, fmtCurrency(a.amount, currency), 14));
      drawTotalRow("NET CASH FROM OPERATING ACTIVITIES", fmtCurrency(cf.netOperatingCashFlow, currency));

      y += 4;
      drawSectionHeading("2. CASH FLOW FROM INVESTING ACTIVITIES");
      cf.investingActivities.forEach((a) => drawTableRow(a.name, fmtCurrency(a.amount, currency), 14));
      drawTotalRow("NET CASH FROM INVESTING ACTIVITIES", fmtCurrency(cf.netInvestingCashFlow, currency));

      y += 4;
      drawSectionHeading("3. CASH FLOW FROM FINANCING ACTIVITIES");
      cf.financingActivities.forEach((a) => drawTableRow(a.name, fmtCurrency(a.amount, currency), 14));
      drawTotalRow("NET CASH FROM FINANCING ACTIVITIES", fmtCurrency(cf.netFinancingCashFlow, currency));

      y += 4;
      drawSectionHeading("4. CASH SUMMARY RECONCILIATION");
      drawTableRow("Net Change in Liquid Cash for Period", fmtCurrency(cf.netChangeInCash, currency));
      drawTableRow("Add: Beginning Cash & Bank Float", fmtCurrency(cf.beginningCashBalance, currency));
      drawDoubleUnderlineTotal("ENDING CASH & BANK BALANCE", fmtCurrency(cf.endingCashBalance, currency));
      break;
    }

    case "trial_balance": {
      const tb = reportData.trialBalance;
      drawSectionHeading("GENERAL TRIAL BALANCE VERIFICATION");
      drawGridHeader(["Account Code & Title", "Classification", "Debit Amount", "Credit Amount"]);
      tb.rows.forEach((r) => {
        checkPageBreak(8);
        drawGridRow([
          `${r.code} - ${r.name}`,
          r.category,
          r.debit > 0 ? fmtCurrency(r.debit, currency) : "-",
          r.credit > 0 ? fmtCurrency(r.credit, currency) : "-",
        ]);
      });
      drawDoubleUnderlineGridTotal([
        "TOTAL BALANCES",
        tb.isBalanced ? "BALANCED" : "DISCREPANCY",
        fmtCurrency(tb.totalDebits, currency),
        fmtCurrency(tb.totalCredits, currency),
      ]);
      break;
    }

    case "tax_statement": {
      const tx = reportData.taxStatement;
      drawSectionHeading("SST TAX COMPLIANCE SUMMARY");
      drawTableRow("Total SST Output Tax (Sales Tax Collected)", fmtCurrency(tx.sstOutputTax, currency));
      drawTableRow("Less: Total SST Input Tax (Eligible Purchase Tax)", `(${fmtCurrency(tx.sstInputTax, currency)})`, 14);
      drawDoubleUnderlineTotal("NET SST PAYABLE / (REFUNDABLE)", fmtCurrency(tx.netSSTPayable, currency), `Effective Rate: ${tx.effectiveTaxRatePct}%`);

      y += 6;
      drawSectionHeading("TAX BASE BREAKDOWN");
      drawTableRow("Taxable Sales Turnover", fmtCurrency(tx.taxableSalesAmount, currency));
      drawTableRow("Zero-Rated / Tax-Exempt Sales", fmtCurrency(tx.taxExemptSalesAmount, currency));

      y += 6;
      drawSectionHeading("ITEMIZED SST TAX TRANSACTIONS");
      drawGridHeader(["Reference #", "Date", "Type", "Counterparty", "Taxable Base", "SST Amount"]);
      tx.transactions.slice(0, 20).forEach((t) => {
        checkPageBreak(8);
        drawGridRow([
          t.referenceNumber,
          t.date,
          t.type === "OUTPUT_TAX" ? "Sales (Output)" : "Purchase (Input)",
          t.counterparty.length > 18 ? t.counterparty.slice(0, 18) + "..." : t.counterparty,
          fmtCurrency(t.taxableAmount, currency),
          fmtCurrency(t.taxAmount, currency),
        ]);
      });
      break;
    }

    case "inventory_valuation": {
      const iv = reportData.inventoryValuation;
      drawSectionHeading("STOCK VALUATION METRICS");
      drawTableRow("Total Active Catalog SKUs", String(iv.totalSkus));
      drawTableRow("Total Physical Units on Hand", `${iv.totalUnits} units`);
      drawTableRow("Total Inventory Asset Cost Value", fmtCurrency(iv.totalCostValue, currency));
      drawTableRow("Total Estimated Retail Value", fmtCurrency(iv.totalRetailValue, currency));
      drawDoubleUnderlineTotal("UNREALIZED INVENTORY MARGIN", fmtCurrency(iv.potentialTotalProfit, currency), `Markup: ${iv.overallMarginPct}%`);

      y += 6;
      drawSectionHeading("INVENTORY ITEM BREAKDOWN (Top Items)");
      drawGridHeader(["SKU", "Item Description", "Qty", "Cost Price", "Selling Price", "Valuation"]);
      iv.items.slice(0, 25).forEach((it) => {
        checkPageBreak(8);
        drawGridRow([
          it.sku,
          it.name.length > 20 ? it.name.slice(0, 20) + "..." : it.name,
          String(it.stockQty),
          fmtCurrency(it.unitCost, currency),
          fmtCurrency(it.unitPrice, currency),
          fmtCurrency(it.totalCostValuation, currency),
        ]);
      });
      break;
    }

    case "sales_statement": {
      const ss = reportData.salesStatement;
      drawSectionHeading("SALES STATEMENT PERFORMANCE");
      drawTableRow("Total Invoices Processed", String(ss.totalInvoices));
      drawTableRow("Total Gross Invoiced Sales", fmtCurrency(ss.totalGrossSales, currency));
      drawTableRow("Discounts Disbursed", fmtCurrency(ss.totalDiscounts, currency));
      drawTableRow("Tax / SST Collected", fmtCurrency(ss.totalTaxCollected, currency));
      drawDoubleUnderlineTotal("NET SETTLED SALES REVENUE", fmtCurrency(ss.totalNetSales, currency), `Avg Order: ${fmtCurrency(ss.avgOrderValue, currency)}`);

      y += 6;
      drawSectionHeading("RECENT SALES INVOICE REGISTER");
      drawGridHeader(["Invoice #", "Date", "Customer", "Tender", "Items", "Grand Total"]);
      ss.invoices.slice(0, 25).forEach((inv) => {
        checkPageBreak(8);
        drawGridRow([
          inv.invoiceNumber,
          inv.date.split(" ")[0],
          inv.customerName.length > 16 ? inv.customerName.slice(0, 16) + "..." : inv.customerName,
          inv.paymentMethod,
          String(inv.itemCount),
          fmtCurrency(inv.grandTotal, currency),
        ]);
      });
      break;
    }

    case "purchase_statement": {
      const ps = reportData.purchaseStatement;
      drawSectionHeading("PURCHASE PROCUREMENT SUMMARY");
      drawTableRow("Total Purchase Orders", String(ps.totalPurchasesCount));
      drawTableRow("Total Purchased Value", fmtCurrency(ps.totalPurchasedValue, currency));
      drawTableRow("Total Amount Paid to Suppliers", fmtCurrency(ps.totalAmountPaid, currency));
      drawDoubleUnderlineTotal("OUTSTANDING SUPPLIER PAYABLES", fmtCurrency(ps.totalOutstandingPayable, currency));

      y += 6;
      drawSectionHeading("PURCHASE ORDERS REGISTER");
      drawGridHeader(["PO #", "Supplier", "Date", "Items", "Total Cost", "Paid", "Balance Due"]);
      ps.orders.slice(0, 20).forEach((po) => {
        checkPageBreak(8);
        drawGridRow([
          po.purchaseOrderNumber,
          po.supplierName.length > 14 ? po.supplierName.slice(0, 14) + "..." : po.supplierName,
          po.date,
          String(po.totalItems),
          fmtCurrency(po.totalAmount, currency),
          fmtCurrency(po.amountPaid, currency),
          fmtCurrency(po.balanceDue, currency),
        ]);
      });
      break;
    }

    case "accounts_receivable": {
      const ar = reportData.accountsReceivable;
      drawSectionHeading("ACCOUNTS RECEIVABLE (AR) AGING OVERVIEW");
      drawTableRow("Total Active Trade Debtors", String(ar.totalActiveDebtors));
      drawTableRow("Current Balance (0 - 30 Days)", fmtCurrency(ar.totalCurrent0to30, currency));
      drawTableRow("Aging Past Due (31 - 60 Days)", fmtCurrency(ar.totalDays31to60, currency));
      drawTableRow("Aging Past Due (61 - 90 Days)", fmtCurrency(ar.totalDays61to90, currency));
      drawTableRow("Critical Overdue (> 90 Days)", fmtCurrency(ar.totalOver90Days, currency));
      drawDoubleUnderlineTotal("TOTAL RECEIVABLES OUTSTANDING", fmtCurrency(ar.totalReceivables, currency));

      y += 6;
      drawSectionHeading("DEBTOR BALANCES REGISTER");
      drawGridHeader(["Customer", "Phone", "0-30d", "31-60d", "61-90d", ">90d", "Total Due"]);
      ar.debtors.slice(0, 20).forEach((d) => {
        checkPageBreak(8);
        drawGridRow([
          d.name.length > 14 ? d.name.slice(0, 14) + "..." : d.name,
          d.phone,
          fmtCurrency(d.current0to30, currency),
          fmtCurrency(d.days31to60, currency),
          fmtCurrency(d.days61to90, currency),
          fmtCurrency(d.over90Days, currency),
          fmtCurrency(d.totalOutstanding, currency),
        ]);
      });
      break;
    }

    case "accounts_payable": {
      const ap = reportData.accountsPayable;
      drawSectionHeading("ACCOUNTS PAYABLE (AP) AGING OVERVIEW");
      drawTableRow("Total Creditors / Suppliers", String(ap.totalCreditorsCount));
      drawTableRow("Current Invoices (0 - 30 Days)", fmtCurrency(ap.totalCurrent0to30, currency));
      drawTableRow("Aging Due (31 - 60 Days)", fmtCurrency(ap.totalDays31to60, currency));
      drawTableRow("Aging Due (61 - 90 Days)", fmtCurrency(ap.totalDays61to90, currency));
      drawTableRow("Critical Overdue (> 90 Days)", fmtCurrency(ap.totalOver90Days, currency));
      drawDoubleUnderlineTotal("TOTAL PAYABLES OUTSTANDING", fmtCurrency(ap.totalPayables, currency));

      y += 6;
      drawSectionHeading("SUPPLIER CREDITOR REGISTER");
      drawGridHeader(["Supplier", "PO Ref", "Date", "Bill Amount", "Paid", "Balance Due"]);
      ap.creditors.slice(0, 20).forEach((c) => {
        checkPageBreak(8);
        drawGridRow([
          c.supplierName.length > 14 ? c.supplierName.slice(0, 14) + "..." : c.supplierName,
          c.purchaseOrderNumber,
          c.date,
          fmtCurrency(c.totalAmount, currency),
          fmtCurrency(c.amountPaid, currency),
          fmtCurrency(c.balanceDue, currency),
        ]);
      });
      break;
    }

    case "expense_statement": {
      const exp = reportData.expenseStatement;
      drawSectionHeading("OPERATING EXPENDITURE SUMMARY");
      drawTableRow("Total Recorded Operating Overheads", fmtCurrency(exp.totalExpenses, currency));
      drawTableRow("Tax-Deductible Business Expenses", fmtCurrency(exp.totalTaxDeductible, currency));

      y += 4;
      drawSectionHeading("EXPENSE CATEGORY DISTRIBUTION");
      exp.categorySummary.forEach((cat) => {
        drawTableRow(`${cat.category} (${cat.count} txns)`, fmtCurrency(cat.amount, currency), 14, `${cat.percentage}%`);
      });
      drawDoubleUnderlineTotal("TOTAL OPERATING EXPENSES", fmtCurrency(exp.totalExpenses, currency));

      y += 6;
      drawSectionHeading("ITEMIZED EXPENDITURE ENTRIES");
      drawGridHeader(["Ref #", "Date", "Category", "Vendor", "Tender", "Amount"]);
      exp.expenses.slice(0, 15).forEach((e) => {
        checkPageBreak(8);
        drawGridRow([
          e.expenseId,
          e.date,
          e.category.length > 16 ? e.category.slice(0, 16) + "..." : e.category,
          e.vendor.length > 14 ? e.vendor.slice(0, 14) + "..." : e.vendor,
          e.paymentMethod,
          fmtCurrency(e.amount, currency),
        ]);
      });
      break;
    }

    case "bank_cash_reconciliation": {
      const rec = reportData.bankCashReconciliation;
      drawSectionHeading("BANK & CASH DRAWER RECONCILIATION");
      drawTableRow("Total Expected Cash in Till Drawers", fmtCurrency(rec.totalExpectedCash, currency));
      drawTableRow("Total Physical Counted Cash", fmtCurrency(rec.totalActualCash, currency));
      drawTableRow("Net Till Discrepancy (Over / Short)", fmtCurrency(rec.totalCashVariance, currency));
      drawTableRow("Total Digital Settlements (Card, QR, Bank)", fmtCurrency(rec.totalDigitalSettlements, currency));
      drawDoubleUnderlineTotal("RECONCILIATION SESSIONS STATUS", `${rec.balancedSessionsCount} Balanced / ${rec.discrepantSessionsCount} Discrepancies`);

      y += 6;
      drawSectionHeading("DRAWER SHIFT SESSIONS");
      drawGridHeader(["Session ID", "Date", "Register", "Opening Float", "Cash Sales", "Variance", "Status"]);
      rec.sessions.forEach((s) => {
        checkPageBreak(8);
        drawGridRow([
          s.sessionId,
          s.date,
          s.registerId,
          fmtCurrency(s.openingFloat, currency),
          fmtCurrency(s.cashSales, currency),
          fmtCurrency(s.variance, currency),
          s.status,
        ]);
      });
      break;
    }
  }

  // Draw Signature / Sign-off block at bottom
  checkPageBreak(30);
  y += 10;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, margin + 55, y);
  doc.line(pageWidth - margin - 55, y, pageWidth - margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Prepared By: Accounting Operator", margin, y + 5);
  doc.text("Approved By: Managing Director", pageWidth - margin, y + 5, { align: "right" });

  // Add Page Numbers
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Official Accounting Document | ${reportTitle} | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  // Save PDF
  const filename = `${reportType}_${(reportData.shopName || "shop").replace(/\s+/g, "_")}_${reportData.dateFilter.endDate}.pdf`;
  doc.save(filename);

  // Helper Drawing Functions
  function drawSectionHeading(title: string) {
    checkPageBreak(12);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(title, margin + 3, y + 4.2);
    y += 8;
  }

  function drawTableRow(label: string, value: string, indent: number = margin + 3, badge?: string) {
    checkPageBreak(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(label, indent, y + 4);

    if (badge) {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(badge, pageWidth - margin - 40, y + 4, { align: "right" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(value, pageWidth - margin - 3, y + 4, { align: "right" });

    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 5.5, pageWidth - margin, y + 5.5);
    y += 6;
  }

  function drawTotalRow(label: string, value: string, badge?: string) {
    checkPageBreak(7);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 6.5, "F");
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(label, margin + 3, y + 4.5);

    if (badge) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(badge, pageWidth - margin - 42, y + 4.5, { align: "right" });
    }

    doc.setFont("helvetica", "bold");
    doc.text(value, pageWidth - margin - 3, y + 4.5, { align: "right" });
    y += 8;
  }

  function drawDoubleUnderlineTotal(label: string, value: string, badge?: string) {
    checkPageBreak(9);
    doc.setFillColor(238, 242, 255); // Indigo tint
    doc.rect(margin, y, contentWidth, 7.5, "F");
    doc.setDrawColor(79, 70, 229);
    doc.line(margin, y, pageWidth - margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(49, 46, 129);
    doc.text(label, margin + 3, y + 5.2);

    if (badge) {
      doc.setFontSize(7.5);
      doc.setTextColor(79, 70, 229);
      doc.text(badge, pageWidth - margin - 45, y + 5.2, { align: "right" });
    }

    doc.setFontSize(9.5);
    doc.text(value, pageWidth - margin - 3, y + 5.2, { align: "right" });

    // Double underline
    doc.setDrawColor(79, 70, 229);
    doc.line(pageWidth - margin - 50, y + 6.5, pageWidth - margin, y + 6.5);
    doc.line(pageWidth - margin - 50, y + 7.2, pageWidth - margin, y + 7.2);

    y += 10;
  }

  function drawGridHeader(columns: string[]) {
    checkPageBreak(7);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const colWidth = contentWidth / columns.length;
    columns.forEach((col, idx) => {
      const align = idx >= columns.length - 2 ? "right" : "left";
      const x = align === "right" ? margin + (idx + 1) * colWidth - 2 : margin + idx * colWidth + 2;
      doc.text(col, x, y + 4.2, { align });
    });
    y += 6.5;
  }

  function drawGridRow(values: string[]) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);

    const colWidth = contentWidth / values.length;
    values.forEach((val, idx) => {
      const align = idx >= values.length - 2 ? "right" : "left";
      const x = align === "right" ? margin + (idx + 1) * colWidth - 2 : margin + idx * colWidth + 2;
      doc.text(val, x, y + 3.8, { align });
    });

    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 5, pageWidth - margin, y + 5);
    y += 5.5;
  }

  function drawDoubleUnderlineGridTotal(values: string[]) {
    checkPageBreak(8);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setDrawColor(148, 163, 184);
    doc.line(margin, y, pageWidth - margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    const colWidth = contentWidth / values.length;
    values.forEach((val, idx) => {
      const align = idx >= values.length - 2 ? "right" : "left";
      const x = align === "right" ? margin + (idx + 1) * colWidth - 2 : margin + idx * colWidth + 2;
      doc.text(val, x, y + 4.8, { align });
    });

    doc.line(margin, y + 6.2, pageWidth - margin, y + 6.2);
    doc.line(margin, y + 6.8, pageWidth - margin, y + 6.8);
    y += 9;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. EXCEL EXPORT IMPLEMENTATION
// ─────────────────────────────────────────────────────────────

export function exportAccountingReportToExcel(options: ReportExportOptions): void {
  const { reportType, reportTitle, reportData } = options;
  const wb = XLSX.utils.book_new();

  // Common Header Metadata
  const metaRows = [
    ["REPORT TITLE", reportTitle.toUpperCase()],
    ["SHOP / BRANCH", reportData.shopName || "All Shops"],
    ["REPORTING PERIOD", reportData.dateFilter.label],
    ["DATE RANGE", `${reportData.dateFilter.startDate} to ${reportData.dateFilter.endDate}`],
    ["GENERATED AT", new Date(reportData.generatedAt).toLocaleString()],
    [], // Blank separator
  ];

  let sheetData: unknown[] = [];

  switch (reportType) {
    case "pnl": {
      const p = reportData.pnl;
      sheetData = [
        ...metaRows,
        ["ACCOUNT CATEGORY", "AMOUNT (LKR)", "NOTES / RATIO"],
        ["REVENUE CHANNELS", "", ""],
        ["  Product Invoices Revenue (Sales revenue)", p.netRevenue > 0 ? p.netRevenue : p.grossSales, ""],
        ["  Wholesale cost of goods sold (COGS)", -p.cogs, ""],
        ["GROSS PROFIT", p.grossProfit, `${p.grossMarginPct.toFixed(1)}% Margin`],
        [],
        ["OPERATING EXPENSES (OPEX)", "", ""],
        ...p.operatingExpenses.map((e) => [`  ${e.category}`, -e.amount, `${e.pctOfRevenue.toFixed(1)}% Revenue`]),
        ["TOTAL OPEX", -p.totalOperatingExpenses, ""],
        [],
        ["NET EARNINGS", "", ""],
        ["NET BUSINESS PROFIT (Profit after listed expenses)", p.netProfit, `${p.netMarginPct.toFixed(1)}% Margin`],
      ];
      break;
    }

    case "balance_sheet": {
      const b = reportData.balanceSheet;
      sheetData = [
        ...metaRows,
        ["ACCOUNT HEAD", "AMOUNT (LKR)", "CLASSIFICATION"],
        ["CURRENT ASSETS", "", ""],
        ...b.currentAssets.map((a) => [`${a.accountCode} - ${a.name}`, a.amount, a.notes || "Current Asset"]),
        ["TOTAL CURRENT ASSETS", b.totalCurrentAssets, ""],
        [],
        ["NON-CURRENT ASSETS", "", ""],
        ...b.nonCurrentAssets.map((a) => [`${a.accountCode} - ${a.name}`, a.amount, a.notes || "Non-Current Asset"]),
        ["TOTAL NON-CURRENT ASSETS", b.totalNonCurrentAssets, ""],
        ["TOTAL ASSETS", b.totalAssets, ""],
        [],
        ["CURRENT LIABILITIES", "", ""],
        ...b.currentLiabilities.map((l) => [`${l.accountCode} - ${l.name}`, l.amount, l.notes || "Current Liability"]),
        ["TOTAL CURRENT LIABILITIES", b.totalCurrentLiabilities, ""],
        [],
        ["NON-CURRENT LIABILITIES", "", ""],
        ...b.nonCurrentLiabilities.map((l) => [`${l.accountCode} - ${l.name}`, l.amount, l.notes || "Non-Current Liability"]),
        ["TOTAL LIABILITIES", b.totalLiabilities, ""],
        [],
        ["OWNER'S EQUITY", "", ""],
        ...b.equityItems.map((e) => [`${e.accountCode} - ${e.name}`, e.amount, e.notes || "Equity"]),
        ["TOTAL EQUITY", b.totalEquity, ""],
        ["TOTAL LIABILITIES & EQUITY", b.totalLiabilitiesAndEquity, b.isBalanced ? "BALANCED" : `Variance: ${b.variance}`],
      ];
      break;
    }

    case "cash_flow": {
      const cf = reportData.cashFlow;
      sheetData = [
        ...metaRows,
        ["CASH FLOW ACTIVITY", "CASH FLOW (LKR)"],
        ["OPERATING ACTIVITIES", ""],
        ...cf.operatingActivities.map((a) => [a.name, a.amount]),
        ["NET CASH FROM OPERATING ACTIVITIES", cf.netOperatingCashFlow],
        [],
        ["INVESTING ACTIVITIES", ""],
        ...cf.investingActivities.map((a) => [a.name, a.amount]),
        ["NET CASH FROM INVESTING ACTIVITIES", cf.netInvestingCashFlow],
        [],
        ["FINANCING ACTIVITIES", ""],
        ...cf.financingActivities.map((a) => [a.name, a.amount]),
        ["NET CASH FROM FINANCING ACTIVITIES", cf.netFinancingCashFlow],
        [],
        ["CASH SUMMARY RECONCILIATION", ""],
        ["Net Period Change in Cash", cf.netChangeInCash],
        ["Beginning Cash & Bank Float", cf.beginningCashBalance],
        ["ENDING CASH & BANK BALANCE", cf.endingCashBalance],
      ];
      break;
    }

    case "trial_balance": {
      const tb = reportData.trialBalance;
      sheetData = [
        ...metaRows,
        ["CODE", "ACCOUNT TITLE", "CLASSIFICATION", "DEBIT (LKR)", "CREDIT (LKR)"],
        ...tb.rows.map((r) => [r.code, r.name, r.category, r.debit || 0, r.credit || 0]),
        [],
        ["TOTAL", "VERIFICATION", tb.isBalanced ? "BALANCED" : "DISCREPANCY", tb.totalDebits, tb.totalCredits],
      ];
      break;
    }

    case "sales_statement": {
      const ss = reportData.salesStatement;
      sheetData = [
        ...metaRows,
        ["INVOICE #", "DATE & TIME", "CUSTOMER", "CASHIER", "METHOD", "ITEMS", "SUBTOTAL (LKR)", "DISCOUNT (LKR)", "TAX (LKR)", "TOTAL (LKR)", "STATUS"],
        ...ss.invoices.map((i) => [
          i.invoiceNumber,
          i.date,
          i.customerName,
          i.cashierName,
          i.paymentMethod,
          i.itemCount,
          i.subtotal,
          i.discount,
          i.taxAmount,
          i.grandTotal,
          i.status,
        ]),
        [],
        ["TOTALS", "", "", "", "", ss.totalInvoices, "", ss.totalDiscounts, ss.totalTaxCollected, ss.totalNetSales, "COMPLETED"],
      ];
      break;
    }

    case "inventory_valuation": {
      const iv = reportData.inventoryValuation;
      sheetData = [
        ...metaRows,
        ["SKU", "ITEM NAME", "CATEGORY", "STOCK QTY", "UNIT COST", "UNIT PRICE", "TOTAL COST VALUATION", "TOTAL RETAIL VALUATION", "POTENTIAL PROFIT", "MARGIN %", "HEALTH"],
        ...iv.items.map((it) => [
          it.sku,
          it.name,
          it.category,
          it.stockQty,
          it.unitCost,
          it.unitPrice,
          it.totalCostValuation,
          it.totalRetailValuation,
          it.potentialProfit,
          it.marginPct,
          it.stockHealth,
        ]),
        [],
        ["TOTALS", `${iv.totalSkus} SKUs`, "", iv.totalUnits, "", "", iv.totalCostValue, iv.totalRetailValue, iv.potentialTotalProfit, iv.overallMarginPct, ""],
      ];
      break;
    }

    case "purchase_statement": {
      const ps = reportData.purchaseStatement;
      sheetData = [
        ...metaRows,
        ["PO NUMBER", "SUPPLIER INVOICE #", "SUPPLIER NAME", "DATE", "PURCHASE STATUS", "PAYMENT STATUS", "ITEMS", "SUBTOTAL", "TAX", "SHIPPING", "TOTAL AMOUNT", "AMOUNT PAID", "BALANCE DUE"],
        ...ps.orders.map((p) => [
          p.purchaseOrderNumber,
          p.supplierInvoiceNumber,
          p.supplierName,
          p.date,
          p.purchaseStatus,
          p.paymentStatus,
          p.totalItems,
          p.subtotal,
          p.taxAmount,
          p.shippingCost,
          p.totalAmount,
          p.amountPaid,
          p.balanceDue,
        ]),
        [],
        ["TOTALS", "", `${ps.totalPurchasesCount} Orders`, "", "", "", "", "", ps.totalTaxPaid, "", ps.totalPurchasedValue, ps.totalAmountPaid, ps.totalOutstandingPayable],
      ];
      break;
    }

    case "accounts_receivable": {
      const ar = reportData.accountsReceivable;
      sheetData = [
        ...metaRows,
        ["CUSTOMER NAME", "PHONE", "LIFETIME SPEND", "0 - 30 DAYS", "31 - 60 DAYS", "61 - 90 DAYS", "> 90 DAYS", "TOTAL OUTSTANDING", "STATUS"],
        ...ar.debtors.map((d) => [
          d.name,
          d.phone,
          d.lifetimeSpend,
          d.current0to30,
          d.days31to60,
          d.days61to90,
          d.over90Days,
          d.totalOutstanding,
          d.status,
        ]),
        [],
        ["TOTALS", `${ar.totalActiveDebtors} Debtors`, "", ar.totalCurrent0to30, ar.totalDays31to60, ar.totalDays61to90, ar.totalOver90Days, ar.totalReceivables, ""],
      ];
      break;
    }

    case "accounts_payable": {
      const ap = reportData.accountsPayable;
      sheetData = [
        ...metaRows,
        ["SUPPLIER NAME", "PO NUMBER", "SUPPLIER BILL #", "DATE", "DUE DATE", "BILL TOTAL", "AMOUNT PAID", "BALANCE DUE", "0-30d", "31-60d", "61-90d", ">90d", "STATUS"],
        ...ap.creditors.map((c) => [
          c.supplierName,
          c.purchaseOrderNumber,
          c.supplierInvoiceNumber,
          c.date,
          c.dueDate,
          c.totalAmount,
          c.amountPaid,
          c.balanceDue,
          c.current0to30,
          c.days31to60,
          c.days61to90,
          c.over90Days,
          c.paymentStatus,
        ]),
        [],
        ["TOTALS", `${ap.totalCreditorsCount} Creditors`, "", "", "", "", "", ap.totalPayables, ap.totalCurrent0to30, ap.totalDays31to60, ap.totalDays61to90, ap.totalOver90Days, ""],
      ];
      break;
    }

    case "expense_statement": {
      const exp = reportData.expenseStatement;
      sheetData = [
        ...metaRows,
        ["EXPENSE ID", "DATE", "CATEGORY", "DESCRIPTION", "VENDOR", "TENDER METHOD", "AMOUNT (LKR)", "TAX DEDUCTIBLE", "RECORDED BY"],
        ...exp.expenses.map((e) => [
          e.expenseId,
          e.date,
          e.category,
          e.description,
          e.vendor,
          e.paymentMethod,
          e.amount,
          e.isTaxDeductible ? "YES" : "NO",
          e.recordedBy,
        ]),
        [],
        ["TOTAL EXPENSES", "", "", "", "", "", exp.totalExpenses, `Tax Deductible: ${exp.totalTaxDeductible}`, ""],
      ];
      break;
    }

    case "bank_cash_reconciliation": {
      const rec = reportData.bankCashReconciliation;
      sheetData = [
        ...metaRows,
        ["SESSION ID", "DATE", "REGISTER", "CASHIER", "OPENING FLOAT", "CASH SALES", "REFUNDS", "PAYOUTS", "EXPECTED TILL", "ACTUAL TILL", "VARIANCE", "CARD SETTLED", "STATUS"],
        ...rec.sessions.map((s) => [
          s.sessionId,
          s.date,
          s.registerId,
          s.cashierName,
          s.openingFloat,
          s.cashSales,
          s.cashRefunds,
          s.cashPayouts,
          s.expectedCash,
          s.actualCash,
          s.variance,
          s.cardSettlement,
          s.status,
        ]),
        [],
        ["TOTALS", "", "", "", "", "", "", "", rec.totalExpectedCash, rec.totalActualCash, rec.totalCashVariance, rec.totalDigitalSettlements, `${rec.balancedSessionsCount} Balanced`],
      ];
      break;
    }

    case "tax_statement": {
      const tx = reportData.taxStatement;
      sheetData = [
        ...metaRows,
        ["SST TAX METRIC", "AMOUNT (LKR)", "NOTES"],
        ["SST Output Tax (Sales)", tx.sstOutputTax, "Collected on customer invoices"],
        ["SST Input Tax (Purchases)", -tx.sstInputTax, "Paid on supplier purchases"],
        ["NET SST PAYABLE / (REFUNDABLE)", tx.netSSTPayable, `Effective Rate: ${tx.effectiveTaxRatePct}%`],
        [],
        ["TAX TURNOVER BASE", "", ""],
        ["Taxable Sales Turnover", tx.taxableSalesAmount, ""],
        ["Tax-Exempt / Zero-Rated Sales", tx.taxExemptSalesAmount, ""],
        [],
        ["REFERENCE #", "DATE", "TYPE", "COUNTERPARTY", "TAX RATE %", "TAXABLE BASE (LKR)", "SST AMOUNT (LKR)", "STATUS"],
        ...tx.transactions.map((t) => [
          t.referenceNumber,
          t.date,
          t.type,
          t.counterparty,
          t.taxRatePct,
          t.taxableAmount,
          t.taxAmount,
          t.status,
        ]),
      ];
      break;
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData as (string | number)[][]);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Financial Report");

  const filename = `${reportType}_${(reportData.shopName || "shop").replace(/\s+/g, "_")}_${reportData.dateFilter.endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}
