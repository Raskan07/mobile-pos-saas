/**
 * app/shop/dashboard/posData.ts
 *
 * Types for POS Billing Workspace.
 * All mock items have been removed in favor of live Firebase Firestore products.
 */

export interface Product {
  id: string;
  name: string;
  specs: string;
  price: number;
  category: string;
  categoryName?: string;
  subcategoryId?: string;
  barcode: string;
  stock: number;
  badge?: string;
  imageUrl?: string;
  // Snapshot enrichment fields
  sku?: string;
  costPrice?: number;
  unit?: string;
  brand?: string;
  variant?: string;
  variantId?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  customPrice?: number;
  variant?: string;
  variantId?: string;
}

export interface DiscountSetting {
  type: "percentage" | "fixed";
  value: number;
}
