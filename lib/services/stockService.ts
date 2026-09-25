/**
 * lib/services/stockService.ts
 *
 * Multi-tenant Stock Management Service for Mobile POS SaaS.
 * Provides atomic inventory updates, minimum stock threshold monitoring,
 * live stock valuation calculations, and immutable audit logging.
 *
 * Path:
 *   Product: shops/{shopId}/products/{productId}
 *   Audit Logs: shops/{shopId}/stock_transactions/{txId}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { AuditUser, ProductItem } from "../types/catalog";
import {
  StockTransaction,
  CreateStockMovementInput,
  StockValuationSummary,
  StockStatus,
} from "../types/stock";

export const STOCK_TRANSACTIONS_COLLECTION = "stock_transactions";

function assertValidSession(shopId: string, user?: AuditUser) {
  if (!shopId || !shopId.trim()) {
    throw new Error("[StockService] Active Shop ID is required.");
  }
  if (!user || !user.userId) {
    throw new Error("[StockService] Authenticated user identity is required for audit trail.");
  }
}

/**
 * Returns the stock health status for a given product
 */
export function getProductStockStatus(product: ProductItem): StockStatus {
  const stock = typeof product.stockQuantity === "number" ? product.stockQuantity : 0;
  const minThreshold = typeof product.minStockLevel === "number" ? product.minStockLevel : 10;

  if (stock <= 0) {
    return "OUT_OF_STOCK";
  }
  if (stock <= minThreshold) {
    return "LOW_STOCK";
  }
  return "HEALTHY";
}

/**
 * Records a stock movement (Stock In, Stock Out, Damaged, Adjustment)
 * Updates product stock in Firestore and creates an immutable audit trail entry.
 */
export async function recordStockMovement(
  shopId: string,
  user: AuditUser,
  input: CreateStockMovementInput
): Promise<{ transaction: StockTransaction; newStock: number }> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  if (!input.productId) {
    throw new Error("[StockService] Product ID is required.");
  }
  if (input.quantity <= 0) {
    throw new Error("[StockService] Quantity must be greater than zero.");
  }

  // Fetch current product state
  const productRef = doc(db, "shops", normShopId, "products", input.productId);
  const prodSnap = await getDoc(productRef);

  if (!prodSnap.exists()) {
    throw new Error(`[StockService] Product ${input.productId} does not exist in shop ${normShopId}.`);
  }

  const productData = prodSnap.data() as ProductItem;
  const previousStock = typeof productData.stockQuantity === "number" ? productData.stockQuantity : 0;

  // Calculate quantity delta
  let quantityDelta = 0;
  if (input.type === "STOCK_IN") {
    quantityDelta = Math.abs(input.quantity);
  } else if (input.type === "STOCK_OUT" || input.type === "DAMAGED" || input.type === "SALE") {
    quantityDelta = -Math.abs(input.quantity);
  } else if (input.type === "ADJUSTMENT") {
    // For manual adjustment, input.quantity is the delta or absolute depending on use
    quantityDelta = input.quantity;
  }

  const newStock = Math.max(0, previousStock + quantityDelta);
  const unitCost = typeof input.unitCost === "number" ? input.unitCost : (productData.costPrice || 0);
  const totalValueChange = quantityDelta * unitCost;
  const now = Date.now();
  const txId = `stk_${now}_${Math.random().toString(36).substring(2, 7)}`;

  // Handle variants if applicable
  let updatedVariants = productData.variants;
  if (input.variantId && productData.variants && productData.variants.length > 0) {
    updatedVariants = productData.variants.map((v) => {
      if (v.id === input.variantId) {
        const currentVarStock = typeof v.stockQuantity === "number" ? v.stockQuantity : 0;
        return {
          ...v,
          stockQuantity: Math.max(0, currentVarStock + quantityDelta),
        };
      }
      return v;
    });
  }

  // Construct audit transaction
  const transaction: StockTransaction = {
    id: txId,
    shopId: normShopId,
    productId: input.productId,
    productName: input.productName || productData.name,
    sku: input.sku || productData.sku,
    barcode: input.barcode || productData.barcode || "",
    variantId: input.variantId || "",
    variantName: input.variantName || "",
    type: input.type,
    quantityDelta,
    previousStock,
    newStock,
    reason: input.reason || "Manual Inventory Adjustment",
    referenceNumber: input.referenceNumber || "",
    unitCost,
    unitSellingPrice: productData.sellingPrice || 0,
    totalValueChange,
    notes: input.notes || "",
    performedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
    createdAt: now,
  };

  // 1. Write immutable audit record
  const txDocRef = doc(db, "shops", normShopId, STOCK_TRANSACTIONS_COLLECTION, txId);
  await setDoc(txDocRef, transaction);

  // 2. Update product stock level in catalog
  const updatePayload: Record<string, unknown> = {
    stockQuantity: newStock,
    updatedAt: now,
    updatedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  };

  if (updatedVariants) {
    updatePayload.variants = updatedVariants;
  }

  await updateDoc(productRef, updatePayload);

  return { transaction, newStock };
}

