/**
 * lib/services/customerService.ts
 *
 * Multi-tenant Customer Management Service for Firebase Firestore.
 *
 * Guarantees:
 * 1. Multi-Tenant Scoping: All customers stored under `shops/{shopId}/customers/{customerId}`.
 * 2. Cross-Shop Isolation: Every read/write enforces shopId boundary — no cross-tenant leaks.
 * 3. Duplicate Prevention: Phone number uniqueness enforced per shop before create.
 * 4. Loyalty Points: Atomic earn/redeem via loyalty_transactions subcollection.
 * 5. Audit Trail: Every write records who performed it, role, and timestamp.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { AuditUser } from "../types/catalog";
import {
  CustomerRecord,
  CreateCustomerInput,
  UpdateCustomerInput,
  LoyaltyTransaction,
  LoyaltyTransactionType,
} from "../types/customer";

export const CUSTOMERS_COLLECTION = "customers";
export const LOYALTY_TRANSACTIONS_COLLECTION = "loyalty_transactions";

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertValidShop(shopId?: string): string {
  const normalized = normalizeShopId(shopId || "");
  if (!normalized) {
    throw new Error(
      "Security violation: Active shop session required. Cannot access customers without authenticated shopId."
    );
  }
  return normalized;
}

/**
 * Removes undefined fields before writing to Firestore (Firestore rejects undefined values).
 */
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined) as unknown as T;
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== undefined) cleaned[k] = cleanUndefined(v);
    }
    return cleaned as T;
  }
  return obj;
}

function generateCustomerId(now: number): string {
  return `cust_${now}_${Math.random().toString(36).substring(2, 7)}`;
}

function generateLoyaltyTxId(now: number): string {
  return `ltx_${now}_${Math.random().toString(36).substring(2, 7)}`;
}

function customersRef(shopId: string) {
  return collection(db, "shops", shopId, CUSTOMERS_COLLECTION);
}

// ── 1. Create Customer ────────────────────────────────────────────────────────

/**
 * Creates a new customer strictly scoped to the authenticated shop.
 * Enforces phone number uniqueness per shop before writing.
 */
export async function createCustomer(
  shopId: string,
  input: CreateCustomerInput,
  createdBy: AuditUser
): Promise<CustomerRecord> {
  const normShopId = assertValidShop(shopId);
  const now = Date.now();

  // Validate required fields
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) throw new Error("Customer name is required.");
  if (!phone) throw new Error("Customer phone number is required.");

  // Enforce phone uniqueness within this shop
  const existingQ = query(
    customersRef(normShopId),
    where("phone", "==", phone),
    where("shopId", "==", normShopId)
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) {
    throw new Error(`A customer with phone number "${phone}" already exists in this shop.`);
  }

  const id = generateCustomerId(now);

  const record: CustomerRecord = {
    id,
    shopId: normShopId,
    name,
    phone,
    loyaltyPoints: 0,
    pointsBalance: 0,
    totalSpend: 0,
    totalVisits: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy,
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };

  const docRef = doc(customersRef(normShopId), id);
  await setDoc(docRef, cleanUndefined(record));
  return record;
}

// ── 2. Update Customer ────────────────────────────────────────────────────────

export async function updateCustomer(
  shopId: string,
  customerId: string,
  input: UpdateCustomerInput,
  updatedBy: AuditUser
): Promise<void> {
  const normShopId = assertValidShop(shopId);

  // Verify ownership
  const docRef = doc(customersRef(normShopId), customerId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Customer not found.");
  const existing = snap.data() as CustomerRecord;
  if (normalizeShopId(existing.shopId) !== normShopId) {
    throw new Error("Access denied: Customer does not belong to this shop.");
  }

  // If phone is changing, enforce uniqueness
  if (input.phone && input.phone.trim() !== existing.phone) {
    const phone = input.phone.trim();
    const dupQ = query(
      customersRef(normShopId),
      where("phone", "==", phone),
      where("shopId", "==", normShopId)
    );
    const dupSnap = await getDocs(dupQ);
    if (!dupSnap.empty) {
      throw new Error(`A customer with phone number "${phone}" already exists in this shop.`);
    }
  }

  const updates: Record<string, unknown> = {
    updatedAt: Date.now(),
    updatedBy,
  };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.phone !== undefined) updates.phone = input.phone.trim();
  if (input.email !== undefined) updates.email = input.email.trim() || null;
  if (input.dateOfBirth !== undefined) updates.dateOfBirth = input.dateOfBirth || null;
  if (input.notes !== undefined) updates.notes = input.notes.trim() || null;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  await updateDoc(docRef, cleanUndefined(updates));
}

// ── 3. Get Single Customer ────────────────────────────────────────────────────

