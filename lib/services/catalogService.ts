/**
 * lib/services/catalogService.ts
 *
 * Multi-tenant catalog management service for 3-Level Product Hierarchy:
 * Top-Level Categories -> Subcategories -> Products.
 * Also manages Brands, Suppliers, and Product Variants.
 *
 * Firestore Layout:
 *   shops/{shopId}/categories/{categoryId}
 *   shops/{shopId}/subcategories/{subcategoryId}
 *   shops/{shopId}/products/{productId}
 *   shops/{shopId}/brands/{brandId}
 *   shops/{shopId}/suppliers/{supplierId}
 *   shops/{shopId}/product_images/{imageId}
 *
 * All operations automatically enforce:
 * - Active shop isolation (`shopId`)
 * - Non-forgeable audit trail (`createdBy`, `createdAt`, `updatedAt`, `updatedBy`)
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
  increment,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import {
  Category,
  Subcategory,
  ProductItem,
  Brand,
  Supplier,
  AuditUser,
  CreateCategoryInput,
  CreateSubcategoryInput,
  CreateProductInput,
} from "../types/catalog";

const CATEGORIES_COLLECTION = "categories";
const SUBCATEGORIES_COLLECTION = "subcategories";
const PRODUCTS_COLLECTION = "products";
const BRANDS_COLLECTION = "brands";
const SUPPLIERS_COLLECTION = "suppliers";
const IMAGES_COLLECTION = "product_images";

// -------------------------------------------------------------
// HELPER: Validate shopId and audit user
// -------------------------------------------------------------
function assertValidSession(shopId: string, user?: AuditUser) {
  if (!shopId || !shopId.trim()) {
    throw new Error("[CatalogService] Operation rejected: Active Shop ID is required.");
  }
  if (!user || !user.userId || !user.username) {
    throw new Error("[CatalogService] Operation rejected: Authenticated user identity is required for audit trail.");
  }
}

// -------------------------------------------------------------
// CODE GENERATION HELPERS (Unique SKU & Barcode)
// -------------------------------------------------------------

export function generateUniqueSKU(prefix = "SKU"): string {
  const cleanPrefix = (prefix || "SKU").trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "SKU";
  const num = Math.floor(1000 + Math.random() * 9000);
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${cleanPrefix}-${num}-${suffix}`;
}

export function generateUniqueBarcode(): string {
  // Generate 12-digit numeric barcode (e.g. 880 + 9 random digits)
  const prefix = "880";
  let rest = "";
  for (let i = 0; i < 9; i++) {
    rest += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${rest}`;
}

// -------------------------------------------------------------
// BRANDS (Shop-Scoped)
// -------------------------------------------------------------

export async function getBrands(shopId: string): Promise<Brand[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const brandRef = collection(db, "shops", normShopId, BRANDS_COLLECTION);
  const q = query(brandRef, orderBy("name", "asc"));
  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Brand, "id">),
  }));
}

export async function createBrand(
  shopId: string,
  user: AuditUser,
  name: string
): Promise<Brand> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const cleanName = (name || "").trim();
  if (!cleanName) throw new Error("Brand name is required.");

  const brandId = `brd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const brandData: Brand = {
    id: brandId,
    shopId: normShopId,
    name: cleanName,
    createdBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = doc(db, "shops", normShopId, BRANDS_COLLECTION, brandId);
  await setDoc(docRef, brandData);

  return brandData;
}

// -------------------------------------------------------------
// SUPPLIERS (Shop-Scoped)
// -------------------------------------------------------------

export async function getSuppliers(shopId: string): Promise<Supplier[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const supRef = collection(db, "shops", normShopId, SUPPLIERS_COLLECTION);
  const q = query(supRef, orderBy("name", "asc"));
  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Supplier, "id">),
  }));
}

export async function createSupplier(
  shopId: string,
  user: AuditUser,
  name: string,
  phone?: string
): Promise<Supplier> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const cleanName = (name || "").trim();
  if (!cleanName) throw new Error("Supplier name is required.");

  const supplierId = `sup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const supplierData: Supplier = {
    id: supplierId,
    shopId: normShopId,
    name: cleanName,
    phone: phone?.trim() || "",
    createdBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = doc(db, "shops", normShopId, SUPPLIERS_COLLECTION, supplierId);
  await setDoc(docRef, supplierData);

  return supplierData;
}

// -------------------------------------------------------------
// CATEGORIES (Level 1)
// -------------------------------------------------------------

export async function getCategories(shopId: string): Promise<Category[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const catRef = collection(db, "shops", normShopId, CATEGORIES_COLLECTION);
  const q = query(catRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Category, "id">),
  }));
}

export async function createCategory(
  shopId: string,
  user: AuditUser,
  input: CreateCategoryInput
): Promise<Category> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const name = input.name?.trim();
  if (!name) {
    throw new Error("Category name is required.");
  }

  const categoryId = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const categoryData: Category = {
    id: categoryId,
    shopId: normShopId,
    name,
    description: input.description?.trim() || "",
    icon: input.icon || "Package",
    color: input.color || "#6366f1",
    subcategoriesCount: 0,
    productsCount: 0,
    createdBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, categoryId);
  await setDoc(docRef, categoryData);

  return categoryData;
}

export async function updateCategory(
  shopId: string,
  categoryId: string,
  user: AuditUser,
  updates: Partial<CreateCategoryInput>
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const docRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, categoryId);
  await updateDoc(docRef, {
    ...(updates.name ? { name: updates.name.trim() } : {}),
    ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
    ...(updates.icon ? { icon: updates.icon } : {}),
    ...(updates.color ? { color: updates.color } : {}),
    updatedAt: Date.now(),
    updatedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  });
}

export async function deleteCategory(shopId: string, categoryId: string): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId || !categoryId) return;

  const docRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, categoryId);
  await deleteDoc(docRef);
}

// -------------------------------------------------------------
// SUBCATEGORIES (Level 2)
// -------------------------------------------------------------

export async function getSubcategories(
  shopId: string,
  categoryId?: string
): Promise<Subcategory[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const subRef = collection(db, "shops", normShopId, SUBCATEGORIES_COLLECTION);
  let q = query(subRef, orderBy("createdAt", "desc"));
  if (categoryId) {
    q = query(subRef, where("categoryId", "==", categoryId), orderBy("createdAt", "desc"));
  }

  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Subcategory, "id">),
  }));
}

export async function createSubcategory(
  shopId: string,
  user: AuditUser,
  input: CreateSubcategoryInput
): Promise<Subcategory> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const name = input.name?.trim();
  if (!name) {
    throw new Error("Subcategory name is required.");
  }
  if (!input.categoryId) {
    throw new Error("Parent category is required.");
  }

  const subcategoryId = `subcat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const subcategoryData: Subcategory = {
    id: subcategoryId,
    shopId: normShopId,
    categoryId: input.categoryId,
    categoryName: input.categoryName || "",
    name,
    description: input.description?.trim() || "",
    productsCount: 0,
    createdBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, subcategoryId);
  await setDoc(docRef, subcategoryData);

  // Increment subcategories count on parent category
  try {
    const parentCatRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, input.categoryId);
    await updateDoc(parentCatRef, {
      subcategoriesCount: increment(1),
      updatedAt: now,
    });
  } catch (e) {
    console.warn("Could not increment subcategoriesCount on parent category:", e);
  }

  return subcategoryData;
}

export async function updateSubcategory(
  shopId: string,
  subcategoryId: string,
  user: AuditUser,
  updates: Partial<CreateSubcategoryInput>
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const docRef = doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, subcategoryId);
  await updateDoc(docRef, {
    ...(updates.name ? { name: updates.name.trim() } : {}),
    ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
    ...(updates.categoryName ? { categoryName: updates.categoryName } : {}),
    updatedAt: Date.now(),
    updatedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  });
}

export async function deleteSubcategory(
  shopId: string,
  subcategoryId: string,
  parentCategoryId?: string
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId || !subcategoryId) return;

  const docRef = doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, subcategoryId);
  await deleteDoc(docRef);

  if (parentCategoryId) {
    try {
      const parentCatRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, parentCategoryId);
      await updateDoc(parentCatRef, {
        subcategoriesCount: increment(-1),
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn("Could not decrement subcategoriesCount on parent category:", e);
    }
  }
}

// -------------------------------------------------------------
// PRODUCTS (Level 3 - With Optional Description & Variants)
// -------------------------------------------------------------

export async function getProducts(
  shopId: string,
  subcategoryId?: string,
  categoryId?: string
): Promise<ProductItem[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const prodRef = collection(db, "shops", normShopId, PRODUCTS_COLLECTION);
  let q = query(prodRef, orderBy("createdAt", "desc"));

  if (subcategoryId) {
    q = query(prodRef, where("subcategoryId", "==", subcategoryId), orderBy("createdAt", "desc"));
  } else if (categoryId) {
    q = query(prodRef, where("categoryId", "==", categoryId), orderBy("createdAt", "desc"));
  }

  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ProductItem, "id">),
  }));
}

export async function getProductById(
  shopId: string,
  productId: string
): Promise<ProductItem | null> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId || !productId) return null;

  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  return { id: snap.id, ...(snap.data() as Omit<ProductItem, "id">) };
}

export async function createProduct(
  shopId: string,
  user: AuditUser,
  input: CreateProductInput
): Promise<ProductItem> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const name = input.name?.trim();
  if (!name) throw new Error("Product name is required.");
  if (!input.sku?.trim()) throw new Error("SKU is required.");
  if (!input.categoryId) throw new Error("Parent category is required.");
  if (!input.subcategoryId) throw new Error("Parent subcategory is required.");

  const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const productData: ProductItem = {
    id: productId,
    shopId: normShopId,
    categoryId: input.categoryId,
    categoryName: input.categoryName || "",
    subcategoryId: input.subcategoryId,
    subcategoryName: input.subcategoryName || "",
    name,
    images: input.images && input.images.length > 0 ? input.images : [],
    sku: input.sku.trim().toUpperCase(),
    barcode: input.barcode?.trim() || "",
    sellingPrice: Number(input.sellingPrice) || 0,
    costPrice: Number(input.costPrice) || 0,
    unit: input.unit?.trim() || "pcs",
    brand: input.brand?.trim() || "",
    brandId: input.brandId || "",
    supplier: input.supplier?.trim() || "",
    supplierId: input.supplierId || "",
    description: input.description?.trim() || "", // Optional
    hasVariants: Boolean(input.hasVariants),
    variants: input.variants && input.variants.length > 0 ? input.variants : [],
    stockQuantity: input.stockQuantity !== undefined ? Number(input.stockQuantity) : 100,
    minStockLevel: input.minStockLevel !== undefined ? Number(input.minStockLevel) : 10,
    status: input.status || "active",
    createdBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  await setDoc(docRef, productData);

  // Increment products count on category and subcategory
  try {
    const catRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, input.categoryId);
    await updateDoc(catRef, { productsCount: increment(1), updatedAt: now });

    const subRef = doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, input.subcategoryId);
    await updateDoc(subRef, { productsCount: increment(1), updatedAt: now });
  } catch (e) {
    console.warn("Could not increment productsCount on category/subcategory:", e);
  }

  return productData;
}

export async function updateProduct(
  shopId: string,
  productId: string,
  user: AuditUser,
  updates: Partial<CreateProductInput>
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  const patch: Record<string, unknown> = {
    updatedAt: Date.now(),
    updatedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  };

  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.sku !== undefined) patch.sku = updates.sku.trim().toUpperCase();
  if (updates.barcode !== undefined) patch.barcode = updates.barcode.trim();
  if (updates.sellingPrice !== undefined) patch.sellingPrice = Number(updates.sellingPrice) || 0;
  if (updates.costPrice !== undefined) patch.costPrice = Number(updates.costPrice) || 0;
  if (updates.unit !== undefined) patch.unit = updates.unit.trim();
  if (updates.brand !== undefined) patch.brand = updates.brand.trim();
  if (updates.brandId !== undefined) patch.brandId = updates.brandId;
  if (updates.supplier !== undefined) patch.supplier = updates.supplier.trim();
  if (updates.supplierId !== undefined) patch.supplierId = updates.supplierId;
  if (updates.description !== undefined) patch.description = updates.description.trim();
  if (updates.hasVariants !== undefined) patch.hasVariants = updates.hasVariants;
  if (updates.variants !== undefined) patch.variants = updates.variants;
  if (updates.images !== undefined) patch.images = updates.images;
  if (updates.stockQuantity !== undefined) patch.stockQuantity = Number(updates.stockQuantity);
  if (updates.minStockLevel !== undefined) patch.minStockLevel = Number(updates.minStockLevel);
  if (updates.status !== undefined) patch.status = updates.status;

  await updateDoc(docRef, patch);
}

export async function deleteProduct(
  shopId: string,
  productId: string,
  categoryId?: string,
  subcategoryId?: string
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId || !productId) return;

  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  await deleteDoc(docRef);

  // Decrement counts
  if (categoryId) {
    try {
      const catRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, categoryId);
      await updateDoc(catRef, { productsCount: increment(-1), updatedAt: Date.now() });
    } catch (e) {
      console.warn("Could not decrement productsCount on category:", e);
    }
  }

  if (subcategoryId) {
    try {
      const subRef = doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, subcategoryId);
      await updateDoc(subRef, { productsCount: increment(-1), updatedAt: Date.now() });
    } catch (e) {
      console.warn("Could not decrement productsCount on subcategory:", e);
    }
  }
}

// -------------------------------------------------------------
// FIREBASE STORAGE: Product Image Upload
// -------------------------------------------------------------

export async function uploadProductImage(shopId: string, file: File): Promise<string> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) throw new Error("Shop ID is required for image upload.");

  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${cleanFileName}`;
  const storagePath = `shops/${normShopId}/products/${uniqueName}`;

  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
    customMetadata: {
      shopId: normShopId,
      originalName: file.name,
    },
  });

  const downloadUrl = await getDownloadURL(snapshot.ref);

  try {
    const imgDocRef = doc(db, "shops", normShopId, IMAGES_COLLECTION, uniqueName);
    await setDoc(imgDocRef, {
      id: uniqueName,
      shopId: normShopId,
      storagePath,
      downloadUrl,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      uploadedAt: Date.now(),
    });
  } catch (err) {
    console.warn("[CatalogService] Could not register image document record:", err);
  }

  return downloadUrl;
}
