/**
 * lib/services/branchService.ts
 *
 * Multi-Branch Management Service for Skyfox POS.
 *
 * Hierarchy:
 *   shops/{shopId}
 *     ├── branches/{branchId}
 *     ├── branchStock/{branchId}__{productId}
 *     ├── branchTransfers/{transferId}
 *     └── users/{userId}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import {
  Branch,
  BranchStatus,
  CreateBranchInput,
  UpdateBranchInput,
  BranchStockRecord,
  UpsertBranchStockInput,
  BranchTransfer,
  BranchTransferStatus,
  CreateBranchTransferInput,
  BranchMigrationReport,
  DEFAULT_BRANCH_ID,
} from "../types/branch";
import { ProductItem } from "../types/catalog";
import { ShopUser } from "../types/user";

export const BRANCHES_SUBCOLLECTION = "branches";
export const BRANCH_STOCK_SUBCOLLECTION = "branchStock";
export const BRANCH_TRANSFERS_SUBCOLLECTION = "branchTransfers";

function generateBranchId(name: string): string {
  const slug = (name || "branch")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  const rand = Math.random().toString(36).substring(2, 6);
  return `br_${slug || "loc"}_${rand}`;
}

function generateTransferNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.floor(1000 + Math.random() * 9000);
  return `TRF-${y}${m}${d}-${r}`;
}

export function getBranchStockDocId(branchId: string, productId: string): string {
  return `${branchId}__${productId}`;
}

// ============================================================================
// 1. BRANCH CRUD & DEFAULT BRANCH GUARANTEES
// ============================================================================

/**
 * Idempotently guarantees every shop has at least one default branch (`main`).
 * Safe to call on login, dashboard load, or migration.
 */
export async function ensureDefaultBranch(
  shopId: string,
  shopName?: string,
  address?: string,
  phone?: string
): Promise<Branch> {
  const normShopId = normalizeShopId(shopId);
  const branchesRef = collection(db, "shops", normShopId, BRANCHES_SUBCOLLECTION);
  const snap = await getDocs(branchesRef);

  if (!snap.empty) {
    const existing = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Branch) }));
    const def = existing.find((b) => b.isDefault) || existing[0];
    return def;
  }

  const now = Date.now();
  const defaultBranch: Branch = {
    id: DEFAULT_BRANCH_ID,
    branchId: DEFAULT_BRANCH_ID,
    shopId: normShopId,
    name: shopName ? `${shopName} — Main Branch` : "Main Branch",
    code: "HQ",
    address: address || "",
    phone: phone || "",
    status: "active",
    isDefault: true,
    createdBy: "system",
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, "shops", normShopId, BRANCHES_SUBCOLLECTION, DEFAULT_BRANCH_ID), defaultBranch);
  return defaultBranch;
}

export async function getBranches(shopId: string): Promise<Branch[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];
  const snap = await getDocs(collection(db, "shops", normShopId, BRANCHES_SUBCOLLECTION));
  if (snap.empty) {
    const def = await ensureDefaultBranch(normShopId);
    return [def];
  }
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Branch) }))
    .sort((a, b) => (a.isDefault === b.isDefault ? a.createdAt - b.createdAt : a.isDefault ? -1 : 1));
}

export function subscribeToBranches(
  shopId: string,
  callback: (branches: Branch[]) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return () => {};
  const ref = collection(db, "shops", normShopId, BRANCHES_SUBCOLLECTION);
  return onSnapshot(ref, async (snap) => {
    if (snap.empty) {
      const def = await ensureDefaultBranch(normShopId);
      callback([def]);
      return;
    }
    const list = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Branch) }))
      .sort((a, b) => (a.isDefault === b.isDefault ? a.createdAt - b.createdAt : a.isDefault ? -1 : 1));
    callback(list);
  });
}

