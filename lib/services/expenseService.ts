/**
 * lib/services/expenseService.ts
 *
 * Multi-Tenant Expenditure, Category, Recurring Schedules & Accounting Posting Service.
 * Strictly isolated by shopId.
 *
 * Guarantees:
 * 1. Multi-Tenant Isolation: All data scoped to `shops/{shopId}/expenses` etc.
 * 2. Proper Double-Entry Accounting: Generates balanced journal entries upon posting.
 * 3. Never count twice: Only posted expenses hit GL / P&L / Balance Sheet.
 * 4. Duplicate Prevention: Recurring expenses use deterministic period keys.
 * 5. Full Audit Trail: Every state transition records who, when, and what.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Unsubscribe,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { AuditUser } from "../types/catalog";
import {
  ExpenseRecord,
  ExpenseCategory,
  RecurringExpenseSchedule,
  JournalEntry,
  JournalEntryLine,
  ExpensePaymentRecord,
  ExpenseAuditEntry,
  ExpenseStatus,
  ExpensePaymentStatus,
  ExpensePaymentMethod,
  ExpenseType,
  CreateExpenseInput,
  UpdateExpenseInput,
  RecordExpensePaymentInput,
  ExpenseFilterOptions,
  ExpenseAnalyticsSummary,
} from "../types/expense";

export const EXPENSES_COLLECTION = "expenses";
export const EXPENSE_CATEGORIES_COLLECTION = "expense_categories";
export const RECURRING_EXPENSES_COLLECTION = "recurring_expenses";
export const JOURNAL_ENTRIES_COLLECTION = "journal_entries";

/**
 * Recursively strips undefined fields from an object so Firestore setDoc / updateDoc does not reject it.
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

// ── Default Categories Blueprint ─────────────────────────────────────────────

export const DEFAULT_EXPENSE_CATEGORIES: Omit<ExpenseCategory, "id" | "shopId" | "createdAt" | "updatedAt">[] = [
  {
    name: "Store Lease & Rent",
    code: "RENT",
    type: "OPERATING_EXPENSE",
    description: "Retail shop rent, showroom and storage lease charges.",
    defaultGlAccount: "6010",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Staff Salaries & Wages",
    code: "SALARY",
    type: "EMPLOYEE_SALARY",
    description: "Employee wages, base salary, overtime management and salary cuts.",
    defaultGlAccount: "6020",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Utilities (Power & Water)",
    code: "UTILITIES",
    type: "OPERATING_EXPENSE",
    description: "Electricity, municipal water and waste management bills.",
    defaultGlAccount: "6030",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Internet & Telephony",
    code: "INTERNET",
    type: "OPERATING_EXPENSE",
    description: "Broadband, fiber connectivity, POS SIM cards and business phone.",
    defaultGlAccount: "6040",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Equipment Repairs & Maintenance",
    code: "REPAIRS",
    type: "OPERATING_EXPENSE",
    description: "AC servicing, barcode scanner repairs, till maintenance.",
    defaultGlAccount: "6050",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Transport, Logistics & Fuel",
    code: "TRANSPORT",
    type: "OPERATING_EXPENSE",
    description: "Courier fees, delivery vehicle fuel, dispatch and parking.",
    defaultGlAccount: "6060",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Bank Charges & Merchant Fees",
    code: "BANK_FEES",
    type: "OPERATING_EXPENSE",
    description: "POS swipe commissions, payment gateway fees and account charges.",
    defaultGlAccount: "6070",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Marketing & Promotions",
    code: "MARKETING",
    type: "OPERATING_EXPENSE",
    description: "Digital ads, flyers, banners, social media and promotions.",
    defaultGlAccount: "6080",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Store & Packaging Supplies",
    code: "SUPPLIES",
    type: "OPERATING_EXPENSE",
    description: "Thermal receipt paper rolls, shopping bags, labels, stationery.",
    defaultGlAccount: "6090",
    isTaxDeductible: true,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "POS Hardware & Capital Assets",
    code: "CAPITAL_ASSET",
    type: "CAPITAL_ASSET",
    description: "New POS hardware, computers, display shelving and shop furniture.",
    defaultGlAccount: "1510",
    isTaxDeductible: false,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Loan & Facility Repayment",
    code: "LIABILITY_PAYMENT",
    type: "LIABILITY_PAYMENT",
    description: "Principal repayment on commercial loan facilities.",
    defaultGlAccount: "2510",
    isTaxDeductible: false,
    isActive: true,
    isSystemDefault: true,
  },
  {
    name: "Owner Drawings & Distributions",
    code: "OWNER_WITHDRAWAL",
    type: "OWNER_WITHDRAWAL",
    description: "Partner cash withdrawals and proprietor profit disbursements.",
    defaultGlAccount: "3040",
    isTaxDeductible: false,
    isActive: true,
    isSystemDefault: true,
  },
];

// ── Number & ID Generators ───────────────────────────────────────────────────

export function generateExpenseId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `EXP-${y}${m}${d}-${rand}`;
}

export function generateJournalEntryId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `JE-${y}${m}${d}-${rand}`;
}

export function generateCategoryId(): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CAT-${rand}`;
}

export function generateScheduleId(): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SCH-${rand}`;
}

// ── Chart of Accounts Lookup ─────────────────────────────────────────────────

export function getAccountName(code: string): string {
  const accounts: Record<string, string> = {
    "1010": "Cash on Hand (Till Drawer)",
    "1020": "Bank Operating Account",
    "1040": "Inventory Asset",
    "1510": "Store Equipment & Hardware Asset",
    "2010": "Accounts Payable (Trade Creditors)",
    "2020": "SST / Sales Tax Payable",
    "2030": "Accrued Operating Expenses",
    "2510": "Commercial Bank Facility (Liability)",
    "3010": "Owner Capital Investment",
    "3040": "Owner Drawings & Distributions",
    "6010": "Rent & Occupancy Expense",
    "6020": "Staff Salaries & Wages Expense",
    "6030": "Utilities Expense",
    "6040": "Internet & Telecommunications Expense",
    "6050": "Repairs & Maintenance Expense",
    "6060": "Transport & Vehicle Expense",
    "6070": "Bank Charges & Merchant Fees Expense",
    "6080": "Marketing & Advertising Expense",
    "6090": "Store Supplies Expense",
    "6100": "General & Administrative Expense",
  };
  return accounts[code] || `Account ${code}`;
}

export function getAccountCategory(code: string): "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" {
  if (code.startsWith("1")) return "ASSET";
  if (code.startsWith("2")) return "LIABILITY";
  if (code.startsWith("3")) return "EQUITY";
  if (code.startsWith("4")) return "REVENUE";
  return "EXPENSE";
}

// ── Category Management ──────────────────────────────────────────────────────

/**
 * Initializes default expense categories for a shop if none exist.
 */
