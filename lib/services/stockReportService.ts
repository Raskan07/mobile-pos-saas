/**
 * lib/services/stockReportService.ts
 *
 * Core engine for the Reusable Stock Reporting System.
 *
 * Key Responsibilities:
 * 1. Strict Multi-Tenant Isolation: Enforces active shopId on all records.
 * 2. Role-Based Access Control: Validates user permissions against existing role models.
 * 3. Data Normalization: Transforms raw Firestore products and audit logs into a
 *    clean, decoupled NormalizedStockReport data set.
 * 4. Deterministic Calculations: Exact mathematical calculations for valuations,
 *    margins, and health metrics shared by all downstream exporters (PDF & XML).
 */

import { ProductItem, Category, AuditUser } from "../types/catalog";
import { StockTransaction, StockMovementType, StockStatus } from "../types/stock";
import {
  StockReportFilters,
  StockReportType,
  DateRangePreset,
  NormalizedStockReport,
  NormalizedStockReportItem,
  NormalizedStockReportMovement,
} from "../types/stockReport";
import { getProductStockStatus } from "./stockService";

/**
 * Checks if a user has sufficient privileges to generate stock reports.
 * Admins and Managers have full report access.
 * Cashiers are allowed if they have the 'inventory_reports' permission.
 */
export function canUserAccessStockReports(
  role?: string,
  permissions?: string[]
): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  if (r === "admin" || r === "manager") return true;
  if (permissions && Array.isArray(permissions)) {
    return (
      permissions.includes("inventory_reports") ||
      permissions.includes("stock_reports") ||
      permissions.includes("admin")
    );
  }
  return false;
}

/**
 * Calculates start and end timestamps for standard date range presets
 */
export function getDateRangeBoundaries(
  preset: DateRangePreset,
  customStart?: number,
  customEnd?: number
): { startDate: number; endDate: number; label: string } {
  const now = new Date();

  // Start of today (00:00:00.000)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // End of today (23:59:59.999)
  const endOfToday = startOfToday + 86400000 - 1;

  switch (preset) {
    case "today":
      return {
        startDate: startOfToday,
        endDate: endOfToday,
        label: `Today (${new Date(startOfToday).toLocaleDateString()})`,
      };

    case "yesterday": {
      const startOfYesterday = startOfToday - 86400000;
      const endOfYesterday = startOfToday - 1;
      return {
        startDate: startOfYesterday,
        endDate: endOfYesterday,
        label: `Yesterday (${new Date(startOfYesterday).toLocaleDateString()})`,
      };
    }

    case "7days": {
      const startOf7Days = startOfToday - 7 * 86400000;
      return {
        startDate: startOf7Days,
        endDate: endOfToday,
        label: `Last 7 Days (${new Date(startOf7Days).toLocaleDateString()} - ${new Date(endOfToday).toLocaleDateString()})`,
      };
    }

    case "30days": {
      const startOf30Days = startOfToday - 30 * 86400000;
      return {
        startDate: startOf30Days,
        endDate: endOfToday,
        label: `Last 30 Days (${new Date(startOf30Days).toLocaleDateString()} - ${new Date(endOfToday).toLocaleDateString()})`,
      };
    }

    case "custom": {
      const start = customStart ?? startOfToday;
      const end = customEnd ?? endOfToday;
      return {
        startDate: start,
        endDate: end,
        label: `Custom Range (${new Date(start).toLocaleString()} - ${new Date(end).toLocaleString()})`,
      };
    }

    case "all":
    default:
      return {
        startDate: 0,
        endDate: Number.MAX_SAFE_INTEGER,
        label: "All Time (Complete History)",
      };
  }
}

/**
 * Builds the decoupled, normalized stock report from raw catalog products and transactions.
 * Strictly guarantees shop ID isolation and mathematical consistency.
 */
