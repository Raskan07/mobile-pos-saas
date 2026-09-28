/**
 * lib/types/purchase.ts
 *
 * Domain types and interfaces for the Purchase History module.
 *
 * Core Guarantees:
 * 1. Strict Status Decoupling:
 *    - `purchaseStatus`: ORDERED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED
 *    - `stockStatus`: PENDING | PARTIALLY_STOCKED | STOCKED | PARTIALLY_RETURNED | RETURNED
 *    - `paymentStatus`: UNPAID | PARTIALLY_PAID | PAID | REFUNDED | OVERPAID
 * 2. Real-World Lifecycles:
 *    - Partial payments & installment schedules
 *    - Post-dated & current cheques with Clearance & Reversible Bounce tracking
 *    - Supplier returns with inventory stock deduction without mutating original order items
 * 3. Immutable Multi-Tenant Scoping:
 *    - Scoped strictly by `shopId`
 *    - Audit logs capturing cashier/manager/admin identity and role
 */

import { AuditUser } from "./catalog";

// ── Status Decoupling ────────────────────────────────────────────────────────

export type PurchaseStatus =
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export type PurchaseStockStatus =
  | "PENDING"
  | "PARTIALLY_STOCKED"
  | "STOCKED"
  | "PARTIALLY_RETURNED"
  | "RETURNED";

export type PurchasePaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "REFUNDED"
  | "OVERPAID";

export type PaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CHEQUE"
  | "CARD"
  | "SUPPLIER_CREDIT";

export type ChequeStatus = "PENDING" | "CLEARED" | "BOUNCED" | "CANCELLED";

export type InstallmentStatus = "PENDING" | "PAID" | "OVERDUE";

export type PurchaseReturnRefundType =
  | "REDUCE_PAYABLE_BALANCE"
  | "CASH_REFUND"
  | "SUPPLIER_CREDIT";

// ── Line Items & Original Snapshot ──────────────────────────────────────────

export interface PurchaseItem {
  id: string;
  productId: string;
  variantId?: string;
  sku: string;
  name: string;
  variantName?: string;
  barcode?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  returnedQuantity: number;
  unitCost: number;
  subtotal: number;
  taxAmount?: number;
  totalCost: number;
}

// ── Cheque Details ──────────────────────────────────────────────────────────

export interface ChequeDetails {
  chequeNumber: string;
  bankName: string;
  chequeDate: number; // Post-dated or issue date in ms
  chequeStatus: ChequeStatus;
  clearedAt?: number;
  bouncedAt?: number;
  bounceReason?: string;
  clearedBy?: AuditUser;
  bouncedBy?: AuditUser;
}

// ── Payment Record (Partial / Full / Cheque) ─────────────────────────────────

export interface PurchasePaymentRecord {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string; // Transaction reference or slip #
  installmentNumber?: number;
  paidAt: number;
  performedBy: AuditUser;
  notes?: string;
  cheque?: ChequeDetails;
}

// ── Installment Schedule ────────────────────────────────────────────────────

export interface PurchaseInstallmentPlan {
  id: string;
  installmentNumber: number;
  dueDate: number; // Unix timestamp in ms
  amountDue: number;
  amountPaid: number;
  status: InstallmentStatus;
  paidAt?: number;
  paymentRecordId?: string;
  notes?: string;
}

// ── Supplier Return (Debit Note) ────────────────────────────────────────────

export interface PurchaseReturnItem {
  productId: string;
  variantId?: string;
  sku: string;
  name: string;
  variantName?: string;
  returnQuantity: number;
  unitCost: number;
  totalRefund: number;
}

export interface PurchaseReturnRecord {
  id: string;
  returnNumber: string; // e.g. RET-20260925-1042
  returnedAt: number;
  items: PurchaseReturnItem[];
  totalReturnedQuantity: number;
  totalRefundAmount: number;
  reason: string; // Defective, Expired, Wrong item, Excess
  refundType: PurchaseReturnRefundType;
  stockDeducted: boolean; // Confirms whether stock was decremented from catalog
  performedBy: AuditUser;
  notes?: string;
}

// ── Audit Log ───────────────────────────────────────────────────────────────

export type PurchaseAuditAction =
  | "CREATED"
  | "STATUS_CHANGED"
  | "PAYMENT_RECORDED"
  | "CHEQUE_CLEARED"
  | "CHEQUE_BOUNCED"
  | "STOCK_RECEIVED"
  | "RETURN_ISSUED"
  | "NOTE_ADDED";

