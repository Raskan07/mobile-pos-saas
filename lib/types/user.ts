/**
 * lib/types/user.ts
 *
 * Types for User management, Roles and Shop Assignment
 */

export type UserRole = "admin" | "manager" | "cashier";

export interface ShopUser {
  uid: string;             // Unique user ID
  username: string;        // Unique username per shop (e.g. "admin", "cashier1")
  displayName?: string;    // Optional full name / display name (falls back to username)
  email?: string;          // Optional user login email
  password?: string;       // Plain text password
  passwordHash?: string;   // SHA-256 password hash
  phone?: string;          // Contact number
  role: UserRole;          // User role
  shopId: string;          // Assigned to exactly one Shop ID
  shopName?: string;       // Cached shop name for quick display
  branchId?: string;       // Optional branch assignment for multi-branch shops
  branchName?: string;     // Optional branch display name
  permissions?: string[];  // Extensible permissions array
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
  permissions?: string[];
}

export interface ShopSession {
  shopId: string;
  shopName: string;
  user: ShopUser;
  token?: string;
  loginTime: number;
}


export const ROLE_CONFIG: Record<
  UserRole,
  { label: string; description: string; color: string; bg: string; border: string }
> = {
  admin: {
    label: "Admin",
    description: "Full store control: manage inventory, staff, sales & financial reports",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  manager: {
    label: "Manager",
    description: "Store operations: repairs, stock updates, inventory & day-to-day sales",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  cashier: {
    label: "Cashier",
    description: "POS terminal checkout, customer invoicing, receipts & cash desk",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
};
