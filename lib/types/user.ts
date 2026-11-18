/**
 * lib/types/user.ts
 *
 * Types for User management, Roles and Shop Assignment
 */

export type UserRole = "admin" | "manager" | "cashier" | "partner" | "custom" | string;

export type AppModule =
  | "products"
  | "barcode"
  | "purchases"
  | "sales"
  | "stock"
  | "customers"
  | "returns"
  | "roles"
  | "expenditures"
  | "repairs"
  | PosModuleId;

/**
 * Permanent unique permission identifiers for the 16 Main Menu Modules
 * (extensible via `string` for future registered modules such as `warranty_management`).
 */
export type PosModuleId =
  | "products"
  | "barcode"
  | "purchase_history"
  | "repair"
  | "stock_management"
  | "stock_analysis"
  | "role_access"
  | "branch_management"
  | "sales_ledger"
  | "sales_analytics"
  | "reports_sst"
  | "expenditures"
  | "operational_summary"
  | "customers"
  | "messages"
  | "settings"
  | "installment_sales"
  | string;

/**
 * Permanent unique permission identifiers for Settings submenus.
 */
export type SettingsSubPermissionId =
  | "profile"
  | "receipt_modification"
  | "store_profile"
  | "hardware_printer"
  | "currency"
  | "audio_scanner"
  | "security_lock"
  | "bill_transfer_logs"
  | string;

export type RolePermissionsMap = Record<string, boolean>;

export type RoleSubPermissionsMap = {
  settings?: Record<string, boolean>;
  [moduleId: string]: Record<string, boolean> | undefined;
};

/**
 * Firestore document stored at `shops/{shopId}/rolePermissions/{roleId}`
 */
export interface RolePermissionDocument {
  roleId: string;
  shopId: string;
  roleLabel?: string;
  description?: string;
  isSystemRole?: boolean;
  permissions: RolePermissionsMap;
  subPermissions: RoleSubPermissionsMap;
  updatedAt?: unknown;
  updatedAtMs: number;
  updatedBy: string;
  updatedByUsername?: string;
}

/**
 * Immutable audit log document stored at `shops/{shopId}/permissionAuditLogs/{logId}`
 */
export interface PermissionAuditLogRecord {
  id: string;
  shopId: string;
  updatedRole: string;
  adminUserId: string;
  adminUsername: string;
  previousPermissions: {
    permissions: RolePermissionsMap;
    subPermissions: RoleSubPermissionsMap;
  } | null;
  newPermissions: {
    permissions: RolePermissionsMap;
    subPermissions: RoleSubPermissionsMap;
  };
  changedSummary: string[];
  timestamp?: unknown;
  timestampMs: number;
}

export type PermissionKey =
  // Products Module
  | "products:view"
  | "products:manage"
  // Barcode Module
  | "barcode:view"
  | "barcode:print"
  // Purchases Module
  | "purchases:view"
  | "purchases:manage"
  // Sales Module
  | "sales:view"
  | "sales:create"
  | "sales:discount"
  | "sales:void"
  // Stock Module
  | "stock:view"
  | "stock:adjust"
  | "stock:analysis"
  // Customer Module
  | "customers:view"
  | "customers:manage"
  // Returns Module
  | "returns:view"
  | "returns:process"
  // Expenditures Module
  | "expenditures:view"
  | "expenditures:create"
  | "expenditures:edit"
  | "expenditures:delete"
  | "expenditures:approve"
  | "expenditures:categories"
  // Repairs Module
  | "repairs:view"
  | "repairs:create"
  | "repairs:technician"
  | "repairs:approve"
  | "repairs:qc"
  | "repairs:billing"
  | "repairs:manage"
  // Role Access & User Management
  | "roles:manage";

export interface PermissionDefinition {
  key: PermissionKey;
  module: AppModule;
  label: string;
  description: string;
  category: string;
  riskLevel: "low" | "medium" | "high";
}