export async function createBranch(
  shopId: string,
  actorUserId: string,
  input: CreateBranchInput
): Promise<Branch> {
  const normShopId = normalizeShopId(shopId);
  const name = (input.name || "").trim();
  if (!name) throw new Error("Branch name is required.");

  const branchId = generateBranchId(name);
  const now = Date.now();
  const branchDoc: Branch = {
    id: branchId,
    branchId,
    shopId: normShopId,
    name,
    code: (input.code || name.slice(0, 3)).trim().toUpperCase(),
    address: (input.address || "").trim(),
    phone: (input.phone || "").trim(),
    email: (input.email || "").trim().toLowerCase(),
    managerName: (input.managerName || "").trim(),
    status: "active",
    isDefault: Boolean(input.isDefault),
    settings: input.settings || {},
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  // Ensure default branch exists first so we never replace or lose the default branch
  await ensureDefaultBranch(normShopId);

  if (branchDoc.isDefault) {
    const existing = await getBranches(normShopId);
    const batch = writeBatch(db);
    for (const b of existing) {
      if (b.isDefault) {
        batch.update(doc(db, "shops", normShopId, BRANCHES_SUBCOLLECTION, b.branchId), {
          isDefault: false,
          updatedAt: now,
        });
      }
    }
    batch.set(doc(db, "shops", normShopId, BRANCHES_SUBCOLLECTION, branchId), branchDoc);
    await batch.commit();
  } else {
    await setDoc(doc(db, "shops", normShopId, BRANCHES_SUBCOLLECTION, branchId), branchDoc);
  }

  return branchDoc;
}

export async function updateBranch(
  shopId: string,
  branchId: string,
  updates: UpdateBranchInput
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  const now = Date.now();
  const ref = doc(db, "shops", normShopId, BRANCHES_SUBCOLLECTION, branchId);
  const cleanUpdates: Record<string, unknown> = { updatedAt: now };

  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.code !== undefined) cleanUpdates.code = updates.code.trim().toUpperCase();
  if (updates.address !== undefined) cleanUpdates.address = updates.address.trim();
  if (updates.phone !== undefined) cleanUpdates.phone = updates.phone.trim();
  if (updates.email !== undefined) cleanUpdates.email = updates.email.trim().toLowerCase();
  if (updates.managerName !== undefined) cleanUpdates.managerName = updates.managerName.trim();
  if (updates.status !== undefined) cleanUpdates.status = updates.status;
  if (updates.settings !== undefined) cleanUpdates.settings = updates.settings;

  if (updates.isDefault) {
    const existing = await getBranches(normShopId);
    const batch = writeBatch(db);
    for (const b of existing) {
      if (b.branchId !== branchId && b.isDefault) {
        batch.update(doc(db, "shops", normShopId, BRANCHES_SUBCOLLECTION, b.branchId), {
          isDefault: false,
          updatedAt: now,
        });
      }
    }
    batch.update(ref, { ...cleanUpdates, isDefault: true });
    await batch.commit();
  } else {
    await updateDoc(ref, cleanUpdates);
  }
}

export async function toggleBranchStatus(
  shopId: string,
  branchId: string,
  nextStatus: BranchStatus
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShopId, BRANCHES_SUBCOLLECTION, branchId);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().isDefault && nextStatus === "inactive") {
    throw new Error("Cannot deactivate the shop's default branch. Set another branch as default first.");
  }
  await updateDoc(ref, { status: nextStatus, updatedAt: Date.now() });
}

// ============================================================================
// 2. BRANCH-SPECIFIC STOCK & SHARED PRODUCT ASSIGNMENT
// ============================================================================

export async function getAllBranchStocks(shopId: string): Promise<BranchStockRecord[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];
  const snap = await getDocs(collection(db, "shops", normShopId, BRANCH_STOCK_SUBCOLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BranchStockRecord, "id">) }));
}

export async function getBranchStockForBranch(
  shopId: string,
  branchId: string
): Promise<BranchStockRecord[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId || !branchId) return [];
  const q = query(
    collection(db, "shops", normShopId, BRANCH_STOCK_SUBCOLLECTION),
    where("branchId", "==", branchId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BranchStockRecord, "id">) }));
}

export function subscribeToBranchStock(
  shopId: string,
  branchId: string | null,
  callback: (records: BranchStockRecord[]) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return () => {};
  const colRef = collection(db, "shops", normShopId, BRANCH_STOCK_SUBCOLLECTION);
  const q = branchId ? query(colRef, where("branchId", "==", branchId)) : colRef;
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BranchStockRecord, "id">) }))
    );
  });
}