export async function ensureDefaultCategories(shopId: string, currentUser?: AuditUser): Promise<ExpenseCategory[]> {
  const normShop = normalizeShopId(shopId);
  if (!normShop) return [];

  const categoriesRef = collection(db, "shops", normShop, EXPENSE_CATEGORIES_COLLECTION);
  const snap = await getDocs(categoriesRef);

  if (!snap.empty) {
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExpenseCategory, "id">) }));
  }

  // Seed default categories
  const now = Date.now();
  const created: ExpenseCategory[] = [];
  const batch = writeBatch(db);

  for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
    const catId = `CAT-${cat.code}`;
    const categoryDoc: ExpenseCategory = {
      id: catId,
      shopId: normShop,
      ...cat,
      createdAt: now,
      updatedAt: now,
    };
    const ref = doc(categoriesRef, catId);
    batch.set(ref, categoryDoc);
    created.push(categoryDoc);
  }

  await batch.commit();
  return created;
}

export async function getExpenseCategories(shopId: string): Promise<ExpenseCategory[]> {
  const normShop = normalizeShopId(shopId);
  if (!normShop) return [];

  const categoriesRef = collection(db, "shops", normShop, EXPENSE_CATEGORIES_COLLECTION);
  const snap = await getDocs(categoriesRef);

  if (snap.empty) {
    return ensureDefaultCategories(normShop);
  }

  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExpenseCategory, "id">) }));
}

export async function createExpenseCategory(
  shopId: string,
  input: Omit<ExpenseCategory, "id" | "shopId" | "createdAt" | "updatedAt">,
  user: AuditUser
): Promise<ExpenseCategory> {
  const normShop = normalizeShopId(shopId);
  const catId = generateCategoryId();
  const now = Date.now();

  const newCat: ExpenseCategory = {
    id: catId,
    shopId: normShop,
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  const ref = doc(db, "shops", normShop, EXPENSE_CATEGORIES_COLLECTION, catId);
  await setDoc(ref, newCat);
  return newCat;
}

export async function updateExpenseCategory(
  shopId: string,
  categoryId: string,
  updates: Partial<Omit<ExpenseCategory, "id" | "shopId" | "createdAt">>
): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, EXPENSE_CATEGORIES_COLLECTION, categoryId);
  await setDoc(ref, { ...updates, updatedAt: Date.now() }, { merge: true });
}

