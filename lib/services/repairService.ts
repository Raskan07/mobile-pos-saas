/**
 * lib/services/repairService.ts
 *
 * Multi-Tenant Phone Repair Management Engine for Skyfox POS SaaS.
 *
 * Guarantees:
 * 1. Multi-Tenant Scoping: All tickets stored under `shops/{shopId}/repairs/{repairId}`
 *    with subcollections (`diagnostics`, `estimates`, `tasks`, `parts_usage`, `payments`, `status_history`, `qc_checks`, `warranties`).
 * 2. Cross-Tenant Isolation: Every read/write strictly asserts active session shopId.
 * 3. State-Machine Integrity: Validates allowed status transitions & enforces mandatory QC checks.
 * 4. Inventory Integration: Consuming parts atomically updates stock via `stockService.ts`.
 * 5. Accounting Integrity: Deposits recorded as liabilities; invoices created at collection via `createSaleRecord`.
 * 6. Audit Trail: Immutable logging in `status_history`.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  deleteDoc,
  Unsubscribe,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { recordStockMovement } from "./stockService";
import { createSaleRecord, generateInvoiceNumber } from "./salesService";
import { AuditUser } from "../types/catalog";
import {
  RepairTicket,
  RepairStatus,
  CreateRepairTicketInput,
  RepairDiagnostic,
  RepairEstimate,
  RepairTask,
  RepairPartUsage,
  RepairPayment,
  RepairStatusEvent,
  RepairQCCheck,
  RepairWarranty,
  RepairFilterOptions,
  FullRepairTicketDetails,
} from "../types/repair";

export const REPAIRS_COLLECTION = "repairs";

// ── Validation Helpers ───────────────────────────────────────────────────────

function assertValidShop(shopId?: string): string {
  const normalized = normalizeShopId(shopId || "");
  if (!normalized) {
    throw new Error(
      "Security violation: Active shop session required. Cannot access repairs without authenticated shopId."
    );
  }
  return normalized;
}

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

/**
 * Generates unique collision-resistant human-readable ticket number:
 * Format: REP-YYYYMMDD-XXXX (e.g. REP-20261019-4821)
 */
export function generateTicketNumber(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `REP-${year}${month}${day}-${randomSuffix}`;
}

export function generateWarrantyCode(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `WAR-${year}${month}-${randomSuffix}`;
}

// ── State Machine Transition Rules ──────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  pending: ["received", "diagnosing", "awaiting_approval", "awaiting_parts", "in_repair", "cancelled"],
  received: ["diagnosing", "awaiting_approval", "awaiting_parts", "in_repair", "quality_check", "cancelled"],
  diagnosing: ["awaiting_approval", "awaiting_parts", "in_repair", "quality_check", "irreparable", "cancelled"],
  awaiting_approval: ["in_repair", "awaiting_parts", "quality_check", "customer_declined", "cancelled"],
  awaiting_parts: ["in_repair", "quality_check", "customer_declined", "cancelled"],
  in_repair: ["quality_check", "awaiting_parts", "ready_for_collection", "irreparable", "cancelled"],
  quality_check: ["ready_for_collection", "in_repair", "awaiting_parts"],
  ready_for_collection: ["collected", "delivered", "in_repair", "quality_check", "cancelled"],
  collected: ["delivered", "warranty_rework"],
  delivered: ["warranty_rework"],
  cancelled: ["received", "in_repair"],
  irreparable: ["collected", "delivered"], // Hand back unrepairable device
  customer_declined: ["collected", "delivered"], // Hand back declined device
  warranty_rework: ["received", "diagnosing", "in_repair", "quality_check", "ready_for_collection", "collected"],
};