export async function upsertBranchStock(
  shopId: string,
  branchId: string,
  productId: string,
  actorUserId: string,
  input: UpsertBranchStockInput,
  productMeta?: { name?: string; sku?: string }
): Promise<BranchStockRecord> {
  const normShopId = normalizeShopId(shopId);
  const docId = getBranchStockDocId(branchId, productId);
  const ref = doc(db, "shops", normShopId, BRANCH_STOCK_SUBCOLLECTION, docId);
  const snap = await getDoc(ref);
  const now = Date.now();

  if (snap.exists()) {
    const existing = snap.data() as BranchStockRecord;
    const updated: BranchStockRecord = {
      ...existing,
      stockQuantity: input.stockQuantity ?? existing.stockQuantity,
      damagedStock: input.damagedStock ?? existing.damagedStock,
      minStockLevel: input.minStockLevel ?? existing.minStockLevel,
      sellingPriceOverride:
        input.sellingPriceOverride !== undefined
          ? input.sellingPriceOverride
          : existing.sellingPriceOverride,
      variantStocks: input.variantStocks ?? existing.variantStocks,
      isAssigned: input.isAssigned ?? existing.isAssigned,
      updatedBy: actorUserId,
      updatedAt: now,
    };
    await setDoc(ref, updated, { merge: true });
    return updated;
  }

  const created: BranchStockRecord = {
    id: docId,
    shopId: normShopId,
    branchId,
    productId,
    productName: productMeta?.name || "",
    sku: productMeta?.sku || "",
    stockQuantity: input.stockQuantity ?? 0,
    damagedStock: input.damagedStock ?? 0,
    minStockLevel: input.minStockLevel ?? 5,
    sellingPriceOverride: input.sellingPriceOverride,
    variantStocks: input.variantStocks,
    isAssigned: input.isAssigned ?? true,
    updatedBy: actorUserId,
    updatedAt: now,
  };
  await setDoc(ref, created);
  return created;
}

export async function adjustBranchStock(
  shopId: string,
  branchId: string,
  productId: string,
  delta: number,
  actorUserId: string,
  opts?: { damagedDelta?: number; variantId?: string; productName?: string; sku?: string }
): Promise<number> {
  const normShopId = normalizeShopId(shopId);
  const docId = getBranchStockDocId(branchId, productId);
  const ref = doc(db, "shops", normShopId, BRANCH_STOCK_SUBCOLLECTION, docId);
  const snap = await getDoc(ref);
  const now = Date.now();

  if (!snap.exists()) {
    const nextQty = Math.max(0, delta);
    const nextDamaged = Math.max(0, opts?.damagedDelta || 0);
    const variantStocks = opts?.variantId ? { [opts.variantId]: Math.max(0, delta) } : undefined;
    await setDoc(ref, {
      id: docId,
      shopId: normShopId,
      branchId,
      productId,
      productName: opts?.productName || "",
      sku: opts?.sku || "",
      stockQuantity: nextQty,
      damagedStock: nextDamaged,
      minStockLevel: 5,
      ...(variantStocks ? { variantStocks } : {}),
      isAssigned: true,
      updatedBy: actorUserId,
      updatedAt: now,
    });
    return nextQty;
  }

  const current = snap.data() as BranchStockRecord;
  const nextQty = Math.max(0, (current.stockQuantity || 0) + delta);
  const nextDamaged = Math.max(0, (current.damagedStock || 0) + (opts?.damagedDelta || 0));
  const nextVariantStocks = { ...(current.variantStocks || {}) };
  if (opts?.variantId) {
    nextVariantStocks[opts.variantId] = Math.max(
      0,
      (nextVariantStocks[opts.variantId] || 0) + delta
    );
  }

  await updateDoc(ref, {
    stockQuantity: nextQty,
    damagedStock: nextDamaged,
    ...(opts?.variantId ? { variantStocks: nextVariantStocks } : {}),
    updatedBy: actorUserId,
    updatedAt: now,
  });

  return nextQty;
}

/**
 * Assigns a shared business-level product to selected branches (or all branches).
 */
