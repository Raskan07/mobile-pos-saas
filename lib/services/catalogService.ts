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
// FAST IN-MEMORY & SESSIONSTORAGE CATALOG CACHE (SWR, BRANCH-SCOPED)
// -------------------------------------------------------------
export interface CatalogCacheSnapshot {
  categories: Category[];
  subcategories: Subcategory[];
  products: ProductItem[];
  brands: Brand[];
  suppliers: Supplier[];
  updatedAt: number;
}

const memoryCatalogCache = new Map<string, CatalogCacheSnapshot>();
const CATALOG_STORAGE_PREFIX = "pos_catalog_cache_v2_";

export function resolveEffectiveBranchId(branchId?: string | null): string {
  const clean = (branchId || "").trim();
  if (!clean || clean === "ALL") return "main";
  return clean;
}

function buildCatalogCacheKey(shopId: string, branchId?: string): string {
  const normShopId = normalizeShopId(shopId);
  const normBranch = (branchId || "main").trim() || "main";
  return `${normShopId}__${normBranch}`;
}

export function getCachedCatalogSnapshot(
  shopId: string,
  branchId?: string
): CatalogCacheSnapshot | null {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return null;
  const cacheKey = buildCatalogCacheKey(normShopId, branchId);

  const inMem = memoryCatalogCache.get(cacheKey);
  if (inMem) return inMem;

  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(`${CATALOG_STORAGE_PREFIX}${cacheKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CatalogCacheSnapshot;
        if (parsed && Array.isArray(parsed.products)) {
          memoryCatalogCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {
      // ignore storage parse error
    }
  }
  return null;
}

export function saveCachedCatalogSnapshot(
  shopId: string,
  snapshot: Omit<CatalogCacheSnapshot, "updatedAt">,
  branchId?: string
): void {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return;
  const cacheKey = buildCatalogCacheKey(normShopId, branchId);

  const entry: CatalogCacheSnapshot = {
    ...snapshot,
    updatedAt: Date.now(),
  };
  memoryCatalogCache.set(cacheKey, entry);

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(`${CATALOG_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(entry));
    } catch {
      // ignore storage quota
    }
  }
}

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
// CATEGORIES (Level 1 - Branch Scoped under shops/{shopId}/branches/{branchId}/categories)
// -------------------------------------------------------------