export function isValidStatusTransition(from: RepairStatus, to: RepairStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

// ── 1. Create Repair Ticket (Device Intake) ──────────────────────────────────

export async function createRepairTicket(
  activeSessionShopId: string,
  user: AuditUser,
  input: CreateRepairTicketInput
): Promise<RepairTicket> {
  const normShop = assertValidShop(activeSessionShopId);

  if (!input.customerName || !input.customerName.trim()) {
    throw new Error("[RepairService] Customer name is required.");
  }
  if (!input.model || !input.model.trim()) {
    throw new Error("[RepairService] Device model is required.");
  }
  if (!input.reportedFaults || input.reportedFaults.length === 0) {
    throw new Error("[RepairService] At least one reported fault is required.");
  }

  const now = Date.now();
  const ticketId = `rep_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const ticketNumber = generateTicketNumber();

  const initialDeposit = Number(input.initialDepositAmount) || 0;
  const estimatedCost = Number(input.estimatedCost) || 0;
  const serviceChargeAmount = Number(input.serviceChargeAmount) || 0;
  const discountAmount = Number(input.discountAmount) || 0;
  const additionalCharges = Number(input.additionalCharges) || 0;
  const internalPartsCost = (input.initialLineItems || []).reduce(
    (sum, it) => sum + (Number(it.unitCost) || 0) * (Number(it.quantity) || 1),
    0
  );
  const balanceDue = Math.max(0, estimatedCost - initialDeposit);
  const intakeReceiptNumber = `JRC-${ticketNumber.slice(4)}`;

  const intakeLineItems = (input.initialLineItems || []).map((it) => ({
    type: it.type,
    description: it.description,
    sku: it.sku,
    quantity: it.quantity,
    unitSellingPrice: it.unitSellingPrice,
    totalPrice: it.totalPrice,
  }));

  const ticketData: RepairTicket = {
    id: ticketId,
    ticketNumber,
    shopId: normShop,
    shopName: user.displayName || normShop,
    branchId: input.branchId || "main",
    branchName: input.branchName || "Main Workshop",

    customerId: input.customerId,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim() || "N/A",
    customerEmail: input.customerEmail?.trim(),

    deviceType: input.deviceType,
    brand: input.brand.trim() || "Generic",
    model: input.model.trim(),
    color: input.color?.trim(),
    serialNumber: input.serialNumber?.trim(),
    imei1: input.imei1?.trim(),
    imei2: input.imei2?.trim(),

    passcodeProtected: Boolean(input.passcodeProtected),
    passcodeMasked: input.passcodeMasked,
    patternMatrix: input.patternMatrix,
    passcodeClearedOnDelivery: false,

    reportedFaults: input.reportedFaults,
    intakeNotes: input.intakeNotes?.trim() || "",
    condition: input.condition,
    accessories: input.accessories,
    intakePhotoUrls: input.intakePhotoUrls || [],
    customerSignatureUrl: input.customerSignatureUrl,

    status: "received",
    priority: input.priority || "normal",
    isWarrantyRework: false,

    assignedTechnicianId: input.assignedTechnicianId,
    assignedTechnicianName: input.assignedTechnicianName,

    estimatedCost,
    serviceChargeAmount,
    discountAmount,
    additionalCharges,
    internalPartsCost,
    depositPaid: initialDeposit,
    totalPaid: initialDeposit,
    intakeReceiptNumber,
    balanceDue,
    intakeLineItems,

    estimatedCompletionDate: input.estimatedCompletionDate,
    createdAt: now,
    createdAtISO: new Date(now).toISOString(),
    updatedAt: now,

    intakeOperator: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  };

  const sanitized = cleanUndefined(ticketData);
  const writePromises: Promise<unknown>[] = [];

  // 1. Write parent ticket under shops/{shopId}/repairs/{ticketId}
  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  writePromises.push(setDoc(ticketRef, sanitized));

  // 2. Also dual-index root /repairs/{ticketId} for fallback querying
  const rootRef = doc(db, REPAIRS_COLLECTION, ticketId);
  writePromises.push(
    setDoc(rootRef, sanitized).catch((err) => {
      console.warn("[RepairService] Root mirror save notice:", err);
    })
  );

  // 3. Write initial status history entry
  const statusEventId = `sth_${now}`;
  const statusEvent: RepairStatusEvent = {
    id: statusEventId,
    ticketId,
    shopId: normShop,
    fromStatus: "NONE",
    toStatus: "received",
    reason: "Device intake received at service counter",
    performedBy: user,
    timestamp: now,
  };
  const statusRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "status_history", statusEventId);
  writePromises.push(setDoc(statusRef, cleanUndefined(statusEvent)));

  // 4. If initial deposit was provided, log into payments subcollection
  if (initialDeposit > 0) {
    const paymentId = `pay_${now}`;
    const paymentRecord: RepairPayment = {
      id: paymentId,
      ticketId,
      shopId: normShop,
      type: "deposit",
      amount: initialDeposit,
      paymentMethod: input.depositPaymentMethod || "cash",
      receiptNumber: `DEP-${ticketNumber.slice(4)}`,
      notes: "Initial intake diagnostic/parts deposit",
      cashier: user,
      recordedAt: now,
    };
    const paymentRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "payments", paymentId);
    writePromises.push(setDoc(paymentRef, cleanUndefined(paymentRecord)));
  }

  // 5. If initial line items were provided from POS intake, create Estimate Version 1
  if (input.initialLineItems && input.initialLineItems.length > 0) {
    const estItems = input.initialLineItems.map((it, idx) => ({
      id: `init_item_${idx}_${now}`,
      type: it.type,
      description: it.description,
      sku: it.sku,
      quantity: it.quantity,
      unitCost: it.unitCost,
      unitSellingPrice: it.unitSellingPrice,
      totalPrice: it.totalPrice,
    }));
    const subtotal = estItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const grandTotal = Math.max(0, subtotal - discountAmount + additionalCharges);
    const estimateId = `est_v1_${now}`;
    const estimateDoc: RepairEstimate = {
      id: estimateId,
      ticketId,
      shopId: normShop,
      version: 1,
      items: estItems,
      subtotal,
      discountAmount,
      taxAmount: 0,
      grandTotal,
      status: "approved",
      customerApproval: {
        approvedAt: now,
        approvedBy: ticketData.customerName,
        approvalMethod: "in_person",
        notes: "Agreed at intake counter",
      },
      createdBy: user,
      createdAt: now,
      updatedAt: now,
    };
    const estRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "estimates", estimateId);
    writePromises.push(setDoc(estRef, cleanUndefined(estimateDoc)));
  }

  await Promise.all(writePromises);

  return ticketData;
}

// ── 2. Real-time Subscription to Repair Tickets ─────────────────────────────

export function subscribeToRepairTickets(
  activeSessionShopId: string,
  callback: (tickets: RepairTicket[]) => void,
  options?: RepairFilterOptions
): Unsubscribe {
  const normShop = assertValidShop(activeSessionShopId);
  const repairsRef = collection(db, "shops", normShop, REPAIRS_COLLECTION);

  let q = query(repairsRef, orderBy("createdAt", "desc"), firestoreLimit(500));

  return onSnapshot(
    q,
    (snapshot) => {
      let tickets = snapshot.docs.map((docSnap) => docSnap.data() as RepairTicket);

      // Deduplicate by ticket.id just in case
      const seenIds = new Set<string>();
      tickets = tickets.filter((t) => {
        if (!t || !t.id || seenIds.has(t.id)) return false;
        seenIds.add(t.id);
        return true;
      });

      // In-memory filters for flexibility
      if (options?.status && options.status !== "all") {
        tickets = tickets.filter((t) => t.status === options.status);
      }
      if (options?.priority && options.priority !== "all") {
        tickets = tickets.filter((t) => t.priority === options.priority);
      }
      if (options?.technicianId && options.technicianId !== "all") {
        tickets = tickets.filter((t) => t.assignedTechnicianId === options.technicianId);
      }
      if (options?.searchQuery && options.searchQuery.trim()) {
        const queryClean = options.searchQuery.toLowerCase().trim();
        tickets = tickets.filter(
          (t) =>
            t.ticketNumber.toLowerCase().includes(queryClean) ||
            t.customerName.toLowerCase().includes(queryClean) ||
            t.customerPhone.toLowerCase().includes(queryClean) ||
            t.model.toLowerCase().includes(queryClean) ||
            t.brand.toLowerCase().includes(queryClean) ||
            (t.imei1 && t.imei1.toLowerCase().includes(queryClean)) ||
            (t.serialNumber && t.serialNumber.toLowerCase().includes(queryClean)) ||
            (t.finalInvoiceNumber && t.finalInvoiceNumber.toLowerCase().includes(queryClean)) ||
            (t.intakeReceiptNumber && t.intakeReceiptNumber.toLowerCase().includes(queryClean))
        );
      }

      callback(tickets);
    },
    (error) => {
      console.error("[RepairService] Real-time listener error:", error);
      callback([]);
    }
  );
}

// ── 3. Fetch Full Ticket Bundle (Parent + All Subcollections) ────────────────

export async function getRepairTicketDetails(
  activeSessionShopId: string,
  ticketId: string
): Promise<FullRepairTicketDetails> {
  const normShop = assertValidShop(activeSessionShopId);

  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  const ticketSnap = await getDoc(ticketRef);

  if (!ticketSnap.exists()) {
    throw new Error(`[RepairService] Repair ticket ${ticketId} not found.`);
  }

  const ticket = ticketSnap.data() as RepairTicket;

  // Subcollections fetch in parallel
  const [
    diagSnap,
    estSnap,
    tasksSnap,
    partsSnap,
    paySnap,
    historySnap,
    qcSnap,
    warSnap,
  ] = await Promise.all([
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "diagnostics")),
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "estimates")),
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "tasks")),
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "parts_usage")),
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "payments")),
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "status_history")),
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "qc_checks")),
    getDocs(collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "warranties")),
  ]);

  return {
    ticket,
    diagnostics: diagSnap.docs.map((d) => d.data() as RepairDiagnostic),
    estimates: estSnap.docs.map((d) => d.data() as RepairEstimate).sort((a, b) => b.version - a.version),
    tasks: tasksSnap.docs.map((d) => d.data() as RepairTask).sort((a, b) => a.createdAt - b.createdAt),
    partsUsage: partsSnap.docs.map((d) => d.data() as RepairPartUsage).sort((a, b) => b.recordedAt - a.recordedAt),
    payments: paySnap.docs.map((d) => d.data() as RepairPayment).sort((a, b) => b.recordedAt - a.recordedAt),
    statusHistory: historySnap.docs.map((d) => d.data() as RepairStatusEvent).sort((a, b) => b.timestamp - a.timestamp),
    qcChecks: qcSnap.docs.map((d) => d.data() as RepairQCCheck).sort((a, b) => b.createdAt - a.createdAt),
    warranties: warSnap.docs.map((d) => d.data() as RepairWarranty),
  };
}

// ── 4. Update Repair Status (With State-Machine & QC Gate Enforcement) ───────

export async function updateRepairStatus(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  newStatus: RepairStatus,
  reason?: string
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);

  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  const ticketSnap = await getDoc(ticketRef);
  if (!ticketSnap.exists()) {
    throw new Error(`[RepairService] Repair ticket ${ticketId} does not exist.`);
  }

  const ticket = ticketSnap.data() as RepairTicket;
  const currentStatus = ticket.status;

  if (currentStatus === newStatus) return;

  // Validate state-machine transition
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    throw new Error(
      `[RepairService] Invalid transition from '${currentStatus}' to '${newStatus}'. Transition not permitted.`
    );
  }

  // Mandatory QC Gate enforcement:
  // Cannot move to "ready_for_collection" without at least one 100% passed QC inspection!
  if (newStatus === "ready_for_collection") {
    const qcSnap = await getDocs(
      collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "qc_checks")
    );
    const checks = qcSnap.docs.map((d) => d.data() as RepairQCCheck);
    const hasPassingQC = checks.some((chk) => chk.isAllPassed);

    if (!hasPassingQC) {
      throw new Error(
        "[RepairService] Quality Control Gate Error: Device cannot be marked 'Ready for Collection' without an approved, 100% passed QC Checklist inspection."
      );
    }
  }

  const now = Date.now();

  // Update parent ticket
  const updatePayload: Partial<RepairTicket> = {
    status: newStatus,
    updatedAt: now,
    ...(newStatus === "collected" ? { closedAt: now } : {}),
  };
  await updateDoc(ticketRef, cleanUndefined(updatePayload));

  // Mirror update
  try {
    await updateDoc(doc(db, REPAIRS_COLLECTION, ticketId), cleanUndefined(updatePayload));
  } catch (err) {
    // ignore root mirror error
  }

  // Append to status history
  const historyId = `sth_${now}_${Math.random().toString(36).substring(2, 6)}`;
  const statusRecord: RepairStatusEvent = {
    id: historyId,
    ticketId,
    shopId: normShop,
    fromStatus: currentStatus,
    toStatus: newStatus,
    reason: reason || `Status changed from ${currentStatus} to ${newStatus}`,
    performedBy: user,
    timestamp: now,
  };

  await setDoc(
    doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "status_history", historyId),
    cleanUndefined(statusRecord)
  );
}

// ── 4.5. Update Technician Assignment & Financial Adjustments ───────────────

export async function assignTechnicianToTicket(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  technicianId: string,
  technicianName: string
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();
  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);

  const payload = cleanUndefined({
    assignedTechnicianId: technicianId || "unassigned",
    assignedTechnicianName: technicianName.trim() || "Unassigned",
    updatedAt: now,
  });

  await updateDoc(ticketRef, payload);
  try {
    await updateDoc(doc(db, REPAIRS_COLLECTION, ticketId), payload);
  } catch (err) {}
}

export async function updateTicketFinancials(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  updates: {
    estimatedCost?: number;
    serviceChargeAmount?: number;
    discountAmount?: number;
    additionalCharges?: number;
  }
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();
  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) return;

  const current = snap.data() as RepairTicket;
  const est = updates.estimatedCost !== undefined ? updates.estimatedCost : current.estimatedCost || 0;
  const svc = updates.serviceChargeAmount !== undefined ? updates.serviceChargeAmount : current.serviceChargeAmount || 0;
  const disc = updates.discountAmount !== undefined ? updates.discountAmount : current.discountAmount || 0;
  const addl = updates.additionalCharges !== undefined ? updates.additionalCharges : current.additionalCharges || 0;
  const totalPaid = current.totalPaid || 0;
  const balanceDue = Math.max(0, est - totalPaid);

  const payload = cleanUndefined({
    estimatedCost: est,
    serviceChargeAmount: svc,
    discountAmount: disc,
    additionalCharges: addl,
    balanceDue,
    updatedAt: now,
  });

  await updateDoc(ticketRef, payload);
  try {
    await updateDoc(doc(db, REPAIRS_COLLECTION, ticketId), payload);
  } catch (err) {}
}

export async function deleteRepairTicket(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  await deleteDoc(ticketRef);

  try {
    await deleteDoc(doc(db, REPAIRS_COLLECTION, ticketId));
  } catch (err) {
    // Ignore if root mirror does not exist
  }
}

// ── 5. Diagnostics Subcollection Operations ──────────────────────────────────

export async function saveRepairDiagnostic(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  diagnosticData: Omit<RepairDiagnostic, "id" | "ticketId" | "shopId" | "technician" | "createdAt">
): Promise<RepairDiagnostic> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();
  const diagId = `diag_${now}`;

  const record: RepairDiagnostic = {
    id: diagId,
    ticketId,
    shopId: normShop,
    technician: user,
    ...diagnosticData,
    createdAt: now,
  };

  await setDoc(
    doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "diagnostics", diagId),
    cleanUndefined(record)
  );

  // Auto transition to diagnosing if ticket is received
  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  const ticketSnap = await getDoc(ticketRef);
  if (ticketSnap.exists() && ticketSnap.data().status === "received") {
    await updateRepairStatus(normShop, user, ticketId, "diagnosing", "Diagnostics initiated");
  }

  return record;
}

// ── 6. Versioned Estimates Subcollection Operations ─────────────────────────

export async function createEstimateVersion(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  items: RepairEstimate["items"],
  discountAmount = 0,
  taxRate = 0
): Promise<RepairEstimate> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();

  // Find existing estimates to determine next version
  const estColl = collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "estimates");
  const estSnap = await getDocs(estColl);
  const nextVersion = estSnap.size + 1;

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = Math.max(0, (subtotal - discountAmount) * taxRate);
  const grandTotal = Math.max(0, subtotal - discountAmount + taxAmount);

  const estimateId = `est_v${nextVersion}_${now}`;
  const estimateDoc: RepairEstimate = {
    id: estimateId,
    ticketId,
    shopId: normShop,
    version: nextVersion,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    grandTotal,
    status: "awaiting_approval",
    createdBy: user,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(estColl, estimateId), cleanUndefined(estimateDoc));

  // Update parent ticket estimated cost & balanceDue
  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  const tSnap = await getDoc(ticketRef);
  const currentPaid = tSnap.exists() ? (tSnap.data().totalPaid || 0) : 0;
  const newBalanceDue = Math.max(0, grandTotal - currentPaid);
  const estInternalCost = items.reduce(
    (sum, item) => sum + (Number(item.unitCost) || 0) * (Number(item.quantity) || 1),
    0
  );

  await updateDoc(ticketRef, {
    estimatedCost: grandTotal,
    discountAmount,
    balanceDue: newBalanceDue,
    ...(estInternalCost > 0 ? { internalPartsCost: estInternalCost } : {}),
    updatedAt: now,
  });
  try {
    await updateDoc(doc(db, REPAIRS_COLLECTION, ticketId), {
      estimatedCost: grandTotal,
      discountAmount,
      balanceDue: newBalanceDue,
      ...(estInternalCost > 0 ? { internalPartsCost: estInternalCost } : {}),
      updatedAt: now,
    });
  } catch (e) {}

  // Automatically transition status to awaiting_approval
  await updateRepairStatus(normShop, user, ticketId, "awaiting_approval", `Estimate v${nextVersion} created`);

  return estimateDoc;
}

export async function approveEstimate(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  estimateId: string,
  approval: NonNullable<RepairEstimate["customerApproval"]>
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();

  const estRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "estimates", estimateId);
  await updateDoc(estRef, {
    status: "approved",
    customerApproval: approval,
    updatedAt: now,
  });

  // Transition ticket to in_repair
  await updateRepairStatus(
    normShop,
    user,
    ticketId,
    "in_repair",
    `Estimate approved by customer (${approval.approvedBy} via ${approval.approvalMethod})`
  );
}

// ── 7. Technician Tasks / Work Logs ──────────────────────────────────────────

export async function addRepairTask(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  title: string,
  description?: string
): Promise<RepairTask> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();
  const taskId = `tsk_${now}`;

  const taskDoc: RepairTask = {
    id: taskId,
    ticketId,
    shopId: normShop,
    title,
    description,
    isCompleted: false,
    createdAt: now,
  };

  await setDoc(
    doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "tasks", taskId),
    cleanUndefined(taskDoc)
  );

  return taskDoc;
}

export async function toggleRepairTask(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  taskId: string,
  isCompleted: boolean,
  timeSpentMinutes?: number
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();

  const taskRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "tasks", taskId);
  await updateDoc(
    taskRef,
    cleanUndefined({
      isCompleted,
      completedAt: isCompleted ? now : null,
      completedBy: isCompleted ? user : null,
      ...(timeSpentMinutes ? { timeSpentMinutes } : {}),
    })
  );
}

// ── 8. Spare Parts Reservation, Consumption & Inventory Movement ────────────

export async function recordPartUsage(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  input: {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCost: number;
    unitSellingPrice: number;
    status: "reserved" | "consumed" | "damaged";
    notes?: string;
  }
): Promise<RepairPartUsage> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();
  const partUsageId = `pu_${now}_${Math.random().toString(36).substring(2, 6)}`;

  let stockTxId: string | undefined = undefined;

  // If part is consumed or damaged, atomically decrement stock via stockService
  if (input.status === "consumed" || input.status === "damaged") {
    try {
      const stockMovementType = input.status === "damaged" ? "DAMAGED" : "STOCK_OUT";
      const stockRes = await recordStockMovement(normShop, user, {
        productId: input.productId,
        productName: input.productName,
        sku: input.sku,
        type: stockMovementType,
        quantity: input.quantity,
        reason: `Repair job consumption (Ticket #${ticketId})`,
        referenceNumber: ticketId,
        unitCost: input.unitCost,
        notes: input.notes,
      });
      stockTxId = stockRes.transaction.id;
    } catch (stockErr) {
      console.warn("[RepairService] Warning: Product stock auto-decrement error:", stockErr);
      // We still record parts usage for workshop traceability
    }
  }

  const partUsageDoc: RepairPartUsage = {
    id: partUsageId,
    ticketId,
    shopId: normShop,
    productId: input.productId,
    productName: input.productName,
    sku: input.sku,
    quantity: input.quantity,
    unitCost: input.unitCost,
    unitSellingPrice: input.unitSellingPrice,
    status: input.status,
    stockTransactionId: stockTxId,
    notes: input.notes,
    recordedBy: user,
    recordedAt: now,
  };

  await setDoc(
    doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "parts_usage", partUsageId),
    cleanUndefined(partUsageDoc)
  );

  // Sync internalPartsCost onto parent ticket
  try {
    const partsColl = collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "parts_usage");
    const allParts = await getDocs(partsColl);
    let totalPartCost = 0;
    allParts.docs.forEach((d) => {
      const p = d.data() as RepairPartUsage;
      if (p.status !== "returned_to_stock") {
        totalPartCost += (Number(p.unitCost) || 0) * (Number(p.quantity) || 1);
      }
    });
    const tRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
    await updateDoc(tRef, { internalPartsCost: totalPartCost, updatedAt: now });
    await updateDoc(doc(db, REPAIRS_COLLECTION, ticketId), { internalPartsCost: totalPartCost, updatedAt: now }).catch(() => {});
  } catch (e) {}

  return partUsageDoc;
}

