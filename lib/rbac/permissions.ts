/**
 * lib/rbac/permissions.ts
 *
 * Role-Based Access Control (RBAC) System for Skyfox POS Multi-Tenant SaaS.
 *
 * Modules: Products, Barcode, Purchases, Sales, Stock, Customers, Returns, Roles.
 * Role Presets: Admin, Manager, Cashier, Partner, Custom + User-created dynamic roles.
 */

import { ShopUser, UserRole, AppModule, PermissionKey, PermissionDefinition } from "../types/user";

// ── Module Metadata ──────────────────────────────────────────────────────────

export interface ModuleMetadata {
  id: AppModule;
  name: string;
  badge: string;
  description: string;
  icon: string;
}

export const APP_MODULES: Record<AppModule, ModuleMetadata> = {
  products: {
    id: "products",
    name: "Products & Catalog",
    badge: "Catalog",
    description: "Product inventory items, variants, brands, categories and pricing.",
    icon: "Package",
  },
  barcode: {
    id: "barcode",
    name: "Barcode",
    badge: "Barcode",
    description: "Barcode label generation, printing, scanner testing and scan logs.",
    icon: "ScanLine",
  },
  purchases: {
    id: "purchases",
    name: "Purchase History",
    badge: "Purchases",
    description: "Supplier invoices, purchase orders, receiving logs and returns.",
    icon: "ClipboardList",
  },
  sales: {
    id: "sales",
    name: "Sales & POS Checkout",
    badge: "Sales",
    description: "Terminal cashier register, bill generation, discount application, and order voiding.",
    icon: "Receipt",
  },
  stock: {
    id: "stock",
    name: "Stock Management",
    badge: "Stock",
    description: "Product inventory, batch tracking, manual count adjustments, and valuation reports.",
    icon: "Warehouse",
  },
  customers: {
    id: "customers",
    name: "Customers",
    badge: "Customers",
    description: "Customer directories, contact management, purchase history, and loyalty points.",
    icon: "Users",
  },
  returns: {
    id: "returns",
    name: "Returns & Refunds",
    badge: "Returns",
    description: "Merchandise return intake, restocking, cash refund disbursement, and credit notes.",
    icon: "RotateCcw",
  },
  roles: {
    id: "roles",
    name: "Role Access",
    badge: "Roles",
    description: "Assign store roles, fine-tune module permissions, and manage staff credentials.",
    icon: "ShieldCheck",
  },
  expenditures: {
    id: "expenditures",
    name: "Expenditures & Expenses",
    badge: "Expenses",
    description: "Expense recording, recurring schedules, approval workflows, and double-entry accounting posting.",
    icon: "Receipt",
  },
  repairs: {
    id: "repairs",
    name: "Phone Repair Management",
    badge: "Repairs",
    description: "Device intake, diagnostics, estimates, parts reservation, technician work logs, QC checks, and warranties.",
    icon: "Wrench",
  },
};