export interface PurchaseAuditEntry {
  id: string;
  timestamp: number;
  action: PurchaseAuditAction;
  performedBy: AuditUser;
  details: string;
  metadata?: Record<string, unknown>;
}

// ── Master Purchase Record ──────────────────────────────────────────────────

export interface PurchaseRecord {
  id: string;
  shopId: string;
  purchaseOrderNumber: string; // e.g. PO-20260925-8321
  supplierInvoiceNumber?: string; // Supplier's own bill/invoice #

  // Supplier Snapshot
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;

  // The 3 Decoupled Statuses
  purchaseStatus: PurchaseStatus;
  stockStatus: PurchaseStockStatus;
  paymentStatus: PurchasePaymentStatus;

  // Ordered Items (Original items remain preserved across returns)
  items: PurchaseItem[];
  totalOrderedQuantity: number;
  totalReceivedQuantity: number;
  totalReturnedQuantity: number;

  // Financials
  subtotalAmount: number;
  taxAmount: number;
  shippingCost: number;
  discountAmount: number;
  totalAmount: number; // Grand total payable
  amountPaid: number;  // Current cleared/valid payments
  balanceDue: number;  // totalAmount - amountPaid (adjusted for returns)

  // Payments & Installments
  payments: PurchasePaymentRecord[];
  hasInstallments: boolean;
  installments: PurchaseInstallmentPlan[];

  // Returns History
  hasReturns: boolean;
  returns: PurchaseReturnRecord[];

  // Audit & Timestamps
  orderedAt: number;
  expectedDeliveryDate?: number;
  receivedAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy: AuditUser;
  notes?: string;
  auditTrail: PurchaseAuditEntry[];
}

// ── Input Types for Service Operations ──────────────────────────────────────

export interface CreatePurchaseItemInput {
  productId: string;
  variantId?: string;
  sku: string;
  name: string;
  variantName?: string;
  barcode?: string;
  orderedQuantity: number;
  unitCost: number;
  taxAmount?: number;
}

export interface CreatePurchaseInstallmentInput {
  installmentNumber: number;
  dueDate: number;
  amountDue: number;
  notes?: string;
}

export interface CreatePurchaseInput {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  supplierInvoiceNumber?: string;
  expectedDeliveryDate?: number;
  items: CreatePurchaseItemInput[];
  shippingCost?: number;
  discountAmount?: number;
  notes?: string;

  // Initial payment if any
  initialPayment?: {
    amount: number;
    paymentMethod: PaymentMethod;
    reference?: string;
    notes?: string;
    cheque?: {
      chequeNumber: string;
      bankName: string;
      chequeDate: number;
    };
  };

  // Optional Installment Plan
  installments?: CreatePurchaseInstallmentInput[];

  // Immediate stock receipt option (if goods arrived at purchase entry time)
  receiveStockNow?: boolean;
}

export interface RecordPaymentInput {
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  installmentId?: string;
  notes?: string;
  cheque?: {
    chequeNumber: string;
    bankName: string;
    chequeDate: number;
  };
}

export interface ReceiveStockItemInput {
  productId: string;
  variantId?: string;
  receiveQuantity: number;
}

export interface CreatePurchaseReturnInput {
  items: {
    productId: string;
    variantId?: string;
    returnQuantity: number;
    reason: string;
  }[];
  reason: string;
  refundType: PurchaseReturnRefundType;
  notes?: string;
}

// ── Filter & Summary Types ──────────────────────────────────────────────────

export interface PurchaseFilterOptions {
  searchQuery?: string;
  supplierId?: string;
  purchaseStatus?: "ALL" | PurchaseStatus;
  stockStatus?: "ALL" | PurchaseStockStatus;
  paymentStatus?: "ALL" | PurchasePaymentStatus;
  installmentStatus?: "ALL" | "HAS_INSTALLMENTS" | "OVERDUE" | "COMPLETED";
  hasReturns?: "ALL" | "WITH_RETURNS" | "NO_RETURNS";
  startDate?: number;
  endDate?: number;
}

export interface PurchaseSummaryMetrics {
  totalPurchasesCount: number;
  totalSpend: number;
  totalPaid: number;
  totalBalanceDue: number;
  pendingChequesCount: number;
  pendingChequesAmount: number;
  overdueInstallmentsCount: number;
  overdueInstallmentsAmount: number;
  totalReturnsCount: number;
  totalReturnsAmount: number;
}
