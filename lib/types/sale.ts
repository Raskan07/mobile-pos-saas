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

export type PaymentMethod = "cash" | "card" | "bank-transfer" | "mobile-qr" | string;
export type SaleStatus = "completed" | "refunded" | "voided";

export interface SaleRecord {
  saleId: string;              // Unique document ID in `sales` collection
  invoiceNumber: string;       // Human-readable invoice code (e.g. "INV-20260910-4821")
  shopId: string;              // Scoped strictly from authenticated session (UPPERCASE)
  shopName: string;            // Cached shop display name
  branchId: string;            // Store branch identifier (e.g. "main")
  branchName: string;          // Store branch display name

  // Cashier audit trail
  cashierId: string;           // Authenticated user ID (e.g. uid)
  cashierName: string;         // Display name or username
  cashierRole: string;         // Role (e.g. "admin", "manager", "cashier")

  // Product snapshots
  items: SaleItemSnapshot[];
  itemCount: number;           // Total physical items (sum of quantities)

  // Financial breakdown
  subtotal: number;            // Total before order discount and tax
  discountSetting: {
    type: "percentage" | "fixed";
    value: number;
  };
  discountAmount: number;      // Total discount applied
  taxRate: number;             // e.g. 0.08 for 8%
  taxAmount: number;           // Tax added
  grandTotal: number;          // Final amount payable
  total: number;               // Equivalent to grandTotal for convenience

  // Tender details
  paymentMethod: PaymentMethod;
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
    name?: string;
    phone?: string;
    email?: string;
  };
  notes?: string;

  // Timestamps
  createdAt: number;           // Unix millisecond timestamp
  createdAtISO: string;        // ISO 8601 string for human-readable audit
  updatedAt: number;           // Unix millisecond timestamp
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
  cashReceived?: number;
  change?: number;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  notes?: string;
}

export interface SalesFilterOptions {
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