export async function assignProductToBranches(
  shopId: string,
  product: ProductItem,
  branchIds: string[],
  assignToAllBranches: boolean,
  actorUserId: string
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  const allBranches = await getBranches(normShopId);
  const targetIds = assignToAllBranches
    ? allBranches.map((b) => b.branchId)
    : branchIds;

  const batch = writeBatch(db);
  const now = Date.now();

  // Update shared product metadata
  batch.update(doc(db, "shops", normShopId, "products", product.id), {
    assignedBranchIds: targetIds,
    assignToAllBranches,
    updatedAt: now,
  });

  // Ensure branchStock record exists for each assigned branch
  for (const bId of targetIds) {
    const docId = getBranchStockDocId(bId, product.id);
    const ref = doc(db, "shops", normShopId, BRANCH_STOCK_SUBCOLLECTION, docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      batch.set(ref, {
        id: docId,
        shopId: normShopId,
        branchId: bId,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        stockQuantity: 0,
        damagedStock: 0,
        minStockLevel: product.minStockLevel ?? 5,
        isAssigned: true,
        updatedBy: actorUserId,
        updatedAt: now,
      });
    } else {
      batch.update(ref, { isAssigned: true, updatedAt: now });
    }
  }

  await batch.commit();
}

// ============================================================================
// 3. BRANCH-TO-BRANCH STOCK TRANSFERS
// ============================================================================

export async function getBranchTransfers(
  shopId: string,
  branchId?: string
): Promise<BranchTransfer[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];
  const snap = await getDocs(collection(db, "shops", normShopId, BRANCH_TRANSFERS_SUBCOLLECTION));
  const list = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<BranchTransfer, "id">) }))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!branchId) return list;
  return list.filter((t) => t.fromBranchId === branchId || t.toBranchId === branchId);
}

export function subscribeToBranchTransfers(
  shopId: string,
  callback: (transfers: BranchTransfer[]) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return () => {};
  const ref = collection(db, "shops", normShopId, BRANCH_TRANSFERS_SUBCOLLECTION);
  return onSnapshot(ref, (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<BranchTransfer, "id">) }))
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  });
}

export async function createBranchTransfer(
  shopId: string,
  actorUser: { uid: string; name?: string },
  input: CreateBranchTransferInput
): Promise<BranchTransfer> {
  const normShopId = normalizeShopId(shopId);
  if (!input.fromBranchId || !input.toBranchId) {
    throw new Error("Source and destination branches are required.");
  }
  if (input.fromBranchId === input.toBranchId) {
    throw new Error("Source and destination branches must be different.");
  }
  if (!input.items || input.items.length === 0) {
    throw new Error("At least one product item is required for a transfer.");
  }

  const now = Date.now();
  const id = `trf_${now}_${Math.random().toString(36).substring(2, 6)}`;
  const totalQuantity = input.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalCostValue = input.items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0),
    0
  );

  const transfer: BranchTransfer = {
    id,
    transferNumber: generateTransferNumber(),
    shopId: normShopId,
    fromBranchId: input.fromBranchId,
    fromBranchName: input.fromBranchName,
    toBranchId: input.toBranchId,
    toBranchName: input.toBranchName,
    items: input.items,
    totalQuantity,
    totalCostValue,
    status: "pending",
    notes: (input.notes || "").trim(),
    createdBy: actorUser.uid,
    createdByName: actorUser.name || actorUser.uid,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, "shops", normShopId, BRANCH_TRANSFERS_SUBCOLLECTION, id), transfer);
  return transfer;
}

/**
 * Transitions a Branch Transfer through:
 * pending -> approved -> dispatched (deducts source branch stock) -> received (credits destination branch stock)
 * or cancelled (restores source stock if already dispatched).
 */
