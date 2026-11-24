/**
 * lib/services/subscriptionService.ts
 *
 * Multi-Tenant Subscription Engine, Founding Customer Pricing, Per-Shop Feature & Limit
 * Enforcement, Storage Metering, and Automated Billing Lifecycle Service for Skyfox POS.
 *
 * Strict Multi-Tenant Shop Isolation:
 * - Every shop's subscription configuration, usage metrics, payment records, and lifecycle
 *   events are scoped strictly by `shopId` under `shops/{shopId}` and its subcollections:
 *     - `shops/{shopId}` (embedded `subscription` object for 0ms POS session access)
 *     - `shops/{shopId}/subscription/config`
 *     - `shops/{shopId}/subscription_payments/{paymentId}`
 *     - `shops/{shopId}/subscription_events/{eventId}`
 * - Global plan templates live in `subscription_plans/{planId}` and are editable by Root Admin
 *   at runtime without code changes.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { Shop } from "../types/shop";
import {
  SubscriptionPlan,
  ShopSubscription,
  SubscriptionLifecycleStatus,
  BillingCycle,
  SubscriptionResourceLimits,
  ShopResourceUsage,
  SubscriptionPaymentRecord,
  SubscriptionLifecycleEvent,
  SubscriptionFeatureKey,
  SUBSCRIPTION_FEATURE_CATALOG,
} from "../types/subscription";

const PLANS_COLLECTION = "subscription_plans";
const SHOPS_COLLECTION = "shops";
const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

function buildAllFeaturesMap(enabledByDefault = true): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const feat of SUBSCRIPTION_FEATURE_CATALOG) {
    map[feat.key] = feat.alwaysEnabled ? true : enabledByDefault;
  }
  return map;
}

/**
 * Default Subscription Plans seeded automatically if `subscription_plans` is empty.
 * Root Admin can edit all prices, founding customer rates, limits, and features in the UI
 * without any code changes.
 */
export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "plan_starter",
    planId: "plan_starter",
    name: "Starter Retail",
    code: "STARTER",
    description: "Essential POS billing, inventory, barcode studio, and WhatsApp e-receipts for single-location shops.",
    badgeText: "Single Store",
    currency: "LKR",
    monthlyPrice: 4500,
    annualPrice: 45000,
    foundingCustomerMonthlyPrice: 2900,
    foundingCustomerAnnualPrice: 29000,
    foundingOfferLabel: "35% Founding Customer Lifetime Rate",
    defaultGracePeriodDays: 7,
    limits: {
      maxStorageMB: 500,
      maxBranches: 1,
      maxUsers: 3,
      maxWhatsappReceiptsPerMonth: 300,
    },
    features: {
      ...buildAllFeaturesMap(true),
      branch_management: false,
      installment_sales: false,
      bill_transfer: false,
      stock_analysis: false,
    },
    isActive: true,
    isDefault: false,
    sortOrder: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "plan_growth",
    planId: "plan_growth",
    name: "Growth Pro",
    code: "GROWTH",
    description: "Full-featured retail & repair POS with multi-branch support, financial statements, and inter-machine bill transfer.",
    badgeText: "Most Popular",
    currency: "LKR",
    monthlyPrice: 9500,
    annualPrice: 95000,
    foundingCustomerMonthlyPrice: 5900,
    foundingCustomerAnnualPrice: 59000,
    foundingOfferLabel: "38% Founding Customer Lifetime Rate",
    defaultGracePeriodDays: 7,
    limits: {
      maxStorageMB: 2048,
      maxBranches: 3,
      maxUsers: 10,
      maxWhatsappReceiptsPerMonth: 2000,
    },
    features: buildAllFeaturesMap(true),
    isActive: true,
    isDefault: true,
    sortOrder: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "plan_enterprise",
    planId: "plan_enterprise",
    name: "Enterprise Unlimited",
    code: "ENTERPRISE",
    description: "High-capacity multi-branch retail chain plan with priority storage, unlimited WhatsApp receipts, and extended grace period.",
    badgeText: "Multi-Branch Chain",
    currency: "LKR",
    monthlyPrice: 19500,
    annualPrice: 195000,
    foundingCustomerMonthlyPrice: 11900,
    foundingCustomerAnnualPrice: 119000,
    foundingOfferLabel: "40% Founding Customer Lifetime Rate",
    defaultGracePeriodDays: 14,
    limits: {
      maxStorageMB: 10240,
      maxBranches: 20,
      maxUsers: 100,
      maxWhatsappReceiptsPerMonth: -1,
    },
    features: buildAllFeaturesMap(true),
    isActive: true,
    isDefault: false,
    sortOrder: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ============================================================================
// 1. SUBSCRIPTION PLANS CRUD (DYNAMICALLY EDITABLE WITHOUT CODE CHANGES)
// ============================================================================

export async function ensureDefaultSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  try {
    const snap = await getDocs(collection(db, PLANS_COLLECTION));
    if (!snap.empty) {
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SubscriptionPlan, "id">) }))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }

    const now = Date.now();
    await Promise.all(
      DEFAULT_SUBSCRIPTION_PLANS.map((plan) =>
        setDoc(doc(db, PLANS_COLLECTION, plan.planId), {
          ...plan,
          createdAt: now,
          updatedAt: now,
        })
      )
    );
    return DEFAULT_SUBSCRIPTION_PLANS;
  } catch (err) {
    console.warn("[SubscriptionService] Fallback to default plans:", err);
    return DEFAULT_SUBSCRIPTION_PLANS;
  }
}

