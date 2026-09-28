/**
 * lib/services/purchaseService.ts
 *
 * Multi-tenant Purchase Management Service for Firebase Firestore.
 *
 * Guarantees:
 * 1. Multi-Tenant Scoping: All purchases are stored under `shops/{shopId}/purchases/{purchaseId}`
 *    strictly derived from the authenticated shop session.
 * 2. Strict Status Decoupling:
 *    `purchaseStatus` (Order lifecycle), `stockStatus` (Inventory impact), and `paymentStatus` (Financials)
 *    operate independently.
 * 3. Real-World Lifecycles:
 *    - Partial payments and installments
 *    - Cheque payments with clearance and reversible bounce handling (without deleting records)
 *    - Purchase returns with catalog stock deduction while preserving original order snapshots
 * 4. Audit Trail: Every operation records who performed it, role, timestamp, and details.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { recordStockMovement } from "./stockService";
import { AuditUser } from "../types/catalog";
import {
  PurchaseRecord,
  PurchaseItem,
  PurchasePaymentRecord,
  PurchaseInstallmentPlan,
  PurchaseReturnRecord,
  PurchaseAuditEntry,
  CreatePurchaseInput,
  RecordPaymentInput,
  ReceiveStockItemInput,
  CreatePurchaseReturnInput,
  PurchaseFilterOptions,
  PurchaseSummaryMetrics,
  PurchaseStatus,
  PurchaseStockStatus,
  PurchasePaymentStatus,
  ChequeStatus,
} from "../types/purchase";

export const PURCHASES_COLLECTION = "purchases";

// ── Number Generators ───────────────────────────────────────────────────────

export function generatePurchaseOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PO-${year}${month}${day}-${rand}`;
}

export function generateReturnNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RET-${year}${month}${day}-${rand}`;
}

// ── RBAC Authorization Helper ───────────────────────────────────────────────

export function canUserManagePurchases(
  role?: string,
  permissions?: string[]
): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  if (r === "admin" || r === "manager") return true;
  if (permissions && Array.isArray(permissions)) {
    return (
      permissions.includes("purchases") ||
      permissions.includes("manage_purchases") ||
      permissions.includes("admin")
    );
  }
  return false;
}

/**
 * Recursively cleans an object by removing properties with `undefined` values.
 * Firestore setDoc/updateDoc throws if any field contains an `undefined` value.
 */
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanFirestoreData) as unknown as T;
  }
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

// ── 1. Create Purchase ──────────────────────────────────────────────────────

