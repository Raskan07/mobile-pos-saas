/**
 * lib/types/subscription.ts
 *
 * Multi-Tenant Subscription Engine, Founding Customer Pricing, Feature Entitlements,
 * Resource Limits (Storage, Branches, Users), and Automated Billing Lifecycle types
 * for Skyfox POS Root Terminal.
 */

import { PosModuleId } from "./user";

export type SubscriptionLifecycleStatus =
  | "active"
  | "trial"
  | "grace_period"
  | "suspended"
  | "cancelled";

export type BillingCycle = "monthly" | "annual";

/**
 * All toggleable features per plan or per shop.
 * Includes all 16 POS main menu modules plus advanced system capabilities.
 */
export type SubscriptionFeatureKey =
  | PosModuleId
  | "pos_billing"
  | "whatsapp_ereceipt"
  | "bill_transfer"
  | "multi_branch"
  | "financial_statements";

export interface SubscriptionFeatureDefinition {
  key: SubscriptionFeatureKey;
  label: string;
  category: "core_pos" | "inventory" | "finance" | "operations" | "advanced";
  description: string;
  alwaysEnabled?: boolean;
}

export const SUBSCRIPTION_FEATURE_CATALOG: SubscriptionFeatureDefinition[] = [
  {
    key: "pos_billing",
    label: "POS Checkout & Billing",
    category: "core_pos",
    description: "Core point-of-sale billing counter and thermal receipt printing.",
    alwaysEnabled: true,
  },
  {
    key: "products",
    label: "Product Catalog",
    category: "inventory",
    description: "Branch-scoped products, categories, brands, suppliers, and pricing.",
  },
  {
    key: "barcode",
    label: "Barcode Studio",
    category: "inventory",
    description: "Barcode label generation and thermal sticker printing.",
  },
  {
    key: "purchase_history",
    label: "Purchase History & GRN",
    category: "inventory",
    description: "Supplier purchase bills, stock receiving, and vendor payables.",
  },
  {
    key: "stock_management",
    label: "Stock Management",
    category: "inventory",
    description: "Warehouse inventory counts, adjustments, and stock audit trail.",
  },
  {
    key: "stock_analysis",
    label: "Stock Analysis",
    category: "inventory",
    description: "Inventory valuation, fast/slow moving items, and reorder insights.",
  },
  {
    key: "sales_ledger",
    label: "Sales Ledger & Returns",
    category: "core_pos",
    description: "Complete invoice history, receipt reprints, returns, and exchanges.",
  },
  {
    key: "sales_analytics",
    label: "Sales Analytics Dashboard",
    category: "finance",
    description: "Interactive sales trends, monthly performance vs target, and 24h heatmaps.",
  },
  {
    key: "reports_sst",
    label: "Reports, SST & Accounting",
    category: "finance",
    description: "Profit & Loss, Balance Sheet, Cash Flow, Trial Balance, GL, and SST filing.",
  },
  {
    key: "expenditures",
    label: "Expense Terminal",
    category: "finance",
    description: "Shop expenditures, custom categories, recurring bills, and payroll tracking.",
  },
  {
    key: "operational_summary",
    label: "Operational Summary",
    category: "operations",
    description: "Daily cash desk reconciliation and tender breakdown statements.",
  },
  {
    key: "repair",
    label: "Repair & Service Center",
    category: "operations",
    description: "Device repair intake, technician tracking, diagnostics, and repair billing.",
  },
  {
    key: "installment_sales",
    label: "Installment Sales",
    category: "finance",
    description: "Installment payment plans, down payments, and overdue reminders.",
  },
  {
    key: "customers",
    label: "Customers & Loyalty",
    category: "core_pos",
    description: "Customer directory, purchase history, and loyalty points.",
  },
  {
    key: "role_access",
    label: "Role Access & RBAC",
    category: "operations",
    description: "Granular staff role permissions and audit logging.",
  },
  {
    key: "branch_management",
    label: "Multi-Branch Management",
    category: "advanced",
    description: "Create branches, assign branch staff, and transfer stock between branches.",
  },
  {
    key: "bill_transfer",
    label: "Inter-Machine Bill Transfer",
    category: "advanced",
    description: "Real-time bill transfer between registered POS terminals and USB print queue.",
  },
  {
    key: "whatsapp_ereceipt",
    label: "WhatsApp Digital E-Receipts",
    category: "advanced",
    description: "Secure unguessable digital receipt links and WhatsApp handoff integration.",
  },
  {
    key: "messages",
    label: "Root Broadcast Inbox",
    category: "operations",
    description: "In-app notifications and billing alerts from Root Admin.",
  },
  {
    key: "settings",
    label: "Store & Receipt Settings",
    category: "core_pos",
    description: "Receipt customization, hardware settings, tax/currency, and profile.",
  },
];

export interface SubscriptionResourceLimits {
  /** Maximum database/asset storage in Megabytes (MB). Use -1 for unlimited. */
  maxStorageMB: number;
  /** Maximum branches allowed for the shop. Use -1 for unlimited. */
  maxBranches: number;
  /** Maximum staff user accounts allowed for the shop. Use -1 for unlimited. */
  maxUsers: number;
  /** Optional monthly WhatsApp e-receipt handoff quota. Use -1 for unlimited. */
  maxWhatsappReceiptsPerMonth?: number;
}

