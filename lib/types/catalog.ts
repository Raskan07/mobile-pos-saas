/**
 * lib/types/catalog.ts
 *
 * TypeScript models for 3-Level Product Hierarchy:
 * Top-Level Categories -> Subcategories -> Products.
 * Also includes Brands, Suppliers, and Product Variants.
 *
 * Every entity strictly enforces:
 * - `shopId`: Multi-tenant boundary
 * - `createdBy`: Audit trail (userId, username, role, displayName)
 * - Timestamps: createdAt and updatedAt
 */

export interface AuditUser {
  userId: string;
  username: string;
  role: string;
  displayName?: string;
}

export interface Brand {
  id: string;
  shopId: string;
  name: string;
  createdBy: AuditUser;
  createdAt: number;
  updatedAt: number;
}

export interface Supplier {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  createdBy: AuditUser;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  subcategoriesCount?: number;
  productsCount?: number;
  createdBy: AuditUser;
  createdAt: number;
  updatedAt: number;
  updatedBy?: AuditUser;
}

export interface Subcategory {
  id: string;
  shopId: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  description?: string;
  productsCount?: number;
  createdBy: AuditUser;
  createdAt: number;
  updatedAt: number;
  updatedBy?: AuditUser;
}

export interface ProductVariant {
  id: string;
  size?: string;
  color?: string;
  sku: string;
  barcode?: string;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
}

export interface ProductItem {
  id: string;
  shopId: string;
  categoryId: string;
  categoryName?: string;
  subcategoryId: string;
  subcategoryName?: string;
  name: string;
  images: string[];
  sku: string;
  barcode?: string;
  sellingPrice: number;
  costPrice: number;
  unit: string; // e.g. "pcs", "box", "kg", "pack", "meter"
  brand: string;
  brandId?: string;
  supplier: string;
  supplierId?: string;
  description?: string; // Optional
  hasVariants?: boolean;
  variants?: ProductVariant[];
  stockQuantity?: number;
  minStockLevel?: number;
  status?: "active" | "inactive";
  createdBy: AuditUser;
  createdAt: number;
  updatedAt: number;
  updatedBy?: AuditUser;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface CreateSubcategoryInput {
  categoryId: string;
  categoryName?: string;
  name: string;
  description?: string;
}

export interface CreateProductInput {
  categoryId: string;
  categoryName?: string;
  subcategoryId: string;
  subcategoryName?: string;
  name: string;
  images?: string[];
  sku: string;
  barcode?: string;
  sellingPrice: number;
  costPrice: number;
  unit: string;
  brand: string;
  brandId?: string;
  supplier: string;
  supplierId?: string;
  description?: string; // Optional
  hasVariants?: boolean;
  variants?: ProductVariant[];
  stockQuantity?: number;
  minStockLevel?: number;
  status?: "active" | "inactive";
}