export async function createPurchase(
  shopId: string,
  input: CreatePurchaseInput,
  user: AuditUser
): Promise<PurchaseRecord> {
  const normShopId = normalizeShopId(shopId);
  const now = Date.now();
  const poNumber = generatePurchaseOrderNumber();
  const purchaseId = `purchase_${now}_${Math.random().toString(36).substring(2, 7)}`;

  // Build items snapshot
  let subtotalAmount = 0;
  let totalTax = 0;
  let totalOrderedQty = 0;

  const items: PurchaseItem[] = input.items.map((item, idx) => {
    const subtotal = item.orderedQuantity * item.unitCost;
    const tax = item.taxAmount || 0;
    const totalCost = subtotal + tax;

    subtotalAmount += subtotal;
    totalTax += tax;
    totalOrderedQty += item.orderedQuantity;

    return {
      id: `item_${idx + 1}_${Date.now()}`,
      productId: item.productId,
      variantId: item.variantId || "",
      sku: item.sku,
      name: item.name,
      variantName: item.variantName || "",
      barcode: item.barcode || "",
      orderedQuantity: item.orderedQuantity,
      receivedQuantity: input.receiveStockNow ? item.orderedQuantity : 0,
      returnedQuantity: 0,
      unitCost: item.unitCost,
      subtotal,
      taxAmount: tax,
      totalCost,
    };
  });

  const shippingCost = input.shippingCost || 0;
  const discountAmount = input.discountAmount || 0;
  const grandTotal = Math.max(0, subtotalAmount + totalTax + shippingCost - discountAmount);

  // Setup decoupled statuses
  const purchaseStatus: PurchaseStatus = input.receiveStockNow
    ? "RECEIVED"
    : "ORDERED";

  const stockStatus: PurchaseStockStatus = input.receiveStockNow
    ? "STOCKED"
    : "PENDING";

  // Payments setup
  const payments: PurchasePaymentRecord[] = [];
  let amountPaid = 0;

  if (input.initialPayment && input.initialPayment.amount > 0) {
    const paymentId = `pay_${Date.now()}_1`;
    const payAmt = input.initialPayment.amount;
    amountPaid = payAmt;

    const paymentRecord: PurchasePaymentRecord = {
      id: paymentId,
      amount: payAmt,
      paymentMethod: input.initialPayment.paymentMethod,
      reference: input.initialPayment.reference || "",
      installmentNumber: 1,
      paidAt: now,
      performedBy: user,
      notes: input.initialPayment.notes || "Initial upfront payment",
    };

    if (input.initialPayment.paymentMethod === "CHEQUE" && input.initialPayment.cheque) {
      paymentRecord.cheque = {
        chequeNumber: input.initialPayment.cheque.chequeNumber,
        bankName: input.initialPayment.cheque.bankName,
        chequeDate: input.initialPayment.cheque.chequeDate,
        chequeStatus: "PENDING",
      };
    }

    payments.push(paymentRecord);
  }

  // Installments setup
  const installments: PurchaseInstallmentPlan[] = [];
  if (input.installments && input.installments.length > 0) {
    input.installments.forEach((inst) => {
      installments.push({
        id: `inst_${inst.installmentNumber}_${Date.now()}`,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amountDue: inst.amountDue,
        amountPaid: 0,
        status: inst.dueDate < now ? "OVERDUE" : "PENDING",
        notes: inst.notes || "",
      });
    });
  }

  // Calculate payment status
  const balanceDue = Math.max(0, grandTotal - amountPaid);
  let paymentStatus: PurchasePaymentStatus = "UNPAID";
  if (amountPaid >= grandTotal && grandTotal > 0) {
    paymentStatus = "PAID";
  } else if (amountPaid > 0) {
    paymentStatus = "PARTIALLY_PAID";
  }

  // Audit Log
  const auditTrail: PurchaseAuditEntry[] = [
    {
      id: `audit_${Date.now()}_created`,
      timestamp: now,
      action: "CREATED",
      performedBy: user,
      details: `Created Purchase Order ${poNumber} for supplier ${input.supplierName}. Total: LKR ${grandTotal.toFixed(2)}. Status: ${purchaseStatus}, Stock: ${stockStatus}, Payment: ${paymentStatus}.`,
      metadata: { grandTotal, amountPaid, balanceDue, itemsCount: items.length },
    },
  ];

  const purchaseRecord: PurchaseRecord = {
    id: purchaseId,
    shopId: normShopId,
    purchaseOrderNumber: poNumber,
    supplierInvoiceNumber: input.supplierInvoiceNumber || "",
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    supplierPhone: input.supplierPhone || "",
    purchaseStatus,
    stockStatus,
    paymentStatus,
    items,
    totalOrderedQuantity: totalOrderedQty,
    totalReceivedQuantity: input.receiveStockNow ? totalOrderedQty : 0,
    totalReturnedQuantity: 0,
    subtotalAmount,
    taxAmount: totalTax,
    shippingCost,
    discountAmount,
    totalAmount: grandTotal,
    amountPaid,
    balanceDue,
    payments,
    hasInstallments: installments.length > 0,
    installments,
    hasReturns: false,
    returns: [],
    orderedAt: now,
    ...(typeof input.expectedDeliveryDate === "number" && !isNaN(input.expectedDeliveryDate)
      ? { expectedDeliveryDate: input.expectedDeliveryDate }
      : {}),
    ...(input.receiveStockNow ? { receivedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
    createdBy: user,
    notes: input.notes || "",
    auditTrail,
  };

  // If immediate stock receipt is requested, trigger catalog stock adjustments
  if (input.receiveStockNow) {
    for (const item of items) {
      try {
        await recordStockMovement(
          normShopId,
          user,
          {
            productId: item.productId,
            variantId: item.variantId || undefined,
            sku: item.sku,
            productName: item.name,
            variantName: item.variantName || undefined,
            type: "STOCK_IN",
            quantity: item.orderedQuantity,
            reason: `PO Initial Stock In (${poNumber})`,
            referenceNumber: poNumber,
            unitCost: item.unitCost,
          }
        );
      } catch (err) {
        console.error(`[PurchaseService] Error stocking item ${item.sku}:`, err);
      }
    }
  }

  // Save to Firestore
  const docRef = doc(db, "shops", normShopId, PURCHASES_COLLECTION, purchaseId);
  await setDoc(docRef, cleanFirestoreData(purchaseRecord));

  return purchaseRecord;
}

// ── 2. Record Payment / Installment ──────────────────────────────────────────

export async function recordPurchasePayment(
  shopId: string,
  purchaseId: string,
  input: RecordPaymentInput,
  user: AuditUser
): Promise<PurchaseRecord> {
  const normShopId = normalizeShopId(shopId);
  const now = Date.now();
  const docRef = doc(db, "shops", normShopId, PURCHASES_COLLECTION, purchaseId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Purchase record ${purchaseId} not found in shop ${normShopId}`);
  }

  const purchase = snap.data() as PurchaseRecord;
  const payAmt = input.amount;
  if (payAmt <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const paymentId = `pay_${now}_${Math.random().toString(36).substring(2, 6)}`;
  const paymentRecord: PurchasePaymentRecord = {
    id: paymentId,
    amount: payAmt,
    paymentMethod: input.paymentMethod,
    reference: input.reference || "",
    paidAt: now,
    performedBy: user,
    notes: input.notes || "",
  };

  if (input.paymentMethod === "CHEQUE" && input.cheque) {
    paymentRecord.cheque = {
      chequeNumber: input.cheque.chequeNumber,
      bankName: input.cheque.bankName,
      chequeDate: input.cheque.chequeDate,
      chequeStatus: "PENDING",
    };
  }

  // Update installments if an installment was referenced
  const updatedInstallments = [...purchase.installments];
  if (input.installmentId) {
    const instIndex = updatedInstallments.findIndex((i) => i.id === input.installmentId);
    if (instIndex >= 0) {
      const inst = updatedInstallments[instIndex];
      const newInstPaid = inst.amountPaid + payAmt;
      updatedInstallments[instIndex] = {
        ...inst,
        amountPaid: newInstPaid,
        status: newInstPaid >= inst.amountDue ? "PAID" : inst.dueDate < now ? "OVERDUE" : "PENDING",
        paidAt: newInstPaid >= inst.amountDue ? now : undefined,
        paymentRecordId: paymentId,
      };
      paymentRecord.installmentNumber = inst.installmentNumber;
    }
  }

  const newAmountPaid = purchase.amountPaid + payAmt;
  const newBalanceDue = Math.max(0, purchase.totalAmount - newAmountPaid);

  let newPaymentStatus: PurchasePaymentStatus = "PARTIALLY_PAID";
  if (newAmountPaid >= purchase.totalAmount) {
    newPaymentStatus = newAmountPaid > purchase.totalAmount ? "OVERPAID" : "PAID";
  }

  const auditEntry: PurchaseAuditEntry = {
    id: `audit_${now}_pay`,
    timestamp: now,
    action: "PAYMENT_RECORDED",
    performedBy: user,
    details: `Recorded payment of LKR ${payAmt.toFixed(2)} via ${input.paymentMethod}${input.paymentMethod === "CHEQUE" ? ` (Cheque #${input.cheque?.chequeNumber})` : ""}. New balance due: LKR ${newBalanceDue.toFixed(2)}.`,
    metadata: { payAmt, newAmountPaid, newBalanceDue, paymentMethod: input.paymentMethod },
  };

  const updatedRecord: PurchaseRecord = {
    ...purchase,
    amountPaid: newAmountPaid,
    balanceDue: newBalanceDue,
    paymentStatus: newPaymentStatus,
    payments: [paymentRecord, ...purchase.payments],
    installments: updatedInstallments,
    updatedAt: now,
    auditTrail: [auditEntry, ...purchase.auditTrail],
  };

  await setDoc(docRef, cleanFirestoreData(updatedRecord));
  return updatedRecord;
}

// ── 3. Manage Cheque Clearance & Bounced Reversals ──────────────────────────

export async function updateChequeStatus(
  shopId: string,
  purchaseId: string,
  paymentId: string,
  newStatus: ChequeStatus,
  reason: string | undefined,
  user: AuditUser
): Promise<PurchaseRecord> {
  const normShopId = normalizeShopId(shopId);
  const now = Date.now();
  const docRef = doc(db, "shops", normShopId, PURCHASES_COLLECTION, purchaseId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Purchase record ${purchaseId} not found`);
  }

  const purchase = snap.data() as PurchaseRecord;
  let chequeAmount = 0;
  let chequeNumber = "";

  const updatedPayments = purchase.payments.map((p) => {
    if (p.id === paymentId && p.cheque) {
      chequeAmount = p.amount;
      chequeNumber = p.cheque.chequeNumber;
      return {
        ...p,
        cheque: {
          ...p.cheque,
          chequeStatus: newStatus,
          clearedAt: newStatus === "CLEARED" ? now : p.cheque.clearedAt,
          clearedBy: newStatus === "CLEARED" ? user : p.cheque.clearedBy,
          bouncedAt: newStatus === "BOUNCED" ? now : p.cheque.bouncedAt,
          bouncedBy: newStatus === "BOUNCED" ? user : p.cheque.bouncedBy,
          bounceReason: newStatus === "BOUNCED" ? reason || "Insufficient Funds / Return" : p.cheque.bounceReason,
        },
      };
    }
    return p;
  });

  let newAmountPaid = purchase.amountPaid;
  let newBalanceDue = purchase.balanceDue;
  let newPaymentStatus = purchase.paymentStatus;
  let auditAction: "CHEQUE_CLEARED" | "CHEQUE_BOUNCED" = "CHEQUE_CLEARED";
  let auditDetails = "";

  if (newStatus === "BOUNCED") {
    auditAction = "CHEQUE_BOUNCED";
    // Deduct bounced cheque amount from amountPaid and restore balanceDue
    newAmountPaid = Math.max(0, purchase.amountPaid - chequeAmount);
    newBalanceDue = Math.max(0, purchase.totalAmount - newAmountPaid);

    if (newAmountPaid <= 0) {
      newPaymentStatus = "UNPAID";
    } else if (newAmountPaid < purchase.totalAmount) {
      newPaymentStatus = "PARTIALLY_PAID";
    }

    auditDetails = `Cheque #${chequeNumber} for LKR ${chequeAmount.toFixed(2)} was marked BOUNCED (Reason: ${reason || "N/A"}). Amount reversed from paid balance. Balance restored to LKR ${newBalanceDue.toFixed(2)}.`;
  } else if (newStatus === "CLEARED") {
    auditAction = "CHEQUE_CLEARED";
    auditDetails = `Cheque #${chequeNumber} for LKR ${chequeAmount.toFixed(2)} cleared successfully.`;
  }

  const auditEntry: PurchaseAuditEntry = {
    id: `audit_${now}_chq_${newStatus.toLowerCase()}`,
    timestamp: now,
    action: auditAction,
    performedBy: user,
    details: auditDetails,
    metadata: { paymentId, chequeNumber, chequeAmount, newStatus, newAmountPaid, newBalanceDue },
  };

  const updatedRecord: PurchaseRecord = {
    ...purchase,
    payments: updatedPayments,
    amountPaid: newAmountPaid,
    balanceDue: newBalanceDue,
    paymentStatus: newPaymentStatus,
    updatedAt: now,
    auditTrail: [auditEntry, ...purchase.auditTrail],
  };

  await setDoc(docRef, cleanFirestoreData(updatedRecord));
  return updatedRecord;
}

// ── 4. Receive Purchase Stock ───────────────────────────────────────────────

export async function receivePurchaseStock(
  shopId: string,
  purchaseId: string,
  receivedItems: ReceiveStockItemInput[],
  user: AuditUser
): Promise<PurchaseRecord> {
  const normShopId = normalizeShopId(shopId);
  const now = Date.now();
  const docRef = doc(db, "shops", normShopId, PURCHASES_COLLECTION, purchaseId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Purchase record ${purchaseId} not found`);
  }

  const purchase = snap.data() as PurchaseRecord;
  let totalNewlyReceived = 0;

  // Update line items
  const updatedItems = purchase.items.map((item) => {
    const recvInput = receivedItems.find(
      (r) => r.productId === item.productId && (!r.variantId || r.variantId === item.variantId)
    );
    if (recvInput && recvInput.receiveQuantity > 0) {
      const addedQty = Math.min(
        recvInput.receiveQuantity,
        item.orderedQuantity - item.receivedQuantity
      );
      totalNewlyReceived += addedQty;
      return {
        ...item,
        receivedQuantity: item.receivedQuantity + addedQty,
      };
    }
    return item;
  });

  // Calculate new total received
  const totalReceivedQuantity = updatedItems.reduce((sum, i) => sum + i.receivedQuantity, 0);

  // Decoupled Status transition:
  let newPurchaseStatus: PurchaseStatus = purchase.purchaseStatus;
  let newStockStatus: PurchaseStockStatus = purchase.stockStatus;

  if (totalReceivedQuantity >= purchase.totalOrderedQuantity) {
    newPurchaseStatus = "RECEIVED";
    newStockStatus = "STOCKED";
  } else if (totalReceivedQuantity > 0) {
    newPurchaseStatus = "PARTIALLY_RECEIVED";
    newStockStatus = "PARTIALLY_STOCKED";
  }

  // Trigger catalog inventory updates via stockService
  for (const recv of receivedItems) {
    if (recv.receiveQuantity <= 0) continue;
    const matchingItem = purchase.items.find(
      (i) => i.productId === recv.productId && (!recv.variantId || recv.variantId === i.variantId)
    );
    if (matchingItem) {
      try {
        await recordStockMovement(
          normShopId,
          user,
          {
            productId: matchingItem.productId,
            variantId: matchingItem.variantId || undefined,
            sku: matchingItem.sku,
            productName: matchingItem.name,
            variantName: matchingItem.variantName || undefined,
            type: "STOCK_IN",
            quantity: recv.receiveQuantity,
            reason: `PO Delivery Received (${purchase.purchaseOrderNumber})`,
            referenceNumber: purchase.purchaseOrderNumber,
            unitCost: matchingItem.unitCost,
          }
        );
      } catch (err) {
        console.error(`[PurchaseService] Error stocking received item ${matchingItem.sku}:`, err);
      }
    }
  }

  const auditEntry: PurchaseAuditEntry = {
    id: `audit_${now}_recv`,
    timestamp: now,
    action: "STOCK_RECEIVED",
    performedBy: user,
    details: `Received ${totalNewlyReceived} units for PO ${purchase.purchaseOrderNumber}. Total received to date: ${totalReceivedQuantity} of ${purchase.totalOrderedQuantity}. Stock status: ${newStockStatus}.`,
    metadata: { totalNewlyReceived, totalReceivedQuantity, newStockStatus },
  };

  const updatedRecord: PurchaseRecord = {
    ...purchase,
    items: updatedItems,
    totalReceivedQuantity,
    purchaseStatus: newPurchaseStatus,
    stockStatus: newStockStatus,
    receivedAt: newPurchaseStatus === "RECEIVED" ? now : purchase.receivedAt,
    updatedAt: now,
    auditTrail: [auditEntry, ...purchase.auditTrail],
  };

  await setDoc(docRef, cleanFirestoreData(updatedRecord));
  return updatedRecord;
}

// ── 5. Create Purchase Return (Debit Note) ──────────────────────────────────

export async function createPurchaseReturn(
  shopId: string,
  purchaseId: string,
  input: CreatePurchaseReturnInput,
  user: AuditUser
): Promise<PurchaseRecord> {
  const normShopId = normalizeShopId(shopId);
  const now = Date.now();
  const docRef = doc(db, "shops", normShopId, PURCHASES_COLLECTION, purchaseId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Purchase record ${purchaseId} not found`);
  }

  const purchase = snap.data() as PurchaseRecord;
  const returnNumber = generateReturnNumber();

  let totalReturnQty = 0;
  let totalRefundAmt = 0;
  const returnItemsList: PurchaseReturnRecord["items"] = [];

  // Update line items returnedQuantity (ORIGINAL orderedQuantity and snapshot NEVER lost)
  const updatedItems = purchase.items.map((item) => {
    const retInput = input.items.find(
      (r) => r.productId === item.productId && (!r.variantId || r.variantId === item.variantId)
    );
    if (retInput && retInput.returnQuantity > 0) {
      const returnQty = Math.min(
        retInput.returnQuantity,
        item.receivedQuantity - item.returnedQuantity
      );
      const refund = returnQty * item.unitCost;

      totalReturnQty += returnQty;
      totalRefundAmt += refund;

      returnItemsList.push({
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        variantName: item.variantName,
        returnQuantity: returnQty,
        unitCost: item.unitCost,
        totalRefund: refund,
      });

      return {
        ...item,
        returnedQuantity: item.returnedQuantity + returnQty,
      };
    }
    return item;
  });

  if (totalReturnQty <= 0) {
    throw new Error("No valid return quantities specified");
  }

  // Deduct inventory from catalog if goods were already received/stocked
  let stockWasDeducted = false;
  if (purchase.stockStatus !== "PENDING") {
    for (const retItem of returnItemsList) {
      try {
        await recordStockMovement(
          normShopId,
          user,
          {
            productId: retItem.productId,
            variantId: retItem.variantId || undefined,
            sku: retItem.sku,
            productName: retItem.name,
            variantName: retItem.variantName || undefined,
            type: input.reason.toLowerCase().includes("damage") ? "DAMAGED" : "STOCK_OUT",
            quantity: retItem.returnQuantity,
            reason: `Supplier Return: ${purchase.purchaseOrderNumber} (${returnNumber} - ${input.reason})`,
            referenceNumber: returnNumber,
            unitCost: retItem.unitCost,
          }
        );
        stockWasDeducted = true;
      } catch (err) {
        console.error(`[PurchaseService] Error deducting returned stock for ${retItem.sku}:`, err);
      }
    }
  }

  // Financial adjustments
  let newTotalAmount = purchase.totalAmount;
  let newBalanceDue = purchase.balanceDue;
  let newPaymentStatus = purchase.paymentStatus;

  if (input.refundType === "REDUCE_PAYABLE_BALANCE") {
    newTotalAmount = Math.max(0, purchase.totalAmount - totalRefundAmt);
    newBalanceDue = Math.max(0, newTotalAmount - purchase.amountPaid);
    if (newBalanceDue === 0 && purchase.amountPaid > 0) {
      newPaymentStatus = "PAID";
    }
  } else if (input.refundType === "CASH_REFUND") {
    // If supplier refunded cash, payment status remains or is noted
    if (purchase.paymentStatus === "PAID" && totalReturnQty >= purchase.totalOrderedQuantity) {
      newPaymentStatus = "REFUNDED";
    }
  }

  // Update stock status based on total returned
  const totalReturnedQuantity = purchase.totalReturnedQuantity + totalReturnQty;
  let newStockStatus: PurchaseStockStatus = purchase.stockStatus;
  if (totalReturnedQuantity >= purchase.totalReceivedQuantity && purchase.totalReceivedQuantity > 0) {
    newStockStatus = "RETURNED";
  } else if (totalReturnedQuantity > 0) {
    newStockStatus = "PARTIALLY_RETURNED";
  }

  const returnRecord: PurchaseReturnRecord = {
    id: `ret_${now}_${Math.random().toString(36).substring(2, 6)}`,
    returnNumber,
    returnedAt: now,
    items: returnItemsList,
    totalReturnedQuantity: totalReturnQty,
    totalRefundAmount: totalRefundAmt,
    reason: input.reason,
    refundType: input.refundType,
    stockDeducted: stockWasDeducted,
    performedBy: user,
    notes: input.notes || "",
  };

  const auditEntry: PurchaseAuditEntry = {
    id: `audit_${now}_ret`,
    timestamp: now,
    action: "RETURN_ISSUED",
    performedBy: user,
    details: `Issued supplier return ${returnNumber} for ${totalReturnQty} units. Total refund: LKR ${totalRefundAmt.toFixed(2)} (${input.refundType}). Reason: ${input.reason}.`,
    metadata: { returnNumber, totalReturnQty, totalRefundAmt, refundType: input.refundType },
  };

  const updatedRecord: PurchaseRecord = {
    ...purchase,
    items: updatedItems,
    totalReturnedQuantity,
    totalAmount: newTotalAmount,
    balanceDue: newBalanceDue,
    paymentStatus: newPaymentStatus,
    stockStatus: newStockStatus,
    hasReturns: true,
    returns: [returnRecord, ...purchase.returns],
    updatedAt: now,
    auditTrail: [auditEntry, ...purchase.auditTrail],
  };

  await setDoc(docRef, cleanFirestoreData(updatedRecord));
  return updatedRecord;
}