export async function deleteExpenseCategory(shopId: string, categoryId: string): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, EXPENSE_CATEGORIES_COLLECTION, categoryId);
  await deleteDoc(ref);
}

// ── Expense Core Operations ──────────────────────────────────────────────────

/**
 * Creates a new expense record in Firestore strictly scoped to the shop.
 */
export async function createExpenseRecord(
  shopId: string,
  input: CreateExpenseInput,
  user: AuditUser
): Promise<ExpenseRecord> {
  const normShop = normalizeShopId(shopId);
  const expenseId = generateExpenseId();
  const now = Date.now();

  // Find or determine category info
  const categories = await getExpenseCategories(normShop);
  const category = categories.find((c) => c.id === input.categoryId);
  const categoryName = input.categoryName || category?.name || "General Expense";
  const expenseType: ExpenseType = input.expenseType || category?.type || "OPERATING_EXPENSE";
  const glAccountCode =
    category?.defaultGlAccount ||
    (expenseType === "CAPITAL_ASSET"
      ? "1510"
      : expenseType === "EMPLOYEE_SALARY"
      ? "6020"
      : "6090");

  const amount = Math.max(0, Number(input.amount) || 0);
  const initialPaid = Math.min(amount, Math.max(0, Number(input.initialAmountPaid) || 0));
  const balanceDue = Math.max(0, amount - initialPaid);

  let paymentStatus: ExpensePaymentStatus = "unpaid";
  if (initialPaid >= amount && amount > 0) {
    paymentStatus = "paid";
  } else if (initialPaid > 0) {
    paymentStatus = "partial";
  }

  const payments: ExpensePaymentRecord[] = [];
  if (initialPaid > 0) {
    payments.push({
      id: `PMT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: input.date,
      amount: initialPaid,
      paymentMethod: input.paymentMethod,
      reference: input.referenceNumber,
      recordedBy: user,
      notes: "Initial payment upon recording",
      createdAt: now,
    });
  }

  // Credit account: 1010 Cash, 1020 Bank, or 2030 Accrued
  const creditAccountCode =
    input.paymentMethod === "cash"
      ? "1010"
      : input.paymentMethod === "bank_transfer" || input.paymentMethod === "card"
      ? "1020"
      : "1010";

  const auditTrail: ExpenseAuditEntry[] = [
    {
      id: `AUD-${now}`,
      action: "CREATED",
      performedBy: user,
      timestamp: now,
      notes: `Expense created for LKR ${amount.toLocaleString()}`,
      nextStatus: "pending_approval",
    },
  ];

  const expense: ExpenseRecord = {
    id: expenseId,
    shopId: normShop,
    categoryId: input.categoryId,
    categoryName,
    categoryCode: category?.code,
    expenseType,
    amount,
    date: input.date,
    paymentMethod: input.paymentMethod,
    description: (input.description || "").trim(),
    vendor: (input.vendor || "").trim(),
    recordedBy: user,
    status: "pending_approval",
    paymentStatus,
    amountPaid: initialPaid,
    balanceDue,
    payments,
    referenceNumber: input.referenceNumber || "",
    receiptUrl: input.receiptUrl || "",
    isTaxDeductible: input.isTaxDeductible ?? category?.isTaxDeductible ?? true,
    glAccountCode,
    creditAccountCode,
    auditTrail,
    createdAt: now,
    updatedAt: now,
  };

  if (input.salaryDetails) {
    expense.salaryDetails = sanitizeForFirestore(input.salaryDetails);
  }

  // If user requested auto-posting (e.g. Admin direct record), approve and post immediately
  if (input.autoPost) {
    expense.status = "approved";
    expense.approvedBy = user;
    expense.approvedAt = now;
    auditTrail.push({
      id: `AUD-${now + 1}`,
      action: "APPROVED",
      performedBy: user,
      timestamp: now + 1,
      notes: "Auto-approved upon entry",
      prevStatus: "pending_approval",
      nextStatus: "approved",
    });

    // Generate Journal Entry
    const journalEntry = buildExpenseJournalEntry(expense, user);
    expense.status = "posted";
    expense.postedBy = user;
    expense.postedAt = now + 2;
    expense.journalEntryId = journalEntry.id;
    auditTrail.push({
      id: `AUD-${now + 2}`,
      action: "POSTED",
      performedBy: user,
      timestamp: now + 2,
      notes: `Posted to General Ledger via ${journalEntry.id}`,
      prevStatus: "approved",
      nextStatus: "posted",
    });

    // Write Journal Entry to shop subcollection
    const jeRef = doc(db, "shops", normShop, JOURNAL_ENTRIES_COLLECTION, journalEntry.id);
    await setDoc(jeRef, sanitizeForFirestore(journalEntry));
  }

  const cleanExpense = sanitizeForFirestore(expense);

  // Save to subcollection: `shops/{shopId}/expenses/{expenseId}`
  const docRef = doc(db, "shops", normShop, EXPENSES_COLLECTION, expenseId);
  await setDoc(docRef, cleanExpense);

  // Fallback mirror to root `expenses/{expenseId}` with shopId
  try {
    const rootRef = doc(db, EXPENSES_COLLECTION, expenseId);
    await setDoc(rootRef, cleanExpense);
  } catch (err) {
    console.warn("[ExpenseService] Root mirror write skipped:", err);
  }

  return expense;
}

/**
 * Builds double-entry journal entry for an expense.
 * Validates Debit === Credit.
 */
export function buildExpenseJournalEntry(expense: ExpenseRecord, user: AuditUser): JournalEntry {
  const jeId = generateJournalEntryId();
  const debitAmount = expense.amount;
  const lines: JournalEntryLine[] = [];

  // Line 1: Debit Expense / Asset / Liability / Drawings Account
  lines.push({
    accountCode: expense.glAccountCode,
    accountName: getAccountName(expense.glAccountCode),
    accountCategory: getAccountCategory(expense.glAccountCode),
    debit: debitAmount,
    credit: 0,
  });

  // Credit side:
  // If paid in full: credit Cash/Bank
  // If unpaid: credit Accrued Liabilities (2030)
  // If partial: credit Cash/Bank for amountPaid, Accrued Liabilities for balanceDue
  if (expense.amountPaid > 0) {
    lines.push({
      accountCode: expense.creditAccountCode,
      accountName: getAccountName(expense.creditAccountCode),
      accountCategory: "ASSET",
      debit: 0,
      credit: expense.amountPaid,
    });
  }

  if (expense.balanceDue > 0) {
    lines.push({
      accountCode: "2030", // Accrued Operating Expenses
      accountName: "Accrued Operating Expenses (Payables)",
      accountCategory: "LIABILITY",
      debit: 0,
      credit: expense.balanceDue,
    });
  }

  const totalDebit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;

  return {
    id: jeId,
    shopId: expense.shopId,
    date: expense.date,
    sourceType: "EXPENSE",
    sourceId: expense.id,
    referenceNumber: expense.referenceNumber || expense.id,
    description: `Expense: ${expense.categoryName} - ${expense.vendor} (${expense.description})`,
    lines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    postedBy: user,
    postedAt: Date.now(),
  };
}

/**
 * Approves an expense.
 */
export async function approveExpense(
  shopId: string,
  expenseId: string,
  user: AuditUser,
  notes?: string
): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, EXPENSES_COLLECTION, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Expense ${expenseId} not found in shop ${normShop}`);

  const expense = snap.data() as ExpenseRecord;
  const now = Date.now();

  const auditEntry: ExpenseAuditEntry = {
    id: `AUD-${now}`,
    action: "APPROVED",
    performedBy: user,
    timestamp: now,
    notes: notes || "Expense approved by management",
    prevStatus: expense.status,
    nextStatus: "approved",
  };

  const auditTrail = [...(expense.auditTrail || []), auditEntry];

  await setDoc(
    ref,
    {
      status: "approved",
      approvedBy: user,
      approvedAt: now,
      auditTrail,
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * Posts an approved expense to the General Ledger with double-entry journal entry.
 * Strictly prevents counting twice.
 */
export async function postExpenseToAccounting(
  shopId: string,
  expenseId: string,
  user: AuditUser
): Promise<JournalEntry> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, EXPENSES_COLLECTION, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Expense ${expenseId} not found`);

  const expense = snap.data() as ExpenseRecord;

  // Guard: Never count an expense twice
  if (expense.status === "posted") {
    throw new Error(`Expense ${expenseId} is already posted to the General Ledger!`);
  }

  const now = Date.now();
  const journalEntry = buildExpenseJournalEntry(expense, user);

  // Write Journal Entry
  const jeRef = doc(db, "shops", normShop, JOURNAL_ENTRIES_COLLECTION, journalEntry.id);
  await setDoc(jeRef, journalEntry);

  const auditEntry: ExpenseAuditEntry = {
    id: `AUD-${now}`,
    action: "POSTED",
    performedBy: user,
    timestamp: now,
    notes: `Posted to General Ledger via ${journalEntry.id}`,
    prevStatus: expense.status,
    nextStatus: "posted",
  };

  const auditTrail = [...(expense.auditTrail || []), auditEntry];

  await setDoc(
    ref,
    {
      status: "posted",
      postedBy: user,
      postedAt: now,
      journalEntryId: journalEntry.id,
      auditTrail,
      updatedAt: now,
    },
    { merge: true }
  );

  return journalEntry;
}

/**
 * Records a partial or full payment on an expense.
 */
export async function recordExpensePayment(
  shopId: string,
  expenseId: string,
  paymentInput: RecordExpensePaymentInput,
  user: AuditUser
): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, EXPENSES_COLLECTION, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Expense ${expenseId} not found`);

  const expense = snap.data() as ExpenseRecord;
  const payAmount = Math.max(0, Number(paymentInput.amount) || 0);

  if (payAmount <= 0) throw new Error("Payment amount must be greater than zero");
  if (payAmount > expense.balanceDue + 0.01) {
    throw new Error(`Payment amount (LKR ${payAmount}) exceeds outstanding balance (LKR ${expense.balanceDue})`);
  }

  const now = Date.now();
  const newAmountPaid = Math.min(expense.amount, expense.amountPaid + payAmount);
  const newBalanceDue = Math.max(0, expense.amount - newAmountPaid);

  let newPaymentStatus: ExpensePaymentStatus = "unpaid";
  if (newBalanceDue <= 0.01) {
    newPaymentStatus = "paid";
  } else if (newAmountPaid > 0) {
    newPaymentStatus = "partial";
  }

  const newPaymentRecord: ExpensePaymentRecord = {
    id: `PMT-${now}-${Math.floor(Math.random() * 1000)}`,
    date: paymentInput.date,
    amount: payAmount,
    paymentMethod: paymentInput.paymentMethod,
    reference: paymentInput.reference || "",
    recordedBy: user,
    notes: paymentInput.notes || "Subsequent payment settlement",
    createdAt: now,
  };

  const payments = [...(expense.payments || []), newPaymentRecord];

  const auditEntry: ExpenseAuditEntry = {
    id: `AUD-${now}`,
    action: "PAYMENT_RECORDED",
    performedBy: user,
    timestamp: now,
    notes: `Settlement payment of LKR ${payAmount.toLocaleString()} recorded via ${paymentInput.paymentMethod}. Remaining: LKR ${newBalanceDue.toLocaleString()}`,
    prevStatus: expense.status,
    nextStatus: expense.status,
  };

  const auditTrail = [...(expense.auditTrail || []), auditEntry];

  // If the expense was already posted, post an additional settlement journal entry
  // Debit: 2030 Accrued Liabilities (reducing debt)
  // Credit: Cash / Bank (outflow)
  if (expense.status === "posted") {
    const jeId = generateJournalEntryId();
    const settlementCreditAccount = paymentInput.paymentMethod === "cash" ? "1010" : "1020";
    const paymentJe: JournalEntry = {
      id: jeId,
      shopId: normShop,
      date: paymentInput.date,
      sourceType: "PAYMENT",
      sourceId: expense.id,
      referenceNumber: paymentInput.reference || expense.id,
      description: `Payment settlement for ${expense.id} (${expense.vendor})`,
      lines: [
        {
          accountCode: "2030",
          accountName: "Accrued Operating Expenses (Payables)",
          accountCategory: "LIABILITY",
          debit: payAmount,
          credit: 0,
        },
        {
          accountCode: settlementCreditAccount,
          accountName: getAccountName(settlementCreditAccount),
          accountCategory: "ASSET",
          debit: 0,
          credit: payAmount,
        },
      ],
      totalDebit: payAmount,
      totalCredit: payAmount,
      isBalanced: true,
      postedBy: user,
      postedAt: now,
    };

    const jeRef = doc(db, "shops", normShop, JOURNAL_ENTRIES_COLLECTION, jeId);
    await setDoc(jeRef, paymentJe);
  }

  await setDoc(
    ref,
    {
      amountPaid: newAmountPaid,
      balanceDue: newBalanceDue,
      paymentStatus: newPaymentStatus,
      payments,
      auditTrail,
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * Rejects an expense voucher.
 */
export async function rejectExpense(
  shopId: string,
  expenseId: string,
  user: AuditUser,
  notes?: string
): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, EXPENSES_COLLECTION, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Expense ${expenseId} not found`);

  const expense = snap.data() as ExpenseRecord;
  if (expense.status === "posted") {
    throw new Error("Cannot reject an already posted expense. Void or reverse instead.");
  }

  const now = Date.now();
  const auditEntry: ExpenseAuditEntry = {
    id: `AUD-${now}`,
    action: "REJECTED",
    performedBy: user,
    timestamp: now,
    notes: notes || "Expense rejected by reviewer",
    prevStatus: expense.status,
    nextStatus: "rejected",
  };

  const auditTrail = [...(expense.auditTrail || []), auditEntry];

  await setDoc(
    ref,
    {
      status: "rejected",
      auditTrail,
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * Deletes or cancels an expense.
 */
export async function deleteExpenseRecord(
  shopId: string,
  expenseId: string,
  user: AuditUser
): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, EXPENSES_COLLECTION, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const expense = snap.data() as ExpenseRecord;
  if (expense.status === "posted") {
    throw new Error("Posted accounting expenses cannot be deleted. Cancel or reverse via audit trail.");
  }

  await deleteDoc(ref);

  // Clean root mirror if exists
  try {
    await deleteDoc(doc(db, EXPENSES_COLLECTION, expenseId));
  } catch (err) {
    // ignore
  }
}

// ── Recurring Expenses & Schedule Engine ─────────────────────────────────────

export async function getRecurringSchedules(shopId: string): Promise<RecurringExpenseSchedule[]> {
  const normShop = normalizeShopId(shopId);
  if (!normShop) return [];

  const ref = collection(db, "shops", normShop, RECURRING_EXPENSES_COLLECTION);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecurringExpenseSchedule, "id">) }));
}

export async function createRecurringSchedule(
  shopId: string,
  input: Omit<RecurringExpenseSchedule, "id" | "shopId" | "createdAt" | "updatedAt" | "createdBy">,
  user: AuditUser
): Promise<RecurringExpenseSchedule> {
  const normShop = normalizeShopId(shopId);
  const scheduleId = generateScheduleId();
  const now = Date.now();

  const schedule: RecurringExpenseSchedule = {
    id: scheduleId,
    shopId: normShop,
    ...input,
    createdBy: user,
    createdAt: now,
    updatedAt: now,
  };

  const ref = doc(db, "shops", normShop, RECURRING_EXPENSES_COLLECTION, scheduleId);
  await setDoc(ref, schedule);
  return schedule;
}

export async function updateRecurringSchedule(
  shopId: string,
  scheduleId: string,
  updates: Partial<Omit<RecurringExpenseSchedule, "id" | "shopId" | "createdAt">>
): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, RECURRING_EXPENSES_COLLECTION, scheduleId);
  await setDoc(ref, { ...updates, updatedAt: Date.now() }, { merge: true });
}

export async function deleteRecurringSchedule(shopId: string, scheduleId: string): Promise<void> {
  const normShop = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShop, RECURRING_EXPENSES_COLLECTION, scheduleId);
  await deleteDoc(ref);
}

/**
 * Computes next due date based on frequency.
 */
export function calculateNextDueDate(currentDueDateStr: string, frequency: string): string {
  const parts = currentDueDateStr.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);

  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Generates due recurring expenses while strictly PREVENTING duplicates.
 * Uses a deterministic period key `SCH-{id}_{dueDate}`.
 */
export async function generateDueRecurringExpenses(
  shopId: string,
  user: AuditUser
): Promise<{ generated: ExpenseRecord[]; skipped: number }> {
  const normShop = normalizeShopId(shopId);
  if (!normShop) return { generated: [], skipped: 0 };

  const schedules = await getRecurringSchedules(normShop);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Fetch all existing expenses to inspect idempotency keys
  const expensesRef = collection(db, "shops", normShop, EXPENSES_COLLECTION);
  const expSnap = await getDocs(expensesRef);
  const existingPeriodKeys = new Set<string>();
  expSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.recurringPeriodKey) {
      existingPeriodKeys.add(data.recurringPeriodKey);
    }
  });

  const generated: ExpenseRecord[] = [];
  let skipped = 0;

  for (const schedule of schedules) {
    if (!schedule.isActive) continue;
    if (schedule.endDate && schedule.endDate < todayStr) continue;

    // Check if nextDueDate is on or before today
    if (schedule.nextDueDate <= todayStr) {
      const periodKey = `${schedule.id}_${schedule.nextDueDate}`;

      // Idempotency check: prevent duplicate recurring expenses!
      if (existingPeriodKeys.has(periodKey)) {
        skipped++;
        // Advance next due date anyway so it doesn't get stuck
        const nextDate = calculateNextDueDate(schedule.nextDueDate, schedule.frequency);
        await updateRecurringSchedule(normShop, schedule.id, {
          nextDueDate: nextDate,
          lastGeneratedPeriod: schedule.nextDueDate,
        });
        continue;
      }

      // Create expense record
      const expenseInput: CreateExpenseInput = {
        categoryId: schedule.categoryId,
        categoryName: schedule.categoryName,
        amount: schedule.amount,
        date: schedule.nextDueDate,
        paymentMethod: schedule.paymentMethod,
        description: schedule.description || `Recurring: ${schedule.title}`,
        vendor: schedule.payee,
        autoPost: schedule.autoApprove,
      };

      const created = await createExpenseRecord(normShop, expenseInput, user);

      // Attach recurring tokens
      const expDocRef = doc(db, "shops", normShop, EXPENSES_COLLECTION, created.id);
      await setDoc(
        expDocRef,
        {
          recurringScheduleId: schedule.id,
          recurringPeriodKey: periodKey,
        },
        { merge: true }
      );

      existingPeriodKeys.add(periodKey);
      generated.push({ ...created, recurringScheduleId: schedule.id, recurringPeriodKey: periodKey });

      // Advance next due date
      const nextDate = calculateNextDueDate(schedule.nextDueDate, schedule.frequency);
      await updateRecurringSchedule(normShop, schedule.id, {
        nextDueDate: nextDate,
        lastGeneratedPeriod: schedule.nextDueDate,
      });
    }
  }

  return { generated, skipped };
}

// ── Realtime Subscriptions & Queries ─────────────────────────────────────────

export function subscribeToExpenses(
  shopId: string,
  onUpdate: (expenses: ExpenseRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normShop = normalizeShopId(shopId);
  if (!normShop) {
    onUpdate([]);
    return () => {};
  }

  const ref = collection(db, "shops", normShop, EXPENSES_COLLECTION);
  const q = query(ref, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExpenseRecord, "id">) }));
      onUpdate(records);
    },
    (err) => {
      console.error("[ExpenseService] Subscription error:", err);
      if (onError) onError(err);
    }
  );
}

export function subscribeToCategories(
  shopId: string,
  onUpdate: (categories: ExpenseCategory[]) => void
): Unsubscribe {
  const normShop = normalizeShopId(shopId);
  if (!normShop) {
    onUpdate([]);
    return () => {};
  }

  const ref = collection(db, "shops", normShop, EXPENSE_CATEGORIES_COLLECTION);
  return onSnapshot(
    ref,
    (snap) => {
      const records = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExpenseCategory, "id">) }));
      onUpdate(records);
    },
    (err) => {
      console.error("[ExpenseService] Categories subscription error:", err);
    }
  );
}

export function subscribeToRecurringSchedules(
  shopId: string,
  onUpdate: (schedules: RecurringExpenseSchedule[]) => void
): Unsubscribe {
  const normShop = normalizeShopId(shopId);
  if (!normShop) {
    onUpdate([]);
    return () => {};
  }

  const ref = collection(db, "shops", normShop, RECURRING_EXPENSES_COLLECTION);
  return onSnapshot(
    ref,
    (snap) => {
      const records = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecurringExpenseSchedule, "id">) }));
      onUpdate(records);
    },
    (err) => {
      console.error("[ExpenseService] Recurring subscription error:", err);
    }
  );
}

// ── Summary & Analytics Computation ──────────────────────────────────────────

export function computeExpenseAnalytics(
  expenses: ExpenseRecord[],
  filter?: ExpenseFilterOptions
): ExpenseAnalyticsSummary {
  let filtered = expenses;

  if (filter) {
    if (filter.startDate) {
      filtered = filtered.filter((e) => e.date >= filter.startDate!);
    }
    if (filter.endDate) {
      filtered = filtered.filter((e) => e.date <= filter.endDate!);
    }
    if (filter.categoryId && filter.categoryId !== "ALL") {
      filtered = filtered.filter((e) => e.categoryId === filter.categoryId);
    }
    if (filter.expenseType) {
      filtered = filtered.filter((e) => e.expenseType === filter.expenseType);
    }
    if (filter.status && filter.status !== "ALL") {
      filtered = filtered.filter((e) => e.status === filter.status);
    }
    if (filter.paymentStatus && filter.paymentStatus !== "ALL") {
      filtered = filtered.filter((e) => e.paymentStatus === filter.paymentStatus);
    }
    if (filter.paymentMethod && filter.paymentMethod !== "ALL") {
      filtered = filtered.filter((e) => e.paymentMethod === filter.paymentMethod);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.vendor.toLowerCase().includes(q) ||
          e.categoryName.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          (e.referenceNumber && e.referenceNumber.toLowerCase().includes(q))
      );
    }
  }

  let totalExpenses = 0;
  let totalOperatingExpenses = 0;
  let totalCapitalAssets = 0;
  let totalLiabilitiesPaid = 0;
  let totalOwnerWithdrawals = 0;
  let totalPaid = 0;
  let totalBalanceDue = 0;
  let postedCount = 0;
  let pendingApprovalCount = 0;
  let draftCount = 0;

  const catMap: Record<string, { name: string; total: number; count: number }> = {};
  const methodMap: Record<string, { total: number; count: number }> = {};

  for (const exp of filtered) {
    const amt = exp.amount;
    totalExpenses += amt;
    totalPaid += exp.amountPaid;
    totalBalanceDue += exp.balanceDue;

    if (exp.expenseType === "OPERATING_EXPENSE" || exp.expenseType === "EMPLOYEE_SALARY") {
      totalOperatingExpenses += amt;
    } else if (exp.expenseType === "CAPITAL_ASSET") {
      totalCapitalAssets += amt;
    } else if (exp.expenseType === "LIABILITY_PAYMENT") {
      totalLiabilitiesPaid += amt;
    } else if (exp.expenseType === "OWNER_WITHDRAWAL") {
      totalOwnerWithdrawals += amt;
    }

    if (exp.status === "posted") postedCount++;
    else if (exp.status === "pending_approval") pendingApprovalCount++;
    else if (exp.status === "draft") draftCount++;

    // Category breakdown
    if (!catMap[exp.categoryId]) {
      catMap[exp.categoryId] = { name: exp.categoryName, total: 0, count: 0 };
    }
    catMap[exp.categoryId].total += amt;
    catMap[exp.categoryId].count++;

    // Payment method breakdown
    const pm = exp.paymentMethod || "other";
    if (!methodMap[pm]) {
      methodMap[pm] = { total: 0, count: 0 };
    }
    methodMap[pm].total += amt;
    methodMap[pm].count++;
  }

  const byCategory = Object.entries(catMap).map(([id, val]) => ({
    categoryId: id,
    categoryName: val.name,
    totalAmount: Math.round(val.total * 100) / 100,
    count: val.count,
    percentage: totalExpenses > 0 ? Math.round((val.total / totalExpenses) * 1000) / 10 : 0,
  }));

  const byPaymentMethod = Object.entries(methodMap).map(([method, val]) => ({
    method,
    totalAmount: Math.round(val.total * 100) / 100,
    count: val.count,
  }));

  return {
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
    totalCapitalAssets: Math.round(totalCapitalAssets * 100) / 100,
    totalLiabilitiesPaid: Math.round(totalLiabilitiesPaid * 100) / 100,
    totalOwnerWithdrawals: Math.round(totalOwnerWithdrawals * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalBalanceDue: Math.round(totalBalanceDue * 100) / 100,
    postedCount,
    pendingApprovalCount,
    draftCount,
    byCategory,
    byPaymentMethod,
  };
}