export function buildNormalizedStockReport(params: {
  shopId: string;
  shopName: string;
  branchName?: string;
  user: AuditUser;
  products: ProductItem[];
  transactions: StockTransaction[];
  categories: Category[];
  filters: StockReportFilters;
}): NormalizedStockReport {
  const { shopId, shopName, branchName, user, products, transactions, categories, filters } = params;

  if (!shopId || !shopId.trim()) {
    throw new Error("[StockReportService] Security violation: Active shop ID is required.");
  }

  // 1. Strict multi-tenant isolation: filter out any rogue items not belonging to this shop
  const isolatedProducts = products.filter((p) => p.shopId === shopId);
  const isolatedTransactions = transactions.filter((t) => t.shopId === shopId);

  // 2. Resolve date boundaries
  const { startDate, endDate, label: dateRangeLabel } = getDateRangeBoundaries(
    filters.dateRangePreset,
    filters.startDate,
    filters.endDate
  );

  // 3. Category lookup map
  const categoryMap = new Map<string, string>();
  categories.forEach((c) => categoryMap.set(c.id, c.name));

  // 4. Filter products
  const filteredProducts = isolatedProducts.filter((p) => {
    const stock = typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
    const minThreshold = typeof p.minStockLevel === "number" ? p.minStockLevel : 10;
    const status = getProductStockStatus(p);

    // Report Type specific filtering
    if (filters.reportType === "LOW_STOCK_ALERT") {
      if (stock > minThreshold) return false;
    }

    // Status filter
    if (filters.status && filters.status !== "ALL" && status !== filters.status) {
      return false;
    }

    // Category filter
    if (filters.categoryId && filters.categoryId !== "ALL" && p.categoryId !== filters.categoryId) {
      return false;
    }

    // Text search query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const matchesName = p.name?.toLowerCase().includes(q);
      const matchesSku = p.sku?.toLowerCase().includes(q);
      const matchesBarcode = p.barcode?.toLowerCase().includes(q);
      const matchesBrand = p.brand?.toLowerCase().includes(q);
      const matchesCat = p.categoryName?.toLowerCase().includes(q);
      if (!matchesName && !matchesSku && !matchesBarcode && !matchesBrand && !matchesCat) {
        return false;
      }
    }

    return true;
  });

  // 5. Filter transactions (Movement logs)
  const filteredTransactions = isolatedTransactions.filter((tx) => {
    // Date & Time range check
    if (tx.createdAt < startDate || tx.createdAt > endDate) {
      return false;
    }

    // Movement Type filter
    if (filters.movementType && filters.movementType !== "ALL" && tx.type !== filters.movementType) {
      return false;
    }

    // Text search query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const matchesProd = tx.productName?.toLowerCase().includes(q);
      const matchesSku = tx.sku?.toLowerCase().includes(q);
      const matchesBarcode = tx.barcode?.toLowerCase().includes(q);
      const matchesReason = tx.reason?.toLowerCase().includes(q);
      const matchesRef = tx.referenceNumber?.toLowerCase().includes(q);
      if (!matchesProd && !matchesSku && !matchesBarcode && !matchesReason && !matchesRef) {
        return false;
      }
    }

    return true;
  });

  // 6. Normalize Item Details & Compute Valuations
  let totalUnits = 0;
  let totalCostValue = 0;
  let totalRetailValue = 0;
  let healthyCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  const normalizedItems: NormalizedStockReportItem[] = filteredProducts.map((p) => {
    const stock = typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
    const cost = typeof p.costPrice === "number" ? p.costPrice : 0;
    const retail = typeof p.sellingPrice === "number" ? p.sellingPrice : 0;
    const minThreshold = typeof p.minStockLevel === "number" ? p.minStockLevel : 10;
    const status = getProductStockStatus(p);

    const itemCostValuation = stock * cost;
    const itemRetailValuation = stock * retail;
    const itemProfit = Math.max(0, itemRetailValuation - itemCostValuation);

    totalUnits += stock;
    totalCostValue += itemCostValuation;
    totalRetailValue += itemRetailValuation;

    if (status === "OUT_OF_STOCK") outOfStockCount++;
    else if (status === "LOW_STOCK") lowStockCount++;
    else healthyCount++;

    return {
      productId: p.id,
      name: p.name || "Untitled Product",
      sku: p.sku || "N/A",
      barcode: p.barcode || "",
      category: p.categoryName || categoryMap.get(p.categoryId) || "General",
      unit: p.unit || "pcs",
      stockQuantity: stock,
      minStockLevel: minThreshold,
      status,
      costPrice: cost,
      sellingPrice: retail,
      totalCostValue: itemCostValuation,
      totalRetailValue: itemRetailValuation,
      profitContribution: itemProfit,
    };
  });

  // Sort items: Low/Out of stock first, then alphabetically
  normalizedItems.sort((a, b) => {
    if (a.stockQuantity <= 0 && b.stockQuantity > 0) return -1;
    if (b.stockQuantity <= 0 && a.stockQuantity > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  // 7. Normalize Movements
  let damagedUnits = 0;
  let damagedValue = 0;

  const normalizedMovements: NormalizedStockReportMovement[] = filteredTransactions.map((tx) => {
    const units = Math.abs(tx.quantityDelta);
    if (tx.type === "DAMAGED") {
      damagedUnits += units;
      damagedValue += units * (tx.unitCost || 0);
    }

    return {
      id: tx.id,
      timestamp: tx.createdAt,
      timestampISO: new Date(tx.createdAt).toISOString(),
      type: tx.type,
      productId: tx.productId,
      productName: tx.productName,
      sku: tx.sku,
      barcode: tx.barcode,
      quantityDelta: tx.quantityDelta,
      previousStock: tx.previousStock,
      newStock: tx.newStock,
      reason: tx.reason,
      referenceNumber: tx.referenceNumber,
      unitCost: tx.unitCost || 0,
      unitSellingPrice: tx.unitSellingPrice || 0,
      totalValueChange: tx.totalValueChange || 0,
      performedBy: tx.performedBy?.displayName || tx.performedBy?.username || "Staff",
      performedByRole: tx.performedBy?.role || "cashier",
      notes: tx.notes,
    };
  });

  // 8. Potential Profit & Margins
  const potentialProfit = Math.max(0, totalRetailValue - totalCostValue);
  const marginPercentage =
    totalRetailValue > 0
      ? Number(((potentialProfit / totalRetailValue) * 100).toFixed(2))
      : 0;

  const now = Date.now();
  const reportId = `rep_${now}_${Math.random().toString(36).substring(2, 7)}`;

  // Human friendly report title
  let reportTitle = "Inventory Valuation & Stock Status Report";
  if (filters.reportType === "STOCK_MOVEMENTS") {
    reportTitle = "Stock Movement & Audit Trail Report";
  } else if (filters.reportType === "LOW_STOCK_ALERT") {
    reportTitle = "Low Stock & Reorder Alerts Report";
  }

  const selectedCategoryLabel =
    filters.categoryId && filters.categoryId !== "ALL"
      ? categoryMap.get(filters.categoryId) || filters.categoryId
      : "All Categories";

  return {
    metadata: {
      reportId,
      reportType: filters.reportType,
      reportTitle,
      shopId,
      shopName,
      branchName: branchName || "Main Branch",
      generatedAt: now,
      generatedAtISO: new Date(now).toISOString(),
      generatedBy: {
        userId: user.userId,
        username: user.username,
        role: user.role,
        displayName: user.displayName || user.username,
      },
      filtersApplied: {
        dateRangeLabel,
        statusLabel: filters.status || "ALL",
        categoryLabel: selectedCategoryLabel,
        movementTypeLabel: filters.movementType || "ALL",
        searchQuery: filters.searchQuery || undefined,
      },
    },
    summary: {
      totalProducts: filteredProducts.length,
      totalUnits,
      totalCostValue,
      totalRetailValue,
      potentialProfit,
      marginPercentage,
      healthyCount,
      lowStockCount,
      outOfStockCount,
      damagedUnits,
      damagedValue,
    },
    items: normalizedItems,
    movements: normalizedMovements,
  };
}