export async function updateBranchTransferStatus(
  shopId: string,
  transferId: string,
  nextStatus: BranchTransferStatus,
  actorUserId: string
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  const ref = doc(db, "shops", normShopId, BRANCH_TRANSFERS_SUBCOLLECTION, transferId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Branch transfer not found.");

  const current = snap.data() as BranchTransfer;
  const prevStatus = current.status;
  if (prevStatus === "received" || prevStatus === "cancelled") {
    throw new Error(`Transfer is already ${prevStatus} and cannot be modified.`);
  }

  const now = Date.now();
  const updates: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: now,
  };

  if (nextStatus === "approved") {
    updates.approvedBy = actorUserId;
    updates.approvedAt = now;
  } else if (nextStatus === "dispatched") {
    updates.dispatchedBy = actorUserId;
    updates.dispatchedAt = now;
    // Deduct stock from source branch
    for (const item of current.items) {
      await adjustBranchStock(
        normShopId,
        current.fromBranchId,
        item.productId,
        -Math.abs(item.quantity),
        actorUserId,
        { variantId: item.variantId, productName: item.productName, sku: item.sku }
      );
    }
  } else if (nextStatus === "received") {
    updates.receivedBy = actorUserId;
    updates.receivedAt = now;
    // If jumping straight from pending/approved -> received, deduct source first
    if (prevStatus === "pending" || prevStatus === "approved") {
      for (const item of current.items) {
        await adjustBranchStock(
          normShopId,
          current.fromBranchId,
          item.productId,
          -Math.abs(item.quantity),
          actorUserId,
          { variantId: item.variantId, productName: item.productName, sku: item.sku }
        );
      }
    }
    // Credit stock to destination branch
    for (const item of current.items) {
      await adjustBranchStock(
        normShopId,
        current.toBranchId,
        item.productId,
        Math.abs(item.quantity),
        actorUserId,
        { variantId: item.variantId, productName: item.productName, sku: item.sku }
      );
    }
  } else if (nextStatus === "cancelled") {
    updates.cancelledBy = actorUserId;
    updates.cancelledAt = now;
    // Restore source stock if it had already been dispatched
    if (prevStatus === "dispatched") {
      for (const item of current.items) {
        await adjustBranchStock(
          normShopId,
          current.fromBranchId,
          item.productId,
          Math.abs(item.quantity),
          actorUserId,
          { variantId: item.variantId, productName: item.productName, sku: item.sku }
        );
      }
    }
  }

  await updateDoc(ref, updates);
}

// ============================================================================
// 4. EMPLOYEE BRANCH ASSIGNMENT
// ============================================================================

export async function assignEmployeeToBranches(
  shopId: string,
  userId: string,
  primaryBranchId: string,
  primaryBranchName: string,
  assignedBranchIds: string[],
  allBranchesAccess: boolean
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  const cleanAssigned = Array.from(new Set([primaryBranchId, ...assignedBranchIds].filter(Boolean)));
  const now = Date.now();
  const payload = {
    branchId: primaryBranchId,
    branchName: primaryBranchName,
    primaryBranchId,
    assignedBranchIds: cleanAssigned,
    allBranchesAccess,
    updatedAt: now,
  };

  await Promise.all([
    updateDoc(doc(db, "shops", normShopId, "users", userId), payload).catch(() => {}),
    updateDoc(doc(db, "users", userId), payload).catch(() => {}),
  ]);
}

// ============================================================================
// 5. IDEMPOTENT DATA MIGRATION (BACKFILL DEFAULT BRANCH TO LEGACY RECORDS)
// ============================================================================

const OPERATIONAL_SUBCOLLECTIONS = [
  "sales",
  "purchases",
  "expenses",
  "repairs",
  "installments",
  "stock_transactions",
  "returns",
  "exchanges",
];

/**
 * Safely and idempotently migrates an existing shop to the multi-branch schema:
 * 1. Ensures default branch exists (`main`).
 * 2. Backfills `primaryBranchId` / `assignedBranchIds` on users missing them.
 * 3. Seeds `branchStock` for the default branch from existing `products` (if not yet seeded).
 * 4. Backfills `branchId: defaultBranch.branchId` on operational records missing `branchId`.
 * Never deletes or overwrites existing `branchId` values.
 */