/**
 * Editable Subscription Plan Definition stored in Firestore (`subscription_plans/{planId}`).
 */
export interface SubscriptionPlan {
  id: string;
  planId: string;
  name: string;
  code: string;
  description: string;
  badgeText?: string;
  currency: string;
  /** Standard monthly subscription fee */
  monthlyPrice: number;
  /** Annual subscription fee (optional discounted yearly rate) */
  annualPrice: number;
  /** Special discounted monthly price locked in for Founding Customers */
  foundingCustomerMonthlyPrice: number;
  /** Special discounted annual price for Founding Customers */
  foundingCustomerAnnualPrice: number;
  /** Founding customer discount label (e.g., "40% Lifetime Founding Discount") */
  foundingOfferLabel?: string;
  /** Default grace period in days after payment due date before automatic suspension */
  defaultGracePeriodDays: number;
  /** Resource quotas (Storage, Branches, Users) */
  limits: SubscriptionResourceLimits;
  /** Default enabled features for shops on this plan */
  features: Record<string, boolean>;
  isActive: boolean;
  isDefault?: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Current resource usage snapshot for a single shop (`shopId`).
 */
export interface ShopResourceUsage {
  storageUsedBytes: number;
  storageUsedMB: number;
  branchCount: number;
  userCount: number;
  productCount: number;
  saleCount: number;
  whatsappHandoffsCount: number;
  lastCalculatedAt: number;
}

/**
 * Per-Shop Subscription State stored on `shops/{shopId}` and `shop_subscriptions/{shopId}`.
 * Strictly isolated by `shopId`.
 */
export interface ShopSubscription {
  shopId: string;
  shopName: string;
  planId: string;
  planName: string;
  planCode: string;
  status: SubscriptionLifecycleStatus;
  billingCycle: BillingCycle;
  currency: string;

  // Pricing & Founding Customer Privileges
  isFoundingCustomer: boolean;
  foundingCustomerSince?: number;
  foundingCustomerNote?: string;
  standardPrice: number;
  foundingPrice: number;
  customPriceOverride?: number | null;
  /** Actual effective amount billed per cycle (respects custom override -> founding price -> standard price) */
  effectiveBillingAmount: number;

  // Billing Dates, Grace Period & Suspension Tracking
  currentPeriodStart: number;
  currentPeriodEnd: number; // Next payment due timestamp (ms)
  gracePeriodDays: number;
  gracePeriodEndsAt: number; // currentPeriodEnd + (gracePeriodDays * 86400000)
  lastPaymentAt?: number;
  lastPaymentAmount?: number;
  lastPaymentReference?: string;
  totalPaidAmount?: number;
  paymentsCount?: number;
  autoSuspendEnabled: boolean;
  suspendedAt?: number | null;
  suspensionReason?: string | null;
  reactivatedAt?: number | null;

  // Effective Limits & Per-Shop Overrides
  limits: SubscriptionResourceLimits;
  limitOverrides?: Partial<SubscriptionResourceLimits>;

  // Effective Features & Per-Shop Feature Overrides
  /** Merged map of plan features + per-shop overrides */
  effectiveFeatures: Record<string, boolean>;
  /** Explicit per-shop feature toggles set by Root Admin without code changes */
  featureOverrides: Record<string, boolean>;

  // Real-time Resource Usage
  usage: ShopResourceUsage;

  updatedAt: number;
  updatedBy?: string;
}

/**
 * Monthly / Annual Subscription Payment Record (`shops/{shopId}/subscription_payments/{paymentId}`)
 */
export interface SubscriptionPaymentRecord {
  paymentId: string;
  shopId: string;
  shopName: string;
  planId: string;
  planName: string;
  billingCycle: BillingCycle;
  amount: number;
  currency: string;
  isFoundingCustomerRate: boolean;
  paymentMethod: "bank_transfer" | "card" | "cash" | "online" | string;
  referenceNumber: string;
  notes?: string;
  periodStart: number;
  periodEnd: number;
  previousStatus: SubscriptionLifecycleStatus;
  newStatus: SubscriptionLifecycleStatus;
  triggeredReactivation: boolean;
  recordedBy: string;
  createdAt: number;
  createdAtISO: string;
}

/**
 * Automated Subscription Lifecycle Audit Event (`shops/{shopId}/subscription_events/{eventId}`)
 */
export interface SubscriptionLifecycleEvent {
  eventId: string;
  shopId: string;
  shopName: string;
  type:
    | "PLAN_ASSIGNED"
    | "PLAN_UPDATED"
    | "FOUNDING_PRICING_TOGGLED"
    | "FEATURE_TOGGLED"
    | "LIMITS_UPDATED"
    | "PAYMENT_RECORDED"
    | "ENTERED_GRACE_PERIOD"
    | "AUTO_SUSPENDED"
    | "MANUAL_SUSPENDED"
    | "REACTIVATED"
    | "GRACE_EXTENDED";
  previousStatus?: SubscriptionLifecycleStatus;
  newStatus?: SubscriptionLifecycleStatus;
  summary: string;
  actor: string;
  createdAt: number;
}
