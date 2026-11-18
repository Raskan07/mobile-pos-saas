/**
 * lib/types/branch.ts
 *
 * Types for Multi-Branch Management within a single Skyfox POS Business (`shopId`):
 * ONE BUSINESS (shopId) -> MULTIPLE BRANCHES (branchId) -> USERS ASSIGNED TO BRANCHES.
 */

export const DEFAULT_BRANCH_ID = "main";
export const ALL_BRANCHES_ID = "ALL";

export type BranchStatus = "active" | "inactive";

export interface BranchSettings {
  taxRate?: number;
  taxName?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  allowNegativeStock?: boolean;
}

export interface Branch {
  id?: string;
  branchId: string;
  shopId: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  managerName?: string;
  status: BranchStatus;
  isDefault: boolean;
  settings?: BranchSettings;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBranchInput {
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  managerName?: string;
  isDefault?: boolean;
  settings?: BranchSettings;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  managerName?: string;
  status?: BranchStatus;
  isDefault?: boolean;
  settings?: BranchSettings;
}

/**
 * Branch-specific inventory for a shared business-level product (`shops/{shopId}/branchStock/{branchId}__{productId}`).
 */
export interface BranchStockRecord {
  id: string;
  shopId: string;
  branchId: string;
  productId: string;
  productName?: string;
  sku?: string;
  stockQuantity: number;
  damagedStock: number;
  minStockLevel: number;
  sellingPriceOverride?: number;
  variantStocks?: Record<string, number>;
  isAssigned: boolean;
  updatedBy?: string;
  updatedAt: number;
}

export interface UpsertBranchStockInput {
  stockQuantity?: number;
  damagedStock?: number;
  minStockLevel?: number;
  sellingPriceOverride?: number;
  variantStocks?: Record<string, number>;
  isAssigned?: boolean;
}

export type BranchTransferStatus =
  | "pending"
  | "approved"
  | "dispatched"
  | "received"
  | "cancelled";

export interface BranchTransferItem {
  productId: string;
  productName: string;
  sku: string;
  variantId?: string;
  variantLabel?: string;
  quantity: number;
  unitCost?: number;
}

export interface BranchTransfer {
  id: string;
  transferNumber: string;
  shopId: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  items: BranchTransferItem[];
  totalQuantity: number;
  totalCostValue: number;
  status: BranchTransferStatus;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  approvedAt?: number;
  dispatchedBy?: string;
  dispatchedAt?: number;
  receivedBy?: string;
  receivedAt?: number;
  cancelledBy?: string;
  cancelledAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBranchTransferInput {
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  items: BranchTransferItem[];
  notes?: string;
}

/**
 * Granular Branch & Multi-Branch RBAC Permissions
 */
export type BranchPermissionKey =
  | "branches.view"
  | "branches.create"
  | "branches.update"
  | "branches.delete"
  | "sales.view"
  | "sales.create"
  | "sales.refund"
  | "inventory.view"
  | "inventory.update"
  | "inventory.transfer"
  | "employees.manage"
  | "reports.view_branch"
  | "reports.view_all_branches"
  | "expenses.manage";

export interface BranchMigrationReport {
  shopId: string;
  defaultBranchId: string;
  defaultBranchCreated: boolean;
  usersUpdated: number;
  branchStockSeeded: number;
  collectionsBackfilled: Record<string, number>;
  totalDocumentsUpdated: number;
  executedAt: number;
  executedBy: string;
  errors: string[];
}

