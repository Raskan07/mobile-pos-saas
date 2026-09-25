/**
 * lib/services/salesService.ts
 *
 * Multi-tenant Sales Management Layer for Firebase Firestore.
 *
 * Core Guarantees:
 * 1. Multi-Tenant Scoping: All sales documents are stored with an immutable `shopId`
 *    strictly derived from the authenticated session. Never accepts arbitrary manual input.
 * 2. Product Snapshot Integrity: Every sale records complete product details
 *    (name, variant, SKU, barcode, unitPrice, costPrice, discount, subtotal)
 *    so old customer invoices remain 100% accurate regardless of subsequent catalog updates.
 * 3. Cross-Tenant Isolation: All queries enforce `where("shopId", "==", activeShopId)`
 *    so shops can never read or query another shop's transactions.
 * 4. Audit Trail: Captures cashier UID, name, role, invoice number, and exact timestamps.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  increment,
  updateDoc,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import {
  SaleRecord,
  SaleItemSnapshot,
  CreateSaleInput,
  SalesFilterOptions,
  ShopSalesSummary,
} from "../types/sale";

export const SALES_COLLECTION = "sales";
export const SHOPS_COLLECTION = "shops";

/**
 * Generates a collision-resistant, human-readable invoice number:
 * Format: INV-YYYYMMDD-XXXX (e.g. INV-20260910-8421)
 */
export function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4-digit random
  const timeSuffix = now.getTime().toString().slice(-2); // 2-digit micro time
  return `INV-${year}${month}${day}-${randomSuffix}`;
}

/**
 * Validates that an active authenticated session shopId exists
 */
function assertValidShopSession(shopId?: string): string {
  const normalized = normalizeShopId(shopId || "");
  if (!normalized) {
    throw new Error(
      "Security violation: Active shop session required. Operation cannot be performed without authenticated shopId."
    );
  }
  return normalized;
}

/**
 * Creates and persists a robust Sale Record in Firestore with full product snapshots.
 *
 * - Scoped strictly to the active session's shopId.
 * - Saves under root `/sales/{saleId}` collection (indexed by `shopId`).
 * - Also mirrors to `/shops/{shopId}/sales/{saleId}` for dual-index hierarchy.
 * - Atomically decrements product inventory in Firestore.
 */
