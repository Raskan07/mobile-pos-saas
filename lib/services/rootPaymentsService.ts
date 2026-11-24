/**
 * lib/services/rootPaymentsService.ts
 *
 * Firestore-backed Financial Engine for Skyfox Root Admin Panel:
 * 1. Platform Wallet (`root_wallet_entries`) & Live Balance Aggregation
 * 2. Unified Transactions Ledger (`subscription_payments` + `root_wallet_entries`)
 * 3. Refunds Management (`root_refunds`) — Issuing, approving, and rejecting refunds per shopId
 * 4. Payouts & Disbursements (`root_payouts`) — Bank/settlement payouts with live status lifecycle
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { SubscriptionPaymentRecord } from "../types/subscription";

export interface RootWalletEntry {
  id: string;
  type: "credit" | "debit";
  category:
    | "subscription_payment"
    | "manual_topup"
    | "refund_deduction"
    | "payout_disbursement"
    | "adjustment";
  shopId?: string;
  shopName?: string;
  amount: number;
  currency: string;
  referenceNumber: string;
  description: string;
  paymentMethod: string;
  createdBy: string;
  createdAt: number;
}

export type RefundStatus = "pending" | "approved" | "rejected";

export interface RootRefundRecord {
  id: string;
  refundCode: string;
  shopId: string;
  shopName: string;
  originalPaymentId?: string;
  originalReference?: string;
  amount: number;
  currency: string;
  reason: string;
  refundMethod: "bank_transfer" | "original_method" | "wallet_credit" | "cash";
  status: RefundStatus;
  notes?: string;
  requestedBy: string;
  processedBy?: string;
  processedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type PayoutStatus = "pending" | "processing" | "completed" | "cancelled";

export interface RootPayoutRecord {
  id: string;
  payoutCode: string;
  recipientName: string;
  accountType: "bank_account" | "partner_settlement" | "operational_withdrawal";
  bankName: string;
  accountNumberMasked: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  currency: string;
  status: PayoutStatus;
  referenceNumber: string;
  notes?: string;
  initiatedBy: string;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

const SUB_PAYMENTS_COL = "subscription_payments";
const WALLET_ENTRIES_COL = "root_wallet_entries";
const REFUNDS_COL = "root_refunds";
const PAYOUTS_COL = "root_payouts";

// ============================================================================
// 1. REAL-TIME SUBSCRIPTIONS FOR TRANSACTIONS, WALLET, REFUNDS & PAYOUTS
// ============================================================================

export function subscribeToAllSubscriptionPayments(
  onUpdate: (payments: SubscriptionPaymentRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, SUB_PAYMENTS_COL),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as SubscriptionPaymentRecord)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onUpdate(list);
    },
    () => onUpdate([])
  );
}

export function subscribeToRootWalletEntries(
  onUpdate: (entries: RootWalletEntry[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, WALLET_ENTRIES_COL),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<RootWalletEntry, "id">) }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onUpdate(list);
    },
    () => onUpdate([])
  );
}

export function subscribeToRootRefunds(
  onUpdate: (refunds: RootRefundRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, REFUNDS_COL),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<RootRefundRecord, "id">) }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onUpdate(list);
    },
    () => onUpdate([])
  );
}

export function subscribeToRootPayouts(
  onUpdate: (payouts: RootPayoutRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, PAYOUTS_COL),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<RootPayoutRecord, "id">) }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onUpdate(list);
    },
    () => onUpdate([])
  );
}

// ============================================================================
// 2. WALLET BALANCE COMPUTATION & MANUAL TOP-UP / ADJUSTMENT
// ============================================================================

export function computePlatformWalletSummary(params: {
  subscriptionPayments: SubscriptionPaymentRecord[];
  walletEntries: RootWalletEntry[];
  refunds: RootRefundRecord[];
  payouts: RootPayoutRecord[];
}) {
  const subscriptionInflow = params.subscriptionPayments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  const manualCredits = params.walletEntries
    .filter((e) => e.type === "credit" && e.category !== "subscription_payment")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const manualDebits = params.walletEntries
    .filter(
      (e) =>
        e.type === "debit" &&
        e.category !== "refund_deduction" &&
        e.category !== "payout_disbursement"
    )
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const approvedRefundsTotal = params.refunds
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const pendingRefundsTotal = params.refunds
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const completedPayoutsTotal = params.payouts
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const pendingPayoutsTotal = params.payouts
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const grossInflow = subscriptionInflow + manualCredits;
  const totalOutflow =
    approvedRefundsTotal + completedPayoutsTotal + manualDebits;
  const availableBalance = grossInflow - totalOutflow - pendingPayoutsTotal;

  return {
    availableBalance,
    grossInflow,
    subscriptionInflow,
    manualCredits,
    approvedRefundsTotal,
    pendingRefundsTotal,
    completedPayoutsTotal,
    pendingPayoutsTotal,
    totalOutflow,
  };
}

export async function createManualWalletEntry(input: {
  type: "credit" | "debit";
  category: RootWalletEntry["category"];
  shopId?: string;
  shopName?: string;
  amount: number;
  currency?: string;
  referenceNumber?: string;
  description: string;
  paymentMethod?: string;
  createdBy?: string;
}): Promise<RootWalletEntry> {
  const now = Date.now();
  const id = `wal_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const refNo =
    (input.referenceNumber || "").trim() ||
    `WAL-${new Date(now).getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const entry: RootWalletEntry = {
    id,
    type: input.type,
    category: input.category,
    ...(input.shopId ? { shopId: normalizeShopId(input.shopId) } : {}),
    ...(input.shopName ? { shopName: input.shopName } : {}),
    amount: Math.max(0, Number(input.amount) || 0),
    currency: (input.currency || "LKR").toUpperCase(),
    referenceNumber: refNo,
    description: input.description.trim() || "Platform Wallet Adjustment",
    paymentMethod: input.paymentMethod || "bank_transfer",
    createdBy: input.createdBy || "Root Admin",
    createdAt: now,
  };

  await setDoc(doc(db, WALLET_ENTRIES_COL, id), entry);
  return entry;
}

// ============================================================================
// 3. REFUNDS LOGIC (CREATE, APPROVE, REJECT)
// ============================================================================

export async function createRootRefundRequest(input: {
  shopId: string;
  shopName: string;
  originalPaymentId?: string;
  originalReference?: string;
  amount: number;
  currency?: string;
  reason: string;
  refundMethod: RootRefundRecord["refundMethod"];
  notes?: string;
  autoApprove?: boolean;
  actor?: string;
}): Promise<RootRefundRecord> {
  const now = Date.now();
  const id = `ref_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const refundCode = `RFD-${Math.floor(10000 + Math.random() * 90000)}`;
  const normShopId = normalizeShopId(input.shopId);

  const status: RefundStatus = input.autoApprove ? "approved" : "pending";

  const record: RootRefundRecord = {
    id,
    refundCode,
    shopId: normShopId,
    shopName: input.shopName || normShopId,
    ...(input.originalPaymentId ? { originalPaymentId: input.originalPaymentId } : {}),
    ...(input.originalReference ? { originalReference: input.originalReference } : {}),
    amount: Math.max(0, Number(input.amount) || 0),
    currency: (input.currency || "LKR").toUpperCase(),
    reason: input.reason.trim() || "Subscription / Platform Refund",
    refundMethod: input.refundMethod || "bank_transfer",
    status,
    ...(input.notes ? { notes: input.notes.trim() } : {}),
    requestedBy: input.actor || "Root Admin",
    ...(input.autoApprove
      ? {
          processedBy: input.actor || "Root Admin",
          processedAt: now,
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    setDoc(doc(db, REFUNDS_COL, id), record),
    setDoc(doc(db, "shops", normShopId, "subscription_refunds", id), record).catch(
      () => {}
    ),
  ]);

  return record;
}

export async function updateRootRefundStatus(
  refund: RootRefundRecord,
  newStatus: RefundStatus,
  actor = "Root Admin"
): Promise<void> {
  const now = Date.now();
  await Promise.all([
    updateDoc(doc(db, REFUNDS_COL, refund.id), {
      status: newStatus,
      processedBy: actor,
      processedAt: now,
      updatedAt: now,
    }),
    updateDoc(
      doc(db, "shops", normalizeShopId(refund.shopId), "subscription_refunds", refund.id),
      {
        status: newStatus,
        processedBy: actor,
        processedAt: now,
        updatedAt: now,
      }
    ).catch(() => {}),
  ]);
}

// ============================================================================
// 4. PAYOUTS & DISBURSEMENTS LOGIC
// ============================================================================

export async function createRootPayout(input: {
  recipientName: string;
  accountType: RootPayoutRecord["accountType"];
  bankName: string;
  accountNumberMasked: string;
  amount: number;
  feeAmount?: number;
  currency?: string;
  referenceNumber?: string;
  notes?: string;
  markCompletedImmediately?: boolean;
  actor?: string;
}): Promise<RootPayoutRecord> {
  const now = Date.now();
  const id = `payo_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const payoutCode = `PYO-${Math.floor(10000 + Math.random() * 90000)}`;
  const gross = Math.max(0, Number(input.amount) || 0);
  const fee = Math.max(0, Number(input.feeAmount) || 0);
  const net = Math.max(0, gross - fee);
  const status: PayoutStatus = input.markCompletedImmediately
    ? "completed"
    : "pending";

  const record: RootPayoutRecord = {
    id,
    payoutCode,
    recipientName: input.recipientName.trim() || "Skyfox Corporate Treasury",
    accountType: input.accountType || "bank_account",
    bankName: input.bankName.trim() || "Commercial Bank",
    accountNumberMasked: input.accountNumberMasked.trim() || "**** 8842",
    amount: gross,
    feeAmount: fee,
    netAmount: net,
    currency: (input.currency || "LKR").toUpperCase(),
    status,
    referenceNumber:
      (input.referenceNumber || "").trim() ||
      `BANK-${new Date(now).getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    ...(input.notes ? { notes: input.notes.trim() } : {}),
    initiatedBy: input.actor || "Root Admin",
    ...(input.markCompletedImmediately ? { completedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, PAYOUTS_COL, id), record);
  return record;
}

export async function updateRootPayoutStatus(
  payoutId: string,
  newStatus: PayoutStatus
): Promise<void> {
  const now = Date.now();
  await updateDoc(doc(db, PAYOUTS_COL, payoutId), {
    status: newStatus,
    ...(newStatus === "completed" ? { completedAt: now } : {}),
    updatedAt: now,
  });
}

export async function deleteRootPayout(payoutId: string): Promise<void> {
  await deleteDoc(doc(db, PAYOUTS_COL, payoutId));
}
