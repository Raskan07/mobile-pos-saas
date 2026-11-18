/**
 * lib/types/sale.ts
 *
 * TypeScript models for POS Sales Records in Firebase Firestore.
 *
 * Core Architecture:
 * - Every sale document is stored under the root `sales` collection.
 * - Every sale document MUST have an indexed `shopId` for strict multi-tenant isolation.
 * - Every line item in `items` contains an immutable snapshot of product details
 *   (name, variant, SKU, unitPrice, costPrice, discount, subtotal, etc.) so old invoices
 *   stay 100% accurate even if catalog items are updated, repriced, or deleted later.
 */

export interface SaleItemSnapshot {
  productId: string;           // Reference to original product ID
  name: string;                // Product name at time of sale
  variant?: string;            // Variant label / description (e.g. "256GB / Space Gray")
  variantId?: string;          // Optional variant ID if applicable
  sku: string;                 // Product or variant SKU
  barcode?: string;            // Barcode scanned / used
  unitPrice: number;           // Unit selling price at time of sale
  costPrice?: number;          // Cost price at time of sale for margin/profit calculation
  quantity: number;            // Quantity purchased
  discount: number;            // Discount allocated to this line item
  subtotal: number;            // Line total: (unitPrice * quantity) - discount
  unit?: string;               // Measurement unit: e.g. "pcs", "kg", "box"
  brand?: string;              // Product brand
  categoryName?: string;       // Category name snapshot
  imageUrl?: string;           // Product image snapshot
}

export type PaymentMethod = "cash" | "card" | "bank-transfer" | "bank-deposit" | "mobile-qr" | "split" | string;
export type SaleStatus = "completed" | "partially_returned" | "refunded" | "exchanged" | "voided";

export interface SplitPaymentEntry {
  method: "cash" | "card" | "bank-transfer" | "bank-deposit" | "deposit" | "mobile-qr" | string;
  amount: number;
  referenceNumber?: string;
  notes?: string;
}

export interface SaleReturnItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;            // Number of units returned
  unitPrice: number;           // Original selling unit price
  refundAmount: number;        // Total refund for this line (qty * unitPrice - discount share)
  restock: boolean;            // Whether the item is put back into shop inventory
  condition?: "good" | "damaged" | "defective";
}

export interface SaleReturnRecord {
  returnId: string;            // Unique return document ID
  originalSaleId: string;      // ID of the original sale record
  invoiceNumber: string;       // Original invoice number
  shopId: string;              // Tenant shop ID
  returnDate: number;          // Timestamp epoch (ms)
  returnDateISO: string;       // ISO 8601 string
  items: SaleReturnItem[];     // Returned line items
  totalRefundAmount: number;   // Total sum refunded
  refundMethod: "cash" | "card" | "store-credit" | "original" | string;
  reason: string;              // Return explanation/reason
  processedBy: {
    userId: string;
    username: string;
    displayName?: string;
    role: string;
  };
}

export interface SaleExchangeItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  variant?: string;
  categoryName?: string;
}

export interface SaleExchangeRecord {
  exchangeId: string;              // Unique document ID in `sales` or embedded
  exchangeInvoiceNumber: string;   // e.g. "EXC-20261002-8321"
  originalSaleId: string;          // Frozen original sale ID
  originalInvoiceNumber: string;   // Frozen original invoice number
  shopId: string;
  exchangeDate: number;
  exchangeDateISO: string;

  // Items returned by customer
  returnedItems: SaleReturnItem[];
  returnedTotal: number;

  // New replacement items selected by customer
  replacementItems: SaleExchangeItem[];
  replacementTotal: number;

  // Price differential
  difference: number;              // replacementTotal - returnedTotal
  settlementType: "customer_paid" | "store_refunded" | "even_exchange";
  settlementMethod: "cash" | "card" | "store-credit" | "bank-transfer" | "mobile-qr" | string;
  amountSettled: number;           // Math.abs(difference)

  reason: string;
  operator: {
    userId: string;
    username: string;
    displayName?: string;
    role: string;
  };
}

export interface SaleRecord {
  saleId: string;              // Unique document ID in `sales` collection
  invoiceNumber: string;       // Human-readable invoice code (e.g. "INV-20260910-4821")
  shopId: string;              // Scoped strictly from authenticated session (UPPERCASE)
  shopName: string;            // Cached shop display name
  branchId: string;            // Store branch identifier (e.g. "main")
  branchName: string;          // Store branch display name

  // Cashier audit trail (Immutable frozen snapshot to preserve historical record even if cashier role changes later)
  cashierId: string;           // Authenticated user ID (e.g. uid)
  cashierName: string;         // Display name or username
  cashierRole: string;         // Role (e.g. "admin", "manager", "cashier", "custom")
  cashierPermissionsSnapshot?: string[]; // Immutable snapshot of permissions at time of sale