export function subscribeToSubscriptionPlans(
  onUpdate: (plans: SubscriptionPlan[]) => void
): Unsubscribe {
  const plansRef = collection(db, PLANS_COLLECTION);
  return onSnapshot(
    plansRef,
    async (snap) => {
      if (snap.empty) {
        const seeded = await ensureDefaultSubscriptionPlans();
        onUpdate(seeded);
        return;
      }
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SubscriptionPlan, "id">) }))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      onUpdate(list);
    },
    () => {
      onUpdate(DEFAULT_SUBSCRIPTION_PLANS);
    }
  );
}

export async function saveSubscriptionPlan(
  planInput: Partial<SubscriptionPlan> & { name: string }
): Promise<SubscriptionPlan> {
  const now = Date.now();
  const planId =
    planInput.planId ||
    planInput.id ||
    `plan_${planInput.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")}_${Math.random().toString(36).substring(2, 6)}`;

  const existingSnap = await getDoc(doc(db, PLANS_COLLECTION, planId)).catch(() => null);
  const existingData = existingSnap?.exists()
    ? (existingSnap.data() as SubscriptionPlan)
    : null;

  const mergedFeatures: Record<string, boolean> = {
    ...buildAllFeaturesMap(true),
    ...(existingData?.features || {}),
    ...(planInput.features || {}),
    pos_billing: true,
  };

  const plan: SubscriptionPlan = {
    id: planId,
    planId,
    name: planInput.name.trim(),
    code: (planInput.code || planInput.name.slice(0, 10)).trim().toUpperCase(),
    description: (planInput.description || "").trim(),
    badgeText: (planInput.badgeText || "").trim(),
    currency: (planInput.currency || existingData?.currency || "LKR").trim().toUpperCase(),
    monthlyPrice: Number(planInput.monthlyPrice ?? existingData?.monthlyPrice ?? 0),
    annualPrice: Number(planInput.annualPrice ?? existingData?.annualPrice ?? 0),
    foundingCustomerMonthlyPrice: Number(
      planInput.foundingCustomerMonthlyPrice ??
        existingData?.foundingCustomerMonthlyPrice ??
        planInput.monthlyPrice ??
        0
    ),
    foundingCustomerAnnualPrice: Number(
      planInput.foundingCustomerAnnualPrice ??
        existingData?.foundingCustomerAnnualPrice ??
        planInput.annualPrice ??
        0
    ),
    foundingOfferLabel:
      planInput.foundingOfferLabel ??
      existingData?.foundingOfferLabel ??
      "Founding Customer Rate",
    defaultGracePeriodDays: Number(
      planInput.defaultGracePeriodDays ?? existingData?.defaultGracePeriodDays ?? 7
    ),
    limits: {
      maxStorageMB: Number(
        planInput.limits?.maxStorageMB ?? existingData?.limits?.maxStorageMB ?? 1024
      ),
      maxBranches: Number(
        planInput.limits?.maxBranches ?? existingData?.limits?.maxBranches ?? 1
      ),
      maxUsers: Number(
        planInput.limits?.maxUsers ?? existingData?.limits?.maxUsers ?? 5
      ),
      maxWhatsappReceiptsPerMonth: Number(
        planInput.limits?.maxWhatsappReceiptsPerMonth ??
          existingData?.limits?.maxWhatsappReceiptsPerMonth ??
          -1
      ),
    },
    features: mergedFeatures,
    isActive: planInput.isActive ?? existingData?.isActive ?? true,
    isDefault: planInput.isDefault ?? existingData?.isDefault ?? false,
    sortOrder: Number(planInput.sortOrder ?? existingData?.sortOrder ?? 10),
    createdAt: existingData?.createdAt || now,
    updatedAt: now,
  };

  await setDoc(doc(db, PLANS_COLLECTION, planId), plan, { merge: true });

  // Propagate updated plan pricing, limits, and default features to shops subscribed to this plan
  // (while preserving each shop's individual overrides and founding customer lock-in)
  void propagatePlanUpdatesToSubscribedShops(plan);

  return plan;
}

export async function deleteSubscriptionPlan(planId: string): Promise<void> {
  await deleteDoc(doc(db, PLANS_COLLECTION, planId));
}

async function propagatePlanUpdatesToSubscribedShops(plan: SubscriptionPlan): Promise<void> {
  try {
    const shopsSnap = await getDocs(collection(db, SHOPS_COLLECTION));
    const now = Date.now();
    await Promise.all(
      shopsSnap.docs.map(async (shopDoc) => {
        const shop = shopDoc.data() as Shop;
        const sub = shop.subscription;
        if (!sub || sub.planId !== plan.planId) return;

        const updatedSub = recomputeEffectiveShopSubscription(sub, plan, now);
        await persistShopSubscriptionToFirestore(shop.shopId, updatedSub);
      })
    );
  } catch (err) {
    console.warn("[SubscriptionService] Propagate plan updates warning:", err);
  }
}

// ============================================================================
// 2. SHOP SUBSCRIPTION COMPUTATION & STRICT SHOP-ID ISOLATED PERSISTENCE
// ============================================================================

export function computeEffectiveBillingAmount(params: {
  billingCycle: BillingCycle;
  isFoundingCustomer: boolean;
  standardMonthly: number;
  standardAnnual: number;
  foundingMonthly: number;
  foundingAnnual: number;
  customPriceOverride?: number | null;
}): number {
  if (
    typeof params.customPriceOverride === "number" &&
    !Number.isNaN(params.customPriceOverride) &&
    params.customPriceOverride >= 0
  ) {
    return params.customPriceOverride;
  }
  if (params.billingCycle === "annual") {
    return params.isFoundingCustomer ? params.foundingAnnual : params.standardAnnual;
  }
  return params.isFoundingCustomer ? params.foundingMonthly : params.standardMonthly;
}

