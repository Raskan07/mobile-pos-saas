"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  CheckCircle2,
  Building2,
  Wrench,
  FileCheck2,
} from "lucide-react";
import {
  AccountingReportType,
  MasterAccountingReportsData,
} from "@/lib/types/accountingReport";

interface FinancialStatementsViewProps {
  reportType: AccountingReportType;
  reportTitle: string;
  reportData: MasterAccountingReportsData;
  operatorName?: string;
  currency?: string;
}

const fmt = (val: number, cur: string = "LKR") => {
  const num = Number(val) || 0;
  const isNeg = num < 0;
  const formatted = Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNeg ? `- ${cur} ${formatted}` : `${cur} ${formatted}`;
};

const REPORT_DOC_CODES: Record<AccountingReportType, string> = {
  pnl: "FIN-STMT-01 • INCOME STATEMENT",
  balance_sheet: "FIN-STMT-02 • STATEMENT OF FINANCIAL POSITION",
  cash_flow: "FIN-STMT-03 • STATEMENT OF CASH FLOWS",
  trial_balance: "GL-STMT-04 • TRIAL BALANCE & GENERAL LEDGER",
  tax_statement: "TAX-STMT-05 • SST TAX RETURN SCHEDULE",
  sales_statement: "OPS-STMT-06 • SALES REVENUE REGISTER",
  repair_statement: "OPS-STMT-07 • WORKSHOP REPAIR COST & REVENUE STATEMENT",
  inventory_valuation: "OPS-STMT-08 • STOCK VALUATION SCHEDULE",
  purchase_statement: "OPS-STMT-09 • SUPPLIER PROCUREMENT REGISTER",
  accounts_receivable: "WC-STMT-10 • ACCOUNTS RECEIVABLE AGING",
  accounts_payable: "WC-STMT-11 • ACCOUNTS PAYABLE AGING",
  expense_statement: "OPS-STMT-12 • OPERATING EXPENSE SCHEDULE",
  bank_cash_reconciliation: "GL-STMT-13 • BANK & TILL RECONCILIATION",
};