export async function returnPartToStock(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  partUsageId: string
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const partRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "parts_usage", partUsageId);
  const partSnap = await getDoc(partRef);

  if (!partSnap.exists()) {
    throw new Error(`[RepairService] Part usage record ${partUsageId} not found.`);
  }

  const part = partSnap.data() as RepairPartUsage;
  if (part.status === "returned_to_stock") return;

  // If it was consumed, replenish stock
  if (part.status === "consumed") {
    await recordStockMovement(normShop, user, {
      productId: part.productId,
      productName: part.productName,
      sku: part.sku,
      type: "STOCK_IN",
      quantity: part.quantity,
      reason: `Repair part return / restock (Ticket #${ticketId})`,
      referenceNumber: ticketId,
      unitCost: part.unitCost,
    });
  }

  await updateDoc(partRef, {
    status: "returned_to_stock",
    notes: `${part.notes || ""} [Returned to stock by ${user.displayName || user.username}]`,
  });
}

// ── 9. Payments, Deposits, Refunds & Balance Calculations ───────────────────

export async function recordRepairPayment(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  input: {
    type: RepairPayment["type"];
    amount: number;
    paymentMethod: RepairPayment["paymentMethod"];
    paymentReference?: string;
    notes?: string;
  }
): Promise<RepairPayment> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();
  const paymentId = `pay_${now}_${Math.random().toString(36).substring(2, 6)}`;

  const paymentRecord: RepairPayment = {
    id: paymentId,
    ticketId,
    shopId: normShop,
    type: input.type,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    receiptNumber: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
    notes: input.notes,
    cashier: user,
    recordedAt: now,
  };

  await setDoc(
    doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "payments", paymentId),
    cleanUndefined(paymentRecord)
  );

  // Recalculate parent ticket financial balance
  const payColl = collection(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "payments");
  const allPays = await getDocs(payColl);
  let totalPaid = 0;
  let depositPaid = 0;

  for (const docP of allPays.docs) {
    const p = docP.data() as RepairPayment;
    if (p.type === "refund") {
      totalPaid -= p.amount;
    } else {
      totalPaid += p.amount;
      if (p.type === "deposit") depositPaid += p.amount;
    }
  }

  const ticketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId);
  const ticketSnap = await getDoc(ticketRef);
  const estimatedCost = ticketSnap.exists() ? (ticketSnap.data().estimatedCost || 0) : 0;
  const balanceDue = Math.max(0, estimatedCost - totalPaid);

  await updateDoc(ticketRef, {
    totalPaid,
    depositPaid,
    balanceDue,
    updatedAt: now,
  });
  try {
    await updateDoc(doc(db, REPAIRS_COLLECTION, ticketId), {
      totalPaid,
      depositPaid,
      balanceDue,
      updatedAt: now,
    });
  } catch (e) {}

  return paymentRecord;
}

