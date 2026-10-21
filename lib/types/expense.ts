/**
 * lib/types/expense.ts
 *
 * Domain types and interfaces for the Multi-Tenant Expenditure & Accounting Integration.
 * Strictly scoped by shopId.
 */

import { AuditUser } from "./catalog";

export type ExpenseType =
  | "OPERATING_EXPENSE"  // Rent, utilities, marketing, maintenance (hits P&L)
  | "EMPLOYEE_SALARY"    // Staff salaries, wages, overtime, salary cuts (hits P&L)
  | "CAPITAL_ASSET"      // POS hardware, fixtures, machinery (hits Balance Sheet assets)
  | "LIABILITY_PAYMENT"  // Loan repayment, SST remittance (hits Balance Sheet liabilities)
  | "OWNER_WITHDRAWAL"   // Drawings / partner profit distribution (hits Equity)
  | "INVENTORY_PURCHASE";// Procurement (hits Inventory Asset / COGS)

export type ExpenseStatus =
  | "draft"              // Initial draft, no financial or accounting impact
  | "pending_approval"   // Submitted for manager/admin approval
  | "approved"           // Approved, authorized for disbursement/posting
  | "posted"             // Officially posted to General Ledger via double-entry journal entry
  | "rejected"           // Declined by reviewer
  | "cancelled";         // Voided / cancelled

export type ExpensePaymentStatus =
  | "unpaid"             // Zero paid, full balance due
  | "partial"            // Partially settled, remaining balance due
  | "paid";              // Fully settled, balance due is 0

export type ExpensePaymentMethod =
  | "cash"
  | "bank_transfer"
  | "card"
  | "cheque"
  | "mobile_money"
  | "other";

export type RecurringFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface ExpensePaymentRecord {
  id: string;
  date: string;               // YYYY-MM-DD
  amount: number;             // Amount in LKR
  paymentMethod: ExpensePaymentMethod;
  reference?: string;         // Cheque #, transaction ref, etc.
  recordedBy: AuditUser;
  notes?: string;
  createdAt: number;
}

export interface ExpenseAuditEntry {
  id: string;
  action:
    | "CREATED"
    | "UPDATED"
    | "SUBMITTED"
    | "APPROVED"
    | "REJECTED"
    | "POSTED"
    | "PAYMENT_RECORDED"
    | "CANCELLED";
  performedBy: AuditUser;
  timestamp: number;
  notes?: string;
  prevStatus?: ExpenseStatus;
  nextStatus?: ExpenseStatus;
}