export async function getCategories(
  shopId: string,
  branchId?: string
): Promise<Category[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const catMap = new Map<string, Category>();
  const shopCatRef = collection(db, "shops", normShopId, CATEGORIES_COLLECTION);
  const queries: Promise<unknown>[] = [getDocs(query(shopCatRef))];

  if (branchId && branchId !== "ALL") {
    const branchCatRef = collection(
      db,
      "shops",
      normShopId,
      "branches",
      branchId,
      CATEGORIES_COLLECTION
    );
    queries.unshift(getDocs(query(branchCatRef)));
  }

  const results = await Promise.allSettled(queries);
  results.forEach((res) => {
    if (res.status === "fulfilled" && res.value) {
      const snap = res.value as Awaited<ReturnType<typeof getDocs>>;
      snap.docs.forEach((docSnap) => {
        if (catMap.has(docSnap.id)) return;
        const data = docSnap.data() as Omit<Category, "id">;
        const docBranchId = resolveEffectiveBranchId(data.branchId);
        const catObj: Category = {
          id: docSnap.id,
          ...data,
          branchId: docBranchId,
        };
        if (!data.branchId) {
          // Backfill missing branchId to "main"
          void setDoc(
            doc(db, "shops", normShopId, CATEGORIES_COLLECTION, docSnap.id),
            { branchId: "main" },
            { merge: true }
          ).catch(() => {});
          void setDoc(
            doc(db, "shops", normShopId, "branches", "main", CATEGORIES_COLLECTION, docSnap.id),
            catObj,
            { merge: true }
          ).catch(() => {});
        }
        catMap.set(docSnap.id, catObj);
      });
    }
  });

  let list = Array.from(catMap.values());
  if (branchId && branchId !== "ALL") {
    list = list.filter((c) => resolveEffectiveBranchId(c.branchId) === branchId);
  }
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
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

  const targetBranchId = resolveEffectiveBranchId(input.branchId);
  const categoryId = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const categoryData: Category = {
    id: categoryId,
    shopId: normShopId,
    branchId: targetBranchId,
    branchName: input.branchName || "",
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
  const branchDocRef = doc(
    db,
    "shops",
    normShopId,
    "branches",
    targetBranchId,
    CATEGORIES_COLLECTION,
    categoryId
  );
  await Promise.all([
    setDoc(docRef, categoryData),
    setDoc(branchDocRef, categoryData).catch(() => {}),
  ]);

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
  categoryId?: string,
  branchId?: string
): Promise<Subcategory[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const subMap = new Map<string, Subcategory>();
  const subRef = collection(db, "shops", normShopId, SUBCATEGORIES_COLLECTION);
  const queries: Promise<unknown>[] = [
    getDocs(categoryId ? query(subRef, where("categoryId", "==", categoryId)) : query(subRef)),
  ];

  if (branchId && branchId !== "ALL") {
    const branchSubRef = collection(
      db,
      "shops",
      normShopId,
      "branches",
      branchId,
      SUBCATEGORIES_COLLECTION
    );
    queries.unshift(
      getDocs(
        categoryId
          ? query(branchSubRef, where("categoryId", "==", categoryId))
          : query(branchSubRef)
      )
    );
  }

  const results = await Promise.allSettled(queries);
  results.forEach((res) => {
    if (res.status === "fulfilled" && res.value) {
      const snap = res.value as Awaited<ReturnType<typeof getDocs>>;
      snap.docs.forEach((docSnap) => {
        if (subMap.has(docSnap.id)) return;
        const data = docSnap.data() as Omit<Subcategory, "id">;
        const docBranchId = resolveEffectiveBranchId(data.branchId);
        const subObj: Subcategory = {
          id: docSnap.id,
          ...data,
          branchId: docBranchId,
        };
        if (!data.branchId) {
          void setDoc(
            doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, docSnap.id),
            { branchId: "main" },
            { merge: true }
          ).catch(() => {});
          void setDoc(
            doc(db, "shops", normShopId, "branches", "main", SUBCATEGORIES_COLLECTION, docSnap.id),
            subObj,
            { merge: true }
          ).catch(() => {});
        }
        subMap.set(docSnap.id, subObj);
      });
    }
  });

  let list = Array.from(subMap.values());
  if (branchId && branchId !== "ALL") {
    list = list.filter((s) => resolveEffectiveBranchId(s.branchId) === branchId);
  }
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
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

  const targetBranchId = resolveEffectiveBranchId(input.branchId);
  const subcategoryId = `subcat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const subcategoryData: Subcategory = {
    id: subcategoryId,
    shopId: normShopId,
    branchId: targetBranchId,
    branchName: input.branchName || "",
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
  const branchDocRef = doc(
    db,
    "shops",
    normShopId,
    "branches",
    targetBranchId,
    SUBCATEGORIES_COLLECTION,
    subcategoryId
  );
  await Promise.all([
    setDoc(docRef, subcategoryData),
    setDoc(branchDocRef, subcategoryData).catch(() => {}),
  ]);

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
  categoryId?: string,
  branchId?: string
): Promise<ProductItem[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  const productMap = new Map<string, ProductItem>();

  const prodRef = collection(db, "shops", normShopId, PRODUCTS_COLLECTION);
  let subQ = query(prodRef);
  if (subcategoryId) {
    subQ = query(prodRef, where("subcategoryId", "==", subcategoryId));
  } else if (categoryId) {
    subQ = query(prodRef, where("categoryId", "==", categoryId));
  }

  const rootRef = collection(db, PRODUCTS_COLLECTION);
  let rootQ = query(rootRef, where("shopId", "==", normShopId));
  if (subcategoryId) {
    rootQ = query(
      rootRef,
      where("shopId", "==", normShopId),
      where("subcategoryId", "==", subcategoryId)
    );
  } else if (categoryId) {
    rootQ = query(
      rootRef,
      where("shopId", "==", normShopId),
      where("categoryId", "==", categoryId)
    );
  }

  const queries: Promise<unknown>[] = [getDocs(subQ), getDocs(rootQ)];

  // Also query the hierarchical branch products path: shops/{shopId}/branches/{branchId}/products
  if (branchId && branchId !== "ALL") {
    const branchProdRef = collection(
      db,
      "shops",
      normShopId,
      "branches",
      branchId,
      PRODUCTS_COLLECTION
    );
    let branchQ = query(branchProdRef);
    if (subcategoryId) {
      branchQ = query(branchProdRef, where("subcategoryId", "==", subcategoryId));
    } else if (categoryId) {
      branchQ = query(branchProdRef, where("categoryId", "==", categoryId));
    }
    queries.unshift(getDocs(branchQ));
  }

  const results = await Promise.allSettled(queries);

  results.forEach((res) => {
    if (res.status === "fulfilled" && res.value) {
      const snap = res.value as Awaited<ReturnType<typeof getDocs>>;
      snap.docs.forEach((docSnap) => {
        if (productMap.has(docSnap.id)) return;
        const data = docSnap.data() as Omit<ProductItem, "id">;
        const resolvedBranchId = resolveEffectiveBranchId(data.branchId);
        const prodObj: ProductItem = {
          id: docSnap.id,
          ...data,
          branchId: resolvedBranchId,
          name: (data.name || "").toUpperCase(),
        };

        // If a legacy product has no branchId, set it to "main" and backfill in Firestore
        if (!data.branchId) {
          void setDoc(
            doc(db, "shops", normShopId, PRODUCTS_COLLECTION, docSnap.id),
            { branchId: "main" },
            { merge: true }
          ).catch(() => {});
          void setDoc(
            doc(db, PRODUCTS_COLLECTION, docSnap.id),
            { branchId: "main" },
            { merge: true }
          ).catch(() => {});
          void setDoc(
            doc(db, "shops", normShopId, "branches", "main", PRODUCTS_COLLECTION, docSnap.id),
            prodObj,
            { merge: true }
          ).catch(() => {});
        }

        productMap.set(docSnap.id, prodObj);
      });
    }
  });

  let list = Array.from(productMap.values());
  if (branchId && branchId !== "ALL") {
    list = list.filter((p) => resolveEffectiveBranchId(p.branchId) === branchId);
  }
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

export async function getProductById(
  shopId: string,
  productId: string
): Promise<ProductItem | null> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId || !productId) return null;

  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  const rootDocRef = doc(db, PRODUCTS_COLLECTION, productId);

  const [subSnap, rootSnap] = await Promise.allSettled([
    getDoc(docRef),
    getDoc(rootDocRef),
  ]);

  if (subSnap.status === "fulfilled" && subSnap.value.exists()) {
    const data = subSnap.value.data() as Omit<ProductItem, "id">;
    return {
      id: subSnap.value.id,
      ...data,
      branchId: resolveEffectiveBranchId(data.branchId),
      name: (data.name || "").toUpperCase(),
    };
  }
  if (rootSnap.status === "fulfilled" && rootSnap.value.exists()) {
    const data = rootSnap.value.data() as Omit<ProductItem, "id">;
    return {
      id: rootSnap.value.id,
      ...data,
      branchId: resolveEffectiveBranchId(data.branchId),
      name: (data.name || "").toUpperCase(),
    };
  }

  return null;
}

export async function ensureCommonCategory(
  shopId: string,
  user: AuditUser,
  branchId?: string
): Promise<Category> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);
  const targetBranchId = resolveEffectiveBranchId(branchId);

  const existingCats = await getCategories(normShopId, targetBranchId);
  const found = existingCats.find(
    (c) =>
      c.name.trim().toLowerCase() === "common" &&
      resolveEffectiveBranchId(c.branchId) === targetBranchId
  );
  if (found) return found;

  const now = Date.now();
  const commonCatId = targetBranchId === "main" ? "cat_common" : `cat_common_${targetBranchId}`;
  const commonCategory: Category = {
    id: commonCatId,
    shopId: normShopId,
    branchId: targetBranchId,
    name: "Common",
    description: "Quick products & general catalog items (no subcategory required)",
    icon: "Package",
    color: "#10b981",
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

  const docRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, commonCatId);
  const branchDocRef = doc(
    db,
    "shops",
    normShopId,
    "branches",
    targetBranchId,
    CATEGORIES_COLLECTION,
    commonCatId
  );
  await Promise.all([
    setDoc(docRef, commonCategory),
    setDoc(branchDocRef, commonCategory).catch(() => {}),
  ]);
  return commonCategory;
}

export async function createProduct(
  shopId: string,
  user: AuditUser,
  input: CreateProductInput
): Promise<ProductItem> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const name = input.name?.trim().toUpperCase();
  if (!name) throw new Error("Product name is required.");
  if (!input.sku?.trim()) throw new Error("SKU is required.");
  if (!input.categoryId) throw new Error("Parent category is required.");

  const targetBranchId = resolveEffectiveBranchId(input.branchId);
  const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const productData: ProductItem = {
    id: productId,
    shopId: normShopId,
    branchId: targetBranchId,
    branchName: input.branchName || "",
    categoryId: input.categoryId,
    categoryName: input.categoryName || "Common",
    subcategoryId: input.subcategoryId || "",
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
    minStockLevel: input.minStockLevel !== undefined ? Number(input.minStockLevel) : 5,
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

  // Primary hierarchical path: shops/{shopId}/branches/{branchId}/products/{productId}
  const branchDocRef = doc(
    db,
    "shops",
    normShopId,
    "branches",
    targetBranchId,
    PRODUCTS_COLLECTION,
    productId
  );
  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  const rootDocRef = doc(db, PRODUCTS_COLLECTION, productId);
  const catRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, input.categoryId);

  const tasks: Promise<unknown>[] = [
    setDoc(branchDocRef, productData),
    setDoc(docRef, productData),
    setDoc(rootDocRef, productData).catch((e) =>
      console.warn("[CatalogService] Notice mirroring product to root products collection:", e)
    ),
    updateDoc(catRef, { productsCount: increment(1), updatedAt: now }).catch(() => {}),
  ];

  if (input.subcategoryId) {
    const subRef = doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, input.subcategoryId);
    tasks.push(updateDoc(subRef, { productsCount: increment(1), updatedAt: now }).catch(() => {}));
  }

  await Promise.all(tasks);
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

  const existing = await getProductById(normShopId, productId);
  const targetBranchId = resolveEffectiveBranchId(updates.branchId || existing?.branchId);

  const branchDocRef = doc(
    db,
    "shops",
    normShopId,
    "branches",
    targetBranchId,
    PRODUCTS_COLLECTION,
    productId
  );
  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  const rootDocRef = doc(db, PRODUCTS_COLLECTION, productId);
  const patch: Record<string, unknown> = {
    branchId: targetBranchId,
    updatedAt: Date.now(),
    updatedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  };

  if (updates.name !== undefined) patch.name = updates.name.trim().toUpperCase();
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
  if (updates.categoryId !== undefined) patch.categoryId = updates.categoryId;
  if (updates.categoryName !== undefined) patch.categoryName = updates.categoryName;
  if (updates.subcategoryId !== undefined) patch.subcategoryId = updates.subcategoryId;
  if (updates.subcategoryName !== undefined) patch.subcategoryName = updates.subcategoryName;

  await Promise.all([
    setDoc(branchDocRef, patch, { merge: true }).catch(() => {}),
    setDoc(docRef, patch, { merge: true }),
    setDoc(rootDocRef, patch, { merge: true }).catch((e) =>
      console.warn("[CatalogService] Notice updating root products doc:", e)
    ),
  ]);
}

export async function moveProductToSubcategory(
  shopId: string,
  productId: string,
  user: AuditUser,
  target: {
    branchId?: string;
    categoryId: string;
    categoryName: string;
    subcategoryId: string;
    subcategoryName: string;
    previousCategoryId?: string;
    previousSubcategoryId?: string;
  }
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  assertValidSession(normShopId, user);

  const targetBranchId = resolveEffectiveBranchId(target.branchId);
  const now = Date.now();
  const patch = {
    branchId: targetBranchId,
    categoryId: target.categoryId,
    categoryName: target.categoryName,
    subcategoryId: target.subcategoryId || "",
    subcategoryName: target.subcategoryName || "",
    updatedAt: now,
    updatedBy: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    },
  };

  const branchDocRef = doc(
    db,
    "shops",
    normShopId,
    "branches",
    targetBranchId,
    PRODUCTS_COLLECTION,
    productId
  );
  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  const rootDocRef = doc(db, PRODUCTS_COLLECTION, productId);

  const tasks: Promise<unknown>[] = [
    setDoc(branchDocRef, patch, { merge: true }).catch(() => {}),
    setDoc(docRef, patch, { merge: true }),
    setDoc(rootDocRef, patch, { merge: true }).catch(() => {}),
  ];

  if (
    target.previousSubcategoryId &&
    target.previousSubcategoryId !== target.subcategoryId
  ) {
    const oldSubRef = doc(
      db,
      "shops",
      normShopId,
      SUBCATEGORIES_COLLECTION,
      target.previousSubcategoryId
    );
    tasks.push(updateDoc(oldSubRef, { productsCount: increment(-1), updatedAt: now }).catch(() => {}));
  }

  if (target.subcategoryId && target.subcategoryId !== target.previousSubcategoryId) {
    const newSubRef = doc(
      db,
      "shops",
      normShopId,
      SUBCATEGORIES_COLLECTION,
      target.subcategoryId
    );
    tasks.push(updateDoc(newSubRef, { productsCount: increment(1), updatedAt: now }).catch(() => {}));
  }

  if (target.previousCategoryId && target.previousCategoryId !== target.categoryId) {
    const oldCatRef = doc(
      db,
      "shops",
      normShopId,
      CATEGORIES_COLLECTION,
      target.previousCategoryId
    );
    const newCatRef = doc(
      db,
      "shops",
      normShopId,
      CATEGORIES_COLLECTION,
      target.categoryId
    );
    tasks.push(updateDoc(oldCatRef, { productsCount: increment(-1), updatedAt: now }).catch(() => {}));
    tasks.push(updateDoc(newCatRef, { productsCount: increment(1), updatedAt: now }).catch(() => {}));
  }

  await Promise.all(tasks);
}

export async function deleteProduct(
  shopId: string,
  productId: string,
  categoryId?: string,
  subcategoryId?: string,
  branchId?: string
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId || !productId) return;

  const targetBranchId = resolveEffectiveBranchId(branchId);
  const branchDocRef = doc(
    db,
    "shops",
    normShopId,
    "branches",
    targetBranchId,
    PRODUCTS_COLLECTION,
    productId
  );
  const docRef = doc(db, "shops", normShopId, PRODUCTS_COLLECTION, productId);
  const rootDocRef = doc(db, PRODUCTS_COLLECTION, productId);
  const now = Date.now();

  const tasks: Promise<unknown>[] = [
    deleteDoc(branchDocRef).catch(() => {}),
    deleteDoc(docRef),
    deleteDoc(rootDocRef).catch(() => {}),
  ];

  if (categoryId) {
    const catRef = doc(db, "shops", normShopId, CATEGORIES_COLLECTION, categoryId);
    tasks.push(updateDoc(catRef, { productsCount: increment(-1), updatedAt: now }).catch(() => {}));
  }

  if (subcategoryId) {
    const subRef = doc(db, "shops", normShopId, SUBCATEGORIES_COLLECTION, subcategoryId);
    tasks.push(updateDoc(subRef, { productsCount: increment(-1), updatedAt: now }).catch(() => {}));
  }

  await Promise.all(tasks);
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