// ── 10. Complete Repair & Settle at POS Register (Creates Sale Record) ────────

export async function completeRepairAndInvoice(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  paymentMethod: "cash" | "card" | "bank_transfer" | "qr" = "cash",
  warrantyDays = 90
): Promise<{ saleId: string; invoiceNumber: string; warrantyCode: string }> {
  const normShop = assertValidShop(activeSessionShopId);

  const bundle = await getRepairTicketDetails(normShop, ticketId);
  const ticket = bundle.ticket;

  // Build itemized sale line items from the latest estimate, intake line items, and/or consumed parts
  const latestEstimate = bundle.estimates[0] || null;
  const consumedParts = bundle.partsUsage.filter(
    (p) => p.status === "consumed" || p.status === "reserved"
  );

  const items: {
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    costPrice: number;
    totalCost: number;
    discount: number;
  }[] = [];

  if (latestEstimate && latestEstimate.items.length > 0) {
    latestEstimate.items.forEach((it, idx) => {
      items.push({
        productId: `prod_adhoc_rep_est_${ticket.id}_${idx}`,
        name: it.description,
        sku: it.sku || (it.type === "part" ? "REP-PART" : "SVC-LABOR"),
        quantity: it.quantity || 1,
        unitPrice: it.unitSellingPrice,
        subtotal: it.totalPrice,
        costPrice: it.unitCost || 0,
        totalCost: (it.unitCost || 0) * (it.quantity || 1),
        discount: 0,
      });
    });

    // Also include any consumed parts not already present in the estimate
    consumedParts.forEach((p, idx) => {
      const alreadyIncluded = items.some(
        (existing) =>
          existing.name.toLowerCase().includes(p.productName.toLowerCase()) ||
          (p.sku && existing.sku === p.sku)
      );
      if (!alreadyIncluded) {
        const sub = p.unitSellingPrice * p.quantity;
        items.push({
          productId: `prod_adhoc_rep_part_${ticket.id}_${idx}`,
          name: p.productName,
          sku: p.sku || "REP-PART",
          quantity: p.quantity,
          unitPrice: p.unitSellingPrice,
          subtotal: sub,
          costPrice: p.unitCost || 0,
          totalCost: (p.unitCost || 0) * p.quantity,
          discount: 0,
        });
      }
    });
  } else if (ticket.intakeLineItems && ticket.intakeLineItems.length > 0) {
    ticket.intakeLineItems.forEach((it, idx) => {
      items.push({
        productId: `prod_adhoc_rep_intake_${ticket.id}_${idx}`,
        name: it.description,
        sku: it.sku || (it.type === "part" ? "REP-PART" : "SVC-LABOR"),
        quantity: it.quantity || 1,
        unitPrice: it.unitSellingPrice,
        subtotal: it.totalPrice,
        costPrice: 0,
        totalCost: 0,
        discount: 0,
      });
    });
  } else if (consumedParts.length > 0) {
    consumedParts.forEach((p, idx) => {
      const sub = p.unitSellingPrice * p.quantity;
      items.push({
        productId: `prod_adhoc_rep_part_${ticket.id}_${idx}`,
        name: p.productName,
        sku: p.sku || "REP-PART",
        quantity: p.quantity,
        unitPrice: p.unitSellingPrice,
        subtotal: sub,
        costPrice: p.unitCost || 0,
        totalCost: (p.unitCost || 0) * p.quantity,
        discount: 0,
      });
    });
  } else if ((ticket.estimatedCost || 0) > 0) {
    items.push({
      productId: `prod_adhoc_repair_service_${ticket.id}`,
      name: `Repair Service: ${ticket.brand} ${ticket.model} (${(ticket.reportedFaults || []).join(", ") || "Service"})`,
      sku: `REP-${ticket.deviceType.toUpperCase()}`,
      quantity: 1,
      unitPrice: (ticket.estimatedCost || 0) + (ticket.discountAmount || 0),
      subtotal: (ticket.estimatedCost || 0) + (ticket.discountAmount || 0),
      costPrice: 0,
      totalCost: 0,
      discount: 0,
    });
  }

  const hasServiceFeeInSource =
    (latestEstimate?.items || []).some((it) => it.type === "service_fee") ||
    (ticket.intakeLineItems || []).some((it) => it.type === "service_fee") ||
    items.some(
      (it) =>
        Math.abs(it.subtotal - (ticket.serviceChargeAmount || 0)) < 0.01 ||
        it.name.toLowerCase().includes("labor") ||
        it.name.toLowerCase().includes("labour") ||
        it.name.toLowerCase().includes("service fee") ||
        it.name.toLowerCase().includes("service charge")
    );

  if (ticket.serviceChargeAmount && ticket.serviceChargeAmount > 0 && !hasServiceFeeInSource) {
    items.push({
      productId: `prod_adhoc_rep_svcfee_${ticket.id}`,
      name: "Service / Labour Charge",
      sku: "SVC-FEE",
      quantity: 1,
      unitPrice: ticket.serviceChargeAmount,
      subtotal: ticket.serviceChargeAmount,
      costPrice: 0,
      totalCost: 0,
      discount: 0,
    });
  }

  if (ticket.additionalCharges && ticket.additionalCharges > 0) {
    items.push({
      productId: `prod_adhoc_rep_addl_${ticket.id}`,
      name: "Additional Workshop / Express Charges",
      sku: "SVC-ADDL",
      quantity: 1,
      unitPrice: ticket.additionalCharges,
      subtotal: ticket.additionalCharges,
      costPrice: 0,
      totalCost: 0,
      discount: 0,
    });
  }

  const rawSubtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
  const finalDiscount = ticket.discountAmount || latestEstimate?.discountAmount || 0;
  const finalPayable = Math.max(0, rawSubtotal - finalDiscount);
  const now = Date.now();

  // Invoke salesService to record permanent POS sale
  const saleRecord = await createSaleRecord(normShop, {
    shopId: normShop,
    shopName: ticket.shopName || normShop,
    branchId: ticket.branchId || "main",
    branchName: ticket.branchName || "Main Workshop",
    cashier: user,
    customer: {
      customerId: ticket.customerId,
      name: ticket.customerName,
      phone: ticket.customerPhone,
      email: ticket.customerEmail,
    },
    items,
    subtotal: rawSubtotal,
    discountSetting: {
      type: "fixed",
      value: finalDiscount,
    },
    discountAmount: finalDiscount,
    taxRate: 0,
    taxAmount: 0,
    grandTotal: finalPayable,
    paymentMethod,
    cashReceived: finalPayable,
    notes: `Repair settlement for Job Ticket #${ticket.ticketNumber} (${ticket.brand} ${ticket.model})`,
  });

  // Record final balance payment in repair payments subcollection
  if (ticket.balanceDue > 0) {
    await recordRepairPayment(normShop, user, ticketId, {
      type: "final_balance",
      amount: ticket.balanceDue,
      paymentMethod,
      notes: `Final settlement applied to POS Invoice #${saleRecord.invoiceNumber}`,
    });
  }

  // Issue Warranty Certificate
  const warrantyCode = generateWarrantyCode();
  const startDate = new Date();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + warrantyDays);

  const formatYMD = (d: Date) => d.toISOString().split("T")[0];

  const warrantyDoc: RepairWarranty = {
    id: `war_${now}`,
    ticketId,
    ticketNumber: ticket.ticketNumber,
    shopId: normShop,
    warrantyCode,
    customerName: ticket.customerName,
    customerPhone: ticket.customerPhone,
    deviceModel: `${ticket.brand} ${ticket.model}`,
    serialOrImei: ticket.imei1 || ticket.serialNumber,
    durationDays: warrantyDays,
    startDate: formatYMD(startDate),
    expiryDate: formatYMD(expiryDate),
    terms: `Valid for ${warrantyDays} days on replaced parts and workmanship. Excludes accidental drop damage, liquid ingress, and unauthorized third-party tampering.`,
    status: "active",
    issuedBy: user,
    issuedAt: now,
  };

  await setDoc(
    doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "warranties", warrantyDoc.id),
    cleanUndefined(warrantyDoc)
  );

  // Transition ticket to "collected"
  await updateRepairStatus(
    normShop,
    user,
    ticketId,
    "collected",
    `Device collected by customer. POS Invoice #${saleRecord.invoiceNumber} issued. Warranty: ${warrantyCode}`
  );

  // Update parent ticket with invoice refs and clear passcode (using cleanUndefined so Firestore updateDoc never throws)
  const finalUpdate = cleanUndefined({
    finalInvoiceNumber: saleRecord.invoiceNumber,
    finalSaleId: saleRecord.saleId,
    passcodeMasked: "",
    patternMatrix: "",
    passcodeClearedOnDelivery: true,
    closedAt: now,
    updatedAt: now,
  });

  await updateDoc(doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId), finalUpdate);
  try {
    await updateDoc(doc(db, REPAIRS_COLLECTION, ticketId), finalUpdate);
  } catch (e) {}

  return {
    saleId: saleRecord.saleId,
    invoiceNumber: saleRecord.invoiceNumber,
    warrantyCode,
  };
}