// ── Permission Catalog ───────────────────────────────────────────────────────

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // Products Module
  {
    key: "products:view",
    module: "products",
    label: "View Products & Catalog",
    description: "Browse product list, category trees, variant options, and retail prices.",
    category: "Products",
    riskLevel: "low",
  },
  {
    key: "products:manage",
    module: "products",
    label: "Create & Edit Products",
    description: "Add new products, modify selling prices, manage categories and suppliers.",
    category: "Products",
    riskLevel: "medium",
  },

  // Barcode Module
  {
    key: "barcode:view",
    module: "barcode",
    label: "View Barcode Scanner & Records",
    description: "Access barcode scanner view and review SKU barcode mappings.",
    category: "Barcode",
    riskLevel: "low",
  },
  {
    key: "barcode:print",
    module: "barcode",
    label: "Generate & Print Barcode Labels",
    description: "Print barcode shelf stickers and product label sheets.",
    category: "Barcode",
    riskLevel: "low",
  },

  // Purchases Module
  {
    key: "purchases:view",
    module: "purchases",
    label: "View Purchase History",
    description: "Inspect supplier purchase orders, payment status, and delivery bills.",
    category: "Purchases",
    riskLevel: "low",
  },
  {
    key: "purchases:manage",
    module: "purchases",
    label: "Manage Purchases & Supplier Returns",
    description: "Create purchase bills, update supplier payments, and process supplier returns.",
    category: "Purchases",
    riskLevel: "high",
  },

  // Sales Module
  {
    key: "sales:view",
    module: "sales",
    label: "View POS & Sales Register",
    description: "Access POS checkout screen, browse catalog, and view daily sales overview.",
    category: "Sales",
    riskLevel: "low",
  },
  {
    key: "sales:create",
    module: "sales",
    label: "Process Sales & Checkout",
    description: "Ring up items, accept cash/card payments, and finalize customer orders.",
    category: "Sales",
    riskLevel: "medium",
  },
  {
    key: "sales:discount",
    module: "sales",
    label: "Apply Custom Discounts",
    description: "Authorize special percentage or fixed cart/line-item discounts at checkout.",
    category: "Sales",
    riskLevel: "medium",
  },
  {
    key: "sales:void",
    module: "sales",
    label: "Void Orders & Invoices",
    description: "Cancel completed or pending transactions and rollback checkout entries.",
    category: "Sales",
    riskLevel: "high",
  },

  // Stock Module
  {
    key: "stock:view",
    module: "stock",
    label: "View Inventory & Catalog",
    description: "Browse stock levels, warehouse batches, supplier tags, and SKU statuses.",
    category: "Stock",
    riskLevel: "low",
  },
  {
    key: "stock:adjust",
    module: "stock",
    label: "Stock In / Adjust Quantities",
    description: "Perform manual inventory adjustments, stock takes, and write-offs.",
    category: "Stock",
    riskLevel: "high",
  },
  {
    key: "stock:analysis",
    module: "stock",
    label: "View Stock Valuation & Reports",
    description: "Access dead stock forecasting, valuation analysis, and reorder warnings.",
    category: "Stock",
    riskLevel: "low",
  },

  // Customers Module
  {
    key: "customers:view",
    module: "customers",
    label: "View Customer Directory",
    description: "Look up registered customer profiles, purchase logs, and loyalty tier balances.",
    category: "Customers",
    riskLevel: "low",
  },
  {
    key: "customers:manage",
    module: "customers",
    label: "Create & Edit Customer Records",
    description: "Register new customers, edit profiles, and grant/deduct loyalty points.",
    category: "Customers",
    riskLevel: "medium",
  },

  // Returns Module
  {
    key: "returns:view",
    module: "returns",
    label: "View Return & Refund Logs",
    description: "Inspect returned item history, credit notes, and refund audit summaries.",
    category: "Returns",
    riskLevel: "low",
  },
  {
    key: "returns:process",
    module: "returns",
    label: "Process Returns & Authorize Refunds",
    description: "Accept items back into inventory and authorize cash or store credit refunds.",
    category: "Returns",
    riskLevel: "high",
  },

  // Role Access & Administration
  {
    key: "roles:manage",
    module: "roles",
    label: "Manage Staff Roles & Access Control",
    description: "Create shop staff, assign roles, and fine-tune per-module permission toggles.",
    category: "Access Control",
    riskLevel: "high",
  },

  // Expenditures Module
  {
    key: "expenditures:view",
    module: "expenditures",
    label: "View Expenditures & Analytics",
    description: "Browse expense registers, view date/month/year summaries, and review payment status.",
    category: "Expenditures",
    riskLevel: "low",
  },
  {
    key: "expenditures:create",
    module: "expenditures",
    label: "Record Expenses & Vouchers",
    description: "Record daily expenses, attach payees, and submit for verification.",
    category: "Expenditures",
    riskLevel: "medium",
  },
  {
    key: "expenditures:edit",
    module: "expenditures",
    label: "Edit Expense Records",
    description: "Modify expense details, payment schedules, and payee information.",
    category: "Expenditures",
    riskLevel: "medium",
  },
  {
    key: "expenditures:delete",
    module: "expenditures",
    label: "Delete or Void Expenses",
    description: "Delete draft expenses or cancel submitted expenditure vouchers.",
    category: "Expenditures",
    riskLevel: "high",
  },
  {
    key: "expenditures:approve",
    module: "expenditures",
    label: "Approve & Post to General Ledger",
    description: "Authorize payment disbursements and post double-entry accounting transactions.",
    category: "Expenditures",
    riskLevel: "high",
  },
  {
    key: "expenditures:categories",
    module: "expenditures",
    label: "Manage Categories & Recurring Schedules",
    description: "Configure custom expense categories, chart of accounts codes, and recurring expense rules.",
    category: "Expenditures",
    riskLevel: "medium",
  },

  // Repairs Module
  {
    key: "repairs:view",
    module: "repairs",
    label: "View Repair Tickets & Dashboard",
    description: "Browse repair tickets, inspect device history, and monitor workshop status.",
    category: "Repairs",
    riskLevel: "low",
  },
  {
    key: "repairs:create",
    module: "repairs",
    label: "Customer Device Intake",
    description: "Create new repair tickets, capture condition checklists, photos, and customer signature.",
    category: "Repairs",
    riskLevel: "low",
  },
  {
    key: "repairs:technician",
    module: "repairs",
    label: "Diagnostics, Tasks & Parts Usage",
    description: "Perform hardware diagnostics, log bench work, and consume inventory spare parts.",
    category: "Repairs",
    riskLevel: "medium",
  },
  {
    key: "repairs:approve",
    module: "repairs",
    label: "Estimate Creation & Approval",
    description: "Draft quotes, apply labor discounts, and record customer estimate approval.",
    category: "Repairs",
    riskLevel: "medium",
  },
  {
    key: "repairs:qc",
    module: "repairs",
    label: "Quality Control Gate Verification",
    description: "Execute mandatory post-repair QC checklists before release for collection.",
    category: "Repairs",
    riskLevel: "medium",
  },
  {
    key: "repairs:billing",
    module: "repairs",
    label: "Repair Deposits, Billing & POS Settlement",
    description: "Collect deposits, generate final invoices, process refunds, and settle balances.",
    category: "Repairs",
    riskLevel: "high",
  },
  {
    key: "repairs:manage",
    module: "repairs",
    label: "Repair Administration & Warranty Override",
    description: "Manage workshop settings, reassign jobs, issue warranty claims, and void tickets.",
    category: "Repairs",
    riskLevel: "high",
  },
];