  // Product snapshots
  items: SaleItemSnapshot[];
  itemCount: number;           // Total physical items (sum of quantities)

  // Financial breakdown
  subtotal: number;            // Total before order discount and tax
  discountSetting: {
    type: "percentage" | "fixed";
    value: number;
    scope?: "group" | "item";
  };
  discountAmount: number;      // Total discount applied
  taxRate: number;             // e.g. 0.08 for 8%
  taxAmount: number;           // Tax added
  grandTotal: number;          // Final amount payable
  total: number;               // Equivalent to grandTotal for convenience

  // Tender details
  paymentMethod: PaymentMethod;
  splitPayments?: SplitPaymentEntry[];
  cashReceived?: number;       // Cash tendered by customer (if cash)
  change?: number;             // Change returned to customer (if cash)
  paymentDetails?: {
    cardBrand?: string;
    authCode?: string;
    referenceNumber?: string;
  };

  // Status & metadata
  status: SaleStatus;
  customer?: {
    customerId?: string;       // Registered customer ID (undefined = walk-in guest)
    name?: string;
    phone?: string;
    email?: string;
  };
  notes?: string;

  // Returns audit trail (linked returns without deleting or altering original transaction integrity)
  hasReturns?: boolean;
  returns?: SaleReturnRecord[];
  totalRefunded?: number;

  // Exchanges audit trail (linked exchanges without deleting original transaction integrity)
  hasExchanges?: boolean;
  exchanges?: SaleExchangeRecord[];

  // WhatsApp E-Receipt Handoff Audit Trail (records handoff initiation only, never falsely marked delivered)
  eReceiptToken?: string;
  eReceiptUrl?: string;
  whatsappHandoffStatus?: "not_initiated" | "handoff_initiated";
  whatsappHandoffInitiatedAt?: number;
  whatsappHandoffCount?: number;
  whatsappTargetPhone?: string;

  // Timestamps
  createdAt: number;           // Unix millisecond timestamp
  createdAtISO: string;        // ISO 8601 string for human-readable audit
  updatedAt: number;           // Unix millisecond timestamp
}

export interface ProcessReturnItemInput {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  refundAmount: number;
  restock: boolean;
  condition?: "good" | "damaged" | "defective";
}

export interface ProcessReturnInput {
  saleId: string;
  items: ProcessReturnItemInput[];
  refundMethod: "cash" | "card" | "store-credit" | "original" | string;
  reason: string;
  operator: {
    userId: string;
    username: string;
    displayName?: string;
    role: string;
  };
}

export interface ProcessExchangeItemInput {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal?: number;
  variant?: string;
  categoryName?: string;
}

export interface ProcessExchangeInput {
  originalSaleId: string;
  returnedItems: ProcessReturnItemInput[];
  replacementItems: ProcessExchangeItemInput[];
  settlementMethod: "cash" | "card" | "store-credit" | "bank-transfer" | "mobile-qr" | string;
  reason: string;
  operator: {
    userId: string;
    username: string;
    displayName?: string;
    role: string;
  };
}

export interface EditSaleInput {
  customer?: {
    customerId?: string;
    name?: string;
    phone?: string;
    email?: string;
  };
  notes?: string;
  paymentMethod?: PaymentMethod;
}

export interface CreateSaleInput {
  shopId: string;              // Must match active session shopId
  shopName: string;
  branchId?: string;
  branchName?: string;
  cashier: {
    userId: string;
    username: string;
    displayName?: string;
    role: string;
    permissions?: string[];
  };
  items: SaleItemSnapshot[];
  subtotal: number;
  discountSetting: {
    type: "percentage" | "fixed";
    value: number;
  };
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  splitPayments?: SplitPaymentEntry[];
  cashReceived?: number;
  change?: number;
  customer?: {
    customerId?: string;
    name?: string;
    phone?: string;
    email?: string;
  };
  notes?: string;
}

export interface SalesFilterOptions {
  branchId?: string;           // Filter by branchId ("ALL" or undefined = all branches)
  startDate?: number;          // Milliseconds epoch
  endDate?: number;            // Milliseconds epoch
  paymentMethod?: string;      // Filter by payment method
  cashierId?: string;          // Filter by cashier
  status?: SaleStatus;         // Filter by status
  limitCount?: number;         // Pagination limit (default 50)
  searchTerm?: string;         // Search invoice number or customer
}

export interface ShopSalesSummary {
  totalRevenue: number;
  totalTransactions: number;
  totalItemsSold: number;
  averageOrderValue: number;
  cashTotal: number;
  cardTotal: number;
  otherTotal: number;
  todayRevenue: number;
  todayTransactions: number;
}