export function recomputeEffectiveShopSubscription(
  current: ShopSubscription,
  plan: SubscriptionPlan,
  now = Date.now()
): ShopSubscription {
  const limitOverrides = current.limitOverrides || {};
  const effectiveLimits: SubscriptionResourceLimits = {
    maxStorageMB:
      typeof limitOverrides.maxStorageMB === "number"
        ? limitOverrides.maxStorageMB
        : plan.limits.maxStorageMB,
    maxBranches:
      typeof limitOverrides.maxBranches === "number"
        ? limitOverrides.maxBranches
        : plan.limits.maxBranches,
    maxUsers:
      typeof limitOverrides.maxUsers === "number"
        ? limitOverrides.maxUsers
        : plan.limits.maxUsers,
    maxWhatsappReceiptsPerMonth:
      typeof limitOverrides.maxWhatsappReceiptsPerMonth === "number"
        ? limitOverrides.maxWhatsappReceiptsPerMonth
        : plan.limits.maxWhatsappReceiptsPerMonth ?? -1,
  };

  const featureOverrides = current.featureOverrides || {};
  const effectiveFeatures: Record<string, boolean> = {
    ...buildAllFeaturesMap(true),
    ...(plan.features || {}),
    ...featureOverrides,
    pos_billing: true,
  };

  const standardPrice =
    current.billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
  const foundingPrice =
    current.billingCycle === "annual"
      ? plan.foundingCustomerAnnualPrice
      : plan.foundingCustomerMonthlyPrice;

  const effectiveBillingAmount = computeEffectiveBillingAmount({
    billingCycle: current.billingCycle,
    isFoundingCustomer: current.isFoundingCustomer,
    standardMonthly: plan.monthlyPrice,
    standardAnnual: plan.annualPrice,
    foundingMonthly: plan.foundingCustomerMonthlyPrice,
    foundingAnnual: plan.foundingCustomerAnnualPrice,
    customPriceOverride: current.customPriceOverride,
  });

  const gracePeriodDays =
    typeof current.gracePeriodDays === "number"
      ? current.gracePeriodDays
      : plan.defaultGracePeriodDays || 7;
  const gracePeriodEndsAt = current.currentPeriodEnd + gracePeriodDays * DAY_MS;

  return {
    ...current,
    planId: plan.planId,
    planName: plan.name,
    planCode: plan.code,
    currency: plan.currency || current.currency || "LKR",
    standardPrice,
    foundingPrice,
    effectiveBillingAmount,
    gracePeriodDays,
    gracePeriodEndsAt,
    limits: effectiveLimits,
    limitOverrides,
    effectiveFeatures,
    featureOverrides,
    updatedAt: now,
  };
}

/**
 * Builds an initial default subscription for a shop that does not have one persisted yet.
 */
export function buildDefaultShopSubscription(
  shop: Shop,
  defaultPlan?: SubscriptionPlan
): ShopSubscription {
  const plan =
    defaultPlan ||
    DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.isDefault) ||
    DEFAULT_SUBSCRIPTION_PLANS[1];
  const now = Date.now();
  const periodStart = shop.createdAt || now;
  // Give active shops a 30-day cycle from current month if not set
  const periodEnd = periodStart + MONTH_MS < now ? now + 15 * DAY_MS : periodStart + MONTH_MS;
  const graceDays = plan.defaultGracePeriodDays || 7;

  const initial: ShopSubscription = {
    shopId: normalizeShopId(shop.shopId),
    shopName: shop.shopName || shop.shopId,
    planId: plan.planId,
    planName: plan.name,
    planCode: plan.code,
    status: shop.status === "suspended" ? "suspended" : "active",
    billingCycle: "monthly",
    currency: plan.currency || "LKR",
    isFoundingCustomer: false,
    standardPrice: plan.monthlyPrice,
    foundingPrice: plan.foundingCustomerMonthlyPrice,
    customPriceOverride: null,
    effectiveBillingAmount: plan.monthlyPrice,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    gracePeriodDays: graceDays,
    gracePeriodEndsAt: periodEnd + graceDays * DAY_MS,
    totalPaidAmount: 0,
    paymentsCount: 0,
    autoSuspendEnabled: true,
    limits: { ...plan.limits },
    limitOverrides: {},
    effectiveFeatures: { ...buildAllFeaturesMap(true), ...(plan.features || {}) },
    featureOverrides: {},
    usage: {
      storageUsedBytes: 0,
      storageUsedMB: 0,
      branchCount: 1,
      userCount: shop.staffCount || 1,
      productCount: 0,
      saleCount: 0,
      whatsappHandoffsCount: 0,
      lastCalculatedAt: now,
    },
    updatedAt: now,
  };

  return initial;
}

/**
 * Persists a shop's subscription strictly under its isolated `shopId` namespace:
 * 1. `shops/{shopId}` (under `subscription` and `subscriptionStatus`)
 * 2. `shops/{shopId}/subscription/config`
 */
export async function persistShopSubscriptionToFirestore(
  shopId: string,
  subscription: ShopSubscription
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return;

  const shopRef = doc(db, SHOPS_COLLECTION, normShopId);
  const isolatedSubRef = doc(db, SHOPS_COLLECTION, normShopId, "subscription", "config");

  const nextShopStatus =
    subscription.status === "suspended"
      ? "suspended"
      : subscription.status === "cancelled"
      ? "inactive"
      : "active";

  await Promise.all([
    setDoc(
      shopRef,
      {
        subscription,
        subscriptionStatus: subscription.status,
        status: nextShopStatus,
        updatedAt: Date.now(),
      },
      { merge: true }
    ),
    setDoc(isolatedSubRef, subscription, { merge: true }),
  ]);
}