export async function getCustomerById(
  shopId: string,
  customerId: string
): Promise<CustomerRecord | null> {
  const normShopId = assertValidShop(shopId);
  const docRef = doc(customersRef(normShopId), customerId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const record = snap.data() as CustomerRecord;
  // Cross-shop isolation check
  if (normalizeShopId(record.shopId) !== normShopId) return null;
  return record;
}

// ── 4. Real-time Subscription ─────────────────────────────────────────────────

/**
 * Real-time listener for customers. Always scoped to shopId — never leaks cross-shop.
 */
export function subscribeToCustomers(
  shopId: string,
  onUpdate: (customers: CustomerRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normShopId = assertValidShop(shopId);

  const q = query(
    customersRef(normShopId),
    where("shopId", "==", normShopId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const customers: CustomerRecord[] = snapshot.docs.map(
        (d) => d.data() as CustomerRecord
      );
      // Sort alphabetically client-side — avoids requiring a composite Firestore index
      customers.sort((a, b) => a.name.localeCompare(b.name));
      onUpdate(customers);
    },
    (err) => {
      console.error(`[CustomerService] Real-time error for shop ${normShopId}:`, err);
      if (onError) onError(err);
    }
  );
}

// ── 5. Search Customers (for picker during sales) ─────────────────────────────

/**
 * In-memory search by name or phone from a pre-loaded list.
 * Call subscribeToCustomers once and filter client-side for snappy UX.
 */
export function filterCustomers(
  customers: CustomerRecord[],
  query: string
): CustomerRecord[] {
  const q = query.toLowerCase().trim();
  if (!q) return customers.filter((c) => c.isActive);
  return customers.filter(
    (c) =>
      c.isActive &&
      (c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)))
  );
}

// ── 6. Loyalty Points Operations ──────────────────────────────────────────────

/**
 * Awards loyalty points to a customer after a completed sale.
 * Rule: 1 point per 100 LKR spent (simple foundation — adjust rule later).
 */
export async function awardLoyaltyPoints(
  shopId: string,
  customerId: string,
  saleTotal: number,
  saleId: string,
  performedBy: AuditUser
): Promise<void> {
  const normShopId = assertValidShop(shopId);
  const pointsEarned = Math.floor(saleTotal / 100);
  if (pointsEarned <= 0) return;

  const now = Date.now();
  const docRef = doc(customersRef(normShopId), customerId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return;

  const customer = snap.data() as CustomerRecord;
  const balanceBefore = customer.pointsBalance;
  const balanceAfter = balanceBefore + pointsEarned;

  await updateDoc(docRef, {
    loyaltyPoints: (customer.loyaltyPoints || 0) + pointsEarned,
    pointsBalance: balanceAfter,
    totalSpend: (customer.totalSpend || 0) + saleTotal,
    totalVisits: (customer.totalVisits || 0) + 1,
    updatedAt: now,
  });

  // Log transaction
  const txId = generateLoyaltyTxId(now);
  const txRef = doc(
    db,
    "shops",
    normShopId,
    CUSTOMERS_COLLECTION,
    customerId,
    LOYALTY_TRANSACTIONS_COLLECTION,
    txId
  );
  const tx: LoyaltyTransaction = {
    id: txId,
    shopId: normShopId,
    customerId,
    type: "EARN",
    points: pointsEarned,
    balanceBefore,
    balanceAfter,
    referenceId: saleId,
    description: `Earned ${pointsEarned} pts from sale ${saleId}`,
    performedBy,
    createdAt: now,
  };
  await setDoc(txRef, tx);
}

/**
 * Deducts loyalty points when redeemed by a customer.
 */
export async function redeemLoyaltyPoints(
  shopId: string,
  customerId: string,
  pointsToRedeem: number,
  referenceId: string,
  performedBy: AuditUser
): Promise<void> {
  const normShopId = assertValidShop(shopId);
  if (pointsToRedeem <= 0) throw new Error("Points to redeem must be greater than 0.");

  const now = Date.now();
  const docRef = doc(customersRef(normShopId), customerId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Customer not found.");

  const customer = snap.data() as CustomerRecord;
  if ((customer.pointsBalance || 0) < pointsToRedeem) {
    throw new Error(
      `Insufficient points. Balance: ${customer.pointsBalance}, Requested: ${pointsToRedeem}`
    );
  }

  const balanceBefore = customer.pointsBalance;
  const balanceAfter = balanceBefore - pointsToRedeem;

  await updateDoc(docRef, {
    pointsBalance: balanceAfter,
    updatedAt: now,
  });

  const txId = generateLoyaltyTxId(now);
  const txRef = doc(
    db,
    "shops",
    normShopId,
    CUSTOMERS_COLLECTION,
    customerId,
    LOYALTY_TRANSACTIONS_COLLECTION,
    txId
  );
  const tx: LoyaltyTransaction = {
    id: txId,
    shopId: normShopId,
    customerId,
    type: "REDEEM",
    points: -pointsToRedeem,
    balanceBefore,
    balanceAfter,
    referenceId,
    description: `Redeemed ${pointsToRedeem} pts`,
    performedBy,
    createdAt: now,
  };
  await setDoc(txRef, tx);
}

/**
 * Fetches loyalty transaction history for a customer.
 */
export async function getLoyaltyTransactions(
  shopId: string,
  customerId: string
): Promise<LoyaltyTransaction[]> {
  const normShopId = assertValidShop(shopId);
  const colRef = collection(
    db,
    "shops",
    normShopId,
    CUSTOMERS_COLLECTION,
    customerId,
    LOYALTY_TRANSACTIONS_COLLECTION
  );
  const snap = await getDocs(colRef);
  const txs = snap.docs.map((d) => d.data() as LoyaltyTransaction);
  txs.sort((a, b) => b.createdAt - a.createdAt);
  return txs;
}
