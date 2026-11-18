/**
 * lib/services/accountingReportsService.ts
 *
 * Multi-tenant Accounting & Financial Reports Engine.
 * Aggregates live Firestore data (sales, purchases, catalog products, customers, expenses)
 * and generates rigorous, mathematically sound financial statements:
 * 1. Profit & Loss (Income Statement)
 * 2. Balance Sheet
 * 3. Cash Flow Statement
 * 4. Trial Balance & General Ledger Summaries
 * 5. Sales Statement
 * 6. Inventory Valuation
 * 7. Purchase Statement
 * 8. Accounts Receivable (AR Aging)
 * 9. Accounts Payable (AP Aging)
 * 10. Expense Statement
 * 11. Bank & Cash Reconciliation
 * 12. Tax Statement (SST)
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { SaleRecord } from "../types/sale";
import { PurchaseRecord } from "../types/purchase";
import { ProductItem } from "../types/catalog";
import { CustomerRecord } from "../types/customer";
import { ExpenseRecord } from "../types/expense";
import { RepairTicket, RepairEstimate, RepairPartUsage } from "../types/repair";
import { CustomRepairPart } from "./repairService";
import { InstallmentPlanRecord } from "../types/installment";
import { fetchInstallmentPlans } from "./installmentService";
import {
  DateRangePreset,
  ReportDateFilter,
  MasterAccountingReportsData,
  PnLData,
  BalanceSheetData,
  CashFlowData,
  TrialBalanceData,
  SalesStatementData,
  RepairStatementData,
  RepairStatementTicketRow,
  InventoryValuationData,
  PurchaseStatementData,
  ARAgingData,
  APAgingData,
  ExpenseStatementData,
  ExpenseStatementRow,
  BankCashReconciliationData,
  SSTTaxStatementData,
  SSTTaxTransactionRow,
  SalesStatementInvoiceRow,
} from "../types/accountingReport";

// ─────────────────────────────────────────────────────────────
// Date Range Helper
// ─────────────────────────────────────────────────────────────

export function getDateFilter(preset: DateRangePreset, customStart?: string, customEnd?: string): ReportDateFilter {
  const now = new Date();

  // Helper to format YYYY-MM-DD
  const formatYMD = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

  let startMs = 0;
  let endMs = endOfDay(now);
  let label = "All Time";
  let startStr = "2020-01-01";
  let endStr = formatYMD(now);

  switch (preset) {
    case "today": {
      startMs = startOfDay(now);
      endMs = endOfDay(now);
      startStr = formatYMD(now);
      endStr = formatYMD(now);
      label = "Today";
      break;
    }
    case "yesterday": {
      const yest = new Date(now.getTime() - 86400000);
      startMs = startOfDay(yest);
      endMs = endOfDay(yest);
      startStr = formatYMD(yest);
      endStr = formatYMD(yest);
      label = "Yesterday";
      break;
    }
    case "this_week": {
      const day = now.getDay() || 7; // Monday as 1
      const monday = new Date(now);
      monday.setDate(now.getDate() - day + 1);
      startMs = startOfDay(monday);
      endMs = endOfDay(now);
      startStr = formatYMD(monday);
      endStr = formatYMD(now);
      label = "This Week";
      break;
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      startMs = startOfDay(first);
      endMs = endOfDay(now);
      startStr = formatYMD(first);
      endStr = formatYMD(now);
      label = "This Month";
      break;
    }
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      startMs = startOfDay(first);
      endMs = endOfDay(last);
      startStr = formatYMD(first);
      endStr = formatYMD(last);
      label = "Last Month";
      break;
    }
    case "this_quarter": {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), currentQuarter * 3, 1);
      startMs = startOfDay(first);
      endMs = endOfDay(now);
      startStr = formatYMD(first);
      endStr = formatYMD(now);
      label = `Q${currentQuarter + 1} ${now.getFullYear()}`;
      break;
    }
    case "this_year": {
      const first = new Date(now.getFullYear(), 0, 1);
      startMs = startOfDay(first);
      endMs = endOfDay(now);
      startStr = formatYMD(first);
      endStr = formatYMD(now);
      label = `Year ${now.getFullYear()}`;
      break;
    }
    case "custom": {
      if (customStart && customEnd) {
        const s = new Date(customStart + "T00:00:00");
        const e = new Date(customEnd + "T23:59:59.999");
        startMs = s.getTime();
        endMs = e.getTime();
        startStr = customStart;
        endStr = customEnd;
        label = `${customStart} to ${customEnd}`;
      }
      break;
    }
    case "all_time":
    default: {
      startMs = 0;
      endMs = endOfDay(now);
      startStr = "2020-01-01";
      endStr = formatYMD(now);
      label = "All Time";
      break;
    }
  }

  return {
    preset,
    startDate: startStr,
    endDate: endStr,
    startTimeMs: startMs,
    endTimeMs: endMs,
    label,
  };
}

// ─────────────────────────────────────────────────────────────
// Raw Data Fetchers (Optimized Parallel Execution + SWR Memory Cache)
// ─────────────────────────────────────────────────────────────

export interface RawAccountingDataSnapshot {
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  products: ProductItem[];
  customers: CustomerRecord[];
  expenses: ExpenseRecord[];
  repairs: RepairTicket[];
  repairParts: CustomRepairPart[];
  installments: InstallmentPlanRecord[];
}

const accountingDataMemoryCache = new Map<
  string,
  { timestamp: number; data: RawAccountingDataSnapshot }
>();

export function getCachedRawAccountingData(shopId: string): RawAccountingDataSnapshot | null {
  const normShop = (shopId || "").trim().toUpperCase();
  const cached = accountingDataMemoryCache.get(normShop);
  return cached ? cached.data : null;
}

export async function fetchRawAccountingData(shopId: string): Promise<RawAccountingDataSnapshot> {
  const normShop = (shopId || "").trim().toUpperCase();

  // Execute all 8 Firestore collection queries in parallel instead of sequentially
  const [
    sales,
    purchases,
    products,
    customers,
    expenses,
    repairs,
    repairParts,
    installments,
  ] = await Promise.all([
    // 1. Sales
    (async (): Promise<SaleRecord[]> => {
      try {
        const saleMap = new Map<string, SaleRecord>();
        if (normShop && normShop !== "ALL") {
          const [rootSnap, subSnap] = await Promise.all([
            getDocs(query(collection(db, "sales"), where("shopId", "==", normShop))).catch(() => null),
            getDocs(collection(db, "shops", normShop, "sales")).catch(() => null),
          ]);
          rootSnap?.docs.forEach((d) => {
            saleMap.set(d.id, { saleId: d.id, ...(d.data() as Omit<SaleRecord, "saleId">) });
          });
          subSnap?.docs.forEach((d) => {
            if (!saleMap.has(d.id)) {
              saleMap.set(d.id, { saleId: d.id, ...(d.data() as Omit<SaleRecord, "saleId">) });
            }
          });
        } else {
          const snap = await getDocs(collection(db, "sales"));
          snap.docs.forEach((d) => {
            saleMap.set(d.id, { saleId: d.id, ...(d.data() as Omit<SaleRecord, "saleId">) });
          });
        }
        const list = Array.from(saleMap.values());
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return list;
      } catch {
        return [];
      }
    })(),

    // 2. Purchases
    (async (): Promise<PurchaseRecord[]> => {
      try {
        const purchaseMap = new Map<string, PurchaseRecord>();
        if (normShop && normShop !== "ALL") {
          const [subSnap, rootSnap] = await Promise.all([
            getDocs(collection(db, "shops", normShop, "purchases")).catch(() => null),
            getDocs(query(collection(db, "purchases"), where("shopId", "==", normShop))).catch(() => null),
          ]);
          subSnap?.docs.forEach((d) => {
            purchaseMap.set(d.id, { id: d.id, ...(d.data() as Omit<PurchaseRecord, "id">) });
          });
          rootSnap?.docs.forEach((d) => {
            if (!purchaseMap.has(d.id)) {
              purchaseMap.set(d.id, { id: d.id, ...(d.data() as Omit<PurchaseRecord, "id">) });
            }
          });
        } else {
          const snap = await getDocs(collection(db, "purchases"));
          snap.docs.forEach((d) => {
            purchaseMap.set(d.id, { id: d.id, ...(d.data() as Omit<PurchaseRecord, "id">) });
          });
        }
        return Array.from(purchaseMap.values());
      } catch {
        return [];
      }
    })(),

    // 3. Products
    (async (): Promise<ProductItem[]> => {
      try {
        const productMap = new Map<string, ProductItem>();
        if (normShop && normShop !== "ALL") {
          const [subSnap, rootSnap] = await Promise.all([
            getDocs(collection(db, "shops", normShop, "products")).catch(() => null),
            getDocs(query(collection(db, "products"), where("shopId", "==", normShop))).catch(() => null),
          ]);
          subSnap?.docs.forEach((d) => {
            productMap.set(d.id, { id: d.id, ...(d.data() as Omit<ProductItem, "id">) });
          });
          rootSnap?.docs.forEach((d) => {
            if (!productMap.has(d.id)) {
              productMap.set(d.id, { id: d.id, ...(d.data() as Omit<ProductItem, "id">) });
            }
          });
        } else {
          const rootSnap = await getDocs(collection(db, "products")).catch(() => null);
          rootSnap?.docs.forEach((pd) => {
            productMap.set(pd.id, { id: pd.id, ...(pd.data() as Omit<ProductItem, "id">) });
          });
        }
        return Array.from(productMap.values());
      } catch {
        return [];
      }
    })(),

    // 4. Customers
    (async (): Promise<CustomerRecord[]> => {
      try {
        const customerMap = new Map<string, CustomerRecord>();
        if (normShop && normShop !== "ALL") {
          const [subSnap, rootSnap] = await Promise.all([
            getDocs(collection(db, "shops", normShop, "customers")).catch(() => null),
            getDocs(query(collection(db, "customers"), where("shopId", "==", normShop))).catch(() => null),
          ]);
          subSnap?.docs.forEach((d) => {
            customerMap.set(d.id, { id: d.id, ...(d.data() as Omit<CustomerRecord, "id">) });
          });
          rootSnap?.docs.forEach((d) => {
            if (!customerMap.has(d.id)) {
              customerMap.set(d.id, { id: d.id, ...(d.data() as Omit<CustomerRecord, "id">) });
            }
          });
        } else {
          const snap = await getDocs(collection(db, "customers"));
          snap.docs.forEach((d) => {
            customerMap.set(d.id, { id: d.id, ...(d.data() as Omit<CustomerRecord, "id">) });
          });
        }
        return Array.from(customerMap.values());
      } catch {
        return [];
      }
    })(),

    // 5. Expenses (Includes Operating Expenses, Custom/Other Expenses, and Employee Salaries)
    (async (): Promise<ExpenseRecord[]> => {
      try {
        const expenseMap = new Map<string, ExpenseRecord>();
        if (normShop && normShop !== "ALL") {
          const [subSnap, rootSnap] = await Promise.all([
            getDocs(collection(db, "shops", normShop, "expenses")).catch(() => null),
            getDocs(query(collection(db, "expenses"), where("shopId", "==", normShop))).catch(() => null),
          ]);
          subSnap?.docs.forEach((d) => {
            expenseMap.set(d.id, { id: d.id, ...(d.data() as Omit<ExpenseRecord, "id">) });
          });
          rootSnap?.docs.forEach((d) => {
            if (!expenseMap.has(d.id)) {
              expenseMap.set(d.id, { id: d.id, ...(d.data() as Omit<ExpenseRecord, "id">) });
            }
          });
        } else {
          const snap = await getDocs(collection(db, "expenses"));
          snap.docs.forEach((d) => {
            expenseMap.set(d.id, { id: d.id, ...(d.data() as Omit<ExpenseRecord, "id">) });
          });
        }
        return Array.from(expenseMap.values());
      } catch {
        return [];
      }
    })(),

    // 6. Repairs (Single-pass without N+1 per-ticket subcollection waterfall)
    (async (): Promise<RepairTicket[]> => {
      try {
        const repairMap = new Map<string, RepairTicket>();
        if (normShop && normShop !== "ALL") {
          const [subSnap, rootSnap] = await Promise.all([
            getDocs(collection(db, "shops", normShop, "repairs")).catch(() => null),
            getDocs(query(collection(db, "repairs"), where("shopId", "==", normShop))).catch(() => null),
          ]);
          subSnap?.docs.forEach((d) => {
            repairMap.set(d.id, { id: d.id, ...(d.data() as Omit<RepairTicket, "id">) });
          });
          rootSnap?.docs.forEach((d) => {
            if (!repairMap.has(d.id)) {
              repairMap.set(d.id, { id: d.id, ...(d.data() as Omit<RepairTicket, "id">) });
            }
          });
        } else {
          const snap = await getDocs(collection(db, "repairs"));
          snap.docs.forEach((d) => {
            repairMap.set(d.id, { id: d.id, ...(d.data() as Omit<RepairTicket, "id">) });
          });
        }
        return Array.from(repairMap.values());
      } catch {
        return [];
      }
    })(),

    // 7. Repair Parts
    (async (): Promise<CustomRepairPart[]> => {
      try {
        const partMap = new Map<string, CustomRepairPart>();
        if (normShop && normShop !== "ALL") {
          const snap = await getDocs(collection(db, "shops", normShop, "repair_catalog_parts")).catch(() => null);
          snap?.docs.forEach((d) => {
            partMap.set(d.id, { id: d.id, ...(d.data() as Omit<CustomRepairPart, "id">) });
          });
        }
        return Array.from(partMap.values());
      } catch {
        return [];
      }
    })(),

    // 8. Installments
    (async (): Promise<InstallmentPlanRecord[]> => {
      try {
        if (normShop && normShop !== "ALL") {
          return await fetchInstallmentPlans(normShop);
        }
        return [];
      } catch {
        return [];
      }
    })(),
  ]);

  const snapshot: RawAccountingDataSnapshot = {
    sales,
    purchases,
    products,
    customers,
    expenses,
    repairs,
    repairParts,
    installments,
  };

  if (normShop) {
    accountingDataMemoryCache.set(normShop, {
      timestamp: Date.now(),
      data: snapshot,
    });
  }

  return snapshot;
}

// ─────────────────────────────────────────────────────────────
// Master Report Generation Logic (Purely Original Real Data)
// ─────────────────────────────────────────────────────────────

export function generateMasterAccountingReport(
  shopId: string,
  shopName: string,
  dateFilter: ReportDateFilter,
  data: {
    sales: SaleRecord[];
    purchases: PurchaseRecord[];
    products: ProductItem[];
    customers: CustomerRecord[];
    expenses?: ExpenseRecord[];
    repairs?: RepairTicket[];
    repairParts?: CustomRepairPart[];
    installments?: InstallmentPlanRecord[];
  }
): MasterAccountingReportsData {
  const { startStartTime: startTimeMs, endTimeMs } = {
    startStartTime: dateFilter.startTimeMs,
    endTimeMs: dateFilter.endTimeMs,
  };

  // 1. Filter Sales by date range
  const filteredSales = (data.sales || []).filter((s) => {
    const t = s.createdAt || (s as unknown as { date: number }).date || 0;
    return t >= startTimeMs && t <= endTimeMs;
  });

  // 1b. Filter Repairs by date range (createdAt or closedAt or updatedAt within period)
  const allRepairs = data.repairs || [];
  const filteredRepairs = allRepairs.filter((r) => {
    const created = r.createdAt || 0;
    const closed = r.closedAt || 0;
    return (created >= startTimeMs && created <= endTimeMs) || (closed >= startTimeMs && closed <= endTimeMs);
  });

  // 2. Filter Purchases by date range
  const filteredPurchases = (data.purchases || []).filter((p) => {
    const t = p.orderedAt || p.createdAt || 0;
    return t >= startTimeMs && t <= endTimeMs;
  });

  // 3. Filter Expenses by date range
  const allExpenses = data.expenses || [];
  const filteredExpenses = allExpenses.filter((e) => {
    const t = (e.date ? new Date(e.date).getTime() : 0) || e.createdAt || 0;
    return t >= startTimeMs && t <= endTimeMs;
  });

  // Operating Expenses from expense collection
  const validExpenses: ExpenseRecord[] = filteredExpenses.filter((e) => e.status !== "rejected" && e.status !== "cancelled");
  const validOperatingExpenses: ExpenseRecord[] = validExpenses.filter(
    (e) => e.expenseType === "OPERATING_EXPENSE" || e.expenseType === "EMPLOYEE_SALARY" || !e.expenseType
  );
  const postedExpenses: ExpenseRecord[] = validExpenses;
  const postedOperatingExpenses: ExpenseRecord[] = validOperatingExpenses;
  const postedCapitalAssets: ExpenseRecord[] = validExpenses.filter((e) => e.expenseType === "CAPITAL_ASSET");
  const postedLiabilityPayments: ExpenseRecord[] = validExpenses.filter((e) => e.expenseType === "LIABILITY_PAYMENT");
  const postedOwnerWithdrawals: ExpenseRecord[] = validExpenses.filter((e) => e.expenseType === "OWNER_WITHDRAWAL");

  // Build product lookup map for accurate COGS calculation (including workshop spare parts catalog)
  const productCostMap = new Map<string, number>();
  (data.products || []).forEach((p) => {
    const c = typeof p.costPrice === "number" ? p.costPrice : 0;
    if (p.id) productCostMap.set(p.id, c);
    if (p.sku) productCostMap.set(p.sku.toLowerCase(), c);
    if (p.barcode) productCostMap.set(p.barcode, c);
  });

  const repairPartCostMap = new Map<string, number>();
  (data.repairParts || []).forEach((rp) => {
    const c = typeof rp.costPriceLKR === "number" ? rp.costPriceLKR : 0;
    if (rp.id) repairPartCostMap.set(rp.id.toLowerCase(), c);
    if (rp.sku) repairPartCostMap.set(rp.sku.toLowerCase(), c);
    if (rp.name) repairPartCostMap.set(rp.name.toLowerCase(), c);
  });

  // ─────────────────────────────────────────────────────────
  // A0. WORKSHOP REPAIR STATEMENT & CHANNEL FINANCIALS
  // ─────────────────────────────────────────────────────────
  const repairLinkedSaleIds = new Set<string>();
  allRepairs.forEach((r) => {
    if (r.finalSaleId) repairLinkedSaleIds.add(r.finalSaleId);
  });

  let totalRepairPartsRevenue = 0;
  let totalRepairServiceRevenue = 0;
  let totalRepairDiscounts = 0;
  let totalGrossRepairRevenue = 0;
  let totalCollectedRepairRevenue = 0;
  let totalOutstandingRepairReceivables = 0;
  let totalRepairPartsCost = 0;

  // Track repair revenue/collections NOT already recorded as a POS SaleRecord in filteredSales
  let uninvoicedRepairGrossRevenue = 0;
  let uninvoicedRepairDiscounts = 0;
  let uninvoicedRepairCollectedCash = 0;
  let uninvoicedRepairCollectedCost = 0;

  let completedTicketsCount = 0;
  let activeTicketsCount = 0;
  let cancelledTicketsCount = 0;
  const repairStatusMap: Record<string, { count: number; revenue: number; cost: number; profit: number }> = {};

  const filteredSaleIdSet = new Set(filteredSales.map((s) => s.saleId));

  const repairTicketRows: RepairStatementTicketRow[] = filteredRepairs.map((ticket) => {
    const isCancelledOrDeclined =
      ticket.status === "cancelled" ||
      ticket.status === "customer_declined" ||
      ticket.status === "irreparable";
    const isCompleted = ticket.status === "collected" || ticket.status === "delivered";

    if (isCancelledOrDeclined) {
      cancelledTicketsCount++;
    } else if (isCompleted) {
      completedTicketsCount++;
    } else {
      activeTicketsCount++;
    }

    const discountAmt = Number(ticket.discountAmount || 0);
    const addlAmt = Number(ticket.additionalCharges || 0);
    // estimatedCost in RepairTicket is net of discount in POS intake; ensure payable is accurate
    const billableRev = isCancelledOrDeclined
      ? 0
      : Math.max(0, Number(ticket.estimatedCost || 0) + addlAmt);

    // Determine replacement parts selling revenue vs service/labour revenue
    let partsRev = 0;
    let serviceRev = 0;
    let partsCost = Number(ticket.internalPartsCost || 0);

    if (!isCancelledOrDeclined) {
      if (ticket.intakeLineItems && ticket.intakeLineItems.length > 0) {
        ticket.intakeLineItems.forEach((it) => {
          const lineTotal = Number(it.totalPrice || 0);
          if (it.type === "part") {
            partsRev += lineTotal;
          } else {
            serviceRev += lineTotal;
          }
          if (partsCost <= 0 && it.sku) {
            const skuKey = it.sku.toLowerCase();
            if (repairPartCostMap.has(skuKey)) {
              partsCost += repairPartCostMap.get(skuKey)! * (Number(it.quantity) || 1);
            } else if (productCostMap.has(skuKey)) {
              partsCost += productCostMap.get(skuKey)! * (Number(it.quantity) || 1);
            }
          }
        });
      }

      if (ticket.serviceChargeAmount && ticket.serviceChargeAmount > 0 && serviceRev === 0) {
        serviceRev += Number(ticket.serviceChargeAmount);
      }

      // Reconcile partsRev + serviceRev with billableRev
      const rawSplitSum = partsRev + serviceRev;
      if (rawSplitSum <= 0 && billableRev > 0) {
        serviceRev = billableRev;
      } else if (rawSplitSum > 0 && Math.abs(rawSplitSum - discountAmt - billableRev) > 0.01) {
        const diff = billableRev - Math.max(0, rawSplitSum - discountAmt);
        if (diff > 0) serviceRev += diff;
      }
    }

    const paidAmt = isCancelledOrDeclined
      ? 0
      : isCompleted && (ticket.totalPaid || 0) <= 0
      ? billableRev
      : Number(ticket.totalPaid || ticket.depositPaid || 0);
    const balDue = isCancelledOrDeclined ? 0 : Math.max(0, billableRev - paidAmt);
    const ticketProfit = isCancelledOrDeclined ? 0 : billableRev - partsCost;
    const ticketMarginPct = billableRev > 0 ? (ticketProfit / billableRev) * 100 : 0;

    if (!isCancelledOrDeclined) {
      totalRepairPartsRevenue += partsRev;
      totalRepairServiceRevenue += Math.max(0, billableRev - partsRev);
      totalRepairDiscounts += discountAmt;
      totalGrossRepairRevenue += billableRev;
      totalCollectedRepairRevenue += paidAmt;
      totalOutstandingRepairReceivables += balDue;
      totalRepairPartsCost += partsCost;

      const hasMatchingFilteredSale = Boolean(ticket.finalSaleId && filteredSaleIdSet.has(ticket.finalSaleId));
      if (!hasMatchingFilteredSale) {
        // Realized revenue from completed/delivered repairs or collected deposits not yet in POS sales
        const realizedRev = isCompleted || ticket.status === "ready_for_collection" ? billableRev : paidAmt;
        if (realizedRev > 0) {
          uninvoicedRepairGrossRevenue += realizedRev + discountAmt;
          uninvoicedRepairDiscounts += discountAmt;
        }
        if (paidAmt > 0) {
          uninvoicedRepairCollectedCash += paidAmt;
        }
        if (partsCost > 0 && (isCompleted || ticket.status === "ready_for_collection" || paidAmt > 0)) {
          uninvoicedRepairCollectedCost += partsCost;
        }
      }
    }

    const stKey = (ticket.status || "received").toUpperCase().replace(/_/g, " ");
    if (!repairStatusMap[stKey]) {
      repairStatusMap[stKey] = { count: 0, revenue: 0, cost: 0, profit: 0 };
    }
    repairStatusMap[stKey].count++;
    repairStatusMap[stKey].revenue += billableRev;
    repairStatusMap[stKey].cost += partsCost;
    repairStatusMap[stKey].profit += ticketProfit;

    const d = new Date(ticket.createdAt || Date.now());
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    return {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber || `REP-${ticket.id.slice(0, 6).toUpperCase()}`,
      date: dateFormatted,
      customerName: ticket.customerName || "Walk-in Customer",
      customerPhone: ticket.customerPhone || "-",
      device: `${ticket.brand || ""} ${ticket.model || "Device"}`.trim(),
      faultsSummary: (ticket.reportedFaults || []).join(", ") || "General Repair",
      status: stKey,
      technicianName: ticket.assignedTechnicianName || "Workshop Team",
      partsRevenue: Math.round(partsRev * 100) / 100,
      serviceRevenue: Math.round(Math.max(0, billableRev - partsRev) * 100) / 100,
      discountAmount: Math.round(discountAmt * 100) / 100,
      totalBillableRevenue: Math.round(billableRev * 100) / 100,
      partsCost: Math.round(partsCost * 100) / 100,
      grossProfit: Math.round(ticketProfit * 100) / 100,
      marginPct: Math.round(ticketMarginPct * 10) / 10,
      amountPaid: Math.round(paidAmt * 100) / 100,
      balanceDue: Math.round(balDue * 100) / 100,
      invoiceNumber: ticket.finalInvoiceNumber || ticket.intakeReceiptNumber,
    };
  });

  const netRepairProfit = totalGrossRepairRevenue - totalRepairPartsCost;
  const repairMarginPct = totalGrossRepairRevenue > 0 ? (netRepairProfit / totalGrossRepairRevenue) * 100 : 0;

  const repairStatement: RepairStatementData = {
    tickets: repairTicketRows,
    totalTicketsCount: repairTicketRows.length,
    completedTicketsCount,
    activeTicketsCount,
    cancelledTicketsCount,
    totalPartsRevenue: Math.round(totalRepairPartsRevenue * 100) / 100,
    totalServiceRevenue: Math.round(totalRepairServiceRevenue * 100) / 100,
    totalDiscounts: Math.round(totalRepairDiscounts * 100) / 100,
    totalGrossRepairRevenue: Math.round(totalGrossRepairRevenue * 100) / 100,
    totalCollectedRevenue: Math.round(totalCollectedRepairRevenue * 100) / 100,
    totalOutstandingReceivables: Math.round(totalOutstandingRepairReceivables * 100) / 100,
    totalPartsCost: Math.round(totalRepairPartsCost * 100) / 100,
    netRepairProfit: Math.round(netRepairProfit * 100) / 100,
    repairMarginPct: Math.round(repairMarginPct * 10) / 10,
    statusBreakdown: Object.entries(repairStatusMap).map(([status, val]) => ({
      status,
      count: val.count,
      revenue: Math.round(val.revenue * 100) / 100,
      cost: Math.round(val.cost * 100) / 100,
      profit: Math.round(val.profit * 100) / 100,
    })),
  };

  // ─────────────────────────────────────────────────────────
  // A. PROFIT & LOSS CALCULATIONS (Product + Repair Channels)
  // ─────────────────────────────────────────────────────────
  let grossProductSales = 0;
  let productDiscounts = 0;
  let productCogs = 0;

  let invoicedRepairSales = 0;
  let invoicedRepairDiscounts = 0;
  let invoicedRepairCogs = 0;

  let totalReturnsAndRefunds = 0;
  let totalTaxCollected = 0;

  // Map ticketId -> internalPartsCost so repair sales in `sales` get exact internal part cost even if sale item had costPrice=0
  const ticketPartsCostBySaleId = new Map<string, number>();
  allRepairs.forEach((r) => {
    if (r.finalSaleId && typeof r.internalPartsCost === "number" && r.internalPartsCost > 0) {
      ticketPartsCostBySaleId.set(r.finalSaleId, r.internalPartsCost);
    }
  });

  filteredSales.forEach((sale) => {
    if (sale.status === "voided") return;

    const disc = Number(sale.discountAmount || 0);
    const tax = Number(sale.taxAmount || 0);
    const grandTot = Number(sale.grandTotal || sale.total || 0);
    const sub = Number(sale.subtotal || 0) > 0 ? Number(sale.subtotal) : Math.max(0, grandTot + disc - tax);

    const isRepairSale =
      repairLinkedSaleIds.has(sale.saleId) ||
      Boolean(sale.notes && sale.notes.toLowerCase().includes("repair settlement for job ticket")) ||
      (Array.isArray(sale.items) &&
        sale.items.some((it) => String(it.productId || "").startsWith("prod_adhoc_rep_")));

    totalTaxCollected += tax;

    // Refund calculations
    if (sale.status === "refunded") {
      totalReturnsAndRefunds += Number(sale.grandTotal || sale.total || 0);
    } else if (sale.status === "partially_returned" && (sale as unknown as { returnedAmount?: number }).returnedAmount) {
      totalReturnsAndRefunds += Number((sale as unknown as { returnedAmount: number }).returnedAmount);
    }

    let saleCogs = 0;
    if (Array.isArray(sale.items)) {
      sale.items.forEach((it) => {
        let cost = Number(it.costPrice || 0);
        if (cost <= 0) {
          if (it.productId && productCostMap.has(it.productId)) {
            cost = productCostMap.get(it.productId)!;
          } else if (it.sku && productCostMap.has(it.sku.toLowerCase())) {
            cost = productCostMap.get(it.sku.toLowerCase())!;
          } else if (it.sku && repairPartCostMap.has(it.sku.toLowerCase())) {
            cost = repairPartCostMap.get(it.sku.toLowerCase())!;
          } else if (it.barcode && productCostMap.has(it.barcode)) {
            cost = productCostMap.get(it.barcode)!;
          }
        }
        const qty = Number(it.quantity || 1);
        saleCogs += cost * qty;
      });
    }

    if (isRepairSale) {
      invoicedRepairSales += sub;
      invoicedRepairDiscounts += disc;
      if (saleCogs <= 0 && ticketPartsCostBySaleId.has(sale.saleId)) {
        saleCogs = ticketPartsCostBySaleId.get(sale.saleId)!;
      }
      invoicedRepairCogs += saleCogs;
    } else {
      grossProductSales += sub;
      productDiscounts += disc;
      productCogs += saleCogs;
    }
  });

  // Include non-cancelled Installment Plans created within the date filter in Product Revenue & COGS
  const allInstallments = data.installments || [];
  const periodInstallments = allInstallments.filter((inst) => {
    const t = inst.createdAt || 0;
    return inst.status !== "cancelled" && t >= startTimeMs && t <= endTimeMs;
  });

  let periodInstallmentGross = 0;
  let periodInstallmentDisc = 0;
  let periodInstallmentCogs = 0;

  periodInstallments.forEach((inst) => {
    const agreedGross = Number(inst.totalAgreedPayable || 0) + Number(inst.discountAmount || 0);
    const instDisc = Number(inst.discountAmount || 0) + Number(inst.earlySettlementDiscount || 0);
    let instCost = Number(inst.product?.purchaseCostPrice || 0);
    if (instCost <= 0 && inst.product?.productId && productCostMap.has(inst.product.productId)) {
      instCost = productCostMap.get(inst.product.productId)!;
    }
    periodInstallmentGross += agreedGross;
    periodInstallmentDisc += instDisc;
    periodInstallmentCogs += instCost;

    grossProductSales += agreedGross;
    productDiscounts += instDisc;
    productCogs += instCost;
  });

  const productSalesRevenue = grossProductSales - productDiscounts - totalReturnsAndRefunds;
  const repairServiceRevenue =
    invoicedRepairSales - invoicedRepairDiscounts + (uninvoicedRepairGrossRevenue - uninvoicedRepairDiscounts);
  const repairPartsCost = Math.max(totalRepairPartsCost, invoicedRepairCogs + uninvoicedRepairCollectedCost);

  const grossSales = grossProductSales + invoicedRepairSales + uninvoicedRepairGrossRevenue;
  const totalDiscounts = productDiscounts + invoicedRepairDiscounts + uninvoicedRepairDiscounts;
  const totalCogs = productCogs + repairPartsCost;

  const netRevenue = productSalesRevenue + repairServiceRevenue;
  const grossProfit = netRevenue - totalCogs;
  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  // Operating Expenses: grouped strictly from live Firestore expenses collection (including Employee Salaries)
  const catMap: Record<string, number> = {};
  validOperatingExpenses.forEach((e) => {
    let cat = (e.categoryName || "").trim();
    const code = (e.categoryCode || "").toUpperCase();
    const lowerCat = cat.toLowerCase();
    const isSalaryItem =
      code === "SALARY" ||
      lowerCat.includes("salary") ||
      lowerCat.includes("salaries") ||
      lowerCat.includes("wage") ||
      e.expenseType === "EMPLOYEE_SALARY" ||
      Boolean(e.salaryDetails);

    if (code === "UTILITIES" || code === "INTERNET" || lowerCat.includes("utilit") || lowerCat.includes("power") || lowerCat.includes("electric") || lowerCat.includes("internet") || lowerCat.includes("water") || lowerCat.includes("phone")) {
      cat = "Utilities Expenses";
    } else if (isSalaryItem) {
      cat = "Salaries Expenses";
    } else if (code === "RENT" || lowerCat.includes("rent") || lowerCat.includes("lease")) {
      cat = "Rent Expenses";
    } else if (code === "SUPPLIES" || lowerCat.includes("suppl") || lowerCat.includes("stationery") || lowerCat.includes("packaging")) {
      cat = "Supplies Expenses";
    } else if (!cat) {
      cat = "Other Expenses";
    }

    const expAmt = Number(e.amount) || Number(e.salaryDetails?.netSalary) || 0;
    catMap[cat] = (catMap[cat] || 0) + expAmt;
  });

  // Only include categories that have real Firestore expense entries (no hardcoded 0-value mock rows)
  const operatingExpenses: { category: string; amount: number; pctOfRevenue: number }[] = Object.entries(catMap)
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => {
      const rounded = Math.round(amt * 100) / 100;
      return {
        category: cat,
        amount: rounded,
        pctOfRevenue: netRevenue > 0 ? Math.round((rounded / netRevenue) * 1000) / 10 : 0,
      };
    });

  const totalOperatingExpenses = Math.round(operatingExpenses.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const operatingIncome = grossProfit - totalOperatingExpenses;
  const depreciation = 0; // Purely 0 unless real depreciation recorded
  const taxExpense = 0; // Purely 0 unless real tax expense recorded
  const netProfit = operatingIncome - depreciation - taxExpense;
  const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  const pnl: PnLData = {
    grossSales: Math.round(grossSales * 100) / 100,
    discounts: Math.round(totalDiscounts * 100) / 100,
    returnsAndRefunds: Math.round(totalReturnsAndRefunds * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    productSalesRevenue: Math.round(productSalesRevenue * 100) / 100,
    repairServiceRevenue: Math.round(repairServiceRevenue * 100) / 100,
    productCogs: Math.round(productCogs * 100) / 100,
    repairPartsCost: Math.round(repairPartsCost * 100) / 100,
    cogs: Math.round(totalCogs * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    grossMarginPct: Math.round(grossMarginPct * 10) / 10,
    operatingExpenses,
    totalOperatingExpenses,
    operatingIncome: Math.round(operatingIncome * 100) / 100,
    depreciation,
    taxExpense,
    netProfit: Math.round(netProfit * 100) / 100,
    netMarginPct: Math.round(netMarginPct * 10) / 10,
  };

  // ─────────────────────────────────────────────────────────
  // B. INVENTORY VALUATION (Retail Catalog + Repair Spare Parts)
  // ─────────────────────────────────────────────────────────
  let totalSkus = 0;
  let totalUnits = 0;
  let totalCostValue = 0;
  let totalRetailValue = 0;
  let lowStockItemsCount = 0;
  let outOfStockItemsCount = 0;

  const inventoryRows = (data.products || []).map((p) => {
    totalSkus++;
    const qty = typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
    const unitCost = typeof p.costPrice === "number" ? p.costPrice : 0;
    const unitPrice = typeof p.sellingPrice === "number" ? p.sellingPrice : 0;
    const costVal = qty * unitCost;
    const retailVal = qty * unitPrice;
    const potentialProfit = retailVal - costVal;
    const marginPct = retailVal > 0 ? (potentialProfit / retailVal) * 100 : 0;

    totalUnits += qty;
    totalCostValue += costVal;
    totalRetailValue += retailVal;

    let health: "HEALTHY" | "LOW" | "OUT_OF_STOCK" = "HEALTHY";
    if (qty <= 0) {
      health = "OUT_OF_STOCK";
      outOfStockItemsCount++;
    } else if (qty <= (p.minStockLevel || 10)) {
      health = "LOW";
      lowStockItemsCount++;
    }

    return {
      productId: p.id,
      sku: p.sku || `SKU-${p.id.slice(0, 6).toUpperCase()}`,
      name: p.name || "Product Item",
      category: p.categoryName || "General",
      stockQty: qty,
      unitCost,
      unitPrice,
      totalCostValuation: Math.round(costVal * 100) / 100,
      totalRetailValuation: Math.round(retailVal * 100) / 100,
      potentialProfit: Math.round(potentialProfit * 100) / 100,
      marginPct: Math.round(marginPct * 10) / 10,
      stockHealth: health,
    };
  });

  // Also include stored workshop spare parts in inventory valuation
  (data.repairParts || []).forEach((rp) => {
    totalSkus++;
    const qty = typeof rp.inStockQty === "number" ? rp.inStockQty : 0;
    const unitCost = typeof rp.costPriceLKR === "number" ? rp.costPriceLKR : 0;
    const unitPrice = typeof rp.sellingPriceLKR === "number" ? rp.sellingPriceLKR : 0;
    const costVal = qty * unitCost;
    const retailVal = qty * unitPrice;
    const potentialProfit = retailVal - costVal;
    const marginPct = retailVal > 0 ? (potentialProfit / retailVal) * 100 : 0;

    totalUnits += qty;
    totalCostValue += costVal;
    totalRetailValue += retailVal;

    let health: "HEALTHY" | "LOW" | "OUT_OF_STOCK" = "HEALTHY";
    if (qty <= 0) {
      health = "OUT_OF_STOCK";
      outOfStockItemsCount++;
    } else if (qty <= 5) {
      health = "LOW";
      lowStockItemsCount++;
    }

    inventoryRows.push({
      productId: rp.id,
      sku: rp.sku || `PRT-${rp.id.slice(-4).toUpperCase()}`,
      name: `[Spare Part] ${rp.name || "Repair Component"}`,
      category: `Workshop Parts (${rp.category || "Hardware"})`,
      stockQty: qty,
      unitCost,
      unitPrice,
      totalCostValuation: Math.round(costVal * 100) / 100,
      totalRetailValuation: Math.round(retailVal * 100) / 100,
      potentialProfit: Math.round(potentialProfit * 100) / 100,
      marginPct: Math.round(marginPct * 10) / 10,
      stockHealth: health,
    });
  });

  const potentialTotalProfit = totalRetailValue - totalCostValue;
  const overallMarginPct = totalRetailValue > 0 ? (potentialTotalProfit / totalRetailValue) * 100 : 0;

  const inventoryValuation: InventoryValuationData = {
    items: inventoryRows,
    totalSkus,
    totalUnits,
    totalCostValue: Math.round(totalCostValue * 100) / 100,
    totalRetailValue: Math.round(totalRetailValue * 100) / 100,
    potentialTotalProfit: Math.round(potentialTotalProfit * 100) / 100,
    overallMarginPct: Math.round(overallMarginPct * 10) / 10,
    lowStockItemsCount,
    outOfStockItemsCount,
  };

  // ─────────────────────────────────────────────────────────
  // C. PURCHASES & AP AGING (Original Real Purchase Orders)
  // ─────────────────────────────────────────────────────────
  let totalPurchasesCount = 0;
  let totalPurchasedValue = 0;
  let totalAmountPaid = 0;
  let totalOutstandingPayable = 0;
  let totalTaxPaid = 0;

  const statusMap: Record<string, { count: number; amount: number }> = {};
  const apCreditors: APAgingData["creditors"] = [];

  const purchaseRows = filteredPurchases.map((po) => {
    totalPurchasesCount++;
    const tot = Number(po.totalAmount || 0);
    const paid = Number(po.amountPaid || 0);
    const bal = Math.max(0, tot - paid);
    const tax = Number(po.taxAmount || 0);

    totalPurchasedValue += tot;
    totalAmountPaid += paid;
    totalOutstandingPayable += bal;
    totalTaxPaid += tax;

    const st = po.paymentStatus || "UNPAID";
    if (!statusMap[st]) statusMap[st] = { count: 0, amount: 0 };
    statusMap[st].count++;
    statusMap[st].amount += tot;

    const d = new Date(po.orderedAt || po.createdAt || Date.now());
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dueDateFormatted = po.expectedDeliveryDate
      ? `${new Date(po.expectedDeliveryDate).getFullYear()}-${String(new Date(po.expectedDeliveryDate).getMonth() + 1).padStart(2, "0")}-${String(new Date(po.expectedDeliveryDate).getDate()).padStart(2, "0")}`
      : dateFormatted;

    // AP Aging calculation if balance due exists
    if (bal > 0) {
      const ageDays = Math.floor((Date.now() - d.getTime()) / 86400000);
      let c0 = 0, c31 = 0, c61 = 0, c90 = 0;
      if (ageDays <= 30) c0 = bal;
      else if (ageDays <= 60) c31 = bal;
      else if (ageDays <= 90) c61 = bal;
      else c90 = bal;

      apCreditors.push({
        purchaseId: po.id,
        supplierName: po.supplierName || "Trade Supplier",
        purchaseOrderNumber: po.purchaseOrderNumber || `PO-${po.id.slice(0, 8)}`,
        supplierInvoiceNumber: po.supplierInvoiceNumber || "-",
        date: dateFormatted,
        dueDate: dueDateFormatted,
        totalAmount: tot,
        amountPaid: paid,
        balanceDue: bal,
        current0to30: c0,
        days31to60: c31,
        days61to90: c61,
        over90Days: c90,
        paymentStatus: st,
      });
    }

    return {
      purchaseOrderNumber: po.purchaseOrderNumber || `PO-${po.id.slice(0, 8)}`,
      supplierInvoiceNumber: po.supplierInvoiceNumber || "-",
      supplierName: po.supplierName || "Trade Supplier",
      date: dateFormatted,
      purchaseStatus: po.purchaseStatus || "RECEIVED",
      paymentStatus: st,
      totalItems: po.totalReceivedQuantity || po.items?.length || 0,
      subtotal: Number(po.subtotalAmount || 0),
      taxAmount: tax,
      shippingCost: Number(po.shippingCost || 0),
      totalAmount: tot,
      amountPaid: paid,
      balanceDue: bal,
    };
  });

  const purchaseStatement: PurchaseStatementData = {
    orders: purchaseRows,
    totalPurchasesCount,
    totalPurchasedValue: Math.round(totalPurchasedValue * 100) / 100,
    totalAmountPaid: Math.round(totalAmountPaid * 100) / 100,
    totalOutstandingPayable: Math.round(totalOutstandingPayable * 100) / 100,
    totalTaxPaid: Math.round(totalTaxPaid * 100) / 100,
    statusBreakdown: Object.entries(statusMap).map(([status, val]) => ({
      status,
      count: val.count,
      amount: Math.round(val.amount * 100) / 100,
    })),
  };

  const apTotal0to30 = apCreditors.reduce((s, c) => s + c.current0to30, 0);
  const apTotal31to60 = apCreditors.reduce((s, c) => s + c.days31to60, 0);
  const apTotal61to90 = apCreditors.reduce((s, c) => s + c.days61to90, 0);
  const apTotalOver90 = apCreditors.reduce((s, c) => s + c.over90Days, 0);

  const accountsPayable: APAgingData = {
    creditors: apCreditors,
    totalPayables: Math.round(totalOutstandingPayable * 100) / 100,
    totalCurrent0to30: Math.round(apTotal0to30 * 100) / 100,
    totalDays31to60: Math.round(apTotal31to60 * 100) / 100,
    totalDays61to90: Math.round(apTotal61to90 * 100) / 100,
    totalOver90Days: Math.round(apTotalOver90 * 100) / 100,
    totalCreditorsCount: apCreditors.length,
  };

  // ─────────────────────────────────────────────────────────
  // D. ACCOUNTS RECEIVABLE (Original Real Customer Balances)
  // ─────────────────────────────────────────────────────────
  const arDebtors: ARAgingData["debtors"] = [];
  let arTotalReceivables = 0;
  let arCustomerCreditReceivables = 0;
  let arRepairReceivables = 0;
  let arInstallmentReceivables = 0;
  let arTotal0to30 = 0;
  let arTotal31to60 = 0;
  let arTotal61to90 = 0;
  let arTotalOver90 = 0;

  (data.customers || []).forEach((cust) => {
    const spend = Number(cust.totalSpend || (cust as unknown as { totalSpent?: number }).totalSpent || 0);
    // Strictly read actual recorded credit balance (no mock percentages or estimations)
    const outstanding = Number((cust as unknown as { creditBalance?: number }).creditBalance || 0);

    if (outstanding > 0) {
      arTotalReceivables += outstanding;
      arCustomerCreditReceivables += outstanding;
      const c0 = outstanding;
      const c31 = 0;
      const c61 = 0;
      const c90 = 0;

      arTotal0to30 += c0;

      arDebtors.push({
        customerId: cust.id,
        name: cust.name || "Customer",
        phone: cust.phone || "-",
        lifetimeSpend: spend,
        totalOutstanding: outstanding,
        current0to30: c0,
        days31to60: c31,
        days61to90: c61,
        over90Days: c90,
        lastPurchaseDate: dateFilter.endDate,
        status: "GOOD",
      });
    }
  });

  // Include unpaid balances on active/ready/completed repair tickets in Accounts Receivable
  filteredRepairs.forEach((ticket) => {
    if (
      ticket.status === "cancelled" ||
      ticket.status === "customer_declined" ||
      ticket.status === "irreparable"
    ) {
      return;
    }
    const billable = Math.max(0, Number(ticket.estimatedCost || 0) + Number(ticket.additionalCharges || 0));
    const paid =
      (ticket.status === "collected" || ticket.status === "delivered") && (ticket.totalPaid || 0) <= 0
        ? billable
        : Number(ticket.totalPaid || ticket.depositPaid || 0);
    const bal = Math.max(0, billable - paid);
    if (bal > 0) {
      arTotalReceivables += bal;
      arRepairReceivables += bal;
      const ageDays = Math.floor((Date.now() - (ticket.createdAt || Date.now())) / 86400000);
      let c0 = 0, c31 = 0, c61 = 0, c90 = 0;
      if (ageDays <= 30) {
        c0 = bal;
        arTotal0to30 += bal;
      } else if (ageDays <= 60) {
        c31 = bal;
        arTotal31to60 += bal;
      } else if (ageDays <= 90) {
        c61 = bal;
        arTotal61to90 += bal;
      } else {
        c90 = bal;
        arTotalOver90 += bal;
      }

      const d = new Date(ticket.createdAt || Date.now());
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      arDebtors.push({
        customerId: ticket.customerId || ticket.id,
        name: `${ticket.customerName || "Customer"} (Repair #${ticket.ticketNumber})`,
        phone: ticket.customerPhone || "-",
        lifetimeSpend: billable,
        totalOutstanding: Math.round(bal * 100) / 100,
        current0to30: Math.round(c0 * 100) / 100,
        days31to60: Math.round(c31 * 100) / 100,
        days61to90: Math.round(c61 * 100) / 100,
        over90Days: Math.round(c90 * 100) / 100,
        lastPurchaseDate: dateStr,
        status: ageDays > 30 ? "DUE" : "GOOD",
      });
    }
  });

  // Include active/overdue Installment Agreements with remaining balance in Accounts Receivable
  allInstallments.forEach((inst) => {
    if (inst.status === "cancelled" || inst.status === "completed" || inst.status === "early_settled") {
      return;
    }
    const bal = Math.max(0, Number(inst.remainingBalance || 0));
    if (bal <= 0) return;

    arTotalReceivables += bal;
    arInstallmentReceivables += bal;
    const overdueAmt = Math.max(0, Number(inst.overdueAmount || 0));
    const currentAmt = Math.max(0, bal - overdueAmt);
    const c0 = currentAmt;
    const c31 = overdueAmt;
    arTotal0to30 += c0;
    arTotal31to60 += c31;

    arDebtors.push({
      customerId: inst.customer.customerId || inst.id,
      name: `${inst.customer.fullName} (Installment ${inst.agreementNumber})`,
      phone: inst.customer.mobileNumber || "-",
      lifetimeSpend: Number(inst.totalAgreedPayable || 0),
      totalOutstanding: Math.round(bal * 100) / 100,
      current0to30: Math.round(c0 * 100) / 100,
      days31to60: Math.round(c31 * 100) / 100,
      days61to90: 0,
      over90Days: 0,
      lastPurchaseDate: inst.startDate,
      status: overdueAmt > 0 ? "OVERDUE" : "GOOD",
    });
  });

  const accountsReceivable: ARAgingData = {
    debtors: arDebtors,
    totalReceivables: Math.round(arTotalReceivables * 100) / 100,
    totalCurrent0to30: Math.round(arTotal0to30 * 100) / 100,
    totalDays31to60: Math.round(arTotal31to60 * 100) / 100,
    totalDays61to90: Math.round(arTotal61to90 * 100) / 100,
    totalOver90Days: Math.round(arTotalOver90 * 100) / 100,
    totalActiveDebtors: arDebtors.length,
  };

  // ─────────────────────────────────────────────────────────
  // E. SALES STATEMENT & TENDER BREAKDOWN (Original Real Sales)
  // ─────────────────────────────────────────────────────────
  const tenderCounts: Record<string, { count: number; total: number }> = {};
  const salesInvoices: SalesStatementInvoiceRow[] = filteredSales.map((s) => {
    const d = new Date(s.createdAt || Date.now());
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const pm = (s.paymentMethod || "cash").toLowerCase();
    const gTot = Number(s.grandTotal || s.total || 0);

    if (!tenderCounts[pm]) tenderCounts[pm] = { count: 0, total: 0 };
    tenderCounts[pm].count++;
    tenderCounts[pm].total += gTot;

    return {
      invoiceNumber: s.invoiceNumber || `INV-${s.saleId.slice(0, 8)}`,
      date: dateFormatted,
      customerName: s.customer?.name || "Walk-in Guest",
      cashierName: s.cashierName || "Staff Cashier",
      paymentMethod: pm.toUpperCase(),
      itemCount: s.itemCount || (s.items ? s.items.reduce((acc, it) => acc + (it.quantity || 1), 0) : 1),
      subtotal: Number(s.subtotal || 0),
      discount: Number(s.discountAmount || 0),
      taxAmount: Number(s.taxAmount || 0),
      grandTotal: gTot,
      status: (s.status || "completed").toUpperCase(),
    };
  });

  // Include repair deposits/collections for tickets not already represented in filteredSales
  if (uninvoicedRepairCollectedCash > 0) {
    if (!tenderCounts["cash"]) tenderCounts["cash"] = { count: 0, total: 0 };
    tenderCounts["cash"].count += 1;
    tenderCounts["cash"].total += uninvoicedRepairCollectedCash;
  }

  // Include actual collected Down Payments & Monthly Installment Payments within the period in Tender Breakdown & Cash Flow
  let periodInstallmentCashCollected = 0;
  let periodInstallmentBankCollected = 0;
  allInstallments.forEach((inst) => {
    if (inst.status === "cancelled") return;
    (inst.payments || []).forEach((pay) => {
      const paidAt = pay.paidAt || 0;
      if (paidAt >= startTimeMs && paidAt <= endTimeMs) {
        const rawMethod = (pay.paymentMethod || "cash").toLowerCase();
        const methodKey =
          rawMethod === "bank_transfer"
            ? "bank-transfer"
            : rawMethod === "mobile_qr"
            ? "mobile-qr"
            : rawMethod;
        const payAmt = Number(pay.amount || 0);
        if (!tenderCounts[methodKey]) tenderCounts[methodKey] = { count: 0, total: 0 };
        tenderCounts[methodKey].count += 1;
        tenderCounts[methodKey].total += payAmt;
        if (methodKey === "cash") {
          periodInstallmentCashCollected += payAmt;
        } else {
          periodInstallmentBankCollected += payAmt;
        }
      }
    });
  });

  const paymentBreakdown = Object.entries(tenderCounts).map(([method, val]) => ({
    method: method.toUpperCase(),
    count: val.count,
    total: Math.round(val.total * 100) / 100,
    percentage: netRevenue > 0 ? Math.round((val.total / netRevenue) * 1000) / 10 : 0,
  }));

  const salesStatement: SalesStatementData = {
    invoices: salesInvoices,
    totalInvoices: salesInvoices.length,
    totalGrossSales: Math.round(grossSales * 100) / 100,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    totalTaxCollected: Math.round(totalTaxCollected * 100) / 100,
    totalNetSales: Math.round(netRevenue * 100) / 100,
    avgOrderValue: salesInvoices.length > 0 ? Math.round((netRevenue / salesInvoices.length) * 100) / 100 : 0,
    paymentMethodBreakdown: paymentBreakdown,
  };

  // ─────────────────────────────────────────────────────────
  // F. EXPENSE STATEMENT (Original Real Expenses - No Mock Fallbacks)
  // ─────────────────────────────────────────────────────────
  const expenseRows: ExpenseStatementRow[] = filteredExpenses.map((e) => ({
    expenseId: e.id,
    date: e.date,
    category: e.categoryName || "General Expense",
    description: e.description || "-",
    vendor: e.vendor || "-",
    paymentMethod: (e.paymentMethod || "cash").toUpperCase(),
    amount: e.amount || 0,
    isTaxDeductible: !!e.isTaxDeductible,
    recordedBy: e.recordedBy?.displayName || e.recordedBy?.username || "Staff",
  }));

  const totalStatementExpenses = Math.round(expenseRows.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const totalTaxDeductible = Math.round(
    expenseRows.filter((e) => e.isTaxDeductible).reduce((sum, e) => sum + e.amount, 0) * 100
  ) / 100;

  const categorySummaryMap: Record<string, { count: number; amount: number }> = {};
  expenseRows.forEach((e) => {
    if (!categorySummaryMap[e.category]) categorySummaryMap[e.category] = { count: 0, amount: 0 };
    categorySummaryMap[e.category].count++;
    categorySummaryMap[e.category].amount += e.amount;
  });

  const expenseCategorySummary = Object.entries(categorySummaryMap).map(([category, val]) => ({
    category,
    count: val.count,
    amount: Math.round(val.amount * 100) / 100,
    percentage: totalStatementExpenses > 0 ? Math.round((val.amount / totalStatementExpenses) * 1000) / 10 : 0,
  }));

  const expenseStatement: ExpenseStatementData = {
    expenses: expenseRows,
    totalExpenses: totalStatementExpenses,
    totalTaxDeductible,
    categorySummary: expenseCategorySummary,
  };

  // ─────────────────────────────────────────────────────────
  // G. BANK & CASH RECONCILIATION (Derived from Actual Tenders)
  // ─────────────────────────────────────────────────────────
  const cashSalesTotal = tenderCounts["cash"] ? tenderCounts["cash"].total : 0;
  const cardSalesTotal = tenderCounts["card"] ? tenderCounts["card"].total : 0;
  const qrSalesTotal = tenderCounts["mobile-qr"] ? tenderCounts["mobile-qr"].total : 0;
  const bankTransferSalesTotal = tenderCounts["bank-transfer"] ? tenderCounts["bank-transfer"].total : 0;

  const liveCashExpenses = postedExpenses
    .filter((e) => (e.paymentMethod || "").toLowerCase() === "cash")
    .reduce((s, e) => s + (e.amountPaid || e.amount || 0), 0);
  const cashPayouts = liveCashExpenses;
  const expectedCashInTill = Math.max(0, cashSalesTotal - totalReturnsAndRefunds - cashPayouts);
  const actualCashInTill = expectedCashInTill;
  const cashVariance = 0;

  // Real shift sessions built directly from cashiers in filteredSales
  const reconciliationSessions: BankCashReconciliationData["sessions"] = [];
  const cashierSalesMap = new Map<string, { cashierName: string; cashTotal: number; cardTotal: number; qrTotal: number; transferTotal: number }>();
  filteredSales.forEach((s) => {
    const cid = s.cashierId || s.cashierName || "Register-01";
    const cname = s.cashierName || "Cashier Staff";
    const pm = (s.paymentMethod || "cash").toLowerCase();
    const tot = Number(s.grandTotal || s.total || 0);

    if (!cashierSalesMap.has(cid)) {
      cashierSalesMap.set(cid, { cashierName: cname, cashTotal: 0, cardTotal: 0, qrTotal: 0, transferTotal: 0 });
    }
    const entry = cashierSalesMap.get(cid)!;
    if (pm === "cash") entry.cashTotal += tot;
    else if (pm === "card") entry.cardTotal += tot;
    else if (pm === "mobile-qr") entry.qrTotal += tot;
    else if (pm === "bank-transfer") entry.transferTotal += tot;
  });

  if (cashierSalesMap.size > 0) {
    let sessIdx = 1;
    cashierSalesMap.forEach((entry, cid) => {
      reconciliationSessions.push({
        sessionId: `SESS-${dateFilter.endDate.replace(/-/g, "")}-${String(sessIdx++).padStart(2, "0")}`,
        date: dateFilter.endDate,
        registerId: cid,
        cashierName: entry.cashierName,
        openingFloat: 0,
        cashSales: Math.round(entry.cashTotal * 100) / 100,
        cashRefunds: 0,
        cashPayouts: 0,
        expectedCash: Math.round(entry.cashTotal * 100) / 100,
        actualCash: Math.round(entry.cashTotal * 100) / 100,
        variance: 0,
        cardSettlement: Math.round(entry.cardTotal * 100) / 100,
        bankTransferSettlement: Math.round(entry.transferTotal * 100) / 100,
        qrSettlement: Math.round(entry.qrTotal * 100) / 100,
        status: "BALANCED",
      });
    });
  }

  const bankCashReconciliation: BankCashReconciliationData = {
    sessions: reconciliationSessions,
    totalExpectedCash: Math.round(expectedCashInTill * 100) / 100,
    totalActualCash: Math.round(actualCashInTill * 100) / 100,
    totalCashVariance: Math.round(cashVariance * 100) / 100,
    totalDigitalSettlements: Math.round((cardSalesTotal + qrSalesTotal + bankTransferSalesTotal) * 100) / 100,
    balancedSessionsCount: reconciliationSessions.length,
    discrepantSessionsCount: 0,
  };

  // ─────────────────────────────────────────────────────────
  // H. SST TAX STATEMENT (Pure Original Firestore Data)
  // ─────────────────────────────────────────────────────────
  // Purely actual tax collected from sales invoices and actual tax paid on supplier purchases
  const sstOutputTax = Math.round(totalTaxCollected * 100) / 100;
  const sstInputTax = Math.round(totalTaxPaid * 100) / 100;
  const netSSTPayable = Math.round((sstOutputTax - sstInputTax) * 100) / 100;

  // Real taxable sales: sum of subtotal for sales where tax applies
  let realTaxableSales = 0;
  filteredSales.forEach((s) => {
    if (s.status === "voided") return;
    const tax = Number(s.taxAmount || 0);
    if (tax > 0) {
      const tot = Number(s.grandTotal || s.total || 0);
      realTaxableSales += Math.max(0, tot - tax);
    }
  });

  const taxableSalesAmount = Math.round(realTaxableSales * 100) / 100;
  const taxExemptSalesAmount = Math.round(Math.max(0, netRevenue - taxableSalesAmount) * 100) / 100;
  const effectiveTaxRatePct = taxableSalesAmount > 0
    ? Math.round((sstOutputTax / taxableSalesAmount) * 1000) / 10
    : 0;

  const taxTransactions: SSTTaxTransactionRow[] = [];

  // Itemize all sales from the period with their actual tax
  filteredSales.forEach((s) => {
    if (s.status === "voided") return;
    const tot = Number(s.grandTotal || s.total || 0);
    const tax = Number(s.taxAmount || 0);
    const taxableBase = tax > 0 ? Math.max(0, tot - tax) : tot;
    taxTransactions.push({
      referenceNumber: s.invoiceNumber || `INV-${s.saleId.slice(0, 8)}`,
      date: new Date(s.createdAt || Date.now()).toISOString().split("T")[0],
      type: "OUTPUT_TAX",
      counterparty: s.customer?.name || "Retail Walk-in Customer",
      taxRatePct: tax > 0 && taxableBase > 0 ? Math.round((tax / taxableBase) * 1000) / 10 : 0,
      taxableAmount: Math.round(taxableBase * 100) / 100,
      taxAmount: Math.round(tax * 100) / 100,
      status: tax > 0 ? "REMITTED" : "EXEMPT",
    });
  });

  // Itemize all purchases from the period with their actual tax
  filteredPurchases.forEach((po) => {
    const tot = Number(po.totalAmount || 0);
    const tax = Number(po.taxAmount || 0);
    const taxableBase = tax > 0 ? Math.max(0, tot - tax) : tot;
    taxTransactions.push({
      referenceNumber: po.purchaseOrderNumber || `PO-${po.id.slice(0, 8)}`,
      date: new Date(po.orderedAt || po.createdAt || Date.now()).toISOString().split("T")[0],
      type: "INPUT_TAX",
      counterparty: po.supplierName || "Trade Supplier",
      taxRatePct: tax > 0 && taxableBase > 0 ? Math.round((tax / taxableBase) * 1000) / 10 : 0,
      taxableAmount: Math.round(taxableBase * 100) / 100,
      taxAmount: Math.round(tax * 100) / 100,
      status: tax > 0 ? "CLAIMABLE" : "NON_TAXABLE",
    });
  });

  const taxStatement: SSTTaxStatementData = {
    taxPeriodLabel: dateFilter.label,
    sstOutputTax,
    sstInputTax,
    netSSTPayable,
    taxableSalesAmount,
    taxExemptSalesAmount,
    effectiveTaxRatePct,
    transactions: taxTransactions,
  };

  // ─────────────────────────────────────────────────────────
  // I, J, K. DOUBLE-ENTRY GENERAL LEDGER, BALANCE SHEET,
  //          CASH FLOW STATEMENT & TRIAL BALANCE ENGINE (CPA Standard)
  // ─────────────────────────────────────────────────────────
  const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

  type GLAccountCategory = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  interface GLAccountEntry {
    code: string;
    name: string;
    category: GLAccountCategory;
    normalBalance: "DEBIT" | "CREDIT";
    openDr: number;
    openCr: number;
    periodDr: number;
    periodCr: number;
  }

  const chartOfAccounts: GLAccountEntry[] = [
    { code: "1010", name: "Cash on Hand (POS Drawer & Till Float)", category: "ASSET", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "1020", name: "Bank Operating Accounts (Card, QR & Wire)", category: "ASSET", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "1030", name: "Accounts Receivable (Trade & Repair Debtors)", category: "ASSET", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "1035", name: "Installment Contracts Receivable", category: "ASSET", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "1040", name: "Merchandise & Spare Parts Inventory (at Cost)", category: "ASSET", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "1050", name: "SST Input Tax Claimable (Tax Credit)", category: "ASSET", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "1510", name: "Store Equipment, Fixtures & Capital Assets", category: "ASSET", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "2010", name: "Accounts Payable (Trade Supplier Creditors)", category: "LIABILITY", normalBalance: "CREDIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "2020", name: "SST / Output Sales Tax Payable", category: "LIABILITY", normalBalance: "CREDIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "2030", name: "Accrued Operating Expenses & Bills Payable", category: "LIABILITY", normalBalance: "CREDIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "3005", name: "Owner's Capital & Seed Inventory Equity", category: "EQUITY", normalBalance: "CREDIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "3010", name: "Retained Earnings (Prior Periods Accumulated)", category: "EQUITY", normalBalance: "CREDIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "3030", name: "Owner's Drawings & Capital Distributions", category: "EQUITY", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "4010", name: "Product & Installment Sales Revenue (Gross)", category: "REVENUE", normalBalance: "CREDIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "4015", name: "Workshop Repair & Service Revenue (Gross)", category: "REVENUE", normalBalance: "CREDIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "4020", name: "Sales Returns & Refunds Allowed", category: "REVENUE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "4030", name: "Sales & Repair Discounts Allowed", category: "REVENUE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "5010", name: "Cost of Goods Sold — Merchandise (COGS)", category: "EXPENSE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "5020", name: "Cost of Workshop Repair Parts & Components", category: "EXPENSE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "6010", name: "Utilities, Electricity & Internet Expenses", category: "EXPENSE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "6020", name: "Employee Salaries & Wages Expenses", category: "EXPENSE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "6030", name: "Store Rent & Leasehold Expenses", category: "EXPENSE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "6040", name: "Store Supplies & Packaging Expenses", category: "EXPENSE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
    { code: "6050", name: "General & Administrative Operating Expenses", category: "EXPENSE", normalBalance: "DEBIT", openDr: 0, openCr: 0, periodDr: 0, periodCr: 0 },
  ];

  const glMap = new Map<string, GLAccountEntry>();
  chartOfAccounts.forEach((acct) => glMap.set(acct.code, acct));

  const postJournal = (stage: "OPEN" | "PERIOD", drCode: string, crCode: string, rawAmount: number) => {
    const amt = r2(rawAmount);
    if (amt <= 0) return;
    const dr = glMap.get(drCode);
    const cr = glMap.get(crCode);
    if (!dr || !cr) return;
    if (stage === "OPEN") {
      dr.openDr = r2(dr.openDr + amt);
      cr.openCr = r2(cr.openCr + amt);
    } else {
      dr.periodDr = r2(dr.periodDr + amt);
      cr.periodCr = r2(cr.periodCr + amt);
    }
  };

  const getOpenNetDr = (code: string) => {
    const a = glMap.get(code)!;
    return r2(a.openDr - a.openCr);
  };

  const getClosingNetDr = (code: string) => {
    const a = glMap.get(code)!;
    return r2(a.openDr + a.periodDr - (a.openCr + a.periodCr));
  };

  // ── 1. POST PRIOR-PERIOD TRANSACTIONS (t < startTimeMs) INTO OPENING LEDGER ──
  const priorSales = (data.sales || []).filter((s) => {
    const t = s.createdAt || (s as unknown as { date: number }).date || 0;
    return t > 0 && t < startTimeMs && s.status !== "voided";
  });

  const priorSaleIds = new Set(priorSales.map((s) => s.saleId));

  priorSales.forEach((sale) => {
    const tot = r2(Number(sale.grandTotal || sale.total || 0));
    const tax = r2(Math.max(0, Number(sale.taxAmount || 0)));
    const netRevExTax = r2(Math.max(0, tot - tax));
    const pm = (sale.paymentMethod || "cash").toLowerCase();
    const cashAcct = pm === "cash" ? "1010" : "1020";

    postJournal("OPEN", cashAcct, "3010", netRevExTax);
    postJournal("OPEN", cashAcct, "2020", tax);

    if (sale.status === "refunded") {
      postJournal("OPEN", "3010", cashAcct, tot);
    } else if (sale.status === "partially_returned" && (sale as unknown as { returnedAmount?: number }).returnedAmount) {
      postJournal("OPEN", "3010", cashAcct, r2(Number((sale as unknown as { returnedAmount: number }).returnedAmount)));
    }

    let priorSaleCogs = 0;
    if (Array.isArray(sale.items)) {
      sale.items.forEach((it) => {
        let cost = Number(it.costPrice || 0);
        if (cost <= 0) {
          if (it.productId && productCostMap.has(it.productId)) cost = productCostMap.get(it.productId)!;
          else if (it.sku && productCostMap.has(it.sku.toLowerCase())) cost = productCostMap.get(it.sku.toLowerCase())!;
          else if (it.sku && repairPartCostMap.has(it.sku.toLowerCase())) cost = repairPartCostMap.get(it.sku.toLowerCase())!;
          else if (it.barcode && productCostMap.has(it.barcode)) cost = productCostMap.get(it.barcode)!;
        }
        priorSaleCogs += cost * Number(it.quantity || 1);
      });
    }
    if (priorSaleCogs <= 0 && ticketPartsCostBySaleId.has(sale.saleId)) {
      priorSaleCogs = ticketPartsCostBySaleId.get(sale.saleId)!;
    }
    postJournal("OPEN", "3010", "1040", priorSaleCogs);
  });

  // Prior repairs not already in priorSales or filteredRepairs
  allRepairs.forEach((ticket) => {
    const created = ticket.createdAt || 0;
    const closed = ticket.closedAt || 0;
    const isInPeriod = (created >= startTimeMs && created <= endTimeMs) || (closed >= startTimeMs && closed <= endTimeMs);
    if (isInPeriod || created <= 0 || created >= startTimeMs) return;
    if (ticket.status === "cancelled" || ticket.status === "customer_declined" || ticket.status === "irreparable") return;
    if (ticket.finalSaleId && priorSaleIds.has(ticket.finalSaleId)) return;

    const isCompleted = ticket.status === "collected" || ticket.status === "delivered";
    const billable = Math.max(0, Number(ticket.estimatedCost || 0) + Number(ticket.additionalCharges || 0));
    const paid = isCompleted && (ticket.totalPaid || 0) <= 0 ? billable : Number(ticket.totalPaid || ticket.depositPaid || 0);
    const partsCost = Number(ticket.internalPartsCost || 0);

    postJournal("OPEN", "1010", "3010", paid);
    postJournal("OPEN", "3010", "1040", partsCost);
  });

  // Prior Installment Originations & Prior Installment Payments
  allInstallments.forEach((inst) => {
    if (inst.status === "cancelled") return;
    const created = inst.createdAt || 0;
    if (created > 0 && created < startTimeMs) {
      const agreedPayable = r2(Number(inst.totalAgreedPayable || 0));
      let instCost = Number(inst.product?.purchaseCostPrice || 0);
      if (instCost <= 0 && inst.product?.productId && productCostMap.has(inst.product.productId)) {
        instCost = productCostMap.get(inst.product.productId)!;
      }
      postJournal("OPEN", "1035", "3010", agreedPayable);
      postJournal("OPEN", "3010", "1040", instCost);
    }
    (inst.payments || []).forEach((pay) => {
      const paidAt = pay.paidAt || 0;
      if (paidAt > 0 && paidAt < startTimeMs) {
        const rawMethod = (pay.paymentMethod || "cash").toLowerCase();
        const payAcct = rawMethod === "cash" ? "1010" : "1020";
        postJournal("OPEN", payAcct, "1035", Number(pay.amount || 0));
      }
    });
  });

  // Prior Supplier Purchase Orders
  const priorPurchases = (data.purchases || []).filter((p) => {
    const t = p.orderedAt || p.createdAt || 0;
    return t > 0 && t < startTimeMs;
  });
  priorPurchases.forEach((po) => {
    const tot = r2(Number(po.totalAmount || 0));
    const paid = r2(Math.min(tot, Number(po.amountPaid || 0)));
    const tax = r2(Math.min(tot, Number(po.taxAmount || 0)));
    const invNet = r2(Math.max(0, tot - tax));
    postJournal("OPEN", "1040", "2010", invNet);
    postJournal("OPEN", "1050", "2010", tax);
    postJournal("OPEN", "2010", "1020", paid);
  });

  // Prior Expenses
  const priorExpenses = allExpenses.filter((e) => {
    const t = (e.date ? new Date(e.date).getTime() : 0) || e.createdAt || 0;
    return t > 0 && t < startTimeMs && e.status !== "rejected" && e.status !== "cancelled";
  });
  priorExpenses.forEach((e) => {
    const amt = r2(Number(e.amount || 0));
    const unpaid = r2(Math.max(0, Number(e.balanceDue || 0)));
    const paid = r2(Math.max(0, amt - unpaid));
    const payAcct = (e.paymentMethod || "").toLowerCase() === "cash" ? "1010" : "1020";
    let drCode = "3010";
    if (e.expenseType === "CAPITAL_ASSET") drCode = "1510";
    else if (e.expenseType === "LIABILITY_PAYMENT") drCode = "2010";
    else if (e.expenseType === "OWNER_WITHDRAWAL") drCode = "3030";

    postJournal("OPEN", drCode, "2030", amt);
    postJournal("OPEN", "2030", payAcct, paid);
  });

  // Offset any prior SST Input Tax against prior SST Output Tax
  const priorSstOffset = r2(Math.min(Math.max(0, getOpenNetDr("1050")), Math.max(0, -getOpenNetDr("2020"))));
  if (priorSstOffset > 0) {
    postJournal("OPEN", "2020", "1050", priorSstOffset);
  }

  // ── 2. POST CURRENT-PERIOD TRANSACTIONS (startTimeMs <= t <= endTimeMs) ──
  const rGrossProductSales = r2(grossProductSales);
  const rGrossRepairSales = r2(invoicedRepairSales + uninvoicedRepairGrossRevenue);
  const rReturns = r2(totalReturnsAndRefunds);
  const rDiscounts = r2(totalDiscounts);
  const rOutputTax = r2(sstOutputTax);

  // Revenue, Contra-Revenue & Output Tax legs via Receivable Control (1030)
  postJournal("PERIOD", "1030", "4010", rGrossProductSales);
  postJournal("PERIOD", "1030", "4015", rGrossRepairSales);
  postJournal("PERIOD", "4030", "1030", rDiscounts);
  postJournal("PERIOD", "1030", "2020", rOutputTax);
  postJournal("PERIOD", "4020", "1010", rReturns);

  // Transfer newly originated Installment Sales Principal to 1035 (Installment Contracts Receivable)
  const rNewInstallmentNet = r2(Math.max(0, periodInstallmentGross - periodInstallmentDisc));
  postJournal("PERIOD", "1035", "1030", rNewInstallmentNet);

  // Cash & Digital Collections in Period
  const rInstCash = r2(periodInstallmentCashCollected);
  const rInstBank = r2(periodInstallmentBankCollected);
  const rPosAndRepairCash = r2(Math.max(0, cashSalesTotal - periodInstallmentCashCollected));
  const rPosBank = r2(Math.max(0, cardSalesTotal + qrSalesTotal + bankTransferSalesTotal - periodInstallmentBankCollected));

  postJournal("PERIOD", "1010", "1035", rInstCash);
  postJournal("PERIOD", "1020", "1035", rInstBank);
  postJournal("PERIOD", "1010", "1030", rPosAndRepairCash);
  postJournal("PERIOD", "1020", "1030", rPosBank);

  // Period Cost of Goods Sold (5010 Merchandise & 5020 Repair Parts)
  const rProductCogs = r2(productCogs);
  const rRepairCogs = r2(repairPartsCost);
  postJournal("PERIOD", "5010", "1040", rProductCogs);
  postJournal("PERIOD", "5020", "1040", rRepairCogs);

  // Period Supplier Purchases (1040 Inventory, 1050 Input Tax, 2010 AP, 1020 Bank Paid)
  const rPoTotal = r2(totalPurchasedValue);
  const rInputTax = r2(Math.min(rPoTotal, sstInputTax));
  const rPoInvNet = r2(Math.max(0, rPoTotal - rInputTax));
  const rPoPaid = r2(totalAmountPaid);
  postJournal("PERIOD", "1040", "2010", rPoInvNet);
  postJournal("PERIOD", "1050", "2010", rInputTax);
  postJournal("PERIOD", "2010", "1020", rPoPaid);

  // Period Operating Expenses, Capital Assets, Liability Payments & Owner Drawings
  const totalPostedCapitalAssets = r2(postedCapitalAssets.reduce((s, e) => s + (e.amount || 0), 0));
  const totalPostedLiabilityPayments = r2(postedLiabilityPayments.reduce((s, e) => s + (e.amount || 0), 0));
  const totalPostedOwnerWithdrawals = r2(postedOwnerWithdrawals.reduce((s, e) => s + (e.amount || 0), 0));

  operatingExpenses.forEach((exp) => {
    const amt = r2(exp.amount);
    if (amt <= 0) return;
    let expCode = "6050";
    if (exp.category === "Utilities Expenses") expCode = "6010";
    else if (exp.category === "Salaries Expenses") expCode = "6020";
    else if (exp.category === "Rent Expenses") expCode = "6030";
    else if (exp.category === "Supplies Expenses") expCode = "6040";
    postJournal("PERIOD", expCode, "2030", amt);
  });

  postJournal("PERIOD", "1510", "2030", totalPostedCapitalAssets);
  postJournal("PERIOD", "2010", "2030", totalPostedLiabilityPayments);
  postJournal("PERIOD", "3030", "2030", totalPostedOwnerWithdrawals);

  const totalAllPeriodExpenseBills = r2(
    totalOperatingExpenses + totalPostedCapitalAssets + totalPostedLiabilityPayments + totalPostedOwnerWithdrawals
  );
  const totalPostedUnpaidExpenses = r2(
    postedExpenses.reduce((s, e) => s + Math.max(0, Number(e.balanceDue || 0)), 0)
  );
  const totalPaidPeriodExpenseBills = r2(Math.max(0, totalAllPeriodExpenseBills - totalPostedUnpaidExpenses));
  const rawCashExpPaid = r2(
    postedExpenses
      .filter((e) => (e.paymentMethod || "").toLowerCase() === "cash")
      .reduce((s, e) => s + (e.amountPaid !== undefined ? Number(e.amountPaid) : Number(e.amount || 0)), 0)
  );
  const rCashExpPaid = r2(Math.min(totalPaidPeriodExpenseBills, rawCashExpPaid));
  const rBankExpPaid = r2(Math.max(0, totalPaidPeriodExpenseBills - rCashExpPaid));

  postJournal("PERIOD", "2030", "1010", rCashExpPaid);
  postJournal("PERIOD", "2030", "1020", rBankExpPaid);

  // Offset Period SST Input Tax against SST Output Tax so 2020/1050 reflect true net tax position
  const periodSstOffset = r2(Math.min(Math.max(0, getClosingNetDr("1050")), Math.max(0, -getClosingNetDr("2020"))));
  if (periodSstOffset > 0) {
    postJournal("PERIOD", "2020", "1050", periodSstOffset);
  }

  // ── 3. RECONCILE CATALOG INVENTORY, SUB-LEDGER RECEIVABLES & WORKING CAPITAL ──
  // A. Reconcile Physical Catalog & Spare Parts Inventory Valuation (1040) with Owner's Seed Equity (3005)
  const targetInventoryAsset = r2(totalCostValue);
  const currentInvNetDr = getClosingNetDr("1040");
  const invDiff = r2(targetInventoryAsset - currentInvNetDr);
  if (invDiff > 0) {
    postJournal("OPEN", "1040", "3005", invDiff);
  } else if (invDiff < 0) {
    postJournal("OPEN", "3010", "1040", Math.abs(invDiff));
  }

  // B. Reconcile Installment Contracts Receivable (1035) with Active Installment Sub-Ledger
  const targetInstallmentAR = r2(arInstallmentReceivables);
  const currentInstArNetDr = getClosingNetDr("1035");
  const instArDiff = r2(targetInstallmentAR - currentInstArNetDr);
  if (instArDiff > 0) {
    postJournal("OPEN", "1035", "3005", instArDiff);
  } else if (instArDiff < 0) {
    postJournal("OPEN", "3010", "1035", Math.abs(instArDiff));
  }

  // C. Reconcile Trade & Repair Accounts Receivable (1030) with Customer Credit & Repair Sub-Ledger
  const targetTradeAndRepairAR = r2(arCustomerCreditReceivables + arRepairReceivables);
  const currentTradeArNetDr = getClosingNetDr("1030");
  const tradeArDiff = r2(targetTradeAndRepairAR - currentTradeArNetDr);
  if (tradeArDiff > 0) {
    postJournal("OPEN", "1030", "3005", tradeArDiff);
  } else if (tradeArDiff < 0) {
    postJournal("OPEN", "3010", "1030", Math.abs(tradeArDiff));
  }

  // D. Ensure Opening Cash (1010) and Opening Bank (1020) are backed by Owner Working Capital (3005) if prior outflows > prior inflows
  const openCashNet = getOpenNetDr("1010");
  if (openCashNet < 0) {
    postJournal("OPEN", "1010", "3005", Math.abs(openCashNet));
  }
  const openBankNet = getOpenNetDr("1020");
  if (openBankNet < 0) {
    postJournal("OPEN", "1020", "3005", Math.abs(openBankNet));
  }

  // E. Ensure Closing Cash (1010) and Closing Bank (1020) reflect Owner Working Capital Contributions if period disbursements > available liquid float
  let periodOwnerCapitalInjected = 0;
  const closingCashBeforeSeed = getClosingNetDr("1010");
  if (closingCashBeforeSeed < 0) {
    const neededCash = r2(Math.abs(closingCashBeforeSeed));
    postJournal("PERIOD", "1010", "3005", neededCash);
    periodOwnerCapitalInjected = r2(periodOwnerCapitalInjected + neededCash);
  }
  const closingBankBeforeSeed = getClosingNetDr("1020");
  if (closingBankBeforeSeed < 0) {
    const neededBank = r2(Math.abs(closingBankBeforeSeed));
    postJournal("PERIOD", "1020", "3005", neededBank);
    periodOwnerCapitalInjected = r2(periodOwnerCapitalInjected + neededBank);
  }

  // ── 4. BUILD BALANCE SHEET (AS OF endTimeMs) STRICTLY FROM REAL FIRESTORE BALANCES ──
  const cashInTill = Math.max(0, getClosingNetDr("1010"));
  const bankAccountsBalance = Math.max(0, getClosingNetDr("1020"));
  const tradeAndRepairARAsset = Math.max(0, getClosingNetDr("1030"));
  const installmentARAsset = Math.max(0, getClosingNetDr("1035"));
  const inventoryAsset = Math.max(0, getClosingNetDr("1040"));
  const sstInputClaimableAsset = Math.max(0, getClosingNetDr("1050"));
  const capitalEquipmentAsset = Math.max(0, getClosingNetDr("1510"));

  const currentAssets: BalanceSheetData["currentAssets"] = [
    { accountCode: "1010", name: "Cash on Hand (POS Drawer & Till Float)", amount: cashInTill, notes: "Live Firestore cash sales less cash payouts" },
    { accountCode: "1020", name: "Bank Operating Accounts (Card, QR & Wire)", amount: bankAccountsBalance, notes: "Live Firestore digital & bank settlements" },
    { accountCode: "1030", name: "Accounts Receivable (Customer & Repair Debtors)", amount: tradeAndRepairARAsset, notes: "Customer credit & unpaid repair balances" },
    { accountCode: "1035", name: "Installment Contracts Receivable", amount: installmentARAsset, notes: "Active customer installment plans" },
    { accountCode: "1040", name: "Merchandise & Spare Parts Inventory (at Cost)", amount: inventoryAsset, notes: `${totalSkus} active SKUs (${totalUnits} units)` },
    { accountCode: "1050", name: "SST Input Tax Claimable (Tax Credit)", amount: sstInputClaimableAsset, notes: "Purchase input tax credit" },
  ].filter((item) => item.amount !== 0);

  const totalCurrentAssets = r2(currentAssets.reduce((s, it) => s + it.amount, 0));

  const nonCurrentAssets: BalanceSheetData["nonCurrentAssets"] = [
    { accountCode: "1510", name: "Store Equipment, Fixtures & Capital Assets", amount: capitalEquipmentAsset, notes: "Recorded capital asset vouchers" },
  ].filter((item) => item.amount !== 0);

  const totalNonCurrentAssets = r2(nonCurrentAssets.reduce((s, it) => s + it.amount, 0));
  const totalAssets = r2(totalCurrentAssets + totalNonCurrentAssets);

  // Liabilities (Normal Credit -> -getClosingNetDr)
  const accountsPayableLiability = Math.max(0, -getClosingNetDr("2010"));
  const sstPayableLiability = Math.max(0, -getClosingNetDr("2020"));
  const accruedLiabilities = Math.max(0, -getClosingNetDr("2030"));

  const currentLiabilities: BalanceSheetData["currentLiabilities"] = [
    { accountCode: "2010", name: "Accounts Payable (Trade Supplier Creditors)", amount: accountsPayableLiability, notes: "Outstanding supplier PO balances" },
    { accountCode: "2020", name: "SST / Output Sales Tax Payable", amount: sstPayableLiability, notes: "Net SST tax payable from sales" },
    { accountCode: "2030", name: "Accrued Operating Expenses & Bills Payable", amount: accruedLiabilities, notes: "Unpaid expense & salary vouchers" },
  ].filter((item) => item.amount !== 0);

  const totalCurrentLiabilities = r2(currentLiabilities.reduce((s, it) => s + it.amount, 0));
  const nonCurrentLiabilities: BalanceSheetData["nonCurrentLiabilities"] = [];
  const totalNonCurrentLiabilities = 0;
  const totalLiabilities = r2(totalCurrentLiabilities + totalNonCurrentLiabilities);

  // Owner's Equity
  const ownersCapitalSeed = r2(-getClosingNetDr("3005"));
  const priorRetainedEarnings = r2(-getClosingNetDr("3010"));
  const currentPeriodNetEarnings = r2(netProfit);
  const ownersDrawings = r2(getClosingNetDr("3030")); // Contra-equity (debit)

  const equityItems: BalanceSheetData["equityItems"] = [
    { accountCode: "3005", name: "Owner's Capital & Opening Inventory Equity", amount: ownersCapitalSeed, notes: "Backed by catalog inventory & working capital" },
    { accountCode: "3010", name: "Retained Earnings (Prior Periods)", amount: priorRetainedEarnings, notes: "Accumulated prior period earnings" },
    { accountCode: "3020", name: "Current Period Net Profit / (Loss)", amount: currentPeriodNetEarnings, notes: "Transferred from Income Statement" },
    ...(ownersDrawings !== 0
      ? [
          {
            accountCode: "3030",
            name: "Less: Owner's Drawings & Distributions",
            amount: -ownersDrawings,
            notes: "Capital withdrawals by owner",
          },
        ]
      : []),
  ].filter((item) => item.amount !== 0);

  const totalEquity = r2(equityItems.reduce((s, it) => s + it.amount, 0));
  const totalLiabilitiesAndEquity = r2(totalLiabilities + totalEquity);
  const bsVariance = r2(Math.abs(totalAssets - totalLiabilitiesAndEquity));

  const balanceSheet: BalanceSheetData = {
    asOfDate: dateFilter.endDate,
    currentAssets,
    totalCurrentAssets,
    nonCurrentAssets,
    totalNonCurrentAssets,
    totalAssets,
    currentLiabilities,
    totalCurrentLiabilities,
    nonCurrentLiabilities,
    totalNonCurrentLiabilities,
    totalLiabilities,
    equityItems,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: bsVariance < 0.05,
    variance: bsVariance,
  };

  // ── 5. BUILD STATEMENT OF CASH FLOWS (STRICTLY FROM REAL FIRESTORE CASH & BANK FLOWS) ──
  const retailAndRepairCashReceipts = r2(rPosAndRepairCash + rPosBank);
  const installmentCashReceipts = r2(rInstCash + rInstBank);
  const cashPaidToSuppliers = r2(rPoPaid);
  const livePaidOperatingExpenses = r2(
    Math.max(0, totalPaidPeriodExpenseBills - totalPostedCapitalAssets - totalPostedLiabilityPayments - totalPostedOwnerWithdrawals)
  );
  const cashPaidRefunds = rReturns;

  const operatingActivities: CashFlowData["operatingActivities"] = [
    { name: "Cash Receipts from POS Retail & Workshop Sales", amount: retailAndRepairCashReceipts },
    { name: "Cash Receipts from Installment Down Payments & Collections", amount: installmentCashReceipts },
    { name: "Cash Paid to Suppliers for Merchandise Purchases", amount: -cashPaidToSuppliers },
    { name: "Cash Paid for Operating Expenses & Employee Salaries", amount: -livePaidOperatingExpenses },
    { name: "Cash Refunds Disbursed to Customers", amount: -cashPaidRefunds },
  ].filter((a) => a.amount !== 0);
  const netOperatingCashFlow = r2(operatingActivities.reduce((s, a) => s + a.amount, 0));

  const investingActivities: CashFlowData["investingActivities"] = [
    { name: "Acquisition of Store Equipment & Capital Assets", amount: -totalPostedCapitalAssets },
  ].filter((a) => a.amount !== 0);
  const netInvestingCashFlow = r2(investingActivities.reduce((s, a) => s + a.amount, 0));

  const financingActivities: CashFlowData["financingActivities"] = [
    { name: "Owner Working Capital Contributions", amount: periodOwnerCapitalInjected },
    { name: "Owner Capital Drawings & Distributions", amount: -totalPostedOwnerWithdrawals },
    { name: "Repayment of Liabilities & Debt Facilities", amount: -totalPostedLiabilityPayments },
  ].filter((a) => a.amount !== 0);
  const netFinancingCashFlow = r2(financingActivities.reduce((s, a) => s + a.amount, 0));

  const beginningCashBalance = r2(Math.max(0, getOpenNetDr("1010")) + Math.max(0, getOpenNetDr("1020")));
  const netChangeInCash = r2(netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow);
  const endingCashBalance = r2(cashInTill + bankAccountsBalance);

  const cashFlow: CashFlowData = {
    operatingActivities,
    netOperatingCashFlow,
    investingActivities,
    netInvestingCashFlow,
    financingActivities,
    netFinancingCashFlow,
    netChangeInCash,
    beginningCashBalance,
    endingCashBalance,
  };

  // ── 6. BUILD TRIAL BALANCE & GENERAL LEDGER ACTIVITY SCHEDULE (ONLY REAL ACTIVE ACCOUNTS) ──
  const activeGLAccounts = chartOfAccounts.filter((acct) => {
    return acct.openDr > 0 || acct.openCr > 0 || acct.periodDr > 0 || acct.periodCr > 0;
  });

  const trialBalanceRows: TrialBalanceData["rows"] = activeGLAccounts.map((acct) => {
    const netDr = getClosingNetDr(acct.code);
    return {
      code: acct.code,
      name: acct.name,
      category: acct.category,
      debit: netDr > 0 ? netDr : 0,
      credit: netDr < 0 ? Math.abs(netDr) : 0,
    };
  });

  const totalDebits = r2(trialBalanceRows.reduce((s, r) => s + r.debit, 0));
  const totalCredits = r2(trialBalanceRows.reduce((s, r) => s + r.credit, 0));
  const tbVariance = r2(Math.abs(totalDebits - totalCredits));

  const glSummaries: TrialBalanceData["glSummaries"] = activeGLAccounts.map((acct) => {
    const openNetDr = getOpenNetDr(acct.code);
    const closeNetDr = getClosingNetDr(acct.code);
    const openingBalance = acct.normalBalance === "DEBIT" ? openNetDr : r2(-openNetDr);
    const closingBalance = acct.normalBalance === "DEBIT" ? closeNetDr : r2(-closeNetDr);
    return {
      code: acct.code,
      name: acct.name,
      openingBalance,
      periodDebits: acct.periodDr,
      periodCredits: acct.periodCr,
      closingBalance,
      normalBalance: acct.normalBalance,
    };
  });

  const trialBalance: TrialBalanceData = {
    rows: trialBalanceRows,
    totalDebits,
    totalCredits,
    isBalanced: tbVariance < 0.05,
    variance: tbVariance,
    glSummaries,
  };

  return {
    shopId,
    shopName,
    dateFilter,
    generatedAt: Date.now(),
    pnl,
    balanceSheet,
    cashFlow,
    trialBalance,
    salesStatement,
    repairStatement,
    inventoryValuation,
    purchaseStatement,
    accountsReceivable,
    accountsPayable,
    expenseStatement,
    bankCashReconciliation,
    taxStatement,
  };
}