export async function logSubscriptionLifecycleEvent(
  shopId: string,
  event: Omit<SubscriptionLifecycleEvent, "eventId" | "shopId" | "createdAt">
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return;
  const now = Date.now();
  const eventId = `evt_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const ref = doc(db, SHOPS_COLLECTION, normShopId, "subscription_events", eventId);
  await setDoc(ref, {
    ...event,
    eventId,
    shopId: normShopId,
    createdAt: now,
  }).catch(() => {});
}

// ============================================================================
// 3. AUTOMATED BILLING LIFECYCLE ENGINE (GRACE PERIODS, SUSPENSIONS, REACTIVATIONS)
// ============================================================================

/**
 * Pure state evaluator that determines whether a shop should automatically transition
 * into `grace_period` or `suspended` based on `currentPeriodEnd` and `gracePeriodEndsAt`.
 */
export function evaluateSubscriptionLifecycle(
  sub: ShopSubscription,
  now = Date.now()
): {
  nextStatus: SubscriptionLifecycleStatus;
  changed: boolean;
  reason?: string;
} {
  // Respect manual cancellation
  if (sub.status === "cancelled") {
    return { nextStatus: "cancelled", changed: false };
  }

  const graceEndsAt =
    sub.gracePeriodEndsAt || sub.currentPeriodEnd + (sub.gracePeriodDays || 7) * DAY_MS;

  // If current date is past grace period end and auto-suspend is enabled -> Suspended
  if (now > graceEndsAt && sub.autoSuspendEnabled !== false) {
    if (sub.status !== "suspended") {
      return {
        nextStatus: "suspended",
        changed: true,
        reason: `Automatic suspension: Payment due on ${new Date(
          sub.currentPeriodEnd
        ).toLocaleDateString()} exceeded ${sub.gracePeriodDays}-day grace period.`,
      };
    }
    return { nextStatus: "suspended", changed: false };
  }

  // If current date is past currentPeriodEnd but within grace period -> Grace Period
  if (now > sub.currentPeriodEnd && now <= graceEndsAt) {
    // Do not auto-unsuspend if manually suspended by root admin before grace period ended
    if (sub.status === "suspended") {
      return { nextStatus: "suspended", changed: false };
    }
    if (sub.status !== "grace_period") {
      return {
        nextStatus: "grace_period",
        changed: true,
        reason: `Billing period ended on ${new Date(
          sub.currentPeriodEnd
        ).toLocaleDateString()}. Shop entered ${sub.gracePeriodDays}-day grace period.`,
      };
    }
    return { nextStatus: "grace_period", changed: false };
  }

  // Otherwise within paid billing period (`now <= sub.currentPeriodEnd`)
  return { nextStatus: sub.status, changed: false };
}

/**
 * Runs the automated billing, grace period, and auto-suspension sweep across all shops.
 * Also initializes default subscription records for any newly registered shops.
 */
export async function runAutomatedSubscriptionLifecycleSweep(
  shopsInput?: Shop[],
  plansInput?: SubscriptionPlan[]
): Promise<{
  checkedCount: number;
  transitionedToGrace: string[];
  autoSuspended: string[];
  activeCount: number;
}> {
  const plans =
    plansInput && plansInput.length > 0
      ? plansInput
      : await ensureDefaultSubscriptionPlans();
  const defaultPlan = plans.find((p) => p.isDefault) || plans[0];

  let shops = shopsInput;
  if (!shops) {
    const snap = await getDocs(collection(db, SHOPS_COLLECTION));
    shops = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Shop, "id">) }));
  }

  const now = Date.now();
  const transitionedToGrace: string[] = [];
  const autoSuspended: string[] = [];
  let activeCount = 0;

  await Promise.all(
    shops.map(async (shop) => {
      const normShopId = normalizeShopId(shop.shopId);
      if (!normShopId) return;

      let sub = shop.subscription;
      if (!sub) {
        sub = buildDefaultShopSubscription(shop, defaultPlan);
        await persistShopSubscriptionToFirestore(normShopId, sub);
      }

      const evaluation = evaluateSubscriptionLifecycle(sub, now);
      if (evaluation.changed) {
        const previousStatus = sub.status;
        const updatedSub: ShopSubscription = {
          ...sub,
          status: evaluation.nextStatus,
          ...(evaluation.nextStatus === "suspended"
            ? {
                suspendedAt: now,
                suspensionReason: evaluation.reason,
              }
            : {}),
          updatedAt: now,
        };

        await persistShopSubscriptionToFirestore(normShopId, updatedSub);
        await logSubscriptionLifecycleEvent(normShopId, {
          shopName: shop.shopName,
          type:
            evaluation.nextStatus === "suspended"
              ? "AUTO_SUSPENDED"
              : "ENTERED_GRACE_PERIOD",
          previousStatus,
          newStatus: evaluation.nextStatus,
          summary: evaluation.reason || `Transitioned to ${evaluation.nextStatus}`,
          actor: "System Billing Engine",
        });

        if (evaluation.nextStatus === "grace_period") {
          transitionedToGrace.push(normShopId);
        } else if (evaluation.nextStatus === "suspended") {
          autoSuspended.push(normShopId);
        }
      }

      const finalStatus = evaluation.nextStatus;
      if (finalStatus === "active" || finalStatus === "trial") {
        activeCount++;
      }
    })
  );

  return {
    checkedCount: shops.length,
    transitionedToGrace,
    autoSuspended,
    activeCount,
  };
}

/**
 * Records a monthly or annual subscription payment for a specific shop (`shopId`).
 * Automatically advances the billing cycle, clears any grace period or suspension,
 * and reactivates the shop immediately.
 */
export async function recordShopSubscriptionPayment(params: {
  shop: Shop;
  amount?: number;
  billingCycle?: BillingCycle;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  actor?: string;
}): Promise<{
  updatedSubscription: ShopSubscription;
  paymentRecord: SubscriptionPaymentRecord;
}> {
  const normShopId = normalizeShopId(params.shop.shopId);
  const now = Date.now();
  const currentSub =
    params.shop.subscription || buildDefaultShopSubscription(params.shop);

  const cycle = params.billingCycle || currentSub.billingCycle || "monthly";
  const amountPaid =
    typeof params.amount === "number"
      ? params.amount
      : currentSub.effectiveBillingAmount;

  // If the current period hasn't expired yet, extend from currentPeriodEnd; otherwise start from `now`
  const baseStart =
    currentSub.currentPeriodEnd > now ? currentSub.currentPeriodEnd : now;
  const nextPeriodEnd = baseStart + (cycle === "annual" ? YEAR_MS : MONTH_MS);
  const graceDays = currentSub.gracePeriodDays || 7;
  const nextGraceEndsAt = nextPeriodEnd + graceDays * DAY_MS;

  const previousStatus = currentSub.status;
  const triggeredReactivation =
    previousStatus === "suspended" || previousStatus === "grace_period";

  const paymentId = `pay_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const refNo =
    (params.referenceNumber || "").trim() ||
    `SUB-${new Date(now).getFullYear()}${String(new Date(now).getMonth() + 1).padStart(
      2,
      "0"
    )}-${Math.floor(1000 + Math.random() * 9000)}`;

  const updatedSubscription: ShopSubscription = {
    ...currentSub,
    status: "active",
    billingCycle: cycle,
    currentPeriodStart: now,
    currentPeriodEnd: nextPeriodEnd,
    gracePeriodEndsAt: nextGraceEndsAt,
    lastPaymentAt: now,
    lastPaymentAmount: amountPaid,
    lastPaymentReference: refNo,
    totalPaidAmount: (currentSub.totalPaidAmount || 0) + amountPaid,
    paymentsCount: (currentSub.paymentsCount || 0) + 1,
    suspendedAt: null,
    suspensionReason: null,
    ...(triggeredReactivation ? { reactivatedAt: now } : {}),
    updatedAt: now,
    updatedBy: params.actor || "Root Admin",
  };

  const paymentRecord: SubscriptionPaymentRecord = {
    paymentId,
    shopId: normShopId,
    shopName: params.shop.shopName,
    planId: updatedSubscription.planId,
    planName: updatedSubscription.planName,
    billingCycle: cycle,
    amount: amountPaid,
    currency: updatedSubscription.currency,
    isFoundingCustomerRate: Boolean(updatedSubscription.isFoundingCustomer),
    paymentMethod: params.paymentMethod || "bank_transfer",
    referenceNumber: refNo,
    notes: (params.notes || "").trim(),
    periodStart: now,
    periodEnd: nextPeriodEnd,
    previousStatus,
    newStatus: "active",
    triggeredReactivation,
    recordedBy: params.actor || "Root Admin",
    createdAt: now,
    createdAtISO: new Date(now).toISOString(),
  };

  await Promise.all([
    persistShopSubscriptionToFirestore(normShopId, updatedSubscription),
    setDoc(
      doc(db, SHOPS_COLLECTION, normShopId, "subscription_payments", paymentId),
      paymentRecord
    ),
    setDoc(doc(db, "subscription_payments", paymentId), paymentRecord).catch(
      () => {}
    ),
    logSubscriptionLifecycleEvent(normShopId, {
      shopName: params.shop.shopName,
      type: "PAYMENT_RECORDED",
      previousStatus,
      newStatus: "active",
      summary: `Payment of ${updatedSubscription.currency} ${amountPaid.toLocaleString()} (${refNo}) recorded. Next due: ${new Date(
        nextPeriodEnd
      ).toLocaleDateString()}.${
        triggeredReactivation ? " Shop automatically reactivated." : ""
      }`,
      actor: params.actor || "Root Admin",
    }),
  ]);

  return { updatedSubscription, paymentRecord };
}

