/**
 * lib/types/customer.ts
 *
 * Domain types for the Customer module.
 *
 * Core Guarantees:
 * 1. Multi-Tenant Scoping: Every customer record carries an immutable `shopId`.
 * 2. Cross-Shop Isolation: All queries must enforce `where("shopId", "==", shopId)`.
 * 3. Loyalty Points Foundation: Simple earn/redeem tracking linked to each customer.
 *    Rules stay minimal now so future tiers, expiry, and rewards can slot in cleanly.
 * 4. Audit Trail: createdBy and updatedBy capture staff identity and role.
 */

import { AuditUser } from "./catalog";

// ── Customer Record ──────────────────────────────────────────────────────────

export interface CustomerRecord {
  id: string;
  shopId: string; // Immutable multi-tenant boundary

  // Core fields
  name: string;
  phone: string; // Primary key for lookup during sales
  email?: string; // Optional

  // Date of birth (stored as ISO date string "YYYY-MM-DD")
  dateOfBirth?: string;

  // Loyalty points — simple accumulator (earn on purchase, redeem for discount)
  loyaltyPoints: number; // Total accrued (lifetime)
  pointsBalance: number; // Current redeemable balance
  totalSpend: number; // Lifetime spend in LKR (updated on each sale)
  totalVisits: number; // Number of completed sales linked to this customer

  // Status
  isActive: boolean;

  // Audit
  notes?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: AuditUser;
  updatedBy?: AuditUser;
}

// ── Input Types ──────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  notes?: string;
  isActive?: boolean;
}

// ── Loyalty Transaction Log ──────────────────────────────────────────────────

export type LoyaltyTransactionType = "EARN" | "REDEEM" | "ADJUSTMENT" | "EXPIRY";

export interface LoyaltyTransaction {
  id: string;
  shopId: string;
  customerId: string;
  type: LoyaltyTransactionType;
  points: number; // Positive for earn, negative for redeem/expiry
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string; // saleId or manual ref
  description: string;
  performedBy: AuditUser;
  createdAt: number;
}

// ── Filter & Search ──────────────────────────────────────────────────────────

export interface CustomerFilterOptions {
  searchQuery?: string; // Matches name or phone
  isActive?: boolean;
}