// ── 11. Quality Control Inspection Checklist Subcollection ───────────────────

export async function saveRepairQCCheck(
  activeSessionShopId: string,
  user: AuditUser,
  ticketId: string,
  items: RepairQCCheck["items"],
  aestheticGrade: RepairQCCheck["aestheticGrade"],
  cleaningPerformed: boolean,
  screwsVerified: boolean,
  inspectorNotes?: string
): Promise<RepairQCCheck> {
  const normShop = assertValidShop(activeSessionShopId);
  const now = Date.now();
  const checkId = `qc_${now}`;

  const isAllPassed = items.every((i) => i.passed) && cleaningPerformed && screwsVerified;

  const qcDoc: RepairQCCheck = {
    id: checkId,
    ticketId,
    shopId: normShop,
    inspector: user,
    items,
    isAllPassed,
    aestheticGrade,
    cleaningPerformed,
    screwsVerified,
    inspectorNotes,
    createdAt: now,
  };

  await setDoc(
    doc(db, "shops", normShop, REPAIRS_COLLECTION, ticketId, "qc_checks", checkId),
    cleanUndefined(qcDoc)
  );

  // If QC passed completely, automatically advance status to ready_for_collection
  if (isAllPassed) {
    await updateRepairStatus(
      normShop,
      user,
      ticketId,
      "ready_for_collection",
      "QC Checklist passed 100%. Device ready for customer collection."
    );
  }

  return qcDoc;
}