export interface UserPersonalNote {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ShopUser {
  uid: string;             // Unique user ID
  username: string;        // Unique username per shop (e.g. "admin", "cashier1")
  displayName?: string;    // Optional full name / display name (falls back to username)
  email?: string;          // Optional user login email
  password?: string;       // Plain text password
  passwordHash?: string;   // SHA-256 password hash
  phone?: string;          // Contact number
  avatarUrl?: string;      // Optional profile picture (data URL or remote URL)
  bio?: string;            // Optional personal bio / shift summary
  jobTitle?: string;       // Optional staff position title
  scratchpadNote?: string; // Quick personal scratchpad note
  personalNotes?: UserPersonalNote[]; // Structured personal notes saved by this user
  role: UserRole;          // User role
  shopId: string;          // Assigned to exactly one Shop ID
  shopName?: string;       // Cached shop name for quick display
  branchId?: string;       // Primary branch ID (backward-compatible)
  branchName?: string;     // Primary branch display name
  primaryBranchId?: string; // Explicit primary branch ID
  assignedBranchIds?: string[]; // All authorized branch IDs for this user
  allBranchesAccess?: boolean;  // Explicit business-wide access (admin / multi-branch auditor)
  branchPermissions?: string[]; // Granular BranchPermissionKey[] overrides
  permissions?: string[];  // Extensible permissions array containing PermissionKey values
  customPermissions?: string[]; // Granular fine-tuned permissions if tailored
  status: "active" | "suspended" | "pending";
  createdAt: number;       // Unix timestamp in ms
  updatedAt?: number;      // Unix timestamp in ms
}

export interface CreateUserInput {
  shopId: string;
  username: string;        // Required username
  password?: string;       // Optional password
  displayName?: string;    // Optional display name
  email?: string;          // Optional email
  phone?: string;          // Optional phone
  role: UserRole;          // User role
  branchId?: string;
  branchName?: string;
  primaryBranchId?: string;
  assignedBranchIds?: string[];
  allBranchesAccess?: boolean;
  branchPermissions?: string[];
  permissions?: string[];
}

export interface ShopSession {
  shopId: string;
  shopName: string;
  user: ShopUser;
  originalAdminUser?: ShopUser;
  token?: string;
  loginTime: number;
}

export const ROLE_CONFIG: Record<
  string,
  { label: string; description: string; color: string; bg: string; border: string }
> = {
  admin: {
    label: "Admin",
    description: "Full store control: manage inventory, staff, sales & financial reports",
    color: "text-zinc-200",
    bg: "bg-zinc-800",
    border: "border-zinc-700",
  },
  manager: {
    label: "Manager",
    description: "Store operations: purchases, catalog, stock & day-to-day sales",
    color: "text-zinc-200",
    bg: "bg-zinc-800",
    border: "border-zinc-700",
  },
  cashier: {
    label: "Cashier",
    description: "POS terminal checkout, customer invoicing, receipts & cash desk",
    color: "text-zinc-300",
    bg: "bg-zinc-800/80",
    border: "border-zinc-700/80",
  },
  partner: {
    label: "Partner",
    description: "Store business partner with executive operational visibility",
    color: "text-zinc-200",
    bg: "bg-zinc-800",
    border: "border-zinc-700",
  },
  custom: {
    label: "Custom",
    description: "Tailored permission profile fine-tuned per module by shop administrator",
    color: "text-zinc-300",
    bg: "bg-zinc-800/80",
    border: "border-zinc-700/80",
  },
};

export function getRoleBadge(role: string): { label: string; color: string; bg: string; border: string } {
  const normalized = (role || "cashier").toLowerCase();
  if (ROLE_CONFIG[normalized]) {
    return ROLE_CONFIG[normalized];
  }
  const formatted = role.charAt(0).toUpperCase() + role.slice(1);
  return {
    label: formatted,
    color: "text-zinc-300",
    bg: "bg-zinc-800/80",
    border: "border-zinc-700/80",
  };
}