export default function FinancialStatementsView({
  reportType,
  reportTitle,
  reportData,
  operatorName = "Admin",
  currency = "LKR",
}: FinancialStatementsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const generatedDateLabel = useMemo(() => {
    try {
      return new Date(reportData.generatedAt || Date.now()).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  }, [reportData.generatedAt]);

  return (
    <div className="w-full py-2 sm:py-4">
      {/* ── Physical Stacked Paper Sheet Wrapper (Only for Statements) ── */}
      <div className="relative max-w-6xl mx-auto">
        {/* Bottom-most paper sheet edge */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute -bottom-2.5 inset-x-4 h-6 rounded-b-sm bg-[#efede6] border border-stone-300/80 shadow-md pointer-events-none"
        />
        {/* Middle paper sheet edge */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute -bottom-1.5 inset-x-2 h-6 rounded-b-sm bg-[#f7f5f0] border border-stone-300/90 shadow-md pointer-events-none"
        />

        {/* Primary White Accounting Paper Sheet */}
        <div
          className="relative bg-[#fffefb] text-slate-900 rounded-sm border border-stone-300/90 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_22px_55px_-10px_rgba(0,0,0,0.6)] overflow-hidden"
          style={{
            backgroundImage:
              "radial-gradient(rgba(15, 23, 42, 0.025) 1px, transparent 0), linear-gradient(to bottom, rgba(255,255,255,0.96), rgba(252,251,247,0.98))",
            backgroundSize: "18px 18px, 100% 100%",
          }}
        >
          {/* Subtle Top Paper Binding / Ledger Accent Strip */}
          <div className="h-1.5 w-full bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />

          {/* Paper Sheet Content Padding */}
          <div className="p-5 sm:p-8 lg:p-10 space-y-6">
            {/* ── Official Accounting Statement Letterhead ── */}
            <div className="pb-5 border-b-2 border-slate-900 relative">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                {/* Left: Organization & Statement Title */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    <Building2 className="w-3.5 h-3.5 text-slate-700" />
                    <span>{reportData.shopName || "Store"}</span>
                    {reportData.shopId && (
                      <span className="font-mono text-[10px] text-slate-400">
                        ({reportData.shopId})
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
                    {reportTitle}
                  </h2>
                  <p className="text-xs font-medium text-slate-600">
                    Reporting Period:{" "}
                    <span className="font-bold text-slate-900">
                      {reportData.dateFilter.label}
                    </span>
                  </p>
                </div>

                {/* Right: Official Document Metadata Box */}
                <div className="sm:text-right bg-stone-50/90 border border-stone-200/90 rounded px-3.5 py-2.5 text-[11px] space-y-1 shrink-0">
                  <div className="font-mono font-bold text-[10px] uppercase tracking-wider text-slate-700">
                    {REPORT_DOC_CODES[reportType]}
                  </div>
                  <div className="text-slate-500 flex sm:justify-end items-center gap-3">
                    <span>
                      Currency: <strong className="text-slate-800 font-mono">{currency}</strong>
                    </span>
                    <span>&bull;</span>
                    <span>
                      Date: <strong className="text-slate-800 font-mono">{generatedDateLabel}</strong>
                    </span>
                  </div>
                  <div className="text-slate-500">
                    Prepared By: <strong className="text-slate-800">{operatorName}</strong>
                  </div>
                </div>
              </div>
              {/* Classic second thin rule underneath thick rule for accounting paper feel */}
              <div className="absolute -bottom-[5px] inset-x-0 h-[1px] bg-slate-400" />
            </div>

            {/* ── Render Statement Body on Paper ── */}
            <div className="pt-1">
              {reportType === "pnl" && (
                <PnLView
                  data={reportData.pnl}
                  currency={currency}
                  shopName={reportData.shopName}
                  periodLabel={reportData.dateFilter.label}
                />
              )}
              {reportType === "balance_sheet" && (
                <BalanceSheetView data={reportData.balanceSheet} currency={currency} />
              )}
              {reportType === "cash_flow" && (
                <CashFlowView data={reportData.cashFlow} currency={currency} />
              )}
              {reportType === "trial_balance" && (
                <TrialBalanceView data={reportData.trialBalance} currency={currency} />
              )}
              {reportType === "tax_statement" && (
                <TaxStatementView
                  data={reportData.taxStatement}
                  currency={currency}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              )}
              {reportType === "sales_statement" && (
                <SalesStatementView
                  data={reportData.salesStatement}
                  currency={currency}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              )}
              {reportType === "repair_statement" && (
                <RepairStatementView
                  data={reportData.repairStatement}
                  currency={currency}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              )}
              {reportType === "inventory_valuation" && (
                <InventoryValuationView
                  data={reportData.inventoryValuation}
                  currency={currency}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              )}
              {reportType === "purchase_statement" && (
                <PurchaseStatementView
                  data={reportData.purchaseStatement}
                  currency={currency}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              )}
              {reportType === "accounts_receivable" && (
                <AccountsReceivableView
                  data={reportData.accountsReceivable}
                  currency={currency}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              )}
              {reportType === "accounts_payable" && (
                <AccountsPayableView
                  data={reportData.accountsPayable}
                  currency={currency}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              )}
              {reportType === "expense_statement" && (
                <ExpenseStatementView data={reportData.expenseStatement} currency={currency} />
              )}
              {reportType === "bank_cash_reconciliation" && (
                <BankCashReconciliationView
                  data={reportData.bankCashReconciliation}
                  currency={currency}
                />
              )}
            </div>

            {/* ── Official Accounting Paper Footer & Attestation ── */}
            <div className="pt-8 mt-8 border-t border-stone-300 flex flex-col sm:flex-row sm:items-end justify-between gap-6 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-slate-600 shrink-0" />
                <span>
                  Official Computer-Generated Financial Statement &bull;{" "}
                  <strong className="text-slate-700">{reportData.shopName || "Store"}</strong>
                </span>
              </div>
              <div className="flex items-center gap-8">
                <div className="border-t border-slate-400 pt-1 min-w-[130px] text-center">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-600">
                    Prepared By ({operatorName})
                  </span>
                </div>
                <div className="border-t border-slate-400 pt-1 min-w-[130px] text-center">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-600">
                    Authorized Signatory
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. Profit & Loss View (Income Statement - Paper Sheet Format)
// ─────────────────────────────────────────────────────────────
function PnLView({
  data,
  currency = "LKR",
  shopName,
  periodLabel,
}: {
  data: MasterAccountingReportsData["pnl"];
  currency: string;
  shopName?: string;
  periodLabel?: string;
}) {
  const activeProductRevenue =
    data.productSalesRevenue !== undefined
      ? data.productSalesRevenue
      : data.netRevenue - (data.repairServiceRevenue || 0);

  const activeRepairRevenue = data.repairServiceRevenue || 0;
  const activeTotalRevenue = data.netRevenue || 0;

  const activeProductCogs =
    data.productCogs !== undefined
      ? data.productCogs
      : Math.max(0, (data.cogs || 0) - (data.repairPartsCost || 0));
  const activeRepairPartsCost = data.repairPartsCost || 0;
  const activeGrossProfit = data.grossProfit || 0;

  const activeExpenses =
    data.operatingExpenses && data.operatingExpenses.length > 0
      ? data.operatingExpenses.map((e) => ({
          category: e.category,
          subCategory: e.category,
          amount: e.amount,
        }))
      : [];

  const activeTotalOpex = data.totalOperatingExpenses || 0;
  const activeNetProfit = data.netProfit || 0;

  const formatAmt = (val: number, curPrefix: string = "Rs") => {
    const isNeg = val < 0;
    const abs = Math.abs(val);
    const formatted =
      abs % 1 === 0
        ? abs.toLocaleString("en-US")
        : abs.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    return isNeg ? `- ${curPrefix} ${formatted}` : `${curPrefix} ${formatted}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Section 1: Revenue Channels */}
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-stone-300 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>REVENUE CHANNELS &amp; DIRECT COST OF SALES</span>
          <span>AMOUNT ({currency})</span>
        </div>

        {/* Row 1: Product Invoices Revenue */}
        <div className="border-b border-stone-200 py-3.5 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-slate-800">
              Product Invoices Revenue
            </span>
            <span className="text-[11px] text-slate-500 ml-2 font-normal">
              (Retail product sales)
            </span>
          </div>
          <span className="text-sm font-semibold font-mono text-slate-900">
            {formatAmt(activeProductRevenue)}
          </span>
        </div>

        {/* Row 1b: Workshop Repair & Service Revenue */}
        <div className="border-b border-stone-200 py-3.5 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-teal-800">
              Workshop Repair &amp; Service Revenue
            </span>
            <span className="text-[11px] text-slate-500 ml-2 font-normal">
              (Repair jobs, replacement parts &amp; labor)
            </span>
          </div>
          <span className="text-sm font-semibold font-mono text-teal-800">
            {formatAmt(activeRepairRevenue)}
          </span>
        </div>

        {/* Subtotal: Total Net Revenue */}
        {activeRepairRevenue > 0 && (
          <div className="border-b border-stone-300 py-2.5 flex items-center justify-between bg-stone-100/80 px-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Total Net Revenue
            </span>
            <span className="text-sm font-bold font-mono text-slate-900">
              {formatAmt(activeTotalRevenue)}
            </span>
          </div>
        )}

        {/* Row 2: Wholesale cost of goods sold (COGS) */}
        <div className="border-b border-stone-200 py-3.5 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-slate-800">
              Wholesale cost of goods sold (COGS)
            </span>
            <span className="text-[11px] text-slate-500 ml-2 font-normal">
              (Less: Product COGS)
            </span>
          </div>
          <span className="text-sm font-semibold font-mono text-rose-700">
            {activeProductCogs > 0
              ? `- ${formatAmt(activeProductCogs).replace("- ", "")}`
              : formatAmt(0)}
          </span>
        </div>

        {/* Row 2b: Repair Replacement Parts & Component Cost */}
        <div className="border-b border-stone-200 py-3.5 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-slate-800">
              Repair replacement parts &amp; component cost
            </span>
            <span className="text-[11px] text-slate-500 ml-2 font-normal">
              (Less: Repair parts COGS)
            </span>
          </div>
          <span className="text-sm font-semibold font-mono text-rose-700">
            {activeRepairPartsCost > 0
              ? `- ${formatAmt(activeRepairPartsCost).replace("- ", "")}`
              : formatAmt(0)}
          </span>
        </div>

        {/* Row 3: GROSS PROFIT */}
        <div className="py-4 px-2.5 bg-stone-100/70 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-900">
            GROSS PROFIT
          </span>
          <span className="text-sm sm:text-base font-extrabold font-mono text-slate-900">
            {formatAmt(activeGrossProfit)}
          </span>
        </div>
      </div>

      {/* Solid Accounting Separator Line */}
      <div className="h-[2px] bg-slate-900 my-6" />

      {/* Section 2: Operating Expenses (OPEX) */}
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-stone-300 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>OPERATING EXPENSES (OPEX)</span>
          <span>AMOUNT ({currency})</span>
        </div>

        <div className="divide-y divide-stone-200">
          {activeExpenses.length === 0 ? (
            <div className="py-4 text-xs text-slate-500 italic">
              No operating or salary expenses recorded in Firestore for this period.
            </div>
          ) : (
            activeExpenses.map((exp, idx) => (
              <div key={idx} className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-slate-800">
                    {exp.category}
                  </span>
                  {exp.subCategory && exp.subCategory !== exp.category && (
                    <span className="text-[11px] text-slate-500 ml-2 font-normal">
                      ({exp.subCategory})
                    </span>
                  )}
                </div>
                <span className="text-sm font-mono text-slate-900">
                  {formatAmt(exp.amount)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Row: TOTAL OPEX */}
        <div className="pt-4 pb-3 px-2.5 bg-stone-100/70 border-t border-stone-300 flex items-center justify-between mt-2">
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-900">
            TOTAL OPEX
          </span>
          <span className="text-sm sm:text-base font-extrabold font-mono text-slate-900">
            {activeTotalOpex > 0
              ? `- ${formatAmt(activeTotalOpex).replace("- ", "")}`
              : formatAmt(0)}
          </span>
        </div>
      </div>

      {/* Double-ruled Net Profit Box */}
      <div className="mt-6 pt-4 pb-4 px-4 bg-emerald-50/70 border-t-2 border-b-4 border-double border-slate-900 flex items-center justify-between">
        <div>
          <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-800">
            NET BUSINESS PROFIT
          </span>
          <span className="text-xs text-slate-600 block mt-0.5">
            Net earnings after direct costs and operating expenses ({shopName || "Store"} &bull; {periodLabel || "Current Period"})
          </span>
        </div>
        <span className="text-base sm:text-xl font-black font-mono tracking-tight text-emerald-800">
          {formatAmt(activeNetProfit)} {currency}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. Balance Sheet View
// ─────────────────────────────────────────────────────────────
function BalanceSheetView({ data, currency }: { data: MasterAccountingReportsData["balanceSheet"]; currency: string }) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Assets" value={fmt(data.totalAssets, currency)} sub="Current & equipment" color="text-sky-800" />
        <KpiCard label="Total Liabilities" value={fmt(data.totalLiabilities, currency)} sub="Payables & SST tax" color="text-amber-800" />
        <KpiCard label="Owner's Equity" value={fmt(data.totalEquity, currency)} sub="Capital & retained earnings" color="text-indigo-800" />
        <KpiCard
          label="Balance Verification"
          value={data.isBalanced ? "BALANCED" : "DISCREPANCY"}
          sub={data.isBalanced ? "Assets = Liab + Equity" : `Variance: ${fmt(data.variance, currency)}`}
          color={data.isBalanced ? "text-emerald-800" : "text-rose-700"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets Column */}
        <div className="rounded border border-stone-300 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Assets (As of {data.asOfDate})
            </h3>
          </div>
          <div className="divide-y divide-stone-200 text-xs">
            <SectionHeaderRow title="Current Assets" />
            {data.currentAssets.map((a, i) => (
              <StatementDataRow key={i} label={`${a.accountCode} - ${a.name}`} value={fmt(a.amount, currency)} badge={a.notes} />
            ))}
            <SubtotalRow label="Total Current Assets" value={fmt(data.totalCurrentAssets, currency)} />

            <SectionHeaderRow title="Non-Current Assets" />
            {data.nonCurrentAssets.map((a, i) => (
              <StatementDataRow key={i} label={`${a.accountCode} - ${a.name}`} value={fmt(a.amount, currency)} badge={a.notes} />
            ))}
            <SubtotalRow label="Total Non-Current Assets" value={fmt(data.totalNonCurrentAssets, currency)} />

            <GrandTotalRow label="TOTAL ASSETS" value={fmt(data.totalAssets, currency)} />
          </div>
        </div>

        {/* Liabilities & Equity Column */}
        <div className="rounded border border-stone-300 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Liabilities &amp; Owner&apos;s Equity
            </h3>
          </div>
          <div className="divide-y divide-stone-200 text-xs">
            <SectionHeaderRow title="Current Liabilities" />
            {data.currentLiabilities.map((l, i) => (
              <StatementDataRow key={i} label={`${l.accountCode} - ${l.name}`} value={fmt(l.amount, currency)} badge={l.notes} />
            ))}
            <SubtotalRow label="Total Current Liabilities" value={fmt(data.totalCurrentLiabilities, currency)} />

            <SectionHeaderRow title="Non-Current Liabilities" />
            {data.nonCurrentLiabilities.map((l, i) => (
              <StatementDataRow key={i} label={`${l.accountCode} - ${l.name}`} value={fmt(l.amount, currency)} badge={l.notes} />
            ))}
            <SubtotalRow label="Total Liabilities" value={fmt(data.totalLiabilities, currency)} />

            <SectionHeaderRow title="Owner's Equity" />
            {data.equityItems.map((e, i) => (
              <StatementDataRow key={i} label={`${e.accountCode} - ${e.name}`} value={fmt(e.amount, currency)} badge={e.notes} />
            ))}
            <SubtotalRow label="Total Owner's Equity" value={fmt(data.totalEquity, currency)} />

            <GrandTotalRow
              label="TOTAL LIABILITIES & EQUITY"
              value={fmt(data.totalLiabilitiesAndEquity, currency)}
              badge={data.isBalanced ? "MATCHED" : "VARIANCE"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. Cash Flow Statement View
// ─────────────────────────────────────────────────────────────
function CashFlowView({ data, currency }: { data: MasterAccountingReportsData["cashFlow"]; currency: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Operating Cash Flow"
          value={fmt(data.netOperatingCashFlow, currency)}
          sub="Core business cash"
          color={data.netOperatingCashFlow >= 0 ? "text-emerald-800" : "text-rose-700"}
        />
        <KpiCard label="Investing Cash Flow" value={fmt(data.netInvestingCashFlow, currency)} sub="Hardware & store fixtures" color="text-amber-800" />
        <KpiCard label="Financing Cash Flow" value={fmt(data.netFinancingCashFlow, currency)} sub="Drawings & loan payments" color="text-indigo-800" />
        <KpiCard label="Ending Cash Balance" value={fmt(data.endingCashBalance, currency)} sub="Liquid drawer & bank float" color="text-teal-800" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Statement of Cash Flows</h3>
        </div>
        <div className="divide-y divide-stone-200 text-xs">
          <SectionHeaderRow title="1. Cash Flow from Operating Activities" />
          {data.operatingActivities.map((a, i) => (
            <StatementDataRow key={i} label={a.name} value={fmt(a.amount, currency)} isDeduction={a.amount < 0} />
          ))}
          <SubtotalRow label="Net Cash from Operating Activities" value={fmt(data.netOperatingCashFlow, currency)} />

          <SectionHeaderRow title="2. Cash Flow from Investing Activities" />
          {data.investingActivities.map((a, i) => (
            <StatementDataRow key={i} label={a.name} value={fmt(a.amount, currency)} isDeduction={a.amount < 0} />
          ))}
          <SubtotalRow label="Net Cash from Investing Activities" value={fmt(data.netInvestingCashFlow, currency)} />

          <SectionHeaderRow title="3. Cash Flow from Financing Activities" />
          {data.financingActivities.map((a, i) => (
            <StatementDataRow key={i} label={a.name} value={fmt(a.amount, currency)} isDeduction={a.amount < 0} />
          ))}
          <SubtotalRow label="Net Cash from Financing Activities" value={fmt(data.netFinancingCashFlow, currency)} />

          <SectionHeaderRow title="4. Cash Reconciliation Summary" />
          <StatementDataRow label="Net Change in Cash for Period" value={fmt(data.netChangeInCash, currency)} />
          <StatementDataRow label="Beginning Cash & Bank Balance" value={fmt(data.beginningCashBalance, currency)} />
          <GrandTotalRow label="ENDING CASH & BANK BALANCE" value={fmt(data.endingCashBalance, currency)} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. Trial Balance View
// ─────────────────────────────────────────────────────────────
function TrialBalanceView({ data, currency }: { data: MasterAccountingReportsData["trialBalance"]; currency: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Debits" value={fmt(data.totalDebits, currency)} sub="All ledger debit balances" color="text-slate-900" />
        <KpiCard label="Total Credits" value={fmt(data.totalCredits, currency)} sub="All ledger credit balances" color="text-slate-900" />
        <KpiCard
          label="Status"
          value={data.isBalanced ? "BALANCED" : "DISCREPANCY"}
          sub={data.isBalanced ? "Debits = Credits" : `Variance: ${fmt(data.variance, currency)}`}
          color={data.isBalanced ? "text-emerald-800" : "text-rose-700"}
        />
        <KpiCard label="General Ledger Accounts" value={`${data.rows.length} Accounts`} sub="Double-entry schedule" color="text-indigo-800" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Trial Balance Account Register</h3>
          {data.isBalanced && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Balanced Double-Entry
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Account Title</th>
                <th className="px-5 py-3">Classification</th>
                <th className="px-5 py-3 text-right">Debit Balance</th>
                <th className="px-5 py-3 text-right">Credit Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-500">{r.code}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{r.name}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-slate-700 border border-stone-200">
                      {r.category}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-medium text-slate-900">
                    {r.debit > 0 ? fmt(r.debit, currency) : "-"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-medium text-slate-900">
                    {r.credit > 0 ? fmt(r.credit, currency) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-stone-100 font-extrabold text-slate-900 border-t-2 border-b-4 border-double border-slate-900">
              <tr>
                <td className="px-5 py-3.5" colSpan={3}>TOTAL TRIAL BALANCE</td>
                <td className="px-5 py-3.5 text-right font-mono">{fmt(data.totalDebits, currency)}</td>
                <td className="px-5 py-3.5 text-right font-mono">{fmt(data.totalCredits, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* General Ledger (GL) Activity & Movement Schedule */}
      {data.glSummaries && data.glSummaries.length > 0 && (
        <div className="rounded border border-stone-300 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                General Ledger (GL) Account Activity &amp; Movement Schedule
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Opening Balance + Period Debits / Credits = Closing Balance per Account
              </p>
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-600">
              {data.glSummaries.length} Active GL Accounts
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
                <tr>
                  <th className="px-4 py-3">GL Code</th>
                  <th className="px-4 py-3">Account Title</th>
                  <th className="px-4 py-3">Normal Bal.</th>
                  <th className="px-4 py-3 text-right">Opening Balance</th>
                  <th className="px-4 py-3 text-right">Period Debits</th>
                  <th className="px-4 py-3 text-right">Period Credits</th>
                  <th className="px-4 py-3 text-right">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-slate-800">
                {data.glSummaries.map((gl, idx) => (
                  <tr key={idx} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-500">{gl.code}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{gl.name}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          gl.normalBalance === "DEBIT"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {gl.normalBalance}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {gl.openingBalance !== 0 ? fmt(gl.openingBalance, currency) : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                      {gl.periodDebits > 0 ? fmt(gl.periodDebits, currency) : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                      {gl.periodCredits > 0 ? fmt(gl.periodCredits, currency) : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                      {fmt(gl.closingBalance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. SST Tax Statement View
// ─────────────────────────────────────────────────────────────
function TaxStatementView({
  data,
  currency,
  searchTerm,
  setSearchTerm,
}: {
  data: MasterAccountingReportsData["taxStatement"];
  currency: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data.transactions;
    const q = searchTerm.toLowerCase();
    return data.transactions.filter(
      (t) =>
        t.referenceNumber.toLowerCase().includes(q) ||
        t.counterparty.toLowerCase().includes(q)
    );
  }, [data.transactions, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="SST Output Tax" value={fmt(data.sstOutputTax, currency)} sub="Tax collected on sales" color="text-purple-800" />
        <KpiCard label="SST Input Tax" value={fmt(data.sstInputTax, currency)} sub="Tax paid on purchases" color="text-sky-800" />
        <KpiCard label="Net SST Payable" value={fmt(data.netSSTPayable, currency)} sub="Remittance to Customs" color="text-emerald-800" />
        <KpiCard label="Effective Tax Rate" value={`${data.effectiveTaxRatePct.toFixed(1)}%`} sub="Standard SST rate" color="text-slate-900" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-300 bg-stone-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">SST Tax Invoices Register</h3>
            <p className="text-xs text-slate-500 mt-0.5">Itemized output and input tax transactions</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ref # or counterparty..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-white border border-stone-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">Reference #</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Counterparty</th>
                <th className="px-5 py-3 text-right">Taxable Base</th>
                <th className="px-5 py-3 text-right">SST Amount</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {filtered.map((t, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-900">{t.referenceNumber}</td>
                  <td className="px-5 py-3 text-slate-500">{t.date}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        t.type === "OUTPUT_TAX"
                          ? "bg-purple-50 text-purple-800 border border-purple-200"
                          : "bg-sky-50 text-sky-800 border border-sky-200"
                      }`}
                    >
                      {t.type === "OUTPUT_TAX" ? "Sales (Output)" : "Purchase (Input)"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{t.counterparty}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmt(t.taxableAmount, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">{fmt(t.taxAmount, currency)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 6. Sales Statement View
// ─────────────────────────────────────────────────────────────
function SalesStatementView({
  data,
  currency,
  searchTerm,
  setSearchTerm,
}: {
  data: MasterAccountingReportsData["salesStatement"];
  currency: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data.invoices;
    const q = searchTerm.toLowerCase();
    return data.invoices.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q) ||
        i.paymentMethod.toLowerCase().includes(q)
    );
  }, [data.invoices, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Invoices" value={String(data.totalInvoices)} sub="Completed sales transactions" color="text-slate-900" />
        <KpiCard label="Gross Sales" value={fmt(data.totalGrossSales, currency)} sub="Before discounts & refunds" color="text-sky-800" />
        <KpiCard label="Net Settled Revenue" value={fmt(data.totalNetSales, currency)} sub="Total revenue realized" color="text-emerald-800" />
        <KpiCard label="Avg Order Value" value={fmt(data.avgOrderValue, currency)} sub="Ticket average" color="text-indigo-800" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-300 bg-stone-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Sales Invoices Register</h3>
            <p className="text-xs text-slate-500 mt-0.5">Showing {filtered.length} of {data.totalInvoices} invoices</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice, customer, method..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-white border border-stone-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">Invoice #</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Tender</th>
                <th className="px-5 py-3 text-right">Items</th>
                <th className="px-5 py-3 text-right">Subtotal</th>
                <th className="px-5 py-3 text-right">Grand Total</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {filtered.map((inv, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-900">{inv.invoiceNumber}</td>
                  <td className="px-5 py-3 text-slate-500">{inv.date}</td>
                  <td className="px-5 py-3 text-slate-700 font-medium">{inv.customerName}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-slate-700 border border-stone-200">
                      {inv.paymentMethod}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{inv.itemCount}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmt(inv.subtotal, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">{fmt(inv.grandTotal, currency)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 7. Inventory Valuation View
// ─────────────────────────────────────────────────────────────
function InventoryValuationView({
  data,
  currency,
  searchTerm,
  setSearchTerm,
}: {
  data: MasterAccountingReportsData["inventoryValuation"];
  currency: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data.items;
    const q = searchTerm.toLowerCase();
    return data.items.filter(
      (it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q) || it.category.toLowerCase().includes(q)
    );
  }, [data.items, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Catalog SKUs" value={`${data.totalSkus} SKUs`} sub={`${data.totalUnits} total units in stock`} color="text-slate-900" />
        <KpiCard label="Cost Asset Valuation" value={fmt(data.totalCostValue, currency)} sub="Stock on hand at cost" color="text-amber-800" />
        <KpiCard label="Retail Valuation" value={fmt(data.totalRetailValue, currency)} sub="Potential retail realization" color="text-sky-800" />
        <KpiCard label="Unrealized Margin" value={fmt(data.potentialTotalProfit, currency)} sub={`${data.overallMarginPct.toFixed(1)}% Markup`} color="text-emerald-800" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-300 bg-stone-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Inventory Stock Valuation Schedule</h3>
            <p className="text-xs text-slate-500 mt-0.5">Showing {filtered.length} products</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product, SKU, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-white border border-stone-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Item Description</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3 text-right">Units</th>
                <th className="px-5 py-3 text-right">Cost Price</th>
                <th className="px-5 py-3 text-right">Selling Price</th>
                <th className="px-5 py-3 text-right">Cost Valuation</th>
                <th className="px-5 py-3 text-right">Margin %</th>
                <th className="px-5 py-3 text-center">Stock Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {filtered.map((it, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-medium text-slate-500">{it.sku}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{it.name}</td>
                  <td className="px-5 py-3 text-slate-600">{it.category}</td>
                  <td className="px-5 py-3 text-right font-mono">{it.stockQty}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmt(it.unitCost, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmt(it.unitPrice, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-amber-800">{fmt(it.totalCostValuation, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-700">{it.marginPct}%</td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        it.stockHealth === "HEALTHY"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : it.stockHealth === "LOW"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {it.stockHealth}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 8. Purchase Statement View
// ─────────────────────────────────────────────────────────────
function PurchaseStatementView({
  data,
  currency,
  searchTerm,
  setSearchTerm,
}: {
  data: MasterAccountingReportsData["purchaseStatement"];
  currency: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data.orders;
    const q = searchTerm.toLowerCase();
    return data.orders.filter(
      (o) => o.purchaseOrderNumber.toLowerCase().includes(q) || o.supplierName.toLowerCase().includes(q)
    );
  }, [data.orders, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Orders" value={String(data.totalPurchasesCount)} sub="Supplier procurement POs" color="text-slate-900" />
        <KpiCard label="Purchased Value" value={fmt(data.totalPurchasedValue, currency)} sub="Total invoiced inventory" color="text-sky-800" />
        <KpiCard label="Amount Settled" value={fmt(data.totalAmountPaid, currency)} sub="Paid to suppliers" color="text-emerald-800" />
        <KpiCard label="Outstanding Balance" value={fmt(data.totalOutstandingPayable, currency)} sub="Current trade payables" color="text-rose-700" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-300 bg-stone-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Supplier Purchases Register</h3>
            <p className="text-xs text-slate-500 mt-0.5">Showing {filtered.length} orders</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PO # or supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-white border border-stone-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">PO Number</th>
                <th className="px-5 py-3">Supplier Name</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Items</th>
                <th className="px-5 py-3 text-right">Total Bill</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Balance Due</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {filtered.map((po, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-900">{po.purchaseOrderNumber}</td>
                  <td className="px-5 py-3 text-slate-700 font-medium">{po.supplierName}</td>
                  <td className="px-5 py-3 text-slate-500">{po.date}</td>
                  <td className="px-5 py-3 text-right font-mono">{po.totalItems}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900">{fmt(po.totalAmount, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono text-emerald-700">{fmt(po.amountPaid, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-rose-700">{fmt(po.balanceDue, currency)}</td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        po.paymentStatus === "PAID"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : po.paymentStatus === "PARTIALLY_PAID"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {po.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 9. Accounts Receivable View
// ─────────────────────────────────────────────────────────────
function AccountsReceivableView({
  data,
  currency,
  searchTerm,
  setSearchTerm,
}: {
  data: MasterAccountingReportsData["accountsReceivable"];
  currency: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data.debtors;
    const q = searchTerm.toLowerCase();
    return data.debtors.filter((d) => d.name.toLowerCase().includes(q) || d.phone.includes(q));
  }, [data.debtors, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Receivables" value={fmt(data.totalReceivables, currency)} sub="Outstanding customer balances" color="text-teal-800" />
        <KpiCard label="Current (0 - 30 Days)" value={fmt(data.totalCurrent0to30, currency)} sub="Standard credit terms" color="text-emerald-800" />
        <KpiCard label="Overdue (> 30 Days)" value={fmt(data.totalDays31to60 + data.totalDays61to90 + data.totalOver90Days, currency)} sub="Requires collection follow-up" color="text-rose-700" />
        <KpiCard label="Active Debtors" value={`${data.totalActiveDebtors} Customers`} sub="Credit ledger accounts" color="text-slate-900" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-300 bg-stone-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Customer AR Aging Ledger</h3>
            <p className="text-xs text-slate-500 mt-0.5">Showing {filtered.length} debtors</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search debtor name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-white border border-stone-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">Customer Name</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3 text-right">0 - 30 Days</th>
                <th className="px-5 py-3 text-right">31 - 60 Days</th>
                <th className="px-5 py-3 text-right">61 - 90 Days</th>
                <th className="px-5 py-3 text-right">&gt; 90 Days</th>
                <th className="px-5 py-3 text-right">Total Due</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {filtered.map((d, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-semibold text-slate-900">{d.name}</td>
                  <td className="px-5 py-3 font-mono text-slate-500">{d.phone}</td>
                  <td className="px-5 py-3 text-right font-mono text-emerald-700">{fmt(d.current0to30, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono text-amber-700">{fmt(d.days31to60, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono text-orange-700">{fmt(d.days61to90, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono text-rose-700">{fmt(d.over90Days, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">{fmt(d.totalOutstanding, currency)}</td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        d.status === "GOOD"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : d.status === "DUE"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 10. Accounts Payable View
// ─────────────────────────────────────────────────────────────
function AccountsPayableView({
  data,
  currency,
  searchTerm,
  setSearchTerm,
}: {
  data: MasterAccountingReportsData["accountsPayable"];
  currency: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data.creditors;
    const q = searchTerm.toLowerCase();
    return data.creditors.filter(
      (c) => c.supplierName.toLowerCase().includes(q) || c.purchaseOrderNumber.toLowerCase().includes(q)
    );
  }, [data.creditors, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Payables" value={fmt(data.totalPayables, currency)} sub="Outstanding supplier bills" color="text-rose-700" />
        <KpiCard label="Current (0 - 30 Days)" value={fmt(data.totalCurrent0to30, currency)} sub="Within agreed credit terms" color="text-emerald-800" />
        <KpiCard label="Aging Overdue" value={fmt(data.totalDays31to60 + data.totalDays61to90 + data.totalOver90Days, currency)} sub="Past supplier due date" color="text-amber-800" />
        <KpiCard label="Active Creditors" value={`${data.totalCreditorsCount} Suppliers`} sub="Pending settlement bills" color="text-slate-900" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-300 bg-stone-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Supplier AP Aging Schedule</h3>
            <p className="text-xs text-slate-500 mt-0.5">Showing {filtered.length} creditors</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search supplier or PO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-white border border-stone-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">Supplier Name</th>
                <th className="px-5 py-3">PO Reference</th>
                <th className="px-5 py-3">Bill Date</th>
                <th className="px-5 py-3">Due Date</th>
                <th className="px-5 py-3 text-right">Bill Total</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Balance Due</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {filtered.map((c, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-semibold text-slate-900">{c.supplierName}</td>
                  <td className="px-5 py-3 font-mono text-slate-500">{c.purchaseOrderNumber}</td>
                  <td className="px-5 py-3 text-slate-500">{c.date}</td>
                  <td className="px-5 py-3 text-slate-500">{c.dueDate}</td>
                  <td className="px-5 py-3 text-right font-mono text-slate-900">{fmt(c.totalAmount, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono text-emerald-700">{fmt(c.amountPaid, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-rose-700">{fmt(c.balanceDue, currency)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      {c.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 11. Expense Statement View
// ─────────────────────────────────────────────────────────────
function ExpenseStatementView({ data, currency }: { data: MasterAccountingReportsData["expenseStatement"]; currency: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Operating Expenses" value={fmt(data.totalExpenses, currency)} sub="Recorded period overheads" color="text-orange-800" />
        <KpiCard label="Tax-Deductible" value={fmt(data.totalTaxDeductible, currency)} sub="Qualified business expenses" color="text-emerald-800" />
        <KpiCard label="Categories Count" value={`${data.categorySummary.length} Categories`} sub="Classified cost centers" color="text-sky-800" />
        <KpiCard label="Expense Entries" value={`${data.expenses.length} Records`} sub="Itemized expense entries" color="text-slate-900" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded border border-stone-300 bg-white p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-4 pb-2 border-b border-stone-200">
            Category Breakdown
          </h3>
          <div className="space-y-3">
            {data.categorySummary.map((cat, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium">{cat.category}</span>
                  <span className="text-slate-900 font-mono font-semibold">
                    {fmt(cat.amount, currency)} ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-slate-800 to-amber-700 rounded-full"
                    style={{ width: `${Math.min(100, cat.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-stone-300 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Itemized Operating Overheads</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
                <tr>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-slate-800">
                {data.expenses.map((e, idx) => (
                  <tr key={idx} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{e.category}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.vendor}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-800">{fmt(e.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 12. Bank & Cash Reconciliation View
// ─────────────────────────────────────────────────────────────
function BankCashReconciliationView({
  data,
  currency,
}: {
  data: MasterAccountingReportsData["bankCashReconciliation"];
  currency: string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Expected Cash in Till" value={fmt(data.totalExpectedCash, currency)} sub="Float + cash sales - refunds" color="text-violet-800" />
        <KpiCard label="Physical Counted Cash" value={fmt(data.totalActualCash, currency)} sub="Drawer physical count" color="text-slate-900" />
        <KpiCard
          label="Till Variance"
          value={fmt(data.totalCashVariance, currency)}
          sub={Math.abs(data.totalCashVariance) < 0.01 ? "Zero discrepancy" : "Over / short difference"}
          color={Math.abs(data.totalCashVariance) < 0.01 ? "text-emerald-800" : "text-rose-700"}
        />
        <KpiCard label="Digital Settlements" value={fmt(data.totalDigitalSettlements, currency)} sub="Card, QR & bank wires" color="text-sky-800" />
      </div>

      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Drawer Till Shift Reconciliation Sessions
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-5 py-3">Session Ref</th>
                <th className="px-5 py-3">Register</th>
                <th className="px-5 py-3">Shift Lead</th>
                <th className="px-5 py-3 text-right">Opening Float</th>
                <th className="px-5 py-3 text-right">Cash Sales</th>
                <th className="px-5 py-3 text-right">Expected Till</th>
                <th className="px-5 py-3 text-right">Actual Count</th>
                <th className="px-5 py-3 text-right">Variance</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {data.sessions.map((s, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-900">{s.sessionId}</td>
                  <td className="px-5 py-3 text-slate-700">{s.registerId}</td>
                  <td className="px-5 py-3 text-slate-600">{s.cashierName}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmt(s.openingFloat, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono text-emerald-700">{fmt(s.cashSales, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmt(s.expectedCash, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">{fmt(s.actualCash, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono font-medium">{fmt(s.variance, currency)}</td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        s.status === "BALANCED"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 13. Repair Statement View (Workshop Revenue, Component Cost & Profit)
// ─────────────────────────────────────────────────────────────
function RepairStatementView({
  data,
  currency,
  searchTerm,
  setSearchTerm,
}: {
  data: MasterAccountingReportsData["repairStatement"];
  currency: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data.tickets;
    const q = searchTerm.toLowerCase();
    return data.tickets.filter(
      (t) =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.customerPhone.toLowerCase().includes(q) ||
        t.device.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        (t.invoiceNumber && t.invoiceNumber.toLowerCase().includes(q))
    );
  }, [data.tickets, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Primary Financial KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
        <KpiCard
          label="Gross Repair Revenue"
          value={fmt(data.totalGrossRepairRevenue, currency)}
          sub={`${data.totalTicketsCount} tickets (${data.completedTicketsCount} completed)`}
          color="text-teal-800"
        />
        <KpiCard
          label="Service & Labor Revenue"
          value={fmt(data.totalServiceRevenue, currency)}
          sub="Technical service charges"
          color="text-sky-800"
        />
        <KpiCard
          label="Parts Selling Revenue"
          value={fmt(data.totalPartsRevenue, currency)}
          sub="Billed replacement parts"
          color="text-indigo-800"
        />
        <KpiCard
          label="Internal Parts Cost"
          value={fmt(data.totalPartsCost, currency)}
          sub="Replacement component COGS"
          color="text-rose-700"
        />
        <KpiCard
          label="Net Repair Profit"
          value={fmt(data.netRepairProfit, currency)}
          sub={`${data.repairMarginPct.toFixed(1)}% Workshop Margin`}
          color="text-emerald-800"
        />
        <KpiCard
          label="Repair Receivables"
          value={fmt(data.totalOutstandingReceivables, currency)}
          sub={`Collected: ${fmt(data.totalCollectedRevenue, currency)}`}
          color="text-amber-800"
        />
      </div>

      {/* Workshop Income & Cost Summary Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded border border-stone-300 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-300 bg-stone-100/90 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-teal-700" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Workshop Repair Cost &amp; Revenue Summary
              </h3>
            </div>
            <span className="text-[11px] font-mono font-bold text-emerald-700">
              Margin: {data.repairMarginPct.toFixed(1)}%
            </span>
          </div>
          <div className="divide-y divide-stone-200 text-xs">
            <StatementDataRow
              label="Replacement Components Revenue (Selling Price)"
              value={fmt(data.totalPartsRevenue, currency)}
              badge="Customer Billed"
            />
            <StatementDataRow
              label="Technical Labor & Service Charges Revenue"
              value={fmt(data.totalServiceRevenue, currency)}
              badge="Service Fees"
            />
            {data.totalDiscounts > 0 && (
              <StatementDataRow
                label="Less: Repair Discounts Allowed"
                value={`- ${fmt(data.totalDiscounts, currency)}`}
                isDeduction
              />
            )}
            <SubtotalRow
              label="Total Billable Repair Revenue"
              value={fmt(data.totalGrossRepairRevenue, currency)}
            />
            <StatementDataRow
              label="Less: Internal Replacement Component Purchase Cost (COGS)"
              value={`- ${fmt(data.totalPartsCost, currency)}`}
              badge="Internal Cost"
              isDeduction
            />
            <GrandTotalRow
              label="NET WORKSHOP REPAIR PROFIT"
              value={fmt(data.netRepairProfit, currency)}
              badge={`${data.repairMarginPct.toFixed(1)}% MARGIN`}
            />
          </div>
        </div>

        {/* Status Breakdown Card */}
        <div className="rounded border border-stone-300 bg-white p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 pb-2 border-b border-stone-200">
              Status Financial Breakdown
            </h3>
            <div className="space-y-2.5 max-h-[210px] overflow-y-auto pr-1">
              {data.statusBreakdown.length > 0 ? (
                data.statusBreakdown.map((st, i) => {
                  const isCancelled = st.status === "CANCELLED";
                  const isDelivered = st.status === "DELIVERED" || st.status === "COLLECTED";
                  return (
                    <div
                      key={i}
                      className={`p-2.5 rounded border flex items-center justify-between text-xs ${
                        isCancelled
                          ? "bg-rose-50/80 border-rose-200"
                          : isDelivered
                          ? "bg-emerald-50/80 border-emerald-200"
                          : "bg-stone-50 border-stone-200"
                      }`}
                    >
                      <div>
                        <span
                          className={`font-bold block ${
                            isCancelled
                              ? "text-rose-800"
                              : isDelivered
                              ? "text-emerald-800"
                              : "text-slate-800"
                          }`}
                        >
                          {st.status}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {st.count} {st.count === 1 ? "ticket" : "tickets"} &bull; Cost: {fmt(st.cost, currency)}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-slate-900 font-bold block">{fmt(st.revenue, currency)}</span>
                        <span className="text-[10px] text-emerald-700 font-semibold">
                          Profit: {fmt(st.profit, currency)}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center">No repair tickets in selected period.</p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Cash Collected vs Due:</span>
            <span className="font-mono text-emerald-700 font-bold">
              {fmt(data.totalCollectedRevenue, currency)} /{" "}
              <span className="text-amber-700">{fmt(data.totalOutstandingReceivables, currency)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Itemized Ticket Financial Register */}
      <div className="rounded border border-stone-300 bg-white overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-300 bg-stone-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Workshop Repair Ticket Financial Ledger
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filtered.length} of {data.totalTicketsCount} repair tickets with internal component costs &amp; margins
            </p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ticket #, customer, device, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-white border border-stone-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 w-full sm:w-72"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold border-b border-stone-300">
              <tr>
                <th className="px-4 py-3">Ticket #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer &amp; Device</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Parts Selling</th>
                <th className="px-4 py-3 text-right">Service / Labor</th>
                <th className="px-4 py-3 text-right">Total Revenue</th>
                <th className="px-4 py-3 text-right">Parts Cost</th>
                <th className="px-4 py-3 text-right">Net Profit</th>
                <th className="px-4 py-3 text-right">Paid / Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-slate-800">
              {filtered.map((t, idx) => {
                const isCancelled = t.status === "CANCELLED";
                const isDelivered = t.status === "DELIVERED" || t.status === "COLLECTED";
                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      isCancelled
                        ? "bg-rose-50/60 hover:bg-rose-50"
                        : isDelivered
                        ? "bg-emerald-50/60 hover:bg-emerald-50"
                        : "hover:bg-stone-50"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono font-bold whitespace-nowrap">
                      <span
                        className={
                          isCancelled
                            ? "text-rose-700 line-through"
                            : isDelivered
                            ? "text-emerald-800"
                            : "text-teal-800"
                        }
                      >
                        {t.ticketNumber}
                      </span>
                      {t.invoiceNumber && (
                        <span className="block text-[10px] text-slate-500 font-normal">{t.invoiceNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{t.customerName}</div>
                      <div className="text-[11px] text-slate-600">
                        {t.device} &bull; <span className="text-slate-500">{t.faultsSummary}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCancelled
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : isDelivered
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-stone-100 text-slate-700 border border-stone-300"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(t.partsRevenue, currency)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sky-800">{fmt(t.serviceRevenue, currency)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {fmt(t.totalBillableRevenue, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-700">{fmt(t.partsCost, currency)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-800">
                      {fmt(t.grossProfit, currency)}
                      <span className="block text-[10px] font-normal text-slate-500">{t.marginPct}%</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      <span className="text-emerald-700 font-semibold block">{fmt(t.amountPaid, currency)}</span>
                      {t.balanceDue > 0 && (
                        <span className="text-[10px] text-amber-700 font-semibold">
                          Due: {fmt(t.balanceDue, currency)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-slate-400 text-xs">
                    No repair tickets found for this period.
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-stone-100 font-extrabold text-slate-900 border-t-2 border-b-4 border-double border-slate-900">
                <tr>
                  <td className="px-4 py-3.5" colSpan={4}>
                    TOTAL WORKSHOP REPAIR FINANCIALS ({filtered.length} Tickets)
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono">{fmt(data.totalPartsRevenue, currency)}</td>
                  <td className="px-4 py-3.5 text-right font-mono">{fmt(data.totalServiceRevenue, currency)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-900">
                    {fmt(data.totalGrossRepairRevenue, currency)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-rose-700">
                    {fmt(data.totalPartsCost, currency)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-800">
                    {fmt(data.netRepairProfit, currency)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-800">
                    {fmt(data.totalCollectedRevenue, currency)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared Paper-Styled Micro-Components for Financial Statements
// ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="px-3.5 py-2.5 rounded bg-stone-50/90 border border-stone-200/90 flex flex-col justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase truncate">{label}</span>
      <div className="mt-1">
        <span className={`text-sm sm:text-base font-extrabold tracking-tight font-mono ${color}`}>{value}</span>
        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  );
}

function SectionHeaderRow({ title }: { title: string }) {
  return (
    <div className="px-5 py-2.5 bg-stone-100/70 font-bold text-slate-700 text-[11px] tracking-wider uppercase">
      {title}
    </div>
  );
}

function StatementDataRow({
  label,
  value,
  badge,
  isDeduction,
}: {
  label: string;
  value: string;
  badge?: string;
  isDeduction?: boolean;
}) {
  return (
    <div className="px-5 py-2.5 flex items-center justify-between hover:bg-stone-50/80 transition-colors">
      <div className="flex items-center gap-2">
        <span className="text-slate-800 font-medium">{label}</span>
        {badge && <span className="text-[10px] text-slate-500">({badge})</span>}
      </div>
      <span className={`font-mono font-semibold ${isDeduction ? "text-rose-700" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  );
}

function SubtotalRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="px-5 py-2.5 bg-stone-100/80 flex items-center justify-between font-bold border-t border-b border-stone-300">
      <div className="flex items-center gap-2">
        <span className="text-slate-800">{label}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-700 border border-stone-300">
            {badge}
          </span>
        )}
      </div>
      <span className="font-mono text-slate-900">{value}</span>
    </div>
  );
}

function GrandTotalRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="px-5 py-3.5 bg-stone-100 flex items-center justify-between font-extrabold border-t-2 border-b-4 border-double border-slate-900">
      <div className="flex items-center gap-2">
        <span className="text-slate-900 tracking-wide uppercase">{label}</span>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold">
            {badge}
          </span>
        )}
      </div>
      <span className="font-mono text-slate-950 text-sm">{value}</span>
    </div>
  );
}