/**
 * Manually suspend or reactivate a shop's subscription from the Root Terminal.
 */
export async function setShopSubscriptionStatus(params: {
  shop: Shop;
  newStatus: SubscriptionLifecycleStatus;
  reason?: string;
  extendDays?: number;
  actor?: string;
}): Promise<ShopSubscription> {
  const normShopId = normalizeShopId(params.shop.shopId);
  const now = Date.now();
  const currentSub =
    params.shop.subscription || buildDefaultShopSubscription(params.shop);
  const previousStatus = currentSub.status;

  let nextPeriodEnd = currentSub.currentPeriodEnd;
  if (
    (params.newStatus === "active" || params.newStatus === "grace_period") &&
    params.extendDays &&
    params.extendDays > 0
  ) {
    const base = Math.max(now, currentSub.currentPeriodEnd);
    nextPeriodEnd = base + params.extendDays * DAY_MS;
  } else if (params.newStatus === "active" && currentSub.currentPeriodEnd <= now) {
    // Grant 30 days on manual reactivation if period was already expired
    nextPeriodEnd = now + MONTH_MS;
  }

  const graceDays = currentSub.gracePeriodDays || 7;
  const updatedSub: ShopSubscription = {
    ...currentSub,
    status: params.newStatus,
    currentPeriodEnd: nextPeriodEnd,
    gracePeriodEndsAt: nextPeriodEnd + graceDays * DAY_MS,
    ...(params.newStatus === "suspended"
      ? {
          suspendedAt: now,
          suspensionReason:
            params.reason || "Suspended by Root Administrator.",
        }
      : {
          suspendedAt: null,
          suspensionReason: null,
          reactivatedAt: now,
        }),
    updatedAt: now,
    updatedBy: params.actor || "Root Admin",
  };

  await persistShopSubscriptionToFirestore(normShopId, updatedSub);
  await logSubscriptionLifecycleEvent(normShopId, {
    shopName: params.shop.shopName,
    type:
      params.newStatus === "suspended"
        ? "MANUAL_SUSPENDED"
        : params.newStatus === "grace_period"
        ? "GRACE_EXTENDED"
        : "REACTIVATED",
    previousStatus,
    newStatus: params.newStatus,
    summary:
      params.reason ||
      `Subscription status changed from ${previousStatus} to ${params.newStatus}.`,
    actor: params.actor || "Root Admin",
  });

  // Deliver real-time notification message to the shop's inbox
  void import("./notificationService")
    .then(({ sendShopNotification }) =>
      sendShopNotification({
        title:
          params.newStatus === "suspended"
            ? `Subscription Suspended — ${params.shop.shopName}`
            : params.newStatus === "active"
            ? `Subscription Reactivated — ${params.shop.shopName}`
            : `Grace Period Extended — ${params.shop.shopName}`,
        message:
          params.reason ||
          (params.newStatus === "suspended"
            ? `Your Skyfox POS subscription for ${params.shop.shopName} (${normShopId}) has been suspended by Root Administration.`
            : `Your Skyfox POS subscription for ${params.shop.shopName} (${normShopId}) is now active.`),
        category: "billing_alert",
        priority: params.newStatus === "suspended" ? "urgent" : "important",
        targetType: "single_shop",
        targetShopIds: [normShopId],
        targetShopNames: [params.shop.shopName],
        sentBy: {
          name: params.actor || "Skyfox Root Admin",
          role: "super_admin",
        },
        pinned: params.newStatus === "suspended",
      })
    )
    .catch(() => {});

  return updatedSub;
}

