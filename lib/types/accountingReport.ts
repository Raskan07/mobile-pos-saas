/**
 * lib/types/accountingReport.ts
 *
 * Domain types and interfaces for the Accounting Reports & SST Module.
 * Covers 12 enterprise financial statements:
 * 1. Profit & Loss (Income Statement)
 * 2. Balance Sheet
 * 3. Cash Flow Statement
 * 4. Trial Balance & General Ledger Summaries
 * 5. Sales Statement
 * 6. Inventory Valuation
 * 7. Purchase Statement
 * 8. Accounts Receivable (AR Aging)
 * 9. Accounts Payable (AP Aging)
 * 10. Expense Statement
 * 11. Bank & Cash Reconciliation
 * 12. Tax Statement (SST)
 */

export type AccountingReportType =
  | "pnl"
  | "balance_sheet"
  | "cash_flow"
  | "trial_balance"
  | "sales_statement"
  | "inventory_valuation"
  | "purchase_statement"
  | "accounts_receivable"
  | "accounts_payable"
  | "expense_statement"
  | "bank_cash_reconciliation"
  | "tax_statement";

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "all_time"
  | "custom";

export interface ReportDateFilter {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTimeMs: number;
  endTimeMs: number;
  label: string;
}

export interface ReportShopFilter {
  shopId: string;     // specific shopId or "ALL"
  shopName: string;
}

// ─────────────────────────────────────────────────────────────
// 1. Profit & Loss Statement
// ─────────────────────────────────────────────────────────────
export interface PnLLineItem {
  code: string;
  name: string;
  amount: number;
  percentageOfRevenue: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export interface PnLData {
  grossSales: number;
  discounts: number;
  returnsAndRefunds: number;
  netRevenue: number;

  cogs: number;
  grossProfit: number;
  grossMarginPct: number;

  operatingExpenses: {
    category: string;
    amount: number;
    pctOfRevenue: number;
  }[];
  totalOperatingExpenses: number;

  operatingIncome: number; // EBITDA
  depreciation: number;
  taxExpense: number;
  netProfit: number;
  netMarginPct: number;
}

// ─────────────────────────────────────────────────────────────
// 2. Balance Sheet
// ─────────────────────────────────────────────────────────────
export interface BalanceSheetItem {
  accountCode: string;
  name: string;
  amount: number;
  notes?: string;
}

export interface BalanceSheetData {
  asOfDate: string;
  currentAssets: BalanceSheetItem[];
  totalCurrentAssets: number;

  nonCurrentAssets: BalanceSheetItem[];
  totalNonCurrentAssets: number;

  totalAssets: number;

  currentLiabilities: BalanceSheetItem[];
  totalCurrentLiabilities: number;

  nonCurrentLiabilities: BalanceSheetItem[];
  totalNonCurrentLiabilities: number;

  totalLiabilities: number;

  equityItems: BalanceSheetItem[];
  totalEquity: number;

  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  variance: number;
}

// ─────────────────────────────────────────────────────────────
// 3. Cash Flow Statement
// ─────────────────────────────────────────────────────────────
export interface CashFlowData {
  operatingActivities: {
    name: string;
    amount: number;
  }[];
  netOperatingCashFlow: number;

  investingActivities: {
    name: string;
    amount: number;
  }[];
  netInvestingCashFlow: number;

  financingActivities: {
    name: string;
    amount: number;
  }[];
  netFinancingCashFlow: number;

  netChangeInCash: number;
  beginningCashBalance: number;
  endingCashBalance: number;
}

// ─────────────────────────────────────────────────────────────
// 4. Trial Balance & General Ledger Summaries
// ─────────────────────────────────────────────────────────────
export interface TrialBalanceRow {
  code: string;
  name: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  debit: number;
  credit: number;
}

export interface GeneralLedgerSummaryRow {
  code: string;
  name: string;
  openingBalance: number;
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
  normalBalance: "DEBIT" | "CREDIT";
}

export interface TrialBalanceData {
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  variance: number;
  glSummaries: GeneralLedgerSummaryRow[];
}

// ─────────────────────────────────────────────────────────────
// 5. Sales Statement
// ─────────────────────────────────────────────────────────────
export interface SalesStatementInvoiceRow {
  invoiceNumber: string;
  date: string;
  customerName: string;
  cashierName: string;
  paymentMethod: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  taxAmount: number;
  grandTotal: number;
  status: string;
}

export interface SalesStatementData {
  invoices: SalesStatementInvoiceRow[];
  totalInvoices: number;
  totalGrossSales: number;
  totalDiscounts: number;
  totalTaxCollected: number;
  totalNetSales: number;
  avgOrderValue: number;
  paymentMethodBreakdown: {
    method: string;
    count: number;
    total: number;
    percentage: number;
  }[];
}

// ─────────────────────────────────────────────────────────────
// 6. Inventory Valuation
// ─────────────────────────────────────────────────────────────
export interface InventoryValuationRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  stockQty: number;
  unitCost: number;
  unitPrice: number;
  totalCostValuation: number;
  totalRetailValuation: number;
  potentialProfit: number;
  marginPct: number;
  stockHealth: "HEALTHY" | "LOW" | "OUT_OF_STOCK";
}

export interface InventoryValuationData {
  items: InventoryValuationRow[];
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
  totalRetailValue: number;
  potentialTotalProfit: number;
  overallMarginPct: number;
  lowStockItemsCount: number;
  outOfStockItemsCount: number;
}