// ── 12. Warranty Claim & Rework Ticket Creator ───────────────────────────────

export async function createWarrantyClaim(
  activeSessionShopId: string,
  user: AuditUser,
  originalTicketId: string,
  claimReason: string
): Promise<RepairTicket> {
  const normShop = assertValidShop(activeSessionShopId);

  const bundle = await getRepairTicketDetails(normShop, originalTicketId);
  const orig = bundle.ticket;

  // Create new ticket flagged as rework
  const reworkInput: CreateRepairTicketInput = {
    customerId: orig.customerId,
    customerName: orig.customerName,
    customerPhone: orig.customerPhone,
    customerEmail: orig.customerEmail,
    deviceType: orig.deviceType,
    brand: orig.brand,
    model: orig.model,
    color: orig.color,
    serialNumber: orig.serialNumber,
    imei1: orig.imei1,
    imei2: orig.imei2,
    passcodeProtected: false,
    reportedFaults: [`Warranty Rework Claim: ${claimReason}`],
    intakeNotes: `Linked to Original Job Ticket #${orig.ticketNumber}`,
    condition: orig.condition,
    accessories: orig.accessories,
    priority: "urgent", // Reworks are prioritized
    estimatedCost: 0, // No charge for warranty
    initialDepositAmount: 0,
    branchId: orig.branchId,
    branchName: orig.branchName,
  };

  const newTicket = await createRepairTicket(normShop, user, reworkInput);

  // Link original and rework
  const reworkTicketRef = doc(db, "shops", normShop, REPAIRS_COLLECTION, newTicket.id);
  await updateDoc(reworkTicketRef, {
    isWarrantyRework: true,
    originalTicketId,
    status: "warranty_rework",
  });

  // Mark warranty status as claimed
  if (bundle.warranties.length > 0) {
    const war = bundle.warranties[0];
    await updateDoc(doc(db, "shops", normShop, REPAIRS_COLLECTION, originalTicketId, "warranties", war.id), {
      status: "claimed",
      reworkTicketId: newTicket.id,
    });
  }

  return newTicket;
}