/**
 * Updates a shop's assigned plan, Founding Customer pricing status, custom price override,
 * resource limits (Storage, Branches, Users), grace period days, and per-shop feature toggles.
 */
export async function updateShopSubscriptionConfiguration(params: {
  shop: Shop;
  plan: SubscriptionPlan;
  billingCycle?: BillingCycle;
  isFoundingCustomer?: boolean;
  foundingCustomerNote?: string;
  customPriceOverride?: number | null;
  gracePeriodDays?: number;
  autoSuspendEnabled?: boolean;
  limitOverrides?: Partial<SubscriptionResourceLimits>;
  featureOverrides?: Record<string, boolean>;
  nextDueDateMs?: number;
  actor?: string;
}): Promise<ShopSubscription> {
  const normShopId = normalizeShopId(params.shop.shopId);
  const now = Date.now();
  const currentSub =
    params.shop.subscription || buildDefaultShopSubscription(params.shop, params.plan);

  const isFounding =
    params.isFoundingCustomer !== undefined
      ? params.isFoundingCustomer
      : currentSub.isFoundingCustomer;

  const cycle = params.billingCycle || currentSub.billingCycle || "monthly";
  const nextPeriodEnd =
    typeof params.nextDueDateMs === "number" && params.nextDueDateMs > 0
      ? params.nextDueDateMs
      : currentSub.currentPeriodEnd;
  const graceDays =
    typeof params.gracePeriodDays === "number"
      ? params.gracePeriodDays
      : currentSub.gracePeriodDays ?? params.plan.defaultGracePeriodDays ?? 7;

  const draft: ShopSubscription = {
    ...currentSub,
    shopId: normShopId,
    shopName: params.shop.shopName,
    billingCycle: cycle,
    isFoundingCustomer: isFounding,
    ...(isFounding && !currentSub.foundingCustomerSince
      ? { foundingCustomerSince: now }
      : {}),
    ...(params.foundingCustomerNote !== undefined
      ? { foundingCustomerNote: params.foundingCustomerNote }
      : {}),
    customPriceOverride:
      params.customPriceOverride !== undefined
        ? params.customPriceOverride
        : currentSub.customPriceOverride,
    currentPeriodEnd: nextPeriodEnd,
    gracePeriodDays: graceDays,
    gracePeriodEndsAt: nextPeriodEnd + graceDays * DAY_MS,
    autoSuspendEnabled:
      params.autoSuspendEnabled !== undefined
        ? params.autoSuspendEnabled
        : currentSub.autoSuspendEnabled,
    limitOverrides:
      params.limitOverrides !== undefined
        ? params.limitOverrides
        : currentSub.limitOverrides,
    featureOverrides:
      params.featureOverrides !== undefined
        ? params.featureOverrides
        : currentSub.featureOverrides,
    updatedBy: params.actor || "Root Admin",
  };

  const recomputed = recomputeEffectiveShopSubscription(draft, params.plan, now);
  // Re-evaluate lifecycle in case due date or grace period was extended
  const evalResult = evaluateSubscriptionLifecycle(recomputed, now);
  if (
    recomputed.status === "grace_period" &&
    now <= recomputed.currentPeriodEnd
  ) {
    recomputed.status = "active";
  } else if (evalResult.changed) {
    recomputed.status = evalResult.nextStatus;
  }

  await persistShopSubscriptionToFirestore(normShopId, recomputed);
  await logSubscriptionLifecycleEvent(normShopId, {
    shopName: params.shop.shopName,
    type: "PLAN_UPDATED",
    previousStatus: currentSub.status,
    newStatus: recomputed.status,
    summary: `Updated subscription: Plan=${recomputed.planName}${
      recomputed.isFoundingCustomer ? " (Founding Customer Rate)" : ""
    }, Effective Rate=${recomputed.currency} ${recomputed.effectiveBillingAmount.toLocaleString()}/${
      recomputed.billingCycle === "annual" ? "yr" : "mo"
    }, Storage=${
      recomputed.limits.maxStorageMB === -1
        ? "Unlimited"
        : `${recomputed.limits.maxStorageMB} MB`
    }, Branches=${
      recomputed.limits.maxBranches === -1
        ? "Unlimited"
        : recomputed.limits.maxBranches
    }, Users=${
      recomputed.limits.maxUsers === -1 ? "Unlimited" : recomputed.limits.maxUsers
    }.`,
    actor: params.actor || "Root Admin",
  });

  return recomputed;
}

