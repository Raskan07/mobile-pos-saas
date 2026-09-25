/**
 * lib/types/barcode.ts
 *
 * Shared type definitions for the barcode label printing system.
 * Used by barcodePdfGenerator, barcodeService, and barcode UI pages.
 */

import { AuditUser } from "./catalog";

// ─── Paper Presets ────────────────────────────────────────────────────────────

export type PaperPresetId =
  | "a4_6col"
  | "a4_3col"
  | "a4_4col"
  | "thermal_50x30"
  | "thermal_40x28"
  | "thermal_60x40"
  | "thermal_100x50";

export interface PaperPreset {
  id: PaperPresetId;
  name: string;
  description: string;
  pageWidthMm: number;
  pageHeightMm: number;
  columns: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
  marginTopMm: number;
  marginLeftMm: number;
  gapXColMm: number;
  gapYRowMm: number;
}

// ─── Label Config ─────────────────────────────────────────────────────────────

export interface LabelConfig {
  paperPreset: PaperPresetId;
  showShopName: boolean;
  showName: boolean;
  showVariant: boolean;
  showSku: boolean;
  showPrice: boolean;
  showCategory?: boolean;
  currencySymbol: string;
  customShopName?: string;
  customWidthMm?: number;
  customHeightMm?: number;
  printerType?: "pdf" | "zpl" | "tspl";
  printerDpi?: 203 | 300;
  printerDarkness?: number;
}

// ─── Barcode Item ─────────────────────────────────────────────────────────────

export interface BarcodeItem {
  /** Unique UI key: productId or `${productId}_${variantId}` */
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  sku: string;
  barcode: string;
  sellingPrice: number;
  costPrice?: number;
  brand?: string;
  categoryName?: string;
  image?: string;
  unit?: string;
  stock?: number;
}

// ─── Print Log ────────────────────────────────────────────────────────────────

export interface BarcodePrintLog {
  id: string;
  shopId: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  barcode: string;
  sku: string;
  price: number;
  quantity: number;
  paperPreset: PaperPresetId;
  action: "PRINT_SINGLE" | "PRINT_BULK" | "REPRINT_SCAN";
  printedBy: AuditUser;
  createdAt: number;
}
