/**
 * lib/services/salesAnalyticsService.ts
 *
 * Core computation engine for Sales Analytics.
 * Operates purely on a single filtered dataset of SaleRecord[] (strictly scoped to authenticated shopId & date range).
 *
 * Guarantees:
 * 1. Single source of truth: All metrics (Cards, Charts, Payment Breakdowns, Products, Categories, Customers, Refunds)
 *    derive from the same filtered dataset.
 * 2. Net Revenue = Gross Sales - Total Refunds.
 * 3. Accurate Tender Reconciliation: Correctly handles Cash, Card, Bank Deposit/Wire, Mobile QR,
 *    and multi-tender Split Payments (with sub-split reconciliation).
 * 4. Resilient to empty datasets (zeroes, no NaNs).
 */

import { SaleRecord } from "../types/sale";

export interface SalesKPIs {
  grossSales: number;           // Total grand total of valid non-voided transactions
  totalRefunds: number;         // Total value refunded across sales in the period
  netRevenue: number;           // Gross Sales - Total Refunds
  totalTransactions: number;    // Number of completed non-voided transactions
  totalItemsSold: number;       // Gross units sold minus returned units
  grossItemsSold: number;       // Gross physical items sold
  totalUnitsReturned: number;   // Number of physical items returned
  averageOrderValue: number;    // Net Revenue / Total Transactions
  grossAverageOrderValue: number; // Gross Sales / Total Transactions
  totalDiscounts: number;       // Total discounts applied
  totalTax: number;             // Total tax collected
  voidedTransactionsCount: number;
  voidedTransactionsAmount: number;
  refundRate: number;           // (totalRefunds / grossSales) * 100
}

export type NormalizedPaymentMethod = "cash" | "card" | "bank_deposit" | "mobile_qr" | "split" | "other";

export interface PaymentMethodSummary {
  methodKey: NormalizedPaymentMethod;
  displayName: string;
  totalCollected: number;       // Amount collected in this tender (including within split payments)
  transactionCount: number;     // Transactions that used this method (pure or split)
  percentageOfTotal: number;    // % of gross collections
  refundsDisbursed: number;     // Refunds returned to this method
  netCollected: number;         // totalCollected - refundsDisbursed
}

export interface SplitPaymentsOverview {
  totalSplitTransactions: number;
  totalSplitVolume: number;
  averageSplitAmount: number;
  percentageOfGrossSales: number;
  tenderContributions: {
    cash: number;
    card: number;
    bank_deposit: number;
    mobile_qr: number;
    other: number;
  };
}

export interface PaymentAnalytics {
  breakdown: Record<NormalizedPaymentMethod, PaymentMethodSummary>;
  splitOverview: SplitPaymentsOverview;
  totalCollectedAllMethods: number;
}

export interface ProductAnalyticsItem {
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  brand: string;
  imageUrl?: string;
  grossUnitsSold: number;
  unitsReturned: number;
  netUnitsSold: number;
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  ordersCount: number;
  avgUnitPrice: number;
  returnRate: number; // % of gross units
}

export interface CategoryAnalyticsItem {
  categoryName: string;
  grossRevenue: number;
  netRevenue: number;
  unitsSold: number;
  percentageShare: number;
  productsCount: number;
}

export interface CustomerAnalyticsItem {
  customerId: string;
  name: string;
  phone?: string;
  email?: string;
  ordersCount: number;
  totalSpent: number;
  lastPurchaseDate: number;
  avgTicketSize: number;
}

export interface CustomerAnalytics {
  registeredCustomersCount: number;
  registeredRevenue: number;
  registeredTransactions: number;
  registeredAOV: number;
  walkInRevenue: number;
  walkInTransactions: number;
  walkInAOV: number;
  topCustomers: CustomerAnalyticsItem[];
  repeatCustomerCount: number;
  registeredRevenueShare: number; // %
}