/**
 * Updates minimum stock alert threshold for a product and logs audit note
 */
export async function updateProductMinStockLevel(
  shopId: string,
  user: AuditUser,
  productId: string,
  minStockLevel: number
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const cleanMin = Math.max(0, Number(minStockLevel) || 0);
  const productRef = doc(db, "shops", normShopId, "products", productId);
  const snap = await getDoc(productRef);

  if (!snap.exists()) {
    throw new Error(`[StockService] Product not found: ${productId}`);
  }

  const prod = snap.data() as ProductItem;
  const currentStock = prod.stockQuantity || 0;
  const now = Date.now();

  await updateDoc(productRef, {
    minStockLevel: cleanMin,
    updatedAt: now,
    updatedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  });

  // Log audit trail for threshold adjustment
  const txId = `stk_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const txDocRef = doc(db, "shops", normShopId, STOCK_TRANSACTIONS_COLLECTION, txId);

  const transaction: StockTransaction = {
    id: txId,
    shopId: normShopId,
    productId,
    productName: prod.name,
    sku: prod.sku,
    barcode: prod.barcode || "",
    type: "ADJUSTMENT",
    quantityDelta: 0,
    previousStock: currentStock,
    newStock: currentStock,
    reason: `Updated minimum alert threshold to ${cleanMin} units`,
    referenceNumber: `THRESHOLD-${cleanMin}`,
    unitCost: prod.costPrice || 0,
    unitSellingPrice: prod.sellingPrice || 0,
    totalValueChange: 0,
    notes: `Reorder point updated from ${prod.minStockLevel ?? 10} to ${cleanMin}`,
    performedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
    createdAt: now,
  };

  await setDoc(txDocRef, transaction);
}

/**
 * Real-time listener for stock transactions audit trail scoped to active shop
 */
export function subscribeToStockTransactions(
  shopId: string,
  onUpdate: (transactions: StockTransaction[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) {
    onUpdate([]);
    return () => {};
  }

  const colRef = collection(db, "shops", normShopId, STOCK_TRANSACTIONS_COLLECTION);
  const q = query(colRef, orderBy("createdAt", "desc"), firestoreLimit(250));

  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<StockTransaction, "id">),
      }));
      onUpdate(records);
    },
    (err) => {
      console.error("[StockService] Subscription error:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Calculates live stock valuation metrics and stock health breakdown
 */
export function calculateStockValuation(
  products: ProductItem[],
  transactions: StockTransaction[] = []
): StockValuationSummary {
  let totalUnits = 0;
  let totalCostValue = 0;
  let totalRetailValue = 0;
  let healthyCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const p of products) {
    const stock = typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
    const cost = typeof p.costPrice === "number" ? p.costPrice : 0;
    const retail = typeof p.sellingPrice === "number" ? p.sellingPrice : 0;
    const minThreshold = typeof p.minStockLevel === "number" ? p.minStockLevel : 10;

    totalUnits += stock;
    totalCostValue += stock * cost;
    totalRetailValue += stock * retail;

    if (stock <= 0) {
      outOfStockCount++;
    } else if (stock <= minThreshold) {
      lowStockCount++;
    } else {
      healthyCount++;
    }
  }

  // Calculate damaged logs summary
  let damagedUnitsLogged = 0;
  let damagedValueLogged = 0;
  for (const tx of transactions) {
    if (tx.type === "DAMAGED") {
      const units = Math.abs(tx.quantityDelta);
      damagedUnitsLogged += units;
      damagedValueLogged += units * (tx.unitCost || 0);
    }
  }

  return {
    totalProducts: products.length,
    totalUnits,
    totalCostValue,
    totalRetailValue,
    healthyCount,
    lowStockCount,
    outOfStockCount,
    damagedUnitsLogged,
    damagedValueLogged,
  };
}