export async function migrateShopToMultiBranch(
  shopId: string,
  executedBy: string
): Promise<BranchMigrationReport> {
  const normShopId = normalizeShopId(shopId);
  const errors: string[] = [];
  const collectionsBackfilled: Record<string, number> = {};
  let usersUpdated = 0;
  let branchStockSeeded = 0;
  let totalDocumentsUpdated = 0;

  // 1. Check if default branch already existed
  const branchesSnapBefore = await getDocs(collection(db, "shops", normShopId, BRANCHES_SUBCOLLECTION));
  const defaultBranchCreated = branchesSnapBefore.empty;
  const defaultBranch = await ensureDefaultBranch(normShopId);

  // 2. Backfill users in shops/{shopId}/users
  try {
    const usersSnap = await getDocs(collection(db, "shops", normShopId, "users"));
    let batch = writeBatch(db);
    let ops = 0;
    for (const uDoc of usersSnap.docs) {
      const data = uDoc.data() as Partial<ShopUser>;
      if (!data.primaryBranchId || !Array.isArray(data.assignedBranchIds) || data.assignedBranchIds.length === 0) {
        const pBranch = data.branchId || defaultBranch.branchId;
        const pName = data.branchName || defaultBranch.name;
        const isAdmin = (data.role || "").toLowerCase() === "admin";
        batch.update(uDoc.ref, {
          branchId: pBranch,
          branchName: pName,
          primaryBranchId: pBranch,
          assignedBranchIds: [pBranch],
          allBranchesAccess: data.allBranchesAccess ?? isAdmin,
        });
        usersUpdated++;
        ops++;
        if (ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
    }
    if (ops > 0) await batch.commit();
  } catch (err) {
    errors.push(`Users backfill error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Seed branchStock for default branch from existing products
  try {
    const prodsSnap = await getDocs(collection(db, "shops", normShopId, "products"));
    let batch = writeBatch(db);
    let ops = 0;
    const now = Date.now();
    for (const pDoc of prodsSnap.docs) {
      const prod = pDoc.data() as ProductItem;
      const stockDocId = getBranchStockDocId(defaultBranch.branchId, pDoc.id);
      const stockRef = doc(db, "shops", normShopId, BRANCH_STOCK_SUBCOLLECTION, stockDocId);
      const existingStock = await getDoc(stockRef);
      if (!existingStock.exists()) {
        const variantStocks: Record<string, number> = {};
        if (Array.isArray(prod.variants)) {
          for (const v of prod.variants) {
            variantStocks[v.id] = Number(v.stockQuantity) || 0;
          }
        }
        batch.set(stockRef, {
          id: stockDocId,
          shopId: normShopId,
          branchId: defaultBranch.branchId,
          productId: pDoc.id,
          productName: prod.name || "",
          sku: prod.sku || "",
          stockQuantity: Number(prod.stockQuantity) || 0,
          damagedStock: 0,
          minStockLevel: Number(prod.minStockLevel) || 5,
          ...(Object.keys(variantStocks).length > 0 ? { variantStocks } : {}),
          isAssigned: true,
          updatedBy: executedBy,
          updatedAt: now,
        });
        branchStockSeeded++;
        ops++;
        if (ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
    }
    if (ops > 0) await batch.commit();
  } catch (err) {
    errors.push(`BranchStock seed error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Backfill missing branchId on operational subcollections (batched)
  for (const colName of OPERATIONAL_SUBCOLLECTIONS) {
    let count = 0;
    try {
      const colSnap = await getDocs(collection(db, "shops", normShopId, colName));
      let batch = writeBatch(db);
      let ops = 0;
      for (const d of colSnap.docs) {
        const data = d.data();
        if (!data.branchId) {
          batch.update(d.ref, {
            branchId: defaultBranch.branchId,
            branchName: defaultBranch.name,
          });
          count++;
          ops++;
          if (ops >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
      }
      if (ops > 0) await batch.commit();
    } catch (err) {
      errors.push(`${colName} backfill error: ${err instanceof Error ? err.message : String(err)}`);
    }
    collectionsBackfilled[colName] = count;
    totalDocumentsUpdated += count;
  }

  totalDocumentsUpdated += usersUpdated + branchStockSeeded;

  return {
    shopId: normShopId,
    defaultBranchId: defaultBranch.branchId,
    defaultBranchCreated,
    usersUpdated,
    branchStockSeeded,
    collectionsBackfilled,
    totalDocumentsUpdated,
    executedAt: Date.now(),
    executedBy,
    errors,
  };
}