/**
 * Instant single-feature toggle per shop from the Root Terminal without code changes.
 */
export async function toggleShopFeatureEntitlement(params: {
  shop: Shop;
  featureKey: SubscriptionFeatureKey | string;
  enabled: boolean;
  actor?: string;
}): Promise<ShopSubscription> {
  const normShopId = normalizeShopId(params.shop.shopId);
  const now = Date.now();
  const currentSub =
    params.shop.subscription || buildDefaultShopSubscription(params.shop);

  const nextOverrides: Record<string, boolean> = {
    ...(currentSub.featureOverrides || {}),
    [params.featureKey]: params.enabled,
  };
  const nextEffective: Record<string, boolean> = {
    ...(currentSub.effectiveFeatures || {}),
    [params.featureKey]: params.enabled,
    pos_billing: true,
  };

  const updated: ShopSubscription = {
    ...currentSub,
    featureOverrides: nextOverrides,
    effectiveFeatures: nextEffective,
    updatedAt: now,
    updatedBy: params.actor || "Root Admin",
  };

  await persistShopSubscriptionToFirestore(normShopId, updated);
  await logSubscriptionLifecycleEvent(normShopId, {
    shopName: params.shop.shopName,
    type: "FEATURE_TOGGLED",
    summary: `Feature "${params.featureKey}" ${
      params.enabled ? "ENABLED" : "DISABLED"
    } for shop ${normShopId}.`,
    actor: params.actor || "Root Admin",
  });

  return updated;
}

/**
 * Fetches payment history strictly isolated to a single shop (`shops/{shopId}/subscription_payments`).
 */
export async function getShopSubscriptionPayments(
  shopId: string
): Promise<SubscriptionPaymentRecord[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];
  try {
    const snap = await getDocs(
      collection(db, SHOPS_COLLECTION, normShopId, "subscription_payments")
    );
    return snap.docs
      .map((d) => d.data() as SubscriptionPaymentRecord)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

/**
 * Fetches lifecycle events strictly isolated to a single shop (`shops/{shopId}/subscription_events`).
 */
export async function getShopSubscriptionEvents(
  shopId: string
): Promise<SubscriptionLifecycleEvent[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];
  try {
    const snap = await getDocs(
      collection(db, SHOPS_COLLECTION, normShopId, "subscription_events")
    );
    return snap.docs
      .map((d) => d.data() as SubscriptionLifecycleEvent)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

// ============================================================================
// 4. STORAGE USAGE METERING & BACK-END RESOURCE / FEATURE ENFORCEMENT
// ============================================================================

/**
 * Calculates real Firestore document storage usage, branch count, user count,
 * product count, and sale count strictly isolated to `shopId`.
 */
export async function calculateAndSyncShopResourceUsage(
  shop: Shop
): Promise<ShopResourceUsage> {
  const normShopId = normalizeShopId(shop.shopId);
  const now = Date.now();

  const subcollectionsToMeasure = [
    "users",
    "branches",
    "products",
    "sales",
    "stock_transactions",
    "e_receipts",
    "whatsapp_handoffs",
    "expenses",
    "repairs",
    "purchases",
    "customers",
    "installments",
  ];

  let totalBytes = 0;
  let branchCount = 0;
  let userCount = 0;
  let productCount = 0;
  let saleCount = 0;
  let whatsappHandoffsCount = 0;

  // Estimate JSON payload byte length of each document in the shop's isolated collections
  await Promise.all(
    subcollectionsToMeasure.map(async (subName) => {
      try {
        const snap = await getDocs(
          collection(db, SHOPS_COLLECTION, normShopId, subName)
        );
        if (subName === "branches") branchCount = Math.max(1, snap.size);
        if (subName === "users") userCount = snap.size;
        if (subName === "products") productCount = snap.size;
        if (subName === "sales") saleCount = snap.size;
        if (subName === "whatsapp_handoffs") whatsappHandoffsCount = snap.size;

        snap.docs.forEach((d) => {
          const data = d.data();
          const jsonStr = JSON.stringify(data || {});
          // Include Firestore document metadata overhead (~256 bytes per doc)
          totalBytes += jsonStr.length * 2 + 256;
        });
      } catch {
        // Ignore inaccessible subcollection
      }
    })
  );

  // Also check root `sales` and `users` scoped to this shopId if nested wasn't populated
  try {
    if (saleCount === 0) {
      const rootSalesSnap = await getDocs(
        query(collection(db, "sales"), where("shopId", "==", normShopId))
      );
      saleCount = rootSalesSnap.size;
      rootSalesSnap.docs.forEach((d) => {
        totalBytes += JSON.stringify(d.data() || {}).length * 2 + 256;
      });
    }
  } catch {}

  const storageUsedMB = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;

  const usage: ShopResourceUsage = {
    storageUsedBytes: totalBytes,
    storageUsedMB,
    branchCount: Math.max(1, branchCount),
    userCount: Math.max(userCount, shop.staffCount || 0),
    productCount,
    saleCount,
    whatsappHandoffsCount,
    lastCalculatedAt: now,
  };

  const currentSub = shop.subscription || buildDefaultShopSubscription(shop);
  const updatedSub: ShopSubscription = {
    ...currentSub,
    usage,
    updatedAt: now,
  };

  await persistShopSubscriptionToFirestore(normShopId, updatedSub);
  return usage;
}

/**
 * Synchronous helper used by `useRBAC` and POS navigation to check whether a feature/module
 * is enabled for the active shop's subscription.
 * Safe default: if a shop has no explicit subscription object yet, returns `true` so existing
 * POS workflows are never disrupted.
 */
export function isFeatureEnabledForShop(
  shop: Shop | null | undefined,
  featureKey: SubscriptionFeatureKey | string
): boolean {
  if (!shop || !shop.subscription) return true;
  if (featureKey === "pos_billing") return true;

  // Check explicit per-shop override first
  const overrides = shop.subscription.featureOverrides;
  if (overrides && typeof overrides[featureKey] === "boolean") {
    return overrides[featureKey];
  }

  // Then check effective features map
  const effective = shop.subscription.effectiveFeatures;
  if (effective && typeof effective[featureKey] === "boolean") {
    return effective[featureKey];
  }

  return true;
}

/**
 * Back-end guard: verifies the shop's subscription is active (or in valid grace period)
 * and that the requested feature is enabled for this shopId.
 */
export async function assertShopFeatureAccess(
  shopId: string,
  featureKey?: SubscriptionFeatureKey | string
): Promise<ShopSubscription | null> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return null;

  const shopSnap = await getDoc(doc(db, SHOPS_COLLECTION, normShopId));
  if (!shopSnap.exists()) return null;

  const shop = { id: shopSnap.id, ...(shopSnap.data() as Omit<Shop, "id">) };
  const sub = shop.subscription;
  if (!sub) return null;

  // Run real-time lifecycle check
  const lifecycle = evaluateSubscriptionLifecycle(sub);
  if (lifecycle.changed) {
    sub.status = lifecycle.nextStatus;
    await persistShopSubscriptionToFirestore(normShopId, sub);
  }

  if (sub.status === "suspended" || shop.status === "suspended") {
    throw new Error(
      `Subscription Suspended for Shop ${normShopId}: ${
        sub.suspensionReason ||
        "Monthly subscription payment is overdue past the grace period. Please contact Root Administration to reactivate."
      }`
    );
  }

  if (featureKey && !isFeatureEnabledForShop(shop, featureKey)) {
    throw new Error(
      `Feature "${featureKey}" is disabled under your current subscription plan (${sub.planName}).`
    );
  }

  return sub;
}

/**
 * Back-end guard: enforces the shop's `maxUsers` limit before creating a new staff account.
 */
export async function assertShopUserLimit(shopId: string): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return;

  const sub = await assertShopFeatureAccess(normShopId);
  if (!sub) return;

  const maxUsers = sub.limits?.maxUsers ?? -1;
  if (maxUsers <= 0) return; // -1 = unlimited

  const usersSnap = await getDocs(
    collection(db, SHOPS_COLLECTION, normShopId, "users")
  );
  const currentCount = usersSnap.size;
  if (currentCount >= maxUsers) {
    throw new Error(
      `Subscription User Limit Reached (${currentCount}/${maxUsers} users on ${sub.planName}). Please upgrade the shop's subscription plan or increase its user limit in Root Terminal.`
    );
  }
}

