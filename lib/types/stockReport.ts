/**
 * lib/types/stockReport.ts
 *
 * Types for the Reusable Stock Reporting System.
 * Defines filter options, normalized report schema, and item structures.
 */

import { StockMovementType, StockStatus } from "./stock";

export type StockReportType =
  | "INVENTORY_VALUATION"
  | "STOCK_MOVEMENTS"
  | "LOW_STOCK_ALERT";

export type DateRangePreset =
  | "all"
  | "today"
  | "yesterday"
  | "7days"
  | "30days"
  | "custom";

export interface StockReportFilters {
  reportType: StockReportType;
  dateRangePreset: DateRangePreset;
  startDate?: number; // timestamp in ms (start of boundary)
  endDate?: number;   // timestamp in ms (end of boundary)
  status?: "ALL" | StockStatus;
  categoryId?: string;
  movementType?: "ALL" | StockMovementType;
  searchQuery?: string;
}

export interface NormalizedStockReportMetadata {
  reportId: string;
  reportType: StockReportType;
  reportTitle: string;
  shopId: string;
  shopName: string;
  branchName?: string;
  generatedAt: number;
  generatedAtISO: string;
  generatedBy: {
    userId: string;
    username: string;
    role: string;
    displayName?: string;
  };
  filtersApplied: {
    dateRangeLabel: string;
    statusLabel: string;
    categoryLabel: string;
    movementTypeLabel?: string;
    searchQuery?: string;
  };
}

export interface NormalizedStockReportSummary {
  totalProducts: number;
  totalUnits: number;
  totalCostValue: number;
  totalRetailValue: number;
  potentialProfit: number;
  marginPercentage: number;
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  damagedUnits: number;
  damagedValue: number;
}

export interface NormalizedStockReportItem {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  stockQuantity: number;
  minStockLevel: number;
  status: StockStatus;
  costPrice: number;
  sellingPrice: number;
  totalCostValue: number;
  totalRetailValue: number;
  profitContribution: number;
}

export interface NormalizedStockReportMovement {
  id: string;
  timestamp: number;
  timestampISO: string;
  type: StockMovementType;
  productId: string;
  productName: string;
  sku: string;
  barcode?: string;
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  referenceNumber?: string;
  unitCost: number;
  unitSellingPrice: number;
  totalValueChange: number;
  performedBy: string;
  performedByRole: string;
  notes?: string;
}

export interface NormalizedStockReport {
  metadata: NormalizedStockReportMetadata;
  summary: NormalizedStockReportSummary;
  items: NormalizedStockReportItem[];
  movements: NormalizedStockReportMovement[];
}