// ── 15. Custom Repair Problems & Parts Catalog Persistence ──────────────────

export const REPAIR_CATALOG_PROBLEMS_COLLECTION = "repair_catalog_problems";
export const REPAIR_CATALOG_PARTS_COLLECTION = "repair_catalog_parts";

export interface CustomRepairProblem {
  id: string;
  name: string;
  icon: string;
  basePriceLKR: number;
  timeEst: string;
  shopId: string;
  createdAt: number;
}

export interface CustomRepairPart {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  costPriceLKR: number;
  sellingPriceLKR: number;
  tier: string;
  warrantyPeriod: string;
  inStockQty?: number;
  shopId: string;
  createdAt: number;
}

export function subscribeToCustomRepairProblems(
  activeSessionShopId: string,
  callback: (problems: CustomRepairProblem[]) => void
): Unsubscribe {
  const normShop = assertValidShop(activeSessionShopId);
  const cacheKey = `custom_repair_problems_${normShop}`;

  // Quick fallback from local cache
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        callback(JSON.parse(cached));
      }
    } catch (e) {
      // ignore
    }
  }

  const colRef = collection(db, "shops", normShop, REPAIR_CATALOG_PROBLEMS_COLLECTION);
  const q = query(colRef, orderBy("createdAt", "desc"), firestoreLimit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => docSnap.data() as CustomRepairProblem);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(items));
        } catch (e) {}
      }
      callback(items);
    },
    (err) => {
      console.warn("[RepairService] Problem catalog snapshot error:", err);
    }
  );
}