/**
 * Back-end guard: enforces the shop's `maxBranches` limit before creating a new branch.
 */
export async function assertShopBranchLimit(shopId: string): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return;

  const sub = await assertShopFeatureAccess(normShopId, "branch_management");
  if (!sub) return;

  const maxBranches = sub.limits?.maxBranches ?? -1;
  if (maxBranches <= 0) return; // -1 = unlimited

  const branchesSnap = await getDocs(
    collection(db, SHOPS_COLLECTION, normShopId, "branches")
  );
  const currentCount = branchesSnap.size;
  if (currentCount >= maxBranches) {
    throw new Error(
      `Subscription Branch Limit Reached (${currentCount}/${maxBranches} branches on ${sub.planName}). Please upgrade the shop's subscription plan or increase its branch limit in Root Terminal.`
    );
  }
}

/**
 * Back-end guard & lightweight incremental storage usage tracker.
 * Enforces `maxStorageMB` before persisting new records and updates `usage.storageUsedBytes`.
 */
export async function assertAndTrackShopStorageUsage(
  shopId: string,
  addedBytes = 1024
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return;

  const shopSnap = await getDoc(doc(db, SHOPS_COLLECTION, normShopId));
  if (!shopSnap.exists()) return;
  const shop = { id: shopSnap.id, ...(shopSnap.data() as Omit<Shop, "id">) };
  const sub = shop.subscription;
  if (!sub) return;

  // Verify not suspended
  const lifecycle = evaluateSubscriptionLifecycle(sub);
  if (lifecycle.nextStatus === "suspended") {
    throw new Error(
      `Subscription Suspended for Shop ${normShopId}: Please renew subscription to continue writing data.`
    );
  }

  const maxStorageMB = sub.limits?.maxStorageMB ?? -1;
  const currentBytes = sub.usage?.storageUsedBytes || 0;
  const nextBytes = Math.max(0, currentBytes + addedBytes);
  const nextMB = Math.round((nextBytes / (1024 * 1024)) * 100) / 100;

  if (maxStorageMB > 0 && nextMB > maxStorageMB) {
    throw new Error(
      `Subscription Storage Limit Reached (${nextMB} MB / ${maxStorageMB} MB on ${sub.planName}). Please increase the shop's storage quota in Root Terminal.`
    );
  }

  // Non-blocking storage usage update on the shop's subscription snapshot
  void updateDoc(doc(db, SHOPS_COLLECTION, normShopId), {
    "subscription.usage.storageUsedBytes": nextBytes,
    "subscription.usage.storageUsedMB": nextMB,
    "subscription.usage.lastCalculatedAt": Date.now(),
  }).catch(() => {});
}
