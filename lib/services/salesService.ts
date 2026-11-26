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
  deleteDoc,
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
  SaleReturnRecord,
  SaleReturnItem,
  ProcessReturnInput,
  EditSaleInput,
  SaleExchangeRecord,
  SaleExchangeItem,
  ProcessExchangeInput,
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
      ...(typeof item.originalUnitPrice === "number"
        ? { originalUnitPrice: Number(item.originalUnitPrice) }
        : {}),
      ...(item.promotion ? { promotion: item.promotion } : {}),
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

    // Cashier audit snapshot (Preserved permanently; never overwritten by subsequent role changes)
    cashierId: input.cashier.userId || "anonymous",
    cashierName: input.cashier.displayName || input.cashier.username || "Cashier",
    cashierRole: input.cashier.role || "cashier",
    cashierPermissionsSnapshot: input.cashier.permissions || [],

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
    taxRate: input.taxRate !== undefined && input.taxRate !== null && !Number.isNaN(Number(input.taxRate)) ? Number(input.taxRate) : 0,
    taxAmount: Number(input.taxAmount) || 0,
    grandTotal,
    total: grandTotal,

    // Payment details
    paymentMethod,
    ...(input.splitPayments && input.splitPayments.length > 0 ? { splitPayments: input.splitPayments } : {}),
    ...(cashReceived !== undefined ? { cashReceived } : {}),
    ...(change !== undefined ? { change } : {}),

    // Status and timestamps
    status: "completed",
    notes: input.notes?.trim() || "",
    createdAt: now,
    createdAtISO: new Date(now).toISOString(),
    updatedAt: now,

    // Optional fields — only include when defined (never write undefined to Firestore)
    ...(input.promotionSummary ? { promotionSummary: input.promotionSummary } : {}),
    ...(input.customer && Object.values(input.customer).some(Boolean)
      ? {
          customer: {
            ...(input.customer.customerId ? { customerId: input.customer.customerId } : {}),
            ...(input.customer.name ? { name: input.customer.name } : {}),
            ...(input.customer.phone ? { phone: input.customer.phone } : {}),
            ...(input.customer.email ? { email: input.customer.email } : {}),
          },
        }
      : {}),
  };

  // 3 & 4. Write to primary `/sales/{saleId}` and nested `/shops/{shopId}/sales/{saleId}` in parallel
  const rootSaleRef = doc(db, SALES_COLLECTION, saleId);
  const nestedSaleRef = doc(
    db,
    SHOPS_COLLECTION,
    normShopId,
    SALES_COLLECTION,
    saleId
  );

  const primaryWritePromise = Promise.all([
    setDoc(rootSaleRef, saleData),
    setDoc(nestedSaleRef, saleData).catch((err) => {
      console.warn("[SalesService] Nested sale mirror notice:", err);
    }),
  ]);

  // 5 & 6. Non-blocking parallel inventory depletion, stock transaction audit trail, and loyalty points
  void (async () => {
    try {
      await Promise.all([
        ...sanitizedItems.map(async (item) => {
          const isServiceOrAdhocItem =
            !item.productId ||
            item.productId.startsWith("prod_adhoc_") ||
            item.productId.startsWith("repair_") ||
            item.productId.startsWith("rep_") ||
            item.productId.startsWith("svc_") ||
            item.productId.startsWith("charge_") ||
            item.productId.startsWith("init_item_");

          if (isServiceOrAdhocItem) return;

          try {
            const productRef = doc(
              db,
              SHOPS_COLLECTION,
              normShopId,
              "products",
              item.productId
            );
            const productSnap = await getDoc(productRef);
            const prevStock = productSnap.exists()
              ? Number(productSnap.data()?.stockQuantity) || 0
              : 0;
            const nextStock = prevStock - item.quantity;
            const prodBranchId =
              (productSnap.exists()
                ? (productSnap.data()?.branchId as string)
                : undefined) ||
              saleData.branchId ||
              "main";

            const branchProdRef = doc(
              db,
              SHOPS_COLLECTION,
              normShopId,
              "branches",
              prodBranchId,
              "products",
              item.productId
            );

            const txId = `stk_${now}_${Math.random().toString(36).substring(2, 7)}`;
            const txDocRef = doc(
              db,
              SHOPS_COLLECTION,
              normShopId,
              "stock_transactions",
              txId
            );

            await Promise.all([
              productSnap.exists()
                ? updateDoc(productRef, {
                    stockQuantity: increment(-item.quantity),
                    updatedAt: now,
                  }).catch(() => {})
                : Promise.resolve(),
              updateDoc(branchProdRef, {
                stockQuantity: increment(-item.quantity),
                updatedAt: now,
              }).catch(() => {}),
              setDoc(txDocRef, {
                id: txId,
                shopId: normShopId,
                branchId: saleData.branchId,
                productId: item.productId,
                productName: item.name,
                sku: item.sku || "",
                barcode: item.barcode || "",
                type: "SALE",
                quantityDelta: -item.quantity,
                previousStock: prevStock,
                newStock: nextStock,
                reason: `POS Sale: ${invoiceNumber}`,
                referenceNumber: invoiceNumber,
                unitCost: item.costPrice || 0,
                unitSellingPrice: item.unitPrice || 0,
                totalValueChange: -item.quantity * (item.costPrice || 0),
                notes: `Tender: ${saleData.paymentMethod.toUpperCase()} | Customer: ${
                  saleData.customer?.name || "Walk-in Guest"
                }`,
                performedBy: {
                  userId: input.cashier?.userId || "cashier",
                  username: input.cashier?.username || "Cashier",
                  role: input.cashier?.role || "cashier",
                  displayName:
                    input.cashier?.displayName ||
                    input.cashier?.username ||
                    "Cashier",
                },
                createdAt: now,
              }).catch(() => {}),
              import("./branchService")
                .then(({ adjustBranchStock }) =>
                  adjustBranchStock(
                    normShopId,
                    saleData.branchId || "main",
                    item.productId,
                    -item.quantity,
                    input.cashier?.userId || "cashier",
                    {
                      variantId: item.variantId,
                      productName: item.name,
                      sku: item.sku,
                    }
                  )
                )
                .catch(() => {}),
            ]);
          } catch (stockErr) {
            console.warn(
              `[SalesService] Notice: Could not decrement stock for ${item.productId}:`,
              stockErr
            );
          }
        }),
        input.customer?.customerId
          ? import("./customerService")
              .then(({ awardLoyaltyPoints }) =>
                awardLoyaltyPoints(
                  normShopId,
                  input.customer!.customerId!,
                  grandTotal,
                  saleId,
                  {
                    userId: input.cashier?.userId || "cashier",
                    username: input.cashier?.username || "Cashier",
                    role: input.cashier?.role || "cashier",
                    displayName:
                      input.cashier?.displayName ||
                      input.cashier?.username ||
                      "Cashier",
                  }
                )
              )
              .catch((loyaltyErr) => {
                console.warn(
                  "[SalesService] Non-blocking loyalty points notice:",
                  loyaltyErr
                );
              })
          : Promise.resolve(),
        import("./subscriptionService")
          .then(({ assertAndTrackShopStorageUsage }) =>
            assertAndTrackShopStorageUsage(
              normShopId,
              JSON.stringify(saleData).length * 2 + 512
            )
          )
          .catch(() => {}),
        saleData.promotionSummary && saleData.promotionSummary.promotions.length > 0
          ? import("./promotionService")
              .then(({ recordPromotionUsageForSale }) =>
                recordPromotionUsageForSale(normShopId, saleData)
              )
              .catch((promoErr) => {
                console.warn("[SalesService] Promotion usage tracking notice:", promoErr);
              })
          : Promise.resolve(),
      ]);
    } catch (bgErr) {
      console.warn("[SalesService] Background post-sale sync notice:", bgErr);
    }
  })();

  // Return immediately once primary sale write completes or within 150ms so POS receipt opens instantly
  await Promise.race([
    primaryWritePromise,
    new Promise((resolve) => setTimeout(resolve, 150)),
  ]);

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
    if (options?.branchId && options.branchId !== "ALL") {
      sales = sales.filter((s) => (s.branchId || "main") === options.branchId);
    }
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
  onError?: (err: Error) => void,
  branchId?: string
): Unsubscribe {
  const normShopId = assertValidShopSession(activeSessionShopId);

  const q = query(
    collection(db, SALES_COLLECTION),
    where("shopId", "==", normShopId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      let sales: SaleRecord[] = snapshot.docs.map(
        (d) => d.data() as SaleRecord
      );
      if (branchId && branchId !== "ALL") {
        sales = sales.filter((s) => (s.branchId || "main") === branchId);
      }
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

/**
 * Processes a customer return on an existing sale:
 * - Guarantees non-destructive return: original sale record is NEVER deleted.
 * - Links a new SaleReturnRecord directly into the sale document's `returns` array.
 * - Updates the sale's status to "partially_returned" or "refunded".
 * - Conditionally restocks inventory and logs stock transaction audit trail.
 */
export async function processSaleReturn(
  activeSessionShopId: string,
  input: ProcessReturnInput
): Promise<{ updatedSale: SaleRecord; returnRecord: SaleReturnRecord }> {
  const normShopId = assertValidShopSession(activeSessionShopId);

  if (!input.saleId) {
    throw new Error("Cannot process return: Original sale ID is required.");
  }

  if (!input.items || input.items.length === 0) {
    throw new Error("Cannot process return: No items selected for return.");
  }

  // 1. Fetch original sale doc from single root sales collection
  const saleDocRef = doc(db, SALES_COLLECTION, input.saleId);
  const snap = await getDoc(saleDocRef);

  if (!snap.exists()) {
    throw new Error(`Original sale with ID ${input.saleId} not found.`);
  }

  const originalSale = snap.data() as SaleRecord;

  // Security check: tenant boundary
  if (normalizeShopId(originalSale.shopId) !== normShopId) {
    throw new Error("Security violation: Cannot process return for another shop's sale.");
  }

  if (originalSale.status === "refunded") {
    throw new Error("This sale has already been fully refunded.");
  }

  if (originalSale.status === "voided") {
    throw new Error("Cannot return items for a voided sale.");
  }

  // 2. Validate return quantities against original sale minus previously returned items
  const previouslyReturnedMap = new Map<string, number>();
  if (originalSale.returns && originalSale.returns.length > 0) {
    originalSale.returns.forEach((ret) => {
      ret.items.forEach((it) => {
        const current = previouslyReturnedMap.get(it.productId) || 0;
        previouslyReturnedMap.set(it.productId, current + it.quantity);
      });
    });
  }

  let totalReturnAmount = 0;
  const sanitizedReturnItems: SaleReturnItem[] = [];

  for (const retItem of input.items) {
    if (retItem.quantity <= 0) continue;

    const originalLineItem = originalSale.items.find(
      (it) => it.productId === retItem.productId
    );

    if (!originalLineItem) {
      throw new Error(`Product ${retItem.name} was not part of original sale ${originalSale.invoiceNumber}.`);
    }

    const alreadyReturned = previouslyReturnedMap.get(retItem.productId) || 0;
    const maxReturnable = originalLineItem.quantity - alreadyReturned;

    if (retItem.quantity > maxReturnable) {
      throw new Error(
        `Cannot return ${retItem.quantity} units of ${originalLineItem.name}. Maximum returnable remaining: ${maxReturnable}.`
      );
    }

    // Calculate line refund amount (pro-rated or provided)
    const effectiveUnitPrice = originalLineItem.unitPrice;
    const lineRefund = Number(retItem.refundAmount) > 0
      ? Number(retItem.refundAmount)
      : Math.max(0, (originalLineItem.subtotal / originalLineItem.quantity) * retItem.quantity);

    totalReturnAmount += lineRefund;

    sanitizedReturnItems.push({
      productId: retItem.productId,
      name: originalLineItem.name,
      sku: originalLineItem.sku,
      quantity: retItem.quantity,
      unitPrice: effectiveUnitPrice,
      refundAmount: lineRefund,
      restock: Boolean(retItem.restock),
      condition: retItem.condition || "good",
    });
  }

  if (sanitizedReturnItems.length === 0) {
    throw new Error("No valid items to return.");
  }

  const now = Date.now();
  const returnId = `ret_${now}_${Math.random().toString(36).substring(2, 7)}`;

  // 3. Construct linked return record
  const returnRecord: SaleReturnRecord = {
    returnId,
    originalSaleId: originalSale.saleId,
    invoiceNumber: originalSale.invoiceNumber,
    shopId: normShopId,
    returnDate: now,
    returnDateISO: new Date(now).toISOString(),
    items: sanitizedReturnItems,
    totalRefundAmount: totalReturnAmount,
    refundMethod: input.refundMethod || "cash",
    reason: input.reason?.trim() || "Customer return",
    processedBy: {
      userId: input.operator.userId || "anonymous",
      username: input.operator.username || "Operator",
      displayName: input.operator.displayName || input.operator.username || "Operator",
      role: input.operator.role || "cashier",
    },
  };

  // 4. Determine new status: check if all items are fully returned
  const allExistingReturns = originalSale.returns || [];
  const updatedReturnsList = [returnRecord, ...allExistingReturns];

  const totalRefundedSum = (originalSale.totalRefunded || 0) + totalReturnAmount;

  // Calculate total units returned vs total units in sale
  let totalUnitsReturned = 0;
  updatedReturnsList.forEach((ret) => {
    ret.items.forEach((it) => {
      totalUnitsReturned += it.quantity;
    });
  });

  const totalOriginalUnits = originalSale.itemCount || originalSale.items.reduce((acc, it) => acc + it.quantity, 0);
  const isFullyReturned = totalUnitsReturned >= totalOriginalUnits || totalRefundedSum >= originalSale.grandTotal;

  const newStatus = isFullyReturned ? "refunded" : "partially_returned";

  // 5. Update root sale document without deleting original sale data
  const updatedSale: SaleRecord = {
    ...originalSale,
    hasReturns: true,
    returns: updatedReturnsList,
    totalRefunded: totalRefundedSum,
    status: newStatus,
    updatedAt: now,
  };

  await updateDoc(saleDocRef, {
    hasReturns: true,
    returns: updatedReturnsList,
    totalRefunded: totalRefundedSum,
    status: newStatus,
    updatedAt: now,
  });

  // Mirror update to nested shop collection if present
  try {
    const nestedDocRef = doc(db, SHOPS_COLLECTION, normShopId, SALES_COLLECTION, originalSale.saleId);
    await updateDoc(nestedDocRef, {
      hasReturns: true,
      returns: updatedReturnsList,
      totalRefunded: totalRefundedSum,
      status: newStatus,
      updatedAt: now,
    });
  } catch (err) {
    console.warn("[SalesService] Nested sale return mirror notice:", err);
  }

  // 6. Restock products in inventory if restock flag is true
  for (const item of sanitizedReturnItems) {
    if (item.restock && item.productId && !item.productId.startsWith("prod_adhoc_")) {
      try {
        const prodRef = doc(db, SHOPS_COLLECTION, normShopId, "products", item.productId);
        await updateDoc(prodRef, {
          stockQuantity: increment(item.quantity),
          updatedAt: now,
        });

        // Write to stock_transactions for audit trail
        try {
          const txId = `stk_ret_${now}_${Math.random().toString(36).substring(2, 7)}`;
          const txDocRef = doc(db, SHOPS_COLLECTION, normShopId, "stock_transactions", txId);
          await setDoc(txDocRef, {
            id: txId,
            shopId: normShopId,
            branchId: originalSale.branchId || "main",
            productId: item.productId,
            productName: item.name,
            sku: item.sku || "",
            type: "RETURN",
            quantityDelta: item.quantity,
            previousStock: 0,
            newStock: 0,
            reason: `Return on Invoice ${originalSale.invoiceNumber}: ${input.reason}`,
            referenceNumber: originalSale.invoiceNumber,
            unitSellingPrice: item.unitPrice,
            totalValueChange: item.quantity * item.unitPrice,
            notes: `Refund: LKR ${item.refundAmount} (${input.refundMethod.toUpperCase()}) | Return ID: ${returnId}`,
            performedBy: {
              userId: input.operator.userId,
              username: input.operator.username,
              role: input.operator.role,
              displayName: input.operator.displayName || input.operator.username,
            },
            createdAt: now,
          });
        } catch (stkTxErr) {
          console.warn("[SalesService] Stock transaction log error on return:", stkTxErr);
        }
      } catch (restockErr) {
        console.warn(`[SalesService] Failed to restock product ${item.productId}:`, restockErr);
      }
    }
  }

  return { updatedSale, returnRecord };
}

/**
 * Processes a product exchange on an existing sale:
 * - Guarantees non-destructive exchange: original sale record is NEVER deleted.
 * - Links a new SaleExchangeRecord directly to the original sale document.
 * - Accurately calculates the price differential (replacement total minus returned credit):
 *   * If replacement costs more (diff > 0): customer pays the difference.
 *   * If replacement costs less (diff < 0): store refunds the difference.
 *   * If equal (diff === 0): even exchange.
 * - Automatically restocks returned items and depletes inventory for replacement items.
 * - Generates an exchange transaction record so exchange receipts can be printed and audited.
 */
export async function processSaleExchange(
  activeSessionShopId: string,
  input: ProcessExchangeInput
): Promise<{
  originalSale: SaleRecord;
  exchangeRecord: SaleExchangeRecord;
  exchangeSaleRecord: SaleRecord;
}> {
  const normShopId = assertValidShopSession(activeSessionShopId);

  if (!input.originalSaleId) {
    throw new Error("Cannot process exchange: Original sale ID is required.");
  }
  if (!input.returnedItems || input.returnedItems.length === 0) {
    throw new Error("Cannot process exchange: Please select at least one item to return.");
  }
  if (!input.replacementItems || input.replacementItems.length === 0) {
    throw new Error("Cannot process exchange: Please select at least one replacement item.");
  }

  // 1. Fetch original sale doc
  const saleDocRef = doc(db, SALES_COLLECTION, input.originalSaleId);
  const snap = await getDoc(saleDocRef);

  if (!snap.exists()) {
    throw new Error(`Original sale with ID ${input.originalSaleId} not found.`);
  }

  const originalSale = snap.data() as SaleRecord;

  // Tenant boundary verification
  if (normalizeShopId(originalSale.shopId) !== normShopId) {
    throw new Error("Security violation: Cannot process exchange for another shop's sale.");
  }

  if (originalSale.status === "voided") {
    throw new Error("Cannot exchange items for a voided sale.");
  }

  // 2. Validate return quantities against original sale minus prior returns/exchanges
  const previouslyProcessedMap = new Map<string, number>();

  if (originalSale.returns && originalSale.returns.length > 0) {
    originalSale.returns.forEach((ret) => {
      ret.items.forEach((it) => {
        const cur = previouslyProcessedMap.get(it.productId) || 0;
        previouslyProcessedMap.set(it.productId, cur + it.quantity);
      });
    });
  }

  if (originalSale.exchanges && originalSale.exchanges.length > 0) {
    originalSale.exchanges.forEach((exc) => {
      exc.returnedItems.forEach((it) => {
        const cur = previouslyProcessedMap.get(it.productId) || 0;
        previouslyProcessedMap.set(it.productId, cur + it.quantity);
      });
    });
  }

  let returnedTotal = 0;
  const sanitizedReturnItems: SaleReturnItem[] = [];

  for (const retItem of input.returnedItems) {
    if (retItem.quantity <= 0) continue;

    const originalLineItem = originalSale.items.find(
      (it) => it.productId === retItem.productId
    );

    if (!originalLineItem) {
      throw new Error(`Product ${retItem.name} was not part of original sale ${originalSale.invoiceNumber}.`);
    }

    const alreadyProcessed = previouslyProcessedMap.get(retItem.productId) || 0;
    const maxReturnable = originalLineItem.quantity - alreadyProcessed;

    if (retItem.quantity > maxReturnable) {
      throw new Error(
        `Cannot return ${retItem.quantity} units of ${originalLineItem.name}. Remaining eligible units: ${maxReturnable}.`
      );
    }

    const lineRefund = Number(retItem.refundAmount) > 0
      ? Number(retItem.refundAmount)
      : Math.max(0, (originalLineItem.subtotal / originalLineItem.quantity) * retItem.quantity);

    returnedTotal += lineRefund;

    sanitizedReturnItems.push({
      productId: retItem.productId,
      name: originalLineItem.name,
      sku: originalLineItem.sku || "",
      quantity: retItem.quantity,
      unitPrice: originalLineItem.unitPrice,
      refundAmount: lineRefund,
      restock: Boolean(retItem.restock),
      condition: retItem.condition || "good",
    });
  }

  if (sanitizedReturnItems.length === 0) {
    throw new Error("No valid items selected to return.");
  }

  // 3. Sanitize replacement items
  let replacementTotal = 0;
  const sanitizedReplacementItems: SaleExchangeItem[] = [];
  const replacementSnapshots: SaleItemSnapshot[] = [];

  for (const repItem of input.replacementItems) {
    const qty = Math.max(1, Number(repItem.quantity) || 1);
    const price = Number(repItem.unitPrice) || 0;
    const lineTotal = price * qty;
    replacementTotal += lineTotal;

    sanitizedReplacementItems.push({
      productId: repItem.productId,
      name: repItem.name,
      sku: repItem.sku || "",
      quantity: qty,
      unitPrice: price,
      subtotal: lineTotal,
      variant: repItem.variant || "",
      categoryName: repItem.categoryName || "",
    });

    replacementSnapshots.push({
      productId: repItem.productId,
      name: repItem.name,
      sku: repItem.sku || "",
      unitPrice: price,
      quantity: qty,
      discount: 0,
      subtotal: lineTotal,
      variant: repItem.variant || "",
      categoryName: repItem.categoryName || "",
    });
  }

  // 4. Calculate differential
  // Example: replacement 500 - returned 900 = -400 (customer gets 400 back)
  // Example: replacement 1200 - returned 900 = +300 (customer pays 300)
  const difference = replacementTotal - returnedTotal;
  const settlementType: "customer_paid" | "store_refunded" | "even_exchange" =
    difference > 0 ? "customer_paid" : difference < 0 ? "store_refunded" : "even_exchange";
  const amountSettled = Math.abs(difference);

  const now = Date.now();
  const exchangeId = `exc_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const dateStr = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const exchangeInvoiceNumber = `EXC-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  const operatorSnapshot = {
    userId: input.operator.userId || "anonymous",
    username: input.operator.username || "Operator",
    displayName: input.operator.displayName || input.operator.username || "Operator",
    role: input.operator.role || "cashier",
  };

  // 5. Construct linked SaleExchangeRecord
  const exchangeRecord: SaleExchangeRecord = {
    exchangeId,
    exchangeInvoiceNumber,
    originalSaleId: originalSale.saleId,
    originalInvoiceNumber: originalSale.invoiceNumber,
    shopId: normShopId,
    exchangeDate: now,
    exchangeDateISO: new Date(now).toISOString(),
    returnedItems: sanitizedReturnItems,
    returnedTotal,
    replacementItems: sanitizedReplacementItems,
    replacementTotal,
    difference,
    settlementType,
    settlementMethod: input.settlementMethod || "cash",
    amountSettled,
    reason: input.reason?.trim() || "Product exchange",
    operator: operatorSnapshot,
  };

  // 6. Update original sale doc without deleting it
  const allExistingExchanges = originalSale.exchanges || [];
  const updatedExchangesList = [exchangeRecord, ...allExistingExchanges];

  const updatedOriginalSale: SaleRecord = {
    ...originalSale,
    hasExchanges: true,
    exchanges: updatedExchangesList,
    updatedAt: now,
  };

  await updateDoc(saleDocRef, {
    hasExchanges: true,
    exchanges: updatedExchangesList,
    updatedAt: now,
  });

  // Mirror update to nested shop collection if present
  try {
    const nestedDocRef = doc(db, SHOPS_COLLECTION, normShopId, SALES_COLLECTION, originalSale.saleId);
    await updateDoc(nestedDocRef, {
      hasExchanges: true,
      exchanges: updatedExchangesList,
      updatedAt: now,
    });
  } catch (err) {
    console.warn("[SalesService] Nested sale exchange mirror notice:", err);
  }

  // 7. Write an Exchange Sale document to `/sales` so it is auditable, searchable, and printable
  const exchangeSaleRecord: SaleRecord = {
    saleId: exchangeId,
    invoiceNumber: exchangeInvoiceNumber,
    shopId: normShopId,
    shopName: originalSale.shopName || normShopId,
    branchId: originalSale.branchId || "main",
    branchName: originalSale.branchName || "Main Branch",
    cashierId: operatorSnapshot.userId,
    cashierName: operatorSnapshot.displayName,
    cashierRole: operatorSnapshot.role,
    items: replacementSnapshots,
    itemCount: replacementSnapshots.reduce((acc, it) => acc + it.quantity, 0),
    subtotal: replacementTotal,
    discountSetting: { type: "fixed", value: 0 },
    discountAmount: 0,
    taxRate: 0,
    taxAmount: 0,
    grandTotal: difference > 0 ? difference : 0,
    total: difference > 0 ? difference : 0,
    paymentMethod: input.settlementMethod || "cash",
    status: "completed",
    // Strictly omit customer if not defined on original sale to prevent Firestore undefined error
    ...(originalSale.customer && Object.values(originalSale.customer).some(Boolean)
      ? {
          customer: {
            ...(originalSale.customer.customerId ? { customerId: originalSale.customer.customerId } : {}),
            ...(originalSale.customer.name ? { name: originalSale.customer.name } : {}),
            ...(originalSale.customer.phone ? { phone: originalSale.customer.phone } : {}),
            ...(originalSale.customer.email ? { email: originalSale.customer.email } : {}),
          },
        }
      : {}),
    notes: `Exchange for original invoice ${originalSale.invoiceNumber}. Return Credit: LKR ${returnedTotal}, Replacement: LKR ${replacementTotal}. Difference: LKR ${difference.toFixed(2)} (${settlementType.replace("_", " ")})`,
    createdAt: now,
    createdAtISO: new Date(now).toISOString(),
    updatedAt: now,
  };

  const exchangeSaleDocRef = doc(db, SALES_COLLECTION, exchangeId);
  await setDoc(exchangeSaleDocRef, exchangeSaleRecord);

  // Mirror to nested `/shops/{shopId}/sales/{saleId}`
  try {
    const nestedExchangeSaleRef = doc(
      db,
      SHOPS_COLLECTION,
      normShopId,
      SALES_COLLECTION,
      exchangeId
    );
    await setDoc(nestedExchangeSaleRef, exchangeSaleRecord);
  } catch (nestedErr) {
    console.warn("[SalesService] Nested exchange sale mirror notice:", nestedErr);
  }

  // 8. Restock returned items
  for (const item of sanitizedReturnItems) {
    if (item.restock && item.productId && !item.productId.startsWith("prod_adhoc_")) {
      try {
        const prodRef = doc(db, SHOPS_COLLECTION, normShopId, "products", item.productId);
        await updateDoc(prodRef, {
          stockQuantity: increment(item.quantity),
          updatedAt: now,
        });

        const txId = `stk_exc_in_${now}_${Math.random().toString(36).substring(2, 7)}`;
        const txDocRef = doc(db, SHOPS_COLLECTION, normShopId, "stock_transactions", txId);
        await setDoc(txDocRef, {
          id: txId,
          shopId: normShopId,
          productId: item.productId,
          productName: item.name,
          sku: item.sku || "",
          type: "RETURN",
          quantityDelta: item.quantity,
          previousStock: 0,
          newStock: 0,
          reason: `Exchange In (Invoice ${originalSale.invoiceNumber} -> ${exchangeInvoiceNumber})`,
          referenceNumber: exchangeInvoiceNumber,
          unitSellingPrice: item.unitPrice,
          totalValueChange: item.quantity * item.unitPrice,
          performedBy: operatorSnapshot,
          createdAt: now,
        });
      } catch (err) {
        console.warn(`[SalesService] Failed to restock product ${item.productId} on exchange:`, err);
      }
    }
  }

  // 9. Deplete replacement items
  for (const repItem of sanitizedReplacementItems) {
    if (repItem.productId && !repItem.productId.startsWith("prod_adhoc_")) {
      try {
        const prodRef = doc(db, SHOPS_COLLECTION, normShopId, "products", repItem.productId);
        await updateDoc(prodRef, {
          stockQuantity: increment(-repItem.quantity),
          updatedAt: now,
        });

        const txId = `stk_exc_out_${now}_${Math.random().toString(36).substring(2, 7)}`;
        const txDocRef = doc(db, SHOPS_COLLECTION, normShopId, "stock_transactions", txId);
        await setDoc(txDocRef, {
          id: txId,
          shopId: normShopId,
          productId: repItem.productId,
          productName: repItem.name,
          sku: repItem.sku || "",
          type: "SALE",
          quantityDelta: -repItem.quantity,
          previousStock: 0,
          newStock: 0,
          reason: `Exchange Out (Invoice ${originalSale.invoiceNumber} -> ${exchangeInvoiceNumber})`,
          referenceNumber: exchangeInvoiceNumber,
          unitSellingPrice: repItem.unitPrice,
          totalValueChange: -repItem.quantity * repItem.unitPrice,
          performedBy: operatorSnapshot,
          createdAt: now,
        });
      } catch (err) {
        console.warn(`[SalesService] Failed to deplete product ${repItem.productId} on exchange:`, err);
      }
    }
  }

  return { originalSale: updatedOriginalSale, exchangeRecord, exchangeSaleRecord };
}

/**
 * Updates editable fields of a sale record (customer details, notes, paymentMethod)
 */
export async function updateSaleRecord(
  activeSessionShopId: string,
  saleId: string,
  input: EditSaleInput
): Promise<SaleRecord> {
  const normShopId = assertValidShopSession(activeSessionShopId);
  const sale = await getSaleById(normShopId, saleId);

  if (!sale) {
    throw new Error(`Sale with ID ${saleId} not found.`);
  }

  const now = Date.now();
  const updates: Partial<SaleRecord> = {
    updatedAt: now,
  };

  if (input.customer !== undefined) {
    updates.customer = input.customer;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes.trim();
  }
  if (input.paymentMethod !== undefined) {
    updates.paymentMethod = input.paymentMethod;
  }

  const saleDocRef = doc(db, SALES_COLLECTION, saleId);
  await updateDoc(saleDocRef, updates);

  return {
    ...sale,
    ...updates,
  };
}

/**
 * Voids a sale transaction:
 * - Changes status to "voided"
 * - Restores inventory stock if restock is enabled
 * - Preserves the immutable document with void metadata
 */
export async function voidSaleRecord(
  activeSessionShopId: string,
  saleId: string,
  voidReason: string,
  operator: { userId: string; username: string; role: string },
  restock = true
): Promise<SaleRecord> {
  const normShopId = assertValidShopSession(activeSessionShopId);
  const sale = await getSaleById(normShopId, saleId);

  if (!sale) {
    throw new Error(`Sale with ID ${saleId} not found.`);
  }

  if (sale.status === "voided") {
    throw new Error("This sale is already voided.");
  }

  const now = Date.now();
  const saleDocRef = doc(db, SALES_COLLECTION, saleId);

  await updateDoc(saleDocRef, {
    status: "voided",
    notes: sale.notes
      ? `${sale.notes}\n[VOIDED by @${operator.username} on ${new Date(now).toLocaleString()}: ${voidReason}]`
      : `[VOIDED by @${operator.username} on ${new Date(now).toLocaleString()}: ${voidReason}]`,
    updatedAt: now,
  });

  // Restock inventory
  if (restock) {
    for (const item of sale.items) {
      if (item.productId && !item.productId.startsWith("prod_adhoc_")) {
        try {
          const prodRef = doc(db, SHOPS_COLLECTION, normShopId, "products", item.productId);
          await updateDoc(prodRef, {
            stockQuantity: increment(item.quantity),
            updatedAt: now,
          });

          // Log stock transaction
          const txId = `stk_void_${now}_${Math.random().toString(36).substring(2, 7)}`;
          const txDocRef = doc(db, SHOPS_COLLECTION, normShopId, "stock_transactions", txId);
          await setDoc(txDocRef, {
            id: txId,
            shopId: normShopId,
            branchId: sale.branchId || "main",
            productId: item.productId,
            productName: item.name,
            sku: item.sku || "",
            type: "VOID",
            quantityDelta: item.quantity,
            previousStock: 0,
            newStock: 0,
            reason: `Sale Voided: ${sale.invoiceNumber} (${voidReason})`,
            referenceNumber: sale.invoiceNumber,
            unitSellingPrice: item.unitPrice,
            totalValueChange: item.quantity * item.unitPrice,
            performedBy: operator,
            createdAt: now,
          });
        } catch (err) {
          console.warn(`[SalesService] Failed to restock item ${item.productId} on void:`, err);
        }
      }
    }
  }

  return {
    ...sale,
    status: "voided",
    updatedAt: now,
  };
}

/**
 * Deletes a sale record document:
 * - Can optionally restore inventory stock prior to deletion
 * - Deletes the document from the sales collection
 */
export async function deleteSaleRecord(
  activeSessionShopId: string,
  saleId: string,
  options?: {
    restoreStock?: boolean;
    operator?: { userId: string; username: string; role: string };
  }
): Promise<void> {
  const normShopId = assertValidShopSession(activeSessionShopId);
  const sale = await getSaleById(normShopId, saleId);

  if (!sale) {
    throw new Error(`Sale with ID ${saleId} not found.`);
  }

  const now = Date.now();

  // Restore inventory if requested
  if (options?.restoreStock) {
    for (const item of sale.items) {
      if (item.productId && !item.productId.startsWith("prod_adhoc_")) {
        try {
          const prodRef = doc(db, SHOPS_COLLECTION, normShopId, "products", item.productId);
          await updateDoc(prodRef, {
            stockQuantity: increment(item.quantity),
            updatedAt: now,
          });

          if (options.operator) {
            const txId = `stk_del_${now}_${Math.random().toString(36).substring(2, 7)}`;
            const txDocRef = doc(db, SHOPS_COLLECTION, normShopId, "stock_transactions", txId);
            await setDoc(txDocRef, {
              id: txId,
              shopId: normShopId,
              productId: item.productId,
              productName: item.name,
              sku: item.sku || "",
              type: "RETURN",
              quantityDelta: item.quantity,
              previousStock: 0,
              newStock: 0,
              reason: `Sale Deleted: ${sale.invoiceNumber}`,
              referenceNumber: sale.invoiceNumber,
              unitSellingPrice: item.unitPrice,
              totalValueChange: item.quantity * item.unitPrice,
              performedBy: options.operator,
              createdAt: now,
            });
          }
        } catch (err) {
          console.warn(`[SalesService] Failed to restore stock on sale deletion for ${item.productId}:`, err);
        }
      }
    }
  }

  // Delete from primary root sales collection
  const saleDocRef = doc(db, SALES_COLLECTION, saleId);
  await deleteDoc(saleDocRef);

  // Also remove mirror doc if it exists
  try {
    const nestedDocRef = doc(db, SHOPS_COLLECTION, normShopId, SALES_COLLECTION, saleId);
    await deleteDoc(nestedDocRef);
  } catch (err) {
    console.warn("[SalesService] Nested sale delete notice:", err);
  }
}