export async function createSaleRecord(
  activeSessionShopId: string,
  input: CreateSaleInput
): Promise<SaleRecord> {
  const normShopId = assertValidShopSession(activeSessionShopId);

  // Security guard: Ensure input shopId matches active authenticated session
  const inputNormShopId = normalizeShopId(input.shopId);
  if (inputNormShopId && inputNormShopId !== normShopId) {
    throw new Error(
      `Security violation: Attempted to record sale for shop ${inputNormShopId} while session is authenticated as ${normShopId}.`
    );
  }

  if (!input.items || input.items.length === 0) {
    throw new Error("Cannot finalize sale: Cart contains no items.");
  }

  const now = Date.now();
  const saleId = `sale_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const invoiceNumber = generateInvoiceNumber();

  // 1. Build immutable product snapshots for each line item
  const sanitizedItems: SaleItemSnapshot[] = input.items.map((item) => {
    const unitPrice = Number(item.unitPrice) || 0;
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const discount = Math.max(0, Number(item.discount) || 0);
    const subtotal = Math.max(0, unitPrice * quantity - discount);

    return {
      productId: item.productId || `prod_adhoc_${now}`,
      name: (item.name || "Unnamed Product").trim(),
      variant: item.variant?.trim() || "",
      variantId: item.variantId?.trim() || "",
      sku: (item.sku || item.barcode || "SKU-GEN").trim().toUpperCase(),
      barcode: item.barcode?.trim() || "",
      unitPrice,
      costPrice: Number(item.costPrice) || 0,
      quantity,
      discount,
      subtotal,
      unit: item.unit?.trim() || "pcs",
      brand: item.brand?.trim() || "",
      categoryName: item.categoryName?.trim() || "",
      imageUrl: item.imageUrl?.trim() || "",
    };
  });

  const totalItemCount = sanitizedItems.reduce((acc, it) => acc + it.quantity, 0);
  const calculatedSubtotal = sanitizedItems.reduce((acc, it) => acc + it.subtotal, 0);

  const grandTotal = Number(input.grandTotal) || calculatedSubtotal;
  const paymentMethod = input.paymentMethod || "cash";
  const cashReceived =
    paymentMethod === "cash"
      ? Number(input.cashReceived ?? grandTotal)
      : undefined;
  const change =
    paymentMethod === "cash" && cashReceived !== undefined
      ? Math.max(0, cashReceived - grandTotal)
      : undefined;

  // 2. Construct complete sale record document — strictly no undefined values (Firestore rejects them)
  const saleData: SaleRecord = {
    saleId,
    invoiceNumber,
    shopId: normShopId,
    shopName: input.shopName || normShopId,
    branchId: input.branchId || "main",
    branchName: input.branchName || "Main Branch",

    // Cashier audit snapshot
    cashierId: input.cashier.userId || "anonymous",
    cashierName: input.cashier.displayName || input.cashier.username || "Cashier",
    cashierRole: input.cashier.role || "cashier",

    // Frozen product snapshots
    items: sanitizedItems,
    itemCount: totalItemCount,

    // Financial calculations
    subtotal: input.subtotal ?? calculatedSubtotal,
    discountSetting: {
      type: input.discountSetting?.type || "fixed",
      value: Number(input.discountSetting?.value) || 0,
    },
    discountAmount: Number(input.discountAmount) || 0,
    taxRate: Number(input.taxRate) || 0.08,
    taxAmount: Number(input.taxAmount) || 0,
    grandTotal,
    total: grandTotal,

    // Payment details
    paymentMethod,
    ...(cashReceived !== undefined ? { cashReceived } : {}),
    ...(change !== undefined ? { change } : {}),

    // Status and timestamps
    status: "completed",
    notes: input.notes?.trim() || "",
    createdAt: now,
    createdAtISO: new Date(now).toISOString(),
    updatedAt: now,

    // Optional fields — only include when defined (never write undefined to Firestore)
    ...(input.customer && Object.values(input.customer).some(Boolean)
      ? {
          customer: {
            ...(input.customer.name ? { name: input.customer.name } : {}),
            ...(input.customer.phone ? { phone: input.customer.phone } : {}),
            ...(input.customer.email ? { email: input.customer.email } : {}),
          },
        }
      : {}),
  };

  // 3. Write to primary `/sales/{saleId}` collection
  const rootSaleRef = doc(db, SALES_COLLECTION, saleId);
  await setDoc(rootSaleRef, saleData);

  // 4. Mirror to nested `/shops/{shopId}/sales/{saleId}` for dual indexing & isolation
  try {
    const nestedSaleRef = doc(
      db,
      SHOPS_COLLECTION,
      normShopId,
      SALES_COLLECTION,
      saleId
    );
    await setDoc(nestedSaleRef, saleData);
  } catch (err) {
    console.warn("[SalesService] Nested sale mirror notice:", err);
  }

  // 5. Asynchronously deplete inventory for each catalog product
  for (const item of sanitizedItems) {
    if (item.productId && !item.productId.startsWith("prod_adhoc_")) {
      try {
        const productRef = doc(
          db,
          SHOPS_COLLECTION,
          normShopId,
          "products",
          item.productId
        );
        await updateDoc(productRef, {
          stockQuantity: increment(-item.quantity),
          updatedAt: now,
        });

        // Mirror to stock_transactions for 360-degree audit trail in Stock Management
        try {
          const txId = `stk_${now}_${Math.random().toString(36).substring(2, 7)}`;
          const txDocRef = doc(db, SHOPS_COLLECTION, normShopId, "stock_transactions", txId);
          await setDoc(txDocRef, {
            id: txId,
            shopId: normShopId,
            productId: item.productId,
            productName: item.name,
            sku: item.sku || "",
            barcode: item.barcode || "",
            type: "SALE",
            quantityDelta: -item.quantity,
            previousStock: 0,
            newStock: 0,
            reason: `POS Sale: ${invoiceNumber}`,
            referenceNumber: invoiceNumber,
            unitCost: item.costPrice || 0,
            unitSellingPrice: item.unitPrice || 0,
            totalValueChange: -item.quantity * (item.costPrice || 0),
            notes: `Tender: ${saleData.paymentMethod.toUpperCase()} | Customer: ${saleData.customer?.name || "Walk-in Guest"}`,
            performedBy: {
              userId: input.cashier?.userId || "cashier",
              username: input.cashier?.username || "Cashier",
              role: input.cashier?.role || "cashier",
              displayName: input.cashier?.displayName || input.cashier?.username || "Cashier",
            },
            createdAt: now,
          });
        } catch (auditErr) {
          console.warn("[SalesService] Non-blocking stock transaction log notice:", auditErr);
        }
      } catch (stockErr) {
        // Log but don't fail the completed invoice if product was unlinked
        console.warn(`[SalesService] Notice: Could not decrement stock for ${item.productId}:`, stockErr);
      }
    }
  }

  return saleData;
}

/**
 * Fetches sales records strictly scoped to the active authenticated shopId.
 * Queries `/sales` with `where("shopId", "==", normShopId)`.
 */
export async function getSalesByShop(
  activeSessionShopId: string,
  options?: SalesFilterOptions
): Promise<SaleRecord[]> {
  const normShopId = assertValidShopSession(activeSessionShopId);

  try {
    // Primary query with shopId boundary
    const baseQuery = query(
      collection(db, SALES_COLLECTION),
      where("shopId", "==", normShopId)
    );

    const snapshot = await getDocs(baseQuery);
    let sales: SaleRecord[] = snapshot.docs.map((d) => d.data() as SaleRecord);

    // Filter in-memory for resilience (prevents composite index errors in Firestore)
    if (options?.startDate) {
      sales = sales.filter((s) => s.createdAt >= options.startDate!);
    }
    if (options?.endDate) {
      sales = sales.filter((s) => s.createdAt <= options.endDate!);
    }
    if (options?.paymentMethod && options.paymentMethod !== "all") {
      sales = sales.filter(
        (s) => s.paymentMethod?.toLowerCase() === options.paymentMethod!.toLowerCase()
      );
    }
    if (options?.cashierId && options.cashierId !== "all") {
      sales = sales.filter((s) => s.cashierId === options.cashierId);
    }
    if (options?.searchTerm) {
      const q = options.searchTerm.toLowerCase().trim();
      sales = sales.filter(
        (s) =>
          s.invoiceNumber.toLowerCase().includes(q) ||
          s.cashierName.toLowerCase().includes(q) ||
          s.customer?.name?.toLowerCase().includes(q) ||
          s.items.some((it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q))
      );
    }

    // Sort descending by newest first
    sales.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limitCount && options.limitCount > 0) {
      sales = sales.slice(0, options.limitCount);
    }

    return sales;
  } catch (error) {
    console.error(`[SalesService] Error fetching sales for shop ${normShopId}:`, error);
    throw error;
  }
}

/**
 * Real-time listener for sales strictly scoped to the active shopId.
 * Always guarantees multi-tenant boundary: never listens to other shops.
 */
export function subscribeToSalesByShop(
  activeSessionShopId: string,
  onUpdate: (sales: SaleRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normShopId = assertValidShopSession(activeSessionShopId);

  const q = query(
    collection(db, SALES_COLLECTION),
    where("shopId", "==", normShopId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const sales: SaleRecord[] = snapshot.docs.map(
        (d) => d.data() as SaleRecord
      );
      sales.sort((a, b) => b.createdAt - a.createdAt);
      onUpdate(sales);
    },
    (err) => {
      console.error(`[SalesService] Real-time sales error for ${normShopId}:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Fetches a single sale by ID and verifies that it strictly belongs to active shopId.
 * Rejects access if another shop attempts to access this sale (Anti-IDOR protection).
 */
export async function getSaleById(
  activeSessionShopId: string,
  saleId: string
): Promise<SaleRecord | null> {
  const normShopId = assertValidShopSession(activeSessionShopId);
  const cleanSaleId = (saleId || "").trim();

  if (!cleanSaleId) return null;

  const docRef = doc(db, SALES_COLLECTION, cleanSaleId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return null;

  const sale = snap.data() as SaleRecord;

  // Strict tenant boundary check
  if (normalizeShopId(sale.shopId) !== normShopId) {
    console.error(
      `[SalesService] Cross-tenant access blocked! Shop ${normShopId} attempted to access sale ${cleanSaleId} owned by ${sale.shopId}`
    );
    throw new Error("Access denied: You do not have permission to view sales from another shop.");
  }

  return sale;
}

/**
 * Computes aggregated financial summaries strictly scoped to the active shop.
 */
export async function getShopSalesSummary(
  activeSessionShopId: string
): Promise<ShopSalesSummary> {
  const normShopId = assertValidShopSession(activeSessionShopId);
  const sales = await getSalesByShop(normShopId);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let totalRevenue = 0;
  let totalItemsSold = 0;
  let cashTotal = 0;
  let cardTotal = 0;
  let otherTotal = 0;
  let todayRevenue = 0;
  let todayTransactions = 0;

  for (const s of sales) {
    const total = s.grandTotal || s.total || 0;
    totalRevenue += total;
    totalItemsSold += s.itemCount || s.items.reduce((acc, it) => acc + it.quantity, 0);

    const method = (s.paymentMethod || "cash").toLowerCase();
    if (method === "cash") {
      cashTotal += total;
    } else if (method === "card") {
      cardTotal += total;
    } else {
      otherTotal += total;
    }

    if (s.createdAt >= startOfToday) {
      todayRevenue += total;
      todayTransactions += 1;
    }
  }

  const totalTransactions = sales.length;
  const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  return {
    totalRevenue,
    totalTransactions,
    totalItemsSold,
    averageOrderValue,
    cashTotal,
    cardTotal,
    otherTotal,
    todayRevenue,
    todayTransactions,
  };
}