// ── 6. Real-time Subscription (Multi-tenant) ────────────────────────────────

export function subscribeToPurchases(
  shopId: string,
  onUpdate: (purchases: PurchaseRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  const purchasesRef = collection(db, "shops", normShopId, PURCHASES_COLLECTION);
  const q = query(purchasesRef, where("shopId", "==", normShopId));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: PurchaseRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push(docSnap.data() as PurchaseRecord);
      });
      // Sort in-memory by orderedAt desc (newest first)
      records.sort((a, b) => (b.orderedAt || 0) - (a.orderedAt || 0));
      onUpdate(records);
    },
    (err) => {
      console.error(`[PurchaseService] Subscription error for shop ${normShopId}:`, err);
      if (onError) onError(err);
    }
  );
}

// ── 7. Filter & Search Helper ───────────────────────────────────────────────

export function filterPurchases(
  purchases: PurchaseRecord[],
  options: PurchaseFilterOptions
): PurchaseRecord[] {
  let list = purchases;

  // Search query
  if (options.searchQuery?.trim()) {
    const q = options.searchQuery.toLowerCase().trim();
    list = list.filter((p) => {
      return (
        p.purchaseOrderNumber.toLowerCase().includes(q) ||
        (p.supplierInvoiceNumber && p.supplierInvoiceNumber.toLowerCase().includes(q)) ||
        p.supplierName.toLowerCase().includes(q) ||
        (p.supplierPhone && p.supplierPhone.includes(q)) ||
        p.items.some(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.sku.toLowerCase().includes(q) ||
            (i.barcode && i.barcode.includes(q))
        ) ||
        (p.createdBy?.displayName && p.createdBy.displayName.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      );
    });
  }

  // Supplier filter
  if (options.supplierId && options.supplierId !== "ALL") {
    list = list.filter((p) => p.supplierId === options.supplierId);
  }

  // Purchase Status
  if (options.purchaseStatus && options.purchaseStatus !== "ALL") {
    list = list.filter((p) => p.purchaseStatus === options.purchaseStatus);
  }

  // Stock Status
  if (options.stockStatus && options.stockStatus !== "ALL") {
    list = list.filter((p) => p.stockStatus === options.stockStatus);
  }

  // Payment Status
  if (options.paymentStatus && options.paymentStatus !== "ALL") {
    list = list.filter((p) => p.paymentStatus === options.paymentStatus);
  }

  // Installment Status
  if (options.installmentStatus && options.installmentStatus !== "ALL") {
    if (options.installmentStatus === "HAS_INSTALLMENTS") {
      list = list.filter((p) => p.hasInstallments);
    } else if (options.installmentStatus === "OVERDUE") {
      list = list.filter((p) =>
        p.installments.some((i) => i.status === "OVERDUE" || (i.status === "PENDING" && i.dueDate < Date.now()))
      );
    } else if (options.installmentStatus === "COMPLETED") {
      list = list.filter(
        (p) => p.hasInstallments && p.installments.every((i) => i.status === "PAID")
      );
    }
  }

  // Returns Status
  if (options.hasReturns && options.hasReturns !== "ALL") {
    if (options.hasReturns === "WITH_RETURNS") {
      list = list.filter((p) => p.hasReturns && p.returns.length > 0);
    } else if (options.hasReturns === "NO_RETURNS") {
      list = list.filter((p) => !p.hasReturns || p.returns.length === 0);
    }
  }

  // Date Range
  if (options.startDate) {
    list = list.filter((p) => p.orderedAt >= options.startDate!);
  }
  if (options.endDate) {
    list = list.filter((p) => p.orderedAt <= options.endDate!);
  }

  return list;
}

// ── 8. Aggregate Summary Metrics ────────────────────────────────────────────

export function calculatePurchaseSummaryMetrics(
  purchases: PurchaseRecord[]
): PurchaseSummaryMetrics {
  const now = Date.now();
  let totalSpend = 0;
  let totalPaid = 0;
  let totalBalanceDue = 0;
  let pendingChequesCount = 0;
  let pendingChequesAmount = 0;
  let overdueInstallmentsCount = 0;
  let overdueInstallmentsAmount = 0;
  let totalReturnsCount = 0;
  let totalReturnsAmount = 0;

  purchases.forEach((p) => {
    totalSpend += p.totalAmount;
    totalPaid += p.amountPaid;
    totalBalanceDue += p.balanceDue;

    // Cheques
    p.payments.forEach((pay) => {
      if (pay.cheque && pay.cheque.chequeStatus === "PENDING") {
        pendingChequesCount++;
        pendingChequesAmount += pay.amount;
      }
    });

    // Installments
    p.installments.forEach((inst) => {
      if (inst.status === "OVERDUE" || (inst.status === "PENDING" && inst.dueDate < now)) {
        overdueInstallmentsCount++;
        overdueInstallmentsAmount += Math.max(0, inst.amountDue - inst.amountPaid);
      }
    });

    // Returns
    if (p.returns && p.returns.length > 0) {
      p.returns.forEach((ret) => {
        totalReturnsCount++;
        totalReturnsAmount += ret.totalRefundAmount;
      });
    }
  });

  return {
    totalPurchasesCount: purchases.length,
    totalSpend,
    totalPaid,
    totalBalanceDue,
    pendingChequesCount,
    pendingChequesAmount,
    overdueInstallmentsCount,
    overdueInstallmentsAmount,
    totalReturnsCount,
    totalReturnsAmount,
  };
}

// ── 9. Delete Purchase Order ────────────────────────────────────────────────

export async function deletePurchase(
  shopId: string,
  purchaseId: string,
  user: AuditUser,
  revertStock: boolean = true
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  const docRef = doc(db, "shops", normShopId, PURCHASES_COLLECTION, purchaseId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Purchase order ${purchaseId} not found in shop ${normShopId}`);
  }

  const purchase = snap.data() as PurchaseRecord;

  // If items were received and revertStock is true, reverse received inventory from catalog
  if (revertStock && purchase.stockStatus !== "PENDING") {
    for (const item of purchase.items) {
      const netReceived = (item.receivedQuantity || 0) - (item.returnedQuantity || 0);
      if (netReceived > 0) {
        try {
          await recordStockMovement(
            normShopId,
            user,
            {
              productId: item.productId,
              variantId: item.variantId || undefined,
              sku: item.sku,
              productName: item.name,
              variantName: item.variantName || undefined,
              type: "STOCK_OUT",
              quantity: netReceived,
              reason: `PO Deleted Stock Reversal (${purchase.purchaseOrderNumber})`,
              referenceNumber: purchase.purchaseOrderNumber,
              unitCost: item.unitCost,
            }
          );
        } catch (err) {
          console.error(`[PurchaseService] Error reverting stock for ${item.sku}:`, err);
        }
      }
    }
  }

  await deleteDoc(docRef);
}