export interface ReturnReasonItem {
  reason: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

export interface RefundAnalytics {
  totalRefundAmount: number;
  totalReturnEvents: number;
  totalItemsReturned: number;
  restockedUnitsCount: number;
  damagedUnitsCount: number;
  refundRateRevenue: number;     // % of gross sales
  refundRateUnits: number;       // % of items sold
  reasons: ReturnReasonItem[];
  refundMethodsBreakdown: {
    cash: number;
    card: number;
    store_credit: number;
    bank_transfer: number;
    other: number;
  };
}

export interface TimelineDataPoint {
  key: string;                  // e.g. "2026-10-01" or "14:00"
  label: string;                // formatted e.g. "Oct 01" or "2:00 PM"
  timestamp: number;
  grossSales: number;
  refunds: number;
  netRevenue: number;
  transactions: number;
  itemsSold: number;
}

export interface HourlySalesDistribution {
  hour: number;                 // 0..23
  label: string;                // "12 AM", "1 PM", etc.
  revenue: number;
  transactions: number;
}

export interface DayOfWeekDistribution {
  dayIndex: number;             // 0=Sun, 1=Mon, ..., 6=Sat
  dayName: string;
  revenue: number;
  transactions: number;
}

export interface SalesAnalyticsResult {
  kpis: SalesKPIs;
  payments: PaymentAnalytics;
  products: {
    topByRevenue: ProductAnalyticsItem[];
    topByQuantity: ProductAnalyticsItem[];
    topReturned: ProductAnalyticsItem[];
    allProducts: ProductAnalyticsItem[];
  };
  categories: CategoryAnalyticsItem[];
  customers: CustomerAnalytics;
  refunds: RefundAnalytics;
  timeline: TimelineDataPoint[];
  hourlyDistribution: HourlySalesDistribution[];
  dayOfWeekDistribution: DayOfWeekDistribution[];
  rawCount: number;
}

/**
 * Normalizes payment method strings into standard categories
 */
export function normalizePaymentKey(methodStr?: string): NormalizedPaymentMethod {
  if (!methodStr) return "other";
  const clean = methodStr.toLowerCase().trim();

  if (clean === "cash") return "cash";
  if (clean === "card" || clean.includes("credit") || clean.includes("debit") || clean.includes("visa") || clean.includes("mastercard")) {
    return "card";
  }
  if (
    clean === "bank" ||
    clean === "bank-transfer" ||
    clean === "bank-deposit" ||
    clean === "deposit" ||
    clean.includes("bank") ||
    clean.includes("wire") ||
    clean.includes("transfer")
  ) {
    return "bank_deposit";
  }
  if (
    clean === "mobile" ||
    clean === "mobile-qr" ||
    clean === "qr" ||
    clean.includes("upi") ||
    clean.includes("venmo") ||
    clean.includes("cashapp")
  ) {
    return "mobile_qr";
  }
  if (clean === "split" || clean.includes("split")) {
    return "split";
  }

  return "other";
}

export const PAYMENT_METHOD_LABELS: Record<NormalizedPaymentMethod, string> = {
  cash: "Cash",
  card: "Credit / Debit Card",
  bank_deposit: "Bank Deposit / Wire",
  mobile_qr: "Mobile / QR Payment",
  split: "Split Payments",
  other: "Other Tenders",
};

/**
 * Extracts the total refund value attached to a SaleRecord.
 * Prioritizes totalRefunded, then sums returns, then checks "refunded" status.
 */
export function getSaleRefundAmount(sale: SaleRecord): number {
  if (sale.status === "voided") return 0;

  if (typeof sale.totalRefunded === "number" && sale.totalRefunded > 0) {
    return sale.totalRefunded;
  }

  if (sale.returns && Array.isArray(sale.returns) && sale.returns.length > 0) {
    const returnSum = sale.returns.reduce((sum, r) => sum + (Number(r.totalRefundAmount) || 0), 0);
    if (returnSum > 0) return returnSum;
  }

  // Fallback: If fully refunded status and no explicit amount, refund equals grand total
  if (sale.status === "refunded") {
    return Number(sale.grandTotal || sale.total || 0);
  }

  return 0;
}

/**
 * Computes all analytics strictly from the single filtered SaleRecord[] dataset.
 * Runs 100% in-memory, synchronous, pure and idempotent.
 */
export function computeSalesAnalytics(
  sales: SaleRecord[],
  isHourlyMode: boolean = false
): SalesAnalyticsResult {
  // Empty dataset defaults
  if (!sales || sales.length === 0) {
    return createEmptyAnalyticsResult();
  }

  let grossSales = 0;
  let totalRefunds = 0;
  let totalTransactions = 0;
  let grossItemsSold = 0;
  let totalUnitsReturned = 0;
  let totalDiscounts = 0;
  let totalTax = 0;
  let voidedTransactionsCount = 0;
  let voidedTransactionsAmount = 0;

  // Payments aggregation buckets
  const methodTotals: Record<NormalizedPaymentMethod, {
    collected: number;
    count: number;
    refunds: number;
  }> = {
    cash: { collected: 0, count: 0, refunds: 0 },
    card: { collected: 0, count: 0, refunds: 0 },
    bank_deposit: { collected: 0, count: 0, refunds: 0 },
    mobile_qr: { collected: 0, count: 0, refunds: 0 },
    split: { collected: 0, count: 0, refunds: 0 },
    other: { collected: 0, count: 0, refunds: 0 },
  };

  const splitContributions = {
    cash: 0,
    card: 0,
    bank_deposit: 0,
    mobile_qr: 0,
    other: 0,
  };
  let totalSplitTransactions = 0;
  let totalSplitVolume = 0;

  // Product, Category & Customer tracking maps
  const productMap = new Map<string, ProductAnalyticsItem>();
  const categoryMap = new Map<string, {
    grossRevenue: number;
    netRevenue: number;
    unitsSold: number;
    productsSet: Set<string>;
  }>();
  const customerMap = new Map<string, CustomerAnalyticsItem>();

  let registeredRevenue = 0;
  let registeredTransactions = 0;
  let walkInRevenue = 0;
  let walkInTransactions = 0;

  // Refund tracking
  let totalReturnEvents = 0;
  let restockedUnitsCount = 0;
  let damagedUnitsCount = 0;
  const reasonMap = new Map<string, { count: number; amount: number }>();
  const refundMethodSums = {
    cash: 0,
    card: 0,
    store_credit: 0,
    bank_transfer: 0,
    other: 0,
  };

  // Timeline tracking (Date string key -> accumulator)
  const timelineMap = new Map<string, {
    label: string;
    timestamp: number;
    grossSales: number;
    refunds: number;
    transactions: number;
    itemsSold: number;
  }>();

  // Hourly and Day-of-week distributions
  const hourlyBuckets = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    revenue: 0,
    transactions: 0,
  }));
  const dayBuckets = Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    revenue: 0,
    transactions: 0,
  }));

  // Single-pass iteration through all sales in the filtered set
  for (const sale of sales) {
    const saleAmount = Number(sale.grandTotal || sale.total || 0);

    // ── Voided Sales Handling ──
    if (sale.status === "voided") {
      voidedTransactionsCount += 1;
      voidedTransactionsAmount += saleAmount;
      continue; // Exclude voided sales from gross revenue & performance metrics
    }

    // ── Valid Transaction Metrics ──
    totalTransactions += 1;
    grossSales += saleAmount;
    totalDiscounts += Number(sale.discountAmount || 0);
    totalTax += Number(sale.taxAmount || 0);

    const saleRefund = getSaleRefundAmount(sale);
    totalRefunds += saleRefund;

    // ── Tender / Payment Method Reconciliation ──
    const hasSplitEntries = Array.isArray(sale.splitPayments) && sale.splitPayments.length > 0;
    const isSplitMethod = sale.paymentMethod === "split" || hasSplitEntries;

    if (isSplitMethod && hasSplitEntries) {
      totalSplitTransactions += 1;
      totalSplitVolume += saleAmount;
      methodTotals.split.count += 1;
      methodTotals.split.collected += saleAmount;

      // Attribute each component payment to its specific tender
      for (const splitEntry of sale.splitPayments!) {
        const splitAmt = Number(splitEntry.amount) || 0;
        const subKey = normalizePaymentKey(splitEntry.method);

        if (subKey === "cash") {
          splitContributions.cash += splitAmt;
          methodTotals.cash.collected += splitAmt;
          methodTotals.cash.count += 1;
        } else if (subKey === "card") {
          splitContributions.card += splitAmt;
          methodTotals.card.collected += splitAmt;
          methodTotals.card.count += 1;
        } else if (subKey === "bank_deposit") {
          splitContributions.bank_deposit += splitAmt;
          methodTotals.bank_deposit.collected += splitAmt;
          methodTotals.bank_deposit.count += 1;
        } else if (subKey === "mobile_qr") {
          splitContributions.mobile_qr += splitAmt;
          methodTotals.mobile_qr.collected += splitAmt;
          methodTotals.mobile_qr.count += 1;
        } else {
          splitContributions.other += splitAmt;
          methodTotals.other.collected += splitAmt;
          methodTotals.other.count += 1;
        }
      }
    } else {
      // Single tender payment
      const primaryKey = normalizePaymentKey(sale.paymentMethod);
      if (primaryKey in methodTotals) {
        methodTotals[primaryKey].collected += saleAmount;
        methodTotals[primaryKey].count += 1;
      } else {
        methodTotals.other.collected += saleAmount;
        methodTotals.other.count += 1;
      }
    }

    // ── Items & Product Metrics ──
    let saleItemUnits = 0;
    if (Array.isArray(sale.items)) {
      for (const item of sale.items) {
        const qty = Math.max(0, Number(item.quantity) || 1);
        const lineTotal = Number(item.subtotal) || (Number(item.unitPrice) * qty);
        grossItemsSold += qty;
        saleItemUnits += qty;

        const pKey = item.productId || item.sku || item.name;
        if (!productMap.has(pKey)) {
          productMap.set(pKey, {
            productId: item.productId || pKey,
            name: item.name || "Unknown Product",
            sku: item.sku || "N/A",
            categoryName: item.categoryName || "Uncategorized",
            brand: item.brand || "",
            imageUrl: item.imageUrl,
            grossUnitsSold: 0,
            unitsReturned: 0,
            netUnitsSold: 0,
            grossRevenue: 0,
            refundAmount: 0,
            netRevenue: 0,
            ordersCount: 0,
            avgUnitPrice: Number(item.unitPrice) || 0,
            returnRate: 0,
          });
        }

        const prod = productMap.get(pKey)!;
        prod.grossUnitsSold += qty;
        prod.grossRevenue += lineTotal;
        prod.ordersCount += 1;
        if (!prod.avgUnitPrice && item.unitPrice) {
          prod.avgUnitPrice = Number(item.unitPrice);
        }

        // Category breakdown
        const catKey = (item.categoryName || "Uncategorized").trim() || "Uncategorized";
        if (!categoryMap.has(catKey)) {
          categoryMap.set(catKey, {
            grossRevenue: 0,
            netRevenue: 0,
            unitsSold: 0,
            productsSet: new Set<string>(),
          });
        }
        const cat = categoryMap.get(catKey)!;
        cat.grossRevenue += lineTotal;
        cat.unitsSold += qty;
        cat.productsSet.add(pKey);
      }
    }

    // ── Refund & Returns Deep Audit ──
    if (sale.returns && Array.isArray(sale.returns)) {
      for (const ret of sale.returns) {
        totalReturnEvents += 1;
        const retAmt = Number(ret.totalRefundAmount) || 0;

        // Refund method breakdown
        const rMethod = (ret.refundMethod || "cash").toLowerCase();
        if (rMethod.includes("cash")) refundMethodSums.cash += retAmt;
        else if (rMethod.includes("card")) refundMethodSums.card += retAmt;
        else if (rMethod.includes("credit") || rMethod.includes("store")) refundMethodSums.store_credit += retAmt;
        else if (rMethod.includes("bank") || rMethod.includes("wire")) refundMethodSums.bank_transfer += retAmt;
        else refundMethodSums.other += retAmt;

        // Return reason tracking
        const reasonClean = (ret.reason || "Unspecified").trim() || "Unspecified";
        if (!reasonMap.has(reasonClean)) {
          reasonMap.set(reasonClean, { count: 0, amount: 0 });
        }
        const rEntry = reasonMap.get(reasonClean)!;
        rEntry.count += 1;
        rEntry.amount += retAmt;

        // Line-level returned items tracking
        if (Array.isArray(ret.items)) {
          for (const retItem of ret.items) {
            const retQty = Number(retItem.quantity) || 0;
            const retLineRefund = Number(retItem.refundAmount) || 0;
            totalUnitsReturned += retQty;

            if (retItem.restock) {
              restockedUnitsCount += retQty;
            } else {
              damagedUnitsCount += retQty;
            }

            // Link to product analytics
            const prodKey = retItem.productId || retItem.sku || retItem.name;
            if (productMap.has(prodKey)) {
              const p = productMap.get(prodKey)!;
              p.unitsReturned += retQty;
              p.refundAmount += retLineRefund;
            }
          }
        }
      }
    }

    // ── Customer Segmentation ──
    const custId = sale.customer?.customerId;
    const custName = sale.customer?.name?.trim();
    const custPhone = sale.customer?.phone?.trim();

    if (custId || (custName && custName.toLowerCase() !== "walk-in customer" && custName.toLowerCase() !== "walk in")) {
      registeredRevenue += saleAmount;
      registeredTransactions += 1;

      const customerKey = custId || custPhone || custName || "registered_anonymous";
      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          customerId: custId || customerKey,
          name: custName || "Valued Customer",
          phone: custPhone,
          email: sale.customer?.email,
          ordersCount: 0,
          totalSpent: 0,
          lastPurchaseDate: sale.createdAt,
          avgTicketSize: 0,
        });
      }
      const c = customerMap.get(customerKey)!;
      c.ordersCount += 1;
      c.totalSpent += saleAmount;
      if (sale.createdAt > c.lastPurchaseDate) {
        c.lastPurchaseDate = sale.createdAt;
      }
    } else {
      walkInRevenue += saleAmount;
      walkInTransactions += 1;
    }

    // ── Timeline Bucket Accumulation ──
    const saleDate = new Date(sale.createdAt || Date.now());
    let timelineKey = "";
    let timelineLabel = "";

    if (isHourlyMode) {
      // Group by hour: e.g. "2026-10-01-14"
      const hr = saleDate.getHours();
      const ampm = hr >= 12 ? "PM" : "AM";
      const displayHour = hr % 12 === 0 ? 12 : hr % 12;
      timelineKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, "0")}-${String(saleDate.getDate()).padStart(2, "0")}-${String(hr).padStart(2, "0")}`;
      timelineLabel = `${displayHour}:00 ${ampm}`;
    } else {
      // Group by day: e.g. "2026-10-01"
      timelineKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, "0")}-${String(saleDate.getDate()).padStart(2, "0")}`;
      timelineLabel = saleDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    if (!timelineMap.has(timelineKey)) {
      timelineMap.set(timelineKey, {
        label: timelineLabel,
        timestamp: saleDate.getTime(),
        grossSales: 0,
        refunds: 0,
        transactions: 0,
        itemsSold: 0,
      });
    }
    const tEntry = timelineMap.get(timelineKey)!;
    tEntry.grossSales += saleAmount;
    tEntry.refunds += saleRefund;
    tEntry.transactions += 1;
    tEntry.itemsSold += saleItemUnits;

    // Hourly distribution bucket
    const h = saleDate.getHours();
    hourlyBuckets[h].revenue += saleAmount;
    hourlyBuckets[h].transactions += 1;

    // Day of week distribution bucket
    const d = saleDate.getDay();
    dayBuckets[d].revenue += saleAmount;
    dayBuckets[d].transactions += 1;
  }

  // ── Final Derived KPI Computations ──
  const netRevenue = Math.max(0, grossSales - totalRefunds);
  const totalItemsSold = Math.max(0, grossItemsSold - totalUnitsReturned);
  const averageOrderValue = totalTransactions > 0 ? netRevenue / totalTransactions : 0;
  const grossAverageOrderValue = totalTransactions > 0 ? grossSales / totalTransactions : 0;
  const refundRate = grossSales > 0 ? (totalRefunds / grossSales) * 100 : 0;

  const kpis: SalesKPIs = {
    grossSales,
    totalRefunds,
    netRevenue,
    totalTransactions,
    totalItemsSold,
    grossItemsSold,
    totalUnitsReturned,
    averageOrderValue,
    grossAverageOrderValue,
    totalDiscounts,
    totalTax,
    voidedTransactionsCount,
    voidedTransactionsAmount,
    refundRate,
  };

  // ── Final Payment Analytics Computation ──
  const totalCollectedAllMethods = grossSales;
  const paymentBreakdown: Record<NormalizedPaymentMethod, PaymentMethodSummary> = {
    cash: {
      methodKey: "cash",
      displayName: PAYMENT_METHOD_LABELS.cash,
      totalCollected: methodTotals.cash.collected,
      transactionCount: methodTotals.cash.count,
      percentageOfTotal: totalCollectedAllMethods > 0 ? (methodTotals.cash.collected / totalCollectedAllMethods) * 100 : 0,
      refundsDisbursed: refundMethodSums.cash,
      netCollected: Math.max(0, methodTotals.cash.collected - refundMethodSums.cash),
    },
    card: {
      methodKey: "card",
      displayName: PAYMENT_METHOD_LABELS.card,
      totalCollected: methodTotals.card.collected,
      transactionCount: methodTotals.card.count,
      percentageOfTotal: totalCollectedAllMethods > 0 ? (methodTotals.card.collected / totalCollectedAllMethods) * 100 : 0,
      refundsDisbursed: refundMethodSums.card,
      netCollected: Math.max(0, methodTotals.card.collected - refundMethodSums.card),
    },
    bank_deposit: {
      methodKey: "bank_deposit",
      displayName: PAYMENT_METHOD_LABELS.bank_deposit,
      totalCollected: methodTotals.bank_deposit.collected,
      transactionCount: methodTotals.bank_deposit.count,
      percentageOfTotal: totalCollectedAllMethods > 0 ? (methodTotals.bank_deposit.collected / totalCollectedAllMethods) * 100 : 0,
      refundsDisbursed: refundMethodSums.bank_transfer,
      netCollected: Math.max(0, methodTotals.bank_deposit.collected - refundMethodSums.bank_transfer),
    },
    mobile_qr: {
      methodKey: "mobile_qr",
      displayName: PAYMENT_METHOD_LABELS.mobile_qr,
      totalCollected: methodTotals.mobile_qr.collected,
      transactionCount: methodTotals.mobile_qr.count,
      percentageOfTotal: totalCollectedAllMethods > 0 ? (methodTotals.mobile_qr.collected / totalCollectedAllMethods) * 100 : 0,
      refundsDisbursed: 0,
      netCollected: methodTotals.mobile_qr.collected,
    },
    split: {
      methodKey: "split",
      displayName: PAYMENT_METHOD_LABELS.split,
      totalCollected: methodTotals.split.collected,
      transactionCount: methodTotals.split.count,
      percentageOfTotal: totalCollectedAllMethods > 0 ? (methodTotals.split.collected / totalCollectedAllMethods) * 100 : 0,
      refundsDisbursed: 0,
      netCollected: methodTotals.split.collected,
    },
    other: {
      methodKey: "other",
      displayName: PAYMENT_METHOD_LABELS.other,
      totalCollected: methodTotals.other.collected,
      transactionCount: methodTotals.other.count,
      percentageOfTotal: totalCollectedAllMethods > 0 ? (methodTotals.other.collected / totalCollectedAllMethods) * 100 : 0,
      refundsDisbursed: refundMethodSums.other + refundMethodSums.store_credit,
      netCollected: Math.max(0, methodTotals.other.collected - (refundMethodSums.other + refundMethodSums.store_credit)),
    },
  };

  const splitOverview: SplitPaymentsOverview = {
    totalSplitTransactions,
    totalSplitVolume,
    averageSplitAmount: totalSplitTransactions > 0 ? totalSplitVolume / totalSplitTransactions : 0,
    percentageOfGrossSales: grossSales > 0 ? (totalSplitVolume / grossSales) * 100 : 0,
    tenderContributions: splitContributions,
  };

  const payments: PaymentAnalytics = {
    breakdown: paymentBreakdown,
    splitOverview,
    totalCollectedAllMethods,
  };

  // ── Final Product Analytics ──
  const allProductsList: ProductAnalyticsItem[] = Array.from(productMap.values()).map((p) => {
    const netUnits = Math.max(0, p.grossUnitsSold - p.unitsReturned);
    const netRev = Math.max(0, p.grossRevenue - p.refundAmount);
    const returnRate = p.grossUnitsSold > 0 ? (p.unitsReturned / p.grossUnitsSold) * 100 : 0;
    return {
      ...p,
      netUnitsSold: netUnits,
      netRevenue: netRev,
      returnRate,
    };
  });

  const topByRevenue = [...allProductsList].sort((a, b) => b.netRevenue - a.netRevenue).slice(0, 10);
  const topByQuantity = [...allProductsList].sort((a, b) => b.grossUnitsSold - a.grossUnitsSold).slice(0, 10);
  const topReturned = [...allProductsList]
    .filter((p) => p.unitsReturned > 0)
    .sort((a, b) => b.unitsReturned - a.unitsReturned)
    .slice(0, 10);

  // ── Final Category Analytics ──
  const categoriesList: CategoryAnalyticsItem[] = Array.from(categoryMap.entries()).map(([catName, data]) => {
    const percentageShare = grossSales > 0 ? (data.grossRevenue / grossSales) * 100 : 0;
    return {
      categoryName: catName,
      grossRevenue: data.grossRevenue,
      netRevenue: data.grossRevenue, // refined if category-level refunds tracked
      unitsSold: data.unitsSold,
      percentageShare,
      productsCount: data.productsSet.size,
    };
  }).sort((a, b) => b.grossRevenue - a.grossRevenue);

  // ── Final Customer Analytics ──
  const topCustomers: CustomerAnalyticsItem[] = Array.from(customerMap.values())
    .map((c) => ({
      ...c,
      avgTicketSize: c.ordersCount > 0 ? c.totalSpent / c.ordersCount : 0,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  const repeatCustomerCount = Array.from(customerMap.values()).filter((c) => c.ordersCount > 1).length;
  const registeredAOV = registeredTransactions > 0 ? registeredRevenue / registeredTransactions : 0;
  const walkInAOV = walkInTransactions > 0 ? walkInRevenue / walkInTransactions : 0;
  const registeredRevenueShare = grossSales > 0 ? (registeredRevenue / grossSales) * 100 : 0;

  const customers: CustomerAnalytics = {
    registeredCustomersCount: customerMap.size,
    registeredRevenue,
    registeredTransactions,
    registeredAOV,
    walkInRevenue,
    walkInTransactions,
    walkInAOV,
    topCustomers,
    repeatCustomerCount,
    registeredRevenueShare,
  };

  // ── Final Refund & Returns Analytics ──
  const reasonsList: ReturnReasonItem[] = Array.from(reasonMap.entries())
    .map(([reason, data]) => ({
      reason,
      count: data.count,
      totalAmount: data.amount,
      percentage: totalRefunds > 0 ? (data.amount / totalRefunds) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const refunds: RefundAnalytics = {
    totalRefundAmount: totalRefunds,
    totalReturnEvents,
    totalItemsReturned: totalUnitsReturned,
    restockedUnitsCount,
    damagedUnitsCount,
    refundRateRevenue: grossSales > 0 ? (totalRefunds / grossSales) * 100 : 0,
    refundRateUnits: grossItemsSold > 0 ? (totalUnitsReturned / grossItemsSold) * 100 : 0,
    reasons: reasonsList,
    refundMethodsBreakdown: refundMethodSums,
  };

  // ── Final Timeline Sorting ──
  const timeline: TimelineDataPoint[] = Array.from(timelineMap.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, data]) => ({
      key,
      label: data.label,
      timestamp: data.timestamp,
      grossSales: data.grossSales,
      refunds: data.refunds,
      netRevenue: Math.max(0, data.grossSales - data.refunds),
      transactions: data.transactions,
      itemsSold: data.itemsSold,
    }));

  // ── Final Hourly and Day of Week Distributions ──
  const hourlyDistribution: HourlySalesDistribution[] = hourlyBuckets.map((b) => {
    const hr = b.hour;
    const ampm = hr >= 12 ? "PM" : "AM";
    const displayHour = hr % 12 === 0 ? 12 : hr % 12;
    return {
      hour: hr,
      label: `${displayHour} ${ampm}`,
      revenue: b.revenue,
      transactions: b.transactions,
    };
  });

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeekDistribution: DayOfWeekDistribution[] = dayBuckets.map((b) => ({
    dayIndex: b.dayIndex,
    dayName: DAY_NAMES[b.dayIndex],
    revenue: b.revenue,
    transactions: b.transactions,
  }));

  return {
    kpis,
    payments,
    products: {
      topByRevenue,
      topByQuantity,
      topReturned,
      allProducts: allProductsList,
    },
    categories: categoriesList,
    customers,
    refunds,
    timeline,
    hourlyDistribution,
    dayOfWeekDistribution,
    rawCount: sales.length,
  };
}

/**
 * Empty analytics result template for safe rendering
 */
function createEmptyAnalyticsResult(): SalesAnalyticsResult {
  const emptyMethodSummary = (key: NormalizedPaymentMethod): PaymentMethodSummary => ({
    methodKey: key,
    displayName: PAYMENT_METHOD_LABELS[key],
    totalCollected: 0,
    transactionCount: 0,
    percentageOfTotal: 0,
    refundsDisbursed: 0,
    netCollected: 0,
  });

  return {
    kpis: {
      grossSales: 0,
      totalRefunds: 0,
      netRevenue: 0,
      totalTransactions: 0,
      totalItemsSold: 0,
      grossItemsSold: 0,
      totalUnitsReturned: 0,
      averageOrderValue: 0,
      grossAverageOrderValue: 0,
      totalDiscounts: 0,
      totalTax: 0,
      voidedTransactionsCount: 0,
      voidedTransactionsAmount: 0,
      refundRate: 0,
    },
    payments: {
      breakdown: {
        cash: emptyMethodSummary("cash"),
        card: emptyMethodSummary("card"),
        bank_deposit: emptyMethodSummary("bank_deposit"),
        mobile_qr: emptyMethodSummary("mobile_qr"),
        split: emptyMethodSummary("split"),
        other: emptyMethodSummary("other"),
      },
      splitOverview: {
        totalSplitTransactions: 0,
        totalSplitVolume: 0,
        averageSplitAmount: 0,
        percentageOfGrossSales: 0,
        tenderContributions: {
          cash: 0,
          card: 0,
          bank_deposit: 0,
          mobile_qr: 0,
          other: 0,
        },
      },
      totalCollectedAllMethods: 0,
    },
    products: {
      topByRevenue: [],
      topByQuantity: [],
      topReturned: [],
      allProducts: [],
    },
    categories: [],
    customers: {
      registeredCustomersCount: 0,
      registeredRevenue: 0,
      registeredTransactions: 0,
      registeredAOV: 0,
      walkInRevenue: 0,
      walkInTransactions: 0,
      walkInAOV: 0,
      topCustomers: [],
      repeatCustomerCount: 0,
      registeredRevenueShare: 0,
    },
    refunds: {
      totalRefundAmount: 0,
      totalReturnEvents: 0,
      totalItemsReturned: 0,
      restockedUnitsCount: 0,
      damagedUnitsCount: 0,
      refundRateRevenue: 0,
      refundRateUnits: 0,
      reasons: [],
      refundMethodsBreakdown: {
        cash: 0,
        card: 0,
        store_credit: 0,
        bank_transfer: 0,
        other: 0,
      },
    },
    timeline: [],
    hourlyDistribution: Array.from({ length: 24 }, (_, i) => {
      const ampm = i >= 12 ? "PM" : "AM";
      const displayHour = i % 12 === 0 ? 12 : i % 12;
      return {
        hour: i,
        label: `${displayHour} ${ampm}`,
        revenue: 0,
        transactions: 0,
      };
    }),
    dayOfWeekDistribution: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName, dayIndex) => ({
      dayIndex,
      dayName,
      revenue: 0,
      transactions: 0,
    })),
    rawCount: 0,
  };
}
