/**
 * lib/services/installmentService.ts
 *
 * Service layer for Installment Sales & Payment Management:
 * - Schedule generation & dynamic balance recalculation
 * - Firestore persistence (shops/{shopId}/installments + root installments) with local cache
 * - Automatic stock deduction upon device delivery & stock restoration on cancellation
 * - Partial, full, advance, and early-settlement payment allocation
 * - Duration fee rules configuration per shop
 * - Printable PDF generation for Customer Agreements and Installment Receipts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import {
  InstallmentPlanRecord,
  InstallmentScheduleItem,
  InstallmentPaymentRecord,
  InstallmentTenderMethod,
  InstallmentCustomerProfile,
  InstallmentGuarantorProfile,
  InstallmentProductSnapshot,
  DownPaymentMethodType,
  DurationFeeRule,
  DEFAULT_DURATION_FEE_RULES,
  DEFAULT_SRI_LANKA_INSTALLMENT_TERMS,
  DEFAULT_LATE_PAYMENT_CONDITIONS,
  InstallmentReminderLog,
} from "../types/installment";

const INSTALLMENTS_COLLECTION = "installments";
const SHOPS_COLLECTION = "shops";

const localSubscribers = new Map<string, Set<(plans: InstallmentPlanRecord[]) => void>>();

function notifyLocalSubscribers(shopId: string, plans: InstallmentPlanRecord[]) {
  const subs = localSubscribers.get(normalizeShopId(shopId || "DEFAULT"));
  if (subs) {
    subs.forEach((cb) => cb(plans));
  }
}

function getLocalStorageKey(shopId: string): string {
  return `skyfox_installments_${normalizeShopId(shopId || "DEFAULT")}`;
}

function getFeeRulesStorageKey(shopId: string): string {
  return `skyfox_installment_fee_rules_${normalizeShopId(shopId || "DEFAULT")}`;
}

/**
 * Loads cached installment plans from localStorage for instant zero-latency UI rendering
 */
