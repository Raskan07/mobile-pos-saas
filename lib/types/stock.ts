/**
 * lib/types/stock.ts
 *
 * Types and interfaces for Stock Management, Audit Logging, and Valuations.
 */

import { AuditUser } from "./catalog";

export type StockMovementType =
  | "STOCK_IN"
  | "STOCK_OUT"
  | "DAMAGED"
  | "ADJUSTMENT"
  | "SALE";

export type StockStatus = "HEALTHY" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface StockTransaction {
  id: string;
  shopId: string;
  productId: string;
  productName: string;
  sku: string;
  barcode?: string;
  variantId?: string;
  variantName?: string;
  type: StockMovementType;
  quantityDelta: number; // positive for in/surplus, negative for out/damaged/sale
  previousStock: number;
  newStock: number;
  reason: string;
  referenceNumber?: string; // PO number, Invoice #, RMA #, Supplier Bill
  unitCost: number;
  unitSellingPrice: number;
  totalValueChange: number; // quantityDelta * unitCost
  notes?: string;
  performedBy: AuditUser;
  createdAt: number;
}

export interface CreateStockMovementInput {
  productId: string;
  productName: string;
  sku: string;
  barcode?: string;
  variantId?: string;
  variantName?: string;
  type: StockMovementType;
  quantity: number; // positive magnitude entered by user
  reason: string;
  referenceNumber?: string;
  unitCost?: number;
  notes?: string;
}

export interface StockValuationSummary {
  totalProducts: number;
  totalUnits: number;
  totalCostValue: number;
  totalRetailValue: number;
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  damagedUnitsLogged: number;
  damagedValueLogged: number;
}

export interface StockFilterOptions {
  status?: "ALL" | StockStatus;
  categoryId?: string;
  movementType?: "ALL" | StockMovementType;
  searchQuery?: string;
  startDate?: number;
  endDate?: number;
}