// ── Default Role Mappings ────────────────────────────────────────────────────

export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionKey[]> = {
  admin: [
    "products:view",
    "products:manage",
    "barcode:view",
    "barcode:print",
    "purchases:view",
    "purchases:manage",
    "sales:view",
    "sales:create",
    "sales:discount",
    "sales:void",
    "stock:view",
    "stock:adjust",
    "stock:analysis",
    "customers:view",
    "customers:manage",
    "returns:view",
    "returns:process",
    "roles:manage",
    "expenditures:view",
    "expenditures:create",
    "expenditures:edit",
    "expenditures:delete",
    "expenditures:approve",
    "expenditures:categories",
    "repairs:view",
    "repairs:create",
    "repairs:technician",
    "repairs:approve",
    "repairs:qc",
    "repairs:billing",
    "repairs:manage",
  ],
  manager: [
    "products:view",
    "products:manage",
    "barcode:view",
    "barcode:print",
    "purchases:view",
    "purchases:manage",
    "sales:view",
    "sales:create",
    "sales:discount",
    "sales:void",
    "stock:view",
    "stock:adjust",
    "stock:analysis",
    "customers:view",
    "customers:manage",
    "returns:view",
    "returns:process",
    "expenditures:view",
    "expenditures:create",
    "expenditures:edit",
    "expenditures:approve",
    "expenditures:categories",
    "repairs:view",
    "repairs:create",
    "repairs:technician",
    "repairs:approve",
    "repairs:qc",
    "repairs:billing",
    "repairs:manage",
  ],
  partner: [
    "products:view",
    "products:manage",
    "barcode:view",
    "barcode:print",
    "purchases:view",
    "sales:view",
    "stock:view",
    "stock:analysis",
    "customers:view",
    "returns:view",
    "expenditures:view",
    "repairs:view",
  ],
  cashier: [
    "products:view",
    "barcode:view",
    "sales:view",
    "sales:create",
    "stock:view",
    "customers:view",
    "customers:manage",
    "returns:view",
    "expenditures:view",
    "expenditures:create",
    "repairs:view",
    "repairs:create",
    "repairs:billing",
  ],
  technician: [
    "products:view",
    "stock:view",
    "repairs:view",
    "repairs:technician",
    "repairs:qc",
  ],
  custom: [
    "products:view",
    "sales:view",
    "sales:create",
    "expenditures:view",
    "repairs:view",
  ],
};

// ── RBAC Verification Functions ──────────────────────────────────────────────

export function getEffectivePermissions(user: ShopUser | null | undefined): PermissionKey[] {
  if (!user) return [];
  if (user.status === "suspended") return [];

  // Admins always have everything
  if (user.role === "admin") {
    return [...ROLE_DEFAULT_PERMISSIONS.admin];
  }

  // If user has an explicit permissions array stored on document
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions as PermissionKey[];
  }

  // Fallback to role preset defaults
  return ROLE_DEFAULT_PERMISSIONS[user.role] || ROLE_DEFAULT_PERMISSIONS.cashier || [];
}

export function hasPermission(
  user: ShopUser | null | undefined,
  permission: PermissionKey
): boolean {
  if (!user || user.status === "suspended") return false;
  if (user.role === "admin") return true;

  const effective = getEffectivePermissions(user);
  return effective.includes(permission);
}

export function hasAnyPermission(
  user: ShopUser | null | undefined,
  permissions: PermissionKey[]
): boolean {
  if (!user || user.status === "suspended") return false;
  if (user.role === "admin") return true;

  const effective = getEffectivePermissions(user);
  return permissions.some((p) => effective.includes(p));
}

export function canAccessModule(
  user: ShopUser | null | undefined,
  module: AppModule
): boolean {
  if (!user || user.status === "suspended") return false;
  if (user.role === "admin") return true;

  const modulePermissions = PERMISSION_CATALOG.filter((p) => p.module === module).map(
    (p) => p.key
  );
  return hasAnyPermission(user, modulePermissions);
}

export function isShopAdmin(user: ShopUser | null | undefined): boolean {
  if (!user || user.status === "suspended") return false;
  return user.role === "admin" || (Array.isArray(user.permissions) && user.permissions.includes("roles:manage"));
}