export function getCachedInstallmentPlans(shopId: string): InstallmentPlanRecord[] {
  if (typeof window === "undefined" || !shopId) return [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(shopId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InstallmentPlanRecord[];
    return Array.isArray(parsed) ? parsed.map(recalculatePlanState) : [];
  } catch {
    return [];
  }
}

function saveCachedInstallmentPlans(shopId: string, plans: InstallmentPlanRecord[]): void {
  if (typeof window === "undefined" || !shopId) return;
  try {
    localStorage.setItem(getLocalStorageKey(shopId), JSON.stringify(plans));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Duration Fee Rules management per shop (Requirement 6)
 */
export function getShopDurationFeeRules(shopId: string): DurationFeeRule[] {
  if (typeof window === "undefined" || !shopId) return DEFAULT_DURATION_FEE_RULES;
  try {
    const raw = localStorage.getItem(getFeeRulesStorageKey(shopId));
    if (!raw) return DEFAULT_DURATION_FEE_RULES;
    const parsed = JSON.parse(raw) as DurationFeeRule[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_DURATION_FEE_RULES;
  } catch {
    return DEFAULT_DURATION_FEE_RULES;
  }
}

export async function saveShopDurationFeeRules(
  shopId: string,
  rules: DurationFeeRule[]
): Promise<void> {
  const normShopId = normalizeShopId(shopId || "DEFAULT");
  if (typeof window !== "undefined") {
    localStorage.setItem(getFeeRulesStorageKey(normShopId), JSON.stringify(rules));
  }
  try {
    const ref = doc(db, SHOPS_COLLECTION, normShopId, "settings", "installment_rules");
    await setDoc(ref, { shopId: normShopId, rules, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.warn("[InstallmentService] Saved duration fee rules locally:", err);
  }
}

/**
 * Helper to add months to a YYYY-MM-DD date string while keeping a target day of month
 */
export function addMonthsToDateStr(
  startDateStr: string,
  monthsToAdd: number,
  preferredDay?: number
): string {
  const parts = startDateStr.split("-").map(Number);
  const baseYear = parts[0] || new Date().getFullYear();
  const baseMonth = (parts[1] || 1) - 1;
  const baseDay = preferredDay || parts[2] || 5;

  const targetDate = new Date(baseYear, baseMonth + monthsToAdd, 1, 12, 0, 0);
  const maxDaysInTargetMonth = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    0
  ).getDate();
  targetDate.setDate(Math.min(baseDay, maxDaysInTargetMonth));

  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Builds the initial month-by-month payment schedule
 */
export function generateInstallmentSchedule(params: {
  financedBalance: number;
  durationMonths: number;
  startDate: string;
  dueDayOfMonth?: number;
}): {
  schedule: InstallmentScheduleItem[];
  monthlyAmount: number;
  endDate: string;
} {
  const { financedBalance, durationMonths, startDate, dueDayOfMonth } = params;
  const count = Math.max(1, Math.round(durationMonths));
  const cleanBalance = Math.max(0, Math.round(financedBalance * 100) / 100);

  // Standard monthly installment rounded to 2 decimal places
  const baseMonthly = Math.floor((cleanBalance / count) * 100) / 100;
  const schedule: InstallmentScheduleItem[] = [];
  const todayStr = new Date().toISOString().split("T")[0];

  let allocatedSum = 0;

  for (let i = 1; i <= count; i++) {
    const dueDate = addMonthsToDateStr(startDate, i, dueDayOfMonth);
    const dueTimestamp = new Date(`${dueDate}T23:59:59`).getTime();

    // Ensure final month absorbs any rounding cent difference so total equals exact financedBalance
    const scheduledAmount =
      i === count
        ? Math.max(0, Math.round((cleanBalance - allocatedSum) * 100) / 100)
        : baseMonthly;
    allocatedSum += scheduledAmount;

    let status: InstallmentScheduleItem["status"] = "upcoming";
    if (scheduledAmount <= 0) {
      status = "paid";
    } else if (dueDate < todayStr) {
      status = "overdue";
    } else if (i === 1) {
      status = "pending";
    }

    schedule.push({
      installmentNumber: i,
      dueDate,
      dueTimestamp,
      scheduledAmount,
      paidAmount: 0,
      remainingAmount: scheduledAmount,
      lateFeeApplied: 0,
      status,
    });
  }

  const endDate = schedule.length > 0 ? schedule[schedule.length - 1].dueDate : startDate;
  return {
    schedule,
    monthlyAmount: baseMonthly,
    endDate,
  };
}

/**
 * Dynamically refreshes schedule statuses (Overdue, Pending, Upcoming, Paid, Partially Paid)
 * and plan-level aggregates based on current date and payment history.
 */
export function recalculatePlanState(plan: InstallmentPlanRecord): InstallmentPlanRecord {
  const todayStr = new Date().toISOString().split("T")[0];
  let foundFirstUnpaid = false;
  let paidCount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let nextDueDate: string | null = null;
  let nextDueAmount = 0;
  let totalScheduleRemaining = 0;

  const isPlanClosed =
    plan.status === "completed" ||
    plan.status === "early_settled" ||
    plan.status === "cancelled";

  const updatedSchedule = (plan.schedule || []).map((item) => {
    const rem = Math.max(
      0,
      Math.round((item.scheduledAmount + (item.lateFeeApplied || 0) - item.paidAmount) * 100) / 100
    );

    if (item.status === "waived") {
      paidCount++;
      return { ...item, remainingAmount: 0 };
    }

    if (rem <= 0.009 || plan.status === "completed" || plan.status === "early_settled") {
      paidCount++;
      return {
        ...item,
        remainingAmount: 0,
        status: "paid" as const,
      };
    }

    totalScheduleRemaining += rem;

    if (!nextDueDate) {
      nextDueDate = item.dueDate;
      nextDueAmount = rem;
    }

    let status: InstallmentScheduleItem["status"] = item.status;
    if (item.dueDate < todayStr && !isPlanClosed) {
      status = "overdue";
      overdueCount++;
      overdueAmount += rem;
    } else if (item.paidAmount > 0 && rem > 0) {
      status = "partially_paid";
      foundFirstUnpaid = true;
    } else if (!foundFirstUnpaid) {
      status = "pending";
      foundFirstUnpaid = true;
    } else {
      status = "upcoming";
    }

    return {
      ...item,
      remainingAmount: rem,
      status,
    };
  });

  const sumPayments = (plan.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const totalCollected = Math.round(sumPayments * 100) / 100;
  const totalLateFees = updatedSchedule.reduce((acc, s) => acc + (Number(s.lateFeeApplied) || 0), 0);
  const effectivePayable = Math.max(
    0,
    plan.totalAgreedPayable + totalLateFees - (plan.earlySettlementDiscount || 0)
  );
  const remainingBalance =
    plan.status === "cancelled" || plan.status === "completed" || plan.status === "early_settled"
      ? 0
      : Math.max(0, Math.round((effectivePayable - totalCollected) * 100) / 100);

  let nextStatus: InstallmentPlanRecord["status"] = plan.status;
  if (plan.status !== "cancelled" && plan.status !== "early_settled") {
    if (remainingBalance <= 0.01) {
      nextStatus = "completed";
    } else if (overdueCount > 0) {
      nextStatus = "overdue";
    } else {
      nextStatus = "active";
    }
  }

  return {
    ...plan,
    schedule: updatedSchedule,
    totalCollectedAmount: totalCollected,
    remainingBalance,
    paidInstallmentsCount: paidCount,
    overdueInstallmentsCount: overdueCount,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
    nextDueDate,
    nextDueAmount: Math.round(nextDueAmount * 100) / 100,
    status: nextStatus,
  };
}

/**
 * Generates a unique human-friendly Agreement ID, e.g. AGR-2026-4819
 */
export function generateAgreementNumber(existingCount = 0): string {
  const year = new Date().getFullYear();
  const seq = String(existingCount + 1).padStart(3, "0");
  const rand = Math.floor(10 + Math.random() * 90);
  return `AGR-${year}-${seq}${rand}`;
}

export interface CreateInstallmentPlanInput {
  shopId: string;
  shopName: string;
  branchId?: string;
  branchName?: string;
  customer: InstallmentCustomerProfile;
  guarantor?: InstallmentGuarantorProfile;
  product: InstallmentProductSnapshot;
  originalCashPrice: number;
  installmentMarkupType: "percentage" | "fixed" | "none";
  installmentMarkupValue: number;
  installmentFeeAmount: number;
  serviceChargeAmount: number;
  discountAmount: number;
  totalAgreedPayable: number;
  downPaymentMethod: DownPaymentMethodType;
  downPaymentInputValue: number;
  initialDownPayment: number;
  downPaymentTenderMethod: InstallmentTenderMethod;
  durationMonths: number;
  startDate: string;
  paymentDueDayOfMonth: number;
  lateFeePerMonthPct?: number;
  lateFeeGraceDays?: number;
  termsAndConditions?: string;
  latePaymentConditions?: string;
  notes?: string;
  operator: {
    userId: string;
    username: string;
    displayName?: string;
  };
}

/**
 * Creates a new Installment Plan, records the initial down payment receipt,
 * and immediately deducts the delivered phone from catalog stock.
 */
export async function createInstallmentPlan(
  input: CreateInstallmentPlanInput
): Promise<InstallmentPlanRecord> {
  const normShopId = normalizeShopId(input.shopId);
  const now = Date.now();
  const existing = getCachedInstallmentPlans(normShopId);
  const planId = `inst_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const agreementNumber = generateAgreementNumber(existing.length);

  const financedPrincipalBalance = Math.max(
    0,
    Math.round((input.totalAgreedPayable - input.initialDownPayment) * 100) / 100
  );

  const { schedule, monthlyAmount, endDate } = generateInstallmentSchedule({
    financedBalance: financedPrincipalBalance,
    durationMonths: input.durationMonths,
    startDate: input.startDate,
    dueDayOfMonth: input.paymentDueDayOfMonth,
  });

  const initialPayments: InstallmentPaymentRecord[] = [];
  if (input.initialDownPayment > 0) {
    initialPayments.push({
      paymentId: `pay_${now}_dp`,
      receiptNumber: `RCP-DP-${agreementNumber.split("-").pop() || now.toString().slice(-4)}`,
      planId,
      agreementNumber,
      shopId: normShopId,
      paymentType: "down_payment",
      amount: input.initialDownPayment,
      paymentMethod: input.downPaymentTenderMethod,
      paidAt: now,
      paidDateStr: input.startDate,
      appliedToInstallments: [],
      balanceBefore: input.totalAgreedPayable,
      balanceAfter: financedPrincipalBalance,
      collectedBy: {
        userId: input.operator.userId || "staff",
        username: input.operator.username || "Staff",
        displayName: input.operator.displayName || input.operator.username || "Staff",
      },
      notes: "Initial Down Payment upon device delivery",
    });
  }

  const rawPlan: InstallmentPlanRecord = {
    id: planId,
    agreementNumber,
    shopId: normShopId,
    shopName: input.shopName || normShopId,
    branchId: input.branchId || "main",
    branchName: input.branchName || "Main Branch",
    customer: input.customer,
    ...(input.guarantor && input.guarantor.fullName.trim() ? { guarantor: input.guarantor } : {}),
    product: input.product,
    originalCashPrice: Number(input.originalCashPrice) || 0,
    installmentMarkupType: input.installmentMarkupType,
    installmentMarkupValue: Number(input.installmentMarkupValue) || 0,
    installmentFeeAmount: Number(input.installmentFeeAmount) || 0,
    serviceChargeAmount: Number(input.serviceChargeAmount) || 0,
    discountAmount: Number(input.discountAmount) || 0,
    totalAgreedPayable: Number(input.totalAgreedPayable) || 0,
    downPaymentMethod: input.downPaymentMethod,
    downPaymentInputValue: Number(input.downPaymentInputValue) || 0,
    initialDownPayment: Number(input.initialDownPayment) || 0,
    downPaymentTenderMethod: input.downPaymentTenderMethod,
    financedPrincipalBalance,
    durationMonths: Number(input.durationMonths) || 12,
    monthlyInstallmentAmount: monthlyAmount,
    startDate: input.startDate,
    endDate,
    paymentDueDayOfMonth: Number(input.paymentDueDayOfMonth) || 5,
    lateFeePerMonthPct: Number(input.lateFeePerMonthPct) || 0,
    lateFeeGraceDays: Number(input.lateFeeGraceDays) || 5,
    totalCollectedAmount: Number(input.initialDownPayment) || 0,
    remainingBalance: financedPrincipalBalance,
    earlySettlementDiscount: 0,
    paidInstallmentsCount: 0,
    overdueInstallmentsCount: 0,
    overdueAmount: 0,
    nextDueDate: schedule[0]?.dueDate || null,
    nextDueAmount: schedule[0]?.scheduledAmount || 0,
    schedule,
    payments: initialPayments,
    reminders: [],
    status: financedPrincipalBalance <= 0 ? "completed" : "active",
    agreementSigned: true,
    agreementSignedAt: now,
    termsAndConditions: input.termsAndConditions || DEFAULT_SRI_LANKA_INSTALLMENT_TERMS,
    latePaymentConditions: input.latePaymentConditions || DEFAULT_LATE_PAYMENT_CONDITIONS,
    notes: input.notes || "",
    createdBy: {
      userId: input.operator.userId || "staff",
      username: input.operator.username || "Staff",
      displayName: input.operator.displayName || input.operator.username || "Staff",
    },
    createdAt: now,
    updatedAt: now,
  };

  const finalPlan = recalculatePlanState(rawPlan);

  // 1. Update local cache & notify UI immediately (zero-latency optimistic update)
  const updatedList = [finalPlan, ...existing.filter((p) => p.id !== finalPlan.id)];
  saveCachedInstallmentPlans(normShopId, updatedList);
  notifyLocalSubscribers(normShopId, updatedList);

  // 2. Persist to Firestore & decrement stock in parallel in the background
  void (async () => {
    const shopRef = doc(db, SHOPS_COLLECTION, normShopId, INSTALLMENTS_COLLECTION, planId);
    const rootRef = doc(db, INSTALLMENTS_COLLECTION, planId);

    const tasks: Promise<unknown>[] = [
      setDoc(shopRef, finalPlan),
      setDoc(rootRef, finalPlan),
    ];

    if (input.product.productId) {
      tasks.push(
        (async () => {
          try {
            const prodRef = doc(
              db,
              SHOPS_COLLECTION,
              normShopId,
              "products",
              input.product.productId!
            );
            const prodSnap = await getDoc(prodRef);
            if (!prodSnap.exists()) return;

            const prevStock = Number(prodSnap.data()?.stockQuantity) || 0;
            const nextStock = prevStock - 1;
            const txId = `stk_inst_${now}`;
            const txRef = doc(db, SHOPS_COLLECTION, normShopId, "stock_transactions", txId);

            await Promise.allSettled([
              updateDoc(prodRef, {
                stockQuantity: increment(-1),
                updatedAt: now,
              }),
              updateDoc(doc(db, "products", input.product.productId!), {
                stockQuantity: increment(-1),
                updatedAt: now,
              }),
              setDoc(txRef, {
                id: txId,
                shopId: normShopId,
                productId: input.product.productId,
                productName: input.product.productName,
                sku: input.product.sku || "",
                barcode: input.product.imeiNumber || "",
                type: "SALE",
                quantityDelta: -1,
                previousStock: prevStock,
                newStock: nextStock,
                reason: `Installment Sale: ${agreementNumber}`,
                referenceNumber: agreementNumber,
                unitCost: input.product.purchaseCostPrice || 0,
                unitSellingPrice: input.totalAgreedPayable || 0,
                totalValueChange: -(input.product.purchaseCostPrice || 0),
                notes: `IMEI: ${input.product.imeiNumber || "N/A"} | Customer: ${input.customer.fullName} (${input.customer.nicNumber})`,
                performedBy: {
                  userId: input.operator.userId || "staff",
                  username: input.operator.username || "Staff",
                  role: "admin",
                  displayName: input.operator.displayName || input.operator.username || "Staff",
                },
                createdAt: now,
              }),
            ]);
          } catch (stockErr) {
            console.warn("[InstallmentService] Background stock decrement notice:", stockErr);
          }
        })()
      );
    }

    await Promise.allSettled(tasks);
  })();

  return finalPlan;
}

/**
 * Records an installment payment (exact, partial, advance/overpayment, or early full settlement)
 * and automatically recalculates the remaining balance and schedule items without losing history.
 */
export async function recordInstallmentPayment(params: {
  shopId: string;
  planId: string;
  amount: number;
  paymentMethod: InstallmentTenderMethod;
  paymentType?: "installment" | "early_settlement";
  earlySettlementDiscount?: number;
  referenceNumber?: string;
  notes?: string;
  operator: {
    userId: string;
    username: string;
    displayName?: string;
  };
}): Promise<{ updatedPlan: InstallmentPlanRecord; paymentRecord: InstallmentPaymentRecord }> {
  const normShopId = normalizeShopId(params.shopId);
  let plans = getCachedInstallmentPlans(normShopId);
  let target = plans.find((p) => p.id === params.planId);
  if (!target) {
    plans = await fetchInstallmentPlans(normShopId);
    target = plans.find((p) => p.id === params.planId);
  }
  if (!target) {
    throw new Error("Installment agreement not found.");
  }

  const now = Date.now();
  const todayStr = new Date(now).toISOString().split("T")[0];
  const paymentAmount = Math.max(0, Math.round(Number(params.amount) * 100) / 100);
  if (paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const discountToApply =
    params.paymentType === "early_settlement"
      ? Math.max(0, Number(params.earlySettlementDiscount) || 0)
      : 0;

  const balanceBefore = target.remainingBalance;
  let unallocated = paymentAmount;
  const appliedToInstallments: { installmentNumber: number; amountApplied: number }[] = [];

  const updatedSchedule = target.schedule.map((item) => {
    if (unallocated <= 0.005 || item.status === "paid" || item.status === "waived") {
      return item;
    }

    const itemTotalDue = item.scheduledAmount + (item.lateFeeApplied || 0);
    const itemRemaining = Math.max(0, Math.round((itemTotalDue - item.paidAmount) * 100) / 100);
    if (itemRemaining <= 0) return item;

    const allocate = Math.min(unallocated, itemRemaining);
    unallocated = Math.max(0, Math.round((unallocated - allocate) * 100) / 100);

    const newPaid = Math.round((item.paidAmount + allocate) * 100) / 100;
    const newRemaining = Math.max(0, Math.round((itemTotalDue - newPaid) * 100) / 100);

    appliedToInstallments.push({
      installmentNumber: item.installmentNumber,
      amountApplied: allocate,
    });

    return {
      ...item,
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status: newRemaining <= 0.009 ? ("paid" as const) : ("partially_paid" as const),
      paidAt: now,
    };
  });

  const seq = (target.payments?.length || 0) + 1;
  const receiptNumber = `RCP-INST-${target.agreementNumber.split("-").pop() || "01"}-${String(seq).padStart(2, "0")}`;

  const balanceAfter = Math.max(
    0,
    Math.round((balanceBefore - paymentAmount - discountToApply) * 100) / 100
  );

  const paymentRecord: InstallmentPaymentRecord = {
    paymentId: `pay_${now}_${Math.random().toString(36).substring(2, 6)}`,
    receiptNumber,
    planId: target.id,
    agreementNumber: target.agreementNumber,
    shopId: normShopId,
    paymentType: params.paymentType || "installment",
    amount: paymentAmount,
    paymentMethod: params.paymentMethod,
    ...(params.referenceNumber ? { referenceNumber: params.referenceNumber } : {}),
    paidAt: now,
    paidDateStr: todayStr,
    appliedToInstallments,
    balanceBefore,
    balanceAfter,
    collectedBy: {
      userId: params.operator.userId || "staff",
      username: params.operator.username || "Staff",
      displayName: params.operator.displayName || params.operator.username || "Staff",
    },
    ...(params.notes ? { notes: params.notes } : {}),
  };

  const nextPlanDraft: InstallmentPlanRecord = {
    ...target,
    schedule: updatedSchedule,
    payments: [...(target.payments || []), paymentRecord],
    earlySettlementDiscount: (target.earlySettlementDiscount || 0) + discountToApply,
    status:
      params.paymentType === "early_settlement" && balanceAfter <= 0.01
        ? "early_settled"
        : balanceAfter <= 0.01
        ? "completed"
        : target.status,
    ...(balanceAfter <= 0.01 ? { completedAt: now } : {}),
    updatedAt: now,
  };

  const updatedPlan = recalculatePlanState(nextPlanDraft);
  await persistUpdatedPlan(normShopId, updatedPlan);

  return { updatedPlan, paymentRecord };
}

/**
 * Waives a specific installment (authorized adjustment)
 */
export async function waiveInstallmentItem(params: {
  shopId: string;
  planId: string;
  installmentNumber: number;
  reason: string;
}): Promise<InstallmentPlanRecord> {
  const normShopId = normalizeShopId(params.shopId);
  let plans = getCachedInstallmentPlans(normShopId);
  let target = plans.find((p) => p.id === params.planId);
  if (!target) {
    plans = await fetchInstallmentPlans(normShopId);
    target = plans.find((p) => p.id === params.planId);
  }
  if (!target) throw new Error("Installment plan not found.");

  let waivedAmount = 0;
  const updatedSchedule = target.schedule.map((item) => {
    if (item.installmentNumber !== params.installmentNumber) return item;
    waivedAmount = item.remainingAmount;
    return {
      ...item,
      remainingAmount: 0,
      status: "waived" as const,
      notes: `Waived: ${params.reason}`,
    };
  });

  const updatedPlan = recalculatePlanState({
    ...target,
    schedule: updatedSchedule,
    earlySettlementDiscount: (target.earlySettlementDiscount || 0) + waivedAmount,
    updatedAt: Date.now(),
  });

  await persistUpdatedPlan(normShopId, updatedPlan);
  return updatedPlan;
}

/**
 * Cancels an agreement while preserving its full financial & transaction history
 */
export async function cancelInstallmentAgreement(params: {
  shopId: string;
  planId: string;
  reason: string;
  restockDevice: boolean;
}): Promise<InstallmentPlanRecord> {
  const normShopId = normalizeShopId(params.shopId);
  let plans = getCachedInstallmentPlans(normShopId);
  let target = plans.find((p) => p.id === params.planId);
  if (!target) {
    plans = await fetchInstallmentPlans(normShopId);
    target = plans.find((p) => p.id === params.planId);
  }
  if (!target) throw new Error("Installment plan not found.");

  const now = Date.now();
  const updatedPlan = recalculatePlanState({
    ...target,
    status: "cancelled",
    cancellationReason: params.reason || "Cancelled by authorized staff",
    cancelledAt: now,
    updatedAt: now,
  });

  await persistUpdatedPlan(normShopId, updatedPlan);

  if (params.restockDevice && target.product.productId) {
    void updateDoc(doc(db, SHOPS_COLLECTION, normShopId, "products", target.product.productId), {
      stockQuantity: increment(1),
      updatedAt: now,
    }).catch(() => {});
  }

  return updatedPlan;
}

/**
 * Logs a customer payment reminder (WhatsApp, SMS, or Email)
 */
export async function logInstallmentReminder(params: {
  shopId: string;
  planId: string;
  channel: "whatsapp" | "sms" | "email";
  installmentNumber?: number;
  recipient: string;
  messagePreview: string;
  sentBy: string;
}): Promise<InstallmentPlanRecord> {
  const normShopId = normalizeShopId(params.shopId);
  let plans = getCachedInstallmentPlans(normShopId);
  let target = plans.find((p) => p.id === params.planId);
  if (!target) {
    plans = await fetchInstallmentPlans(normShopId);
    target = plans.find((p) => p.id === params.planId);
  }
  if (!target) throw new Error("Installment plan not found.");

  const reminder: InstallmentReminderLog = {
    id: `rem_${Date.now()}`,
    sentAt: Date.now(),
    channel: params.channel,
    installmentNumber: params.installmentNumber,
    recipient: params.recipient,
    messagePreview: params.messagePreview,
    sentBy: params.sentBy,
  };

  const updatedPlan: InstallmentPlanRecord = {
    ...target,
    reminders: [reminder, ...(target.reminders || [])],
    updatedAt: Date.now(),
  };

  await persistUpdatedPlan(normShopId, updatedPlan);
  return updatedPlan;
}

async function persistUpdatedPlan(shopId: string, updatedPlan: InstallmentPlanRecord) {
  const cached = getCachedInstallmentPlans(shopId);
  const nextList = [updatedPlan, ...cached.filter((p) => p.id !== updatedPlan.id)];
  nextList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  saveCachedInstallmentPlans(shopId, nextList);
  notifyLocalSubscribers(shopId, nextList);

  const shopRef = doc(db, SHOPS_COLLECTION, shopId, INSTALLMENTS_COLLECTION, updatedPlan.id);
  const rootRef = doc(db, INSTALLMENTS_COLLECTION, updatedPlan.id);
  void Promise.allSettled([
    setDoc(shopRef, updatedPlan, { merge: true }),
    setDoc(rootRef, updatedPlan, { merge: true }),
  ]);
}

/**
 * Fetches all installment plans for a shop from Firestore + local cache in parallel
 */
export async function fetchInstallmentPlans(shopId: string): Promise<InstallmentPlanRecord[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const map = new Map<string, InstallmentPlanRecord>();
  getCachedInstallmentPlans(normShopId).forEach((p) => map.set(p.id, p));

  const [subRes, rootRes] = await Promise.allSettled([
    getDocs(collection(db, SHOPS_COLLECTION, normShopId, INSTALLMENTS_COLLECTION)),
    getDocs(query(collection(db, INSTALLMENTS_COLLECTION), where("shopId", "==", normShopId))),
  ]);

  if (subRes.status === "fulfilled") {
    subRes.value.docs.forEach((d) => {
      const rec = { id: d.id, ...(d.data() as Omit<InstallmentPlanRecord, "id">) };
      map.set(d.id, recalculatePlanState(rec));
    });
  }

  if (rootRes.status === "fulfilled") {
    rootRes.value.docs.forEach((d) => {
      if (!map.has(d.id)) {
        const rec = { id: d.id, ...(d.data() as Omit<InstallmentPlanRecord, "id">) };
        map.set(d.id, recalculatePlanState(rec));
      }
    });
  }

  const list = Array.from(map.values()).map(recalculatePlanState);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  saveCachedInstallmentPlans(normShopId, list);
  notifyLocalSubscribers(normShopId, list);
  return list;
}

/**
 * Real-time subscription to shop installment plans
 */
export function subscribeToInstallmentPlans(
  shopId: string,
  onUpdate: (plans: InstallmentPlanRecord[]) => void
): () => void {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) {
    onUpdate([]);
    return () => {};
  }

  if (!localSubscribers.has(normShopId)) {
    localSubscribers.set(normShopId, new Set());
  }
  localSubscribers.get(normShopId)!.add(onUpdate);

  // Emit cached immediately (0ms)
  const initial = getCachedInstallmentPlans(normShopId);
  onUpdate(initial);

  // Also fetch in parallel from Firestore
  void fetchInstallmentPlans(normShopId);

  const subRef = collection(db, SHOPS_COLLECTION, normShopId, INSTALLMENTS_COLLECTION);
  const unsubscribe = onSnapshot(
    subRef,
    (snap) => {
      const map = new Map<string, InstallmentPlanRecord>();
      getCachedInstallmentPlans(normShopId).forEach((p) => map.set(p.id, p));
      snap.docs.forEach((d) => {
        const rec = { id: d.id, ...(d.data() as Omit<InstallmentPlanRecord, "id">) };
        map.set(d.id, recalculatePlanState(rec));
      });
      const list = Array.from(map.values()).map(recalculatePlanState);
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      saveCachedInstallmentPlans(normShopId, list);
      notifyLocalSubscribers(normShopId, list);
    },
    () => {
      onUpdate(getCachedInstallmentPlans(normShopId));
    }
  );

  return () => {
    localSubscribers.get(normShopId)?.delete(onUpdate);
    unsubscribe();
  };
}

/**
 * Exports a formal Customer Installment Agreement to a downloadable PDF document
 */
export async function exportInstallmentAgreementToPdf(
  plan: InstallmentPlanRecord,
  currency = "LKR",
  shopMeta?: { address?: string; phone?: string }
): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const docPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const fmt = (n: number) =>
    `${currency} ${(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Header
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(15);
  docPdf.text((plan.shopName || "MOBILE POS RETAIL STORE").toUpperCase(), 14, 16);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(80, 80, 80);
  if (shopMeta?.address) docPdf.text(shopMeta.address, 14, 21);
  docPdf.text(
    `${shopMeta?.phone ? `Tel: ${shopMeta.phone}  |  ` : ""}Branch: ${plan.branchName} (${plan.shopId})`,
    14,
    25.5
  );

  // Agreement Badge on Right
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(11);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text("CUSTOMER INSTALLMENT AGREEMENT", 196, 16, { align: "right" });
  docPdf.setFontSize(9);
  docPdf.text(`Agreement ID: ${plan.agreementNumber}`, 196, 21, { align: "right" });
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);
  docPdf.text(`Start Date: ${plan.startDate}  |  End Date: ${plan.endDate}`, 196, 25.5, {
    align: "right",
  });

  docPdf.setDrawColor(40, 40, 40);
  docPdf.line(14, 29, 196, 29);

  // 1. Customer & Device Box (Pure White Background with Clean Border)
  let y = 34;
  docPdf.setFillColor(255, 255, 255);
  docPdf.setDrawColor(200, 200, 200);
  docPdf.rect(14, y, 89, 34);
  docPdf.rect(107, y, 89, 34);

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(20, 20, 20);
  docPdf.text("1. CUSTOMER & NIC IDENTIFICATION", 17, y + 5);
  docPdf.text("2. DEVICE, IMEI & DELIVERY RECORD", 110, y + 5);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);
  docPdf.text(`Name: ${plan.customer.fullName}`, 17, y + 10.5);
  docPdf.text(`NIC No: ${plan.customer.nicNumber}`, 17, y + 15);
  docPdf.text(`Mobile: ${plan.customer.mobileNumber}`, 17, y + 19.5);
  docPdf.text(`Address: ${(plan.customer.address || "").slice(0, 44)}`, 17, y + 24);
  if (plan.guarantor?.fullName) {
    docPdf.text(
      `Guarantor: ${plan.guarantor.fullName} (${plan.guarantor.nicNumber})`,
      17,
      y + 29.5
    );
  }

  docPdf.text(`Device: ${plan.product.productName}`, 110, y + 10.5);
  docPdf.text(`Model / SKU: ${plan.product.model} (${plan.product.sku})`, 110, y + 15);
  docPdf.setFont("helvetica", "bold");
  docPdf.text(`IMEI Number: ${plan.product.imeiNumber}`, 110, y + 19.5);
  docPdf.setFont("helvetica", "normal");
  docPdf.text(`Serial No: ${plan.product.serialNumber || "N/A"}`, 110, y + 24);
  docPdf.text(
    `Delivered: ${plan.product.deliveryDate} | ${plan.product.warrantyDetails.slice(0, 26)}`,
    110,
    y + 29.5
  );

  y += 40;

  // 2. Financial Breakdown Strip (Pure White Background)
  docPdf.setDrawColor(180, 180, 180);
  docPdf.rect(14, y, 182, 6.5);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8);
  docPdf.setTextColor(20, 20, 20);
  docPdf.text("3. TRANSPARENT FINANCIAL BREAKDOWN", 17, y + 4.5);
  docPdf.text(`Duration: ${plan.durationMonths} Months`, 193, y + 4.5, { align: "right" });

  y += 6.5;
  docPdf.setDrawColor(200, 200, 200);
  docPdf.rect(14, y, 182, 14);
  if (plan.initialDownPayment > 0) {
    docPdf.setFillColor(220, 252, 231); // green highlight for paid down payment
    docPdf.rect(109, y + 0.5, 31, 13, "F");
  }
  docPdf.setTextColor(30, 30, 30);
  docPdf.setFontSize(7.5);
  const cols = [
    { label: "Cash Price", val: fmt(plan.originalCashPrice), x: 16, green: false },
    {
      label: "Installment Fee",
      val: fmt((plan.installmentFeeAmount || 0) + (plan.serviceChargeAmount || 0)),
      x: 47,
      green: false,
    },
    { label: "Total Payable", val: fmt(plan.totalAgreedPayable), x: 78, green: false },
    {
      label: "Down Payment",
      val: fmt(plan.initialDownPayment),
      x: 111,
      green: plan.initialDownPayment > 0,
    },
    { label: "Financed Bal.", val: fmt(plan.financedPrincipalBalance), x: 142, green: false },
    { label: "Monthly Inst.", val: fmt(plan.monthlyInstallmentAmount), x: 170, green: false },
  ];
  cols.forEach((c) => {
    docPdf.setTextColor(c.green ? 6 : 30, c.green ? 95 : 30, c.green ? 70 : 30);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(c.label, c.x, y + 5);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(c.val, c.x, y + 10.5);
  });

  y += 20;

  // 3. Schedule Table Header (Pure White Background + Green Highlight on Paid Rows)
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text("4. MONTHLY INSTALLMENT PAYMENT SCHEDULE", 14, y);
  y += 2.5;

  docPdf.setDrawColor(180, 180, 180);
  docPdf.rect(14, y, 182, 6);
  docPdf.setFontSize(7.5);
  docPdf.text("Month", 17, y + 4.2);
  docPdf.text("Due Date", 38, y + 4.2);
  docPdf.text("Installment", 85, y + 4.2, { align: "right" });
  docPdf.text("Paid", 120, y + 4.2, { align: "right" });
  docPdf.text("Remaining", 156, y + 4.2, { align: "right" });
  docPdf.text("Status", 192, y + 4.2, { align: "right" });
  y += 6;

  docPdf.setFont("helvetica", "normal");
  plan.schedule.forEach((item) => {
    if (y > 245) {
      docPdf.addPage();
      y = 18;
    }
    const isPaid = item.status === "paid";
    const isPartial = item.status === "partially_paid";
    if (isPaid) {
      docPdf.setFillColor(220, 252, 231); // green highlight when payment is done
      docPdf.rect(14, y, 182, 5.2, "F");
    } else if (isPartial) {
      docPdf.setFillColor(240, 253, 244);
      docPdf.rect(14, y, 182, 5.2, "F");
    }
    docPdf.setDrawColor(220, 220, 220);
    docPdf.line(14, y + 5.2, 196, y + 5.2);

    if (isPaid) {
      docPdf.setTextColor(6, 95, 70);
      docPdf.setFont("helvetica", "bold");
    } else {
      docPdf.setTextColor(30, 30, 30);
      docPdf.setFont("helvetica", "normal");
    }

    docPdf.text(String(item.installmentNumber).padStart(2, "0"), 17, y + 3.8);
    docPdf.text(item.dueDate, 38, y + 3.8);
    docPdf.text(fmt(item.scheduledAmount), 85, y + 3.8, { align: "right" });
    docPdf.text(fmt(item.paidAmount), 120, y + 3.8, { align: "right" });
    docPdf.text(fmt(item.remainingAmount), 156, y + 3.8, { align: "right" });
    docPdf.text(
      isPaid ? "PAID" : item.status.toUpperCase().replace("_", " "),
      192,
      y + 3.8,
      {
        align: "right",
      }
    );
    y += 5.4;
  });

  y += 6;
  if (y > 235) {
    docPdf.addPage();
    y = 18;
  }

  // 4. Legal & Signatures
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8);
  docPdf.text("5. LATE PAYMENT CONDITIONS & TERMS OF AGREEMENT", 14, y);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7);
  docPdf.setTextColor(65, 65, 65);
  const combinedTerms = `${plan.latePaymentConditions}\n${plan.termsAndConditions}`;
  const splitTerms = docPdf.splitTextToSize(combinedTerms, 182);
  docPdf.text(splitTerms, 14, y + 4);

  const sigY = Math.min(278, y + 8 + splitTerms.length * 3 + 12);
  docPdf.setDrawColor(100, 100, 100);
  docPdf.line(14, sigY, 68, sigY);
  docPdf.line(78, sigY, 132, sigY);
  docPdf.line(142, sigY, 196, sigY);

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(7.5);
  docPdf.setTextColor(20, 20, 20);
  docPdf.text("Customer Signature & Date", 14, sigY + 4);
  docPdf.text("Guarantor Signature & Date", 78, sigY + 4);
  docPdf.text("Authorized Shop Representative", 142, sigY + 4);

  docPdf.save(`${plan.agreementNumber}_${plan.customer.fullName.replace(/\s+/g, "_")}.pdf`);
}