export interface ExpenseCategory {
  id: string;
  shopId: string;             // Multi-tenant isolation key
  name: string;               // Display name, e.g. "Store Rent"
  code: string;               // E.g., "RENT", "SALARY", "UTILITIES"
  type: ExpenseType;          // Distinguishes OpEx from Assets/Liabilities/Withdrawals
  description?: string;
  defaultGlAccount: string;   // Account code, e.g. "6010", "6020"
  isTaxDeductible: boolean;
  isActive: boolean;
  isSystemDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RecurringExpenseSchedule {
  id: string;
  shopId: string;             // Multi-tenant isolation key
  title: string;              // E.g. "Monthly Shop Rental"
  categoryId: string;
  categoryName: string;
  amount: number;             // Amount in LKR
  frequency: RecurringFrequency;
  paymentMethod: ExpensePaymentMethod;
  payee: string;              // Landlord, utility provider, etc.
  description?: string;
  startDate: string;          // YYYY-MM-DD
  endDate?: string;           // Optional termination date
  nextDueDate: string;        // YYYY-MM-DD
  lastGeneratedPeriod?: string; // Idempotency key, e.g. "2026-10" to prevent duplicates
  autoApprove: boolean;       // Automatically set status to "approved"
  isActive: boolean;
  createdBy: AuditUser;
  createdAt: number;
  updatedAt: number;
}

export interface JournalEntryLine {
  accountCode: string;
  accountName: string;
  accountCategory: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;                 // JE-YYYYMMDD-XXXX
  shopId: string;             // Multi-tenant isolation key
  date: string;               // YYYY-MM-DD
  sourceType: "EXPENSE" | "SALE" | "PURCHASE" | "RETURN" | "PAYMENT" | "MANUAL";
  sourceId: string;           // Expense ID or reference
  referenceNumber?: string;
  description: string;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  postedBy: AuditUser;
  postedAt: number;
}

export interface EmployeeSalaryDetails {
  employeeId?: string;
  employeeName: string;
  baseSalary: number;
  overtimeHours?: number;
  overtimeRate?: number;
  overtimeAmount?: number;
  overtimeNotes?: string;
  salaryCuts?: number;
  salaryCutReason?: string;
  bonusAmount?: number;
  allowances?: number;
  netSalary: number;
  payPeriod?: string; // e.g. "2026-10" or "October 2026"
  notes?: string;
}

export interface ExpenseRecord {
  id: string;                 // EXP-YYYYMMDD-XXXX
  shopId: string;             // Strictly isolated by shopId
  categoryId: string;
  categoryName: string;
  categoryCode?: string;
  expenseType: ExpenseType;
  amount: number;             // Amount in LKR
  date: string;               // YYYY-MM-DD
  paymentMethod: ExpensePaymentMethod;
  description: string;
  vendor: string;             // Payee / supplier / service provider / employee
  recordedBy: AuditUser;
  approvedBy?: AuditUser;
  approvedAt?: number;
  postedBy?: AuditUser;
  postedAt?: number;
  status: ExpenseStatus;
  paymentStatus: ExpensePaymentStatus;
  amountPaid: number;         // Amount in LKR
  balanceDue: number;         // Amount in LKR
  payments: ExpensePaymentRecord[];
  recurringScheduleId?: string;
  recurringPeriodKey?: string;// Unique idempotency token, prevents duplicate recurring postings
  receiptUrl?: string;
  referenceNumber?: string;   // Invoice number, bill number, receipt voucher
  isTaxDeductible: boolean;
  glAccountCode: string;      // E.g. "6010"
  creditAccountCode: string;  // E.g. "1010" Cash, "1020" Bank, or "2030" Accrued Expenses
  journalEntryId?: string;    // Linked posted journal entry ID
  salaryDetails?: EmployeeSalaryDetails; // Specialized employee compensation & overtime details
  auditTrail: ExpenseAuditEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateExpenseInput {
  categoryId: string;
  categoryName?: string;
  expenseType?: ExpenseType;
  amount: number;             // Amount in LKR
  date: string;               // YYYY-MM-DD
  paymentMethod: ExpensePaymentMethod;
  description: string;
  vendor: string;
  referenceNumber?: string;
  receiptUrl?: string;
  isTaxDeductible?: boolean;
  paymentStatus?: ExpensePaymentStatus;
  initialAmountPaid?: number; // Optional immediate payment
  autoPost?: boolean;         // Auto post if user has permission
  salaryDetails?: EmployeeSalaryDetails;
}

export interface UpdateExpenseInput {
  categoryId?: string;
  categoryName?: string;
  expenseType?: ExpenseType;
  amount?: number;
  date?: string;
  paymentMethod?: ExpensePaymentMethod;
  description?: string;
  vendor?: string;
  referenceNumber?: string;
  receiptUrl?: string;
  isTaxDeductible?: boolean;
  status?: ExpenseStatus;
  salaryDetails?: EmployeeSalaryDetails;
}

export interface RecordExpensePaymentInput {
  amount: number;             // Amount in LKR
  date: string;               // YYYY-MM-DD
  paymentMethod: ExpensePaymentMethod;
  reference?: string;
  notes?: string;
}

export interface ExpenseFilterOptions {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  expenseType?: ExpenseType;
  status?: ExpenseStatus | "ALL";
  paymentStatus?: ExpensePaymentStatus | "ALL";
  paymentMethod?: ExpensePaymentMethod | "ALL";
  searchQuery?: string;
}

export interface ExpenseAnalyticsSummary {
  totalExpenses: number;        // All expenses sum in LKR
  totalOperatingExpenses: number; // Operating expenses (P&L impact)
  totalCapitalAssets: number;     // Asset purchases
  totalLiabilitiesPaid: number;   // Debt/tax repayments
  totalOwnerWithdrawals: number;  // Drawings
  totalPaid: number;
  totalBalanceDue: number;
  postedCount: number;
  pendingApprovalCount: number;
  draftCount: number;
  byCategory: {
    categoryId: string;
    categoryName: string;
    totalAmount: number;
    count: number;
    percentage: number;
  }[];
  byPaymentMethod: {
    method: string;
    totalAmount: number;
    count: number;
  }[];
}