// ─────────────────────────────────────────────────────────────
// 7. Purchase Statement
// ─────────────────────────────────────────────────────────────
export interface PurchaseStatementRow {
  purchaseOrderNumber: string;
  supplierInvoiceNumber: string;
  supplierName: string;
  date: string;
  purchaseStatus: string;
  paymentStatus: string;
  totalItems: number;
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
}

export interface PurchaseStatementData {
  orders: PurchaseStatementRow[];
  totalPurchasesCount: number;
  totalPurchasedValue: number;
  totalAmountPaid: number;
  totalOutstandingPayable: number;
  totalTaxPaid: number;
  statusBreakdown: {
    status: string;
    count: number;
    amount: number;
  }[];
}

// ─────────────────────────────────────────────────────────────
// 8. Accounts Receivable (AR Aging)
// ─────────────────────────────────────────────────────────────
export interface ARAgingRow {
  customerId: string;
  name: string;
  phone: string;
  lifetimeSpend: number;
  totalOutstanding: number;
  current0to30: number;
  days31to60: number;
  days61to90: number;
  over90Days: number;
  lastPurchaseDate: string;
  status: "GOOD" | "DUE" | "OVERDUE";
}

export interface ARAgingData {
  debtors: ARAgingRow[];
  totalReceivables: number;
  totalCurrent0to30: number;
  totalDays31to60: number;
  totalDays61to90: number;
  totalOver90Days: number;
  totalActiveDebtors: number;
}

// ─────────────────────────────────────────────────────────────
// 9. Accounts Payable (AP Aging)
// ─────────────────────────────────────────────────────────────
export interface APAgingRow {
  purchaseId: string;
  supplierName: string;
  purchaseOrderNumber: string;
  supplierInvoiceNumber: string;
  date: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  current0to30: number;
  days31to60: number;
  days61to90: number;
  over90Days: number;
  paymentStatus: string;
}

export interface APAgingData {
  creditors: APAgingRow[];
  totalPayables: number;
  totalCurrent0to30: number;
  totalDays31to60: number;
  totalDays61to90: number;
  totalOver90Days: number;
  totalCreditorsCount: number;
}

// ─────────────────────────────────────────────────────────────
// 10. Expense Statement
// ─────────────────────────────────────────────────────────────
export interface ExpenseStatementRow {
  expenseId: string;
  date: string;
  category: string;
  description: string;
  vendor: string;
  paymentMethod: string;
  amount: number;
  isTaxDeductible: boolean;
  recordedBy: string;
}

export interface ExpenseStatementData {
  expenses: ExpenseStatementRow[];
  totalExpenses: number;
  totalTaxDeductible: number;
  categorySummary: {
    category: string;
    count: number;
    amount: number;
    percentage: number;
  }[];
}

// ─────────────────────────────────────────────────────────────
// 11. Bank & Cash Reconciliation
// ─────────────────────────────────────────────────────────────
export interface ReconciliationSessionRow {
  sessionId: string;
  date: string;
  registerId: string;
  cashierName: string;
  openingFloat: number;
  cashSales: number;
  cashRefunds: number;
  cashPayouts: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  cardSettlement: number;
  bankTransferSettlement: number;
  qrSettlement: number;
  status: "BALANCED" | "VARIANCE" | "PENDING";
}

export interface BankCashReconciliationData {
  sessions: ReconciliationSessionRow[];
  totalExpectedCash: number;
  totalActualCash: number;
  totalCashVariance: number;
  totalDigitalSettlements: number;
  balancedSessionsCount: number;
  discrepantSessionsCount: number;
}

// ─────────────────────────────────────────────────────────────
// 12. Tax Statement (SST)
// ─────────────────────────────────────────────────────────────
export interface SSTTaxTransactionRow {
  referenceNumber: string;
  date: string;
  type: "OUTPUT_TAX" | "INPUT_TAX"; // Output = Sales, Input = Purchase/Expense
  counterparty: string;
  taxRatePct: number;
  taxableAmount: number;
  taxAmount: number;
  status: string;
}

export interface SSTTaxStatementData {
  taxPeriodLabel: string;
  sstOutputTax: number;      // Tax collected on sales
  sstInputTax: number;       // Tax paid on purchases
  netSSTPayable: number;     // Output - Input
  taxableSalesAmount: number;
  taxExemptSalesAmount: number;
  effectiveTaxRatePct: number;
  transactions: SSTTaxTransactionRow[];
}

// ─────────────────────────────────────────────────────────────
// Master Report Container Interface
// ─────────────────────────────────────────────────────────────
export interface MasterAccountingReportsData {
  shopId: string;
  shopName: string;
  dateFilter: ReportDateFilter;
  generatedAt: number;

  pnl: PnLData;
  balanceSheet: BalanceSheetData;
  cashFlow: CashFlowData;
  trialBalance: TrialBalanceData;
  salesStatement: SalesStatementData;
  inventoryValuation: InventoryValuationData;
  purchaseStatement: PurchaseStatementData;
  accountsReceivable: ARAgingData;
  accountsPayable: APAgingData;
  expenseStatement: ExpenseStatementData;
  bankCashReconciliation: BankCashReconciliationData;
  taxStatement: SSTTaxStatementData;
}