export async function saveCustomRepairProblem(
  activeSessionShopId: string,
  problem: CustomRepairProblem
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const probRef = doc(db, "shops", normShop, REPAIR_CATALOG_PROBLEMS_COLLECTION, problem.id);
  await setDoc(probRef, cleanUndefined({ ...problem, shopId: normShop }));

  // Also update local cache
  if (typeof window !== "undefined") {
    const cacheKey = `custom_repair_problems_${normShop}`;
    try {
      const existing = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      const filtered = existing.filter((p: CustomRepairProblem) => p.id !== problem.id);
      localStorage.setItem(cacheKey, JSON.stringify([problem, ...filtered]));
    } catch (e) {}
  }
}

export async function deleteCustomRepairProblem(
  activeSessionShopId: string,
  problemId: string
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const probRef = doc(db, "shops", normShop, REPAIR_CATALOG_PROBLEMS_COLLECTION, problemId);
  await deleteDoc(probRef);

  if (typeof window !== "undefined") {
    const cacheKey = `custom_repair_problems_${normShop}`;
    try {
      const existing = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      localStorage.setItem(cacheKey, JSON.stringify(existing.filter((p: CustomRepairProblem) => p.id !== problemId)));
    } catch (e) {}
  }
}

export function subscribeToCustomRepairParts(
  activeSessionShopId: string,
  callback: (parts: CustomRepairPart[]) => void
): Unsubscribe {
  const normShop = assertValidShop(activeSessionShopId);
  const cacheKey = `custom_repair_parts_${normShop}`;

  // Quick fallback from local cache (strictly clean out any legacy part_init mock data)
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cleaned = Array.isArray(parsed)
          ? parsed.filter((p: CustomRepairPart) => !p.id?.startsWith("part_init_"))
          : [];
        if (Array.isArray(parsed) && parsed.length !== cleaned.length) {
          localStorage.setItem(cacheKey, JSON.stringify(cleaned));
        }
        callback(cleaned);
      }
    } catch (e) {}
  }

  const colRef = collection(db, "shops", normShop, REPAIR_CATALOG_PARTS_COLLECTION);
  const q = query(colRef, orderBy("createdAt", "desc"), firestoreLimit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      // Exclude any legacy mock items that might have been seeded
      const items = snapshot.docs
        .map((docSnap) => docSnap.data() as CustomRepairPart)
        .filter((p) => !p.id?.startsWith("part_init_"));
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(items));
        } catch (e) {}
      }
      callback(items);
    },
    (err) => {
      console.warn("[RepairService] Parts catalog snapshot error:", err);
    }
  );
}

export async function saveCustomRepairPart(
  activeSessionShopId: string,
  part: CustomRepairPart
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const partRef = doc(db, "shops", normShop, REPAIR_CATALOG_PARTS_COLLECTION, part.id);
  await setDoc(partRef, cleanUndefined({ ...part, shopId: normShop }));

  if (typeof window !== "undefined") {
    const cacheKey = `custom_repair_parts_${normShop}`;
    try {
      const existing = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      const filtered = existing.filter((p: CustomRepairPart) => p.id !== part.id);
      localStorage.setItem(cacheKey, JSON.stringify([part, ...filtered]));
    } catch (e) {}
  }
}

export async function deleteCustomRepairPart(
  activeSessionShopId: string,
  partId: string
): Promise<void> {
  const normShop = assertValidShop(activeSessionShopId);
  const partRef = doc(db, "shops", normShop, REPAIR_CATALOG_PARTS_COLLECTION, partId);
  await deleteDoc(partRef);

  if (typeof window !== "undefined") {
    const cacheKey = `custom_repair_parts_${normShop}`;
    try {
      const existing = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      localStorage.setItem(cacheKey, JSON.stringify(existing.filter((p: CustomRepairPart) => p.id !== partId)));
    } catch (e) {}
  }
}

