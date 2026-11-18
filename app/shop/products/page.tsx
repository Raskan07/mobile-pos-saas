"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Layers,
  ChevronRight,
  Plus,
  Search,
  Table as TableIcon,
  LayoutGrid,
  Info,
  X,
  UploadCloud,
  Check,
  Trash2,
  Barcode,
  ScanLine,
  Clock,
  ShieldCheck,
  RefreshCw,
  Box,
  Smartphone,
  Headphones,
  Wrench,
  Radio,
  Zap,
  Tag,
  Store,
  Sparkles,
  Pencil,
  FolderInput,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  Category,
  Subcategory,
  ProductItem,
  ProductVariant,
  Brand,
  Supplier,
  AuditUser,
  CreateCategoryInput,
  CreateSubcategoryInput,
  CreateProductInput,
} from "@/lib/types/catalog";
import {
  getCategories,
  createCategory,
  deleteCategory,
  getSubcategories,
  createSubcategory,
  deleteSubcategory,
  getProducts,
  createProduct,
  updateProduct,
  moveProductToSubcategory,
  deleteProduct,
  ensureCommonCategory,
  getCachedCatalogSnapshot,
  saveCachedCatalogSnapshot,
  uploadProductImage,
  getBrands,
  createBrand,
  getSuppliers,
  createSupplier,
  generateUniqueSKU,
  generateUniqueBarcode,
} from "@/lib/services/catalogService";

const CATEGORY_ICONS = [
  { id: "Smartphone", icon: Smartphone },
  { id: "Headphones", icon: Headphones },
  { id: "Package", icon: Package },
  { id: "Wrench", icon: Wrench },
  { id: "Radio", icon: Radio },
  { id: "Zap", icon: Zap },
  { id: "Store", icon: Store },
  { id: "Tag", icon: Tag },
];

const PRESET_COLORS = [
  "#6366f1",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#3b82f6",
  "#ef4444",
];

function getProductTotalStock(prod: ProductItem): number {
  if (Array.isArray(prod.variants) && prod.variants.length > 0) {
    const variantsSum = prod.variants.reduce(
      (sum, v) => sum + (Number(v.stockQuantity) || 0),
      0
    );
    if (variantsSum > 0 || prod.hasVariants) {
      return variantsSum > 0 ? variantsSum : Number(prod.stockQuantity) || 0;
    }
  }
  return Number(prod.stockQuantity) || 0;
}

function formatLKR(val: number): string {
  const num = Number(val) || 0;
  return `LKR ${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ProductsCatalogPage() {
  const router = useRouter();
  const shopAuth = useShopAuth();

  // Shop & User Context
  const shop = shopAuth?.shop || {
    shopId: "SHOP-7294",
    shopName: "HM POS Mobile Hub",
    ownerName: "Raskan",
    phone: "+1 (555) 234-8900",
    address: "142 Tech Avenue, Suite 4B",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const user = shopAuth?.user || {
    uid: "usr-cashier-01",
    shopId: shop.shopId,
    username: "raskan",
    displayName: "Raskan",
    email: "cashier@hmpos.local",
    role: "manager",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const activeBranchId = shopAuth?.activeBranchId || shopAuth?.user?.primaryBranchId || "main";
  const activeBranchName =
    activeBranchId === "ALL"
      ? "Main Branch"
      : shopAuth?.activeBranchName || "Main Branch";
  const effectiveBranchId = activeBranchId === "ALL" ? "main" : activeBranchId;

  const auditUser: AuditUser = useMemo(
    () => ({
      userId: user.uid,
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username,
    }),
    [user]
  );

  const canManage = user.role === "admin" || user.role === "manager";

  // Hierarchy Navigation State
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);

  // Catalog Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Search & View options
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilterTab, setSearchFilterTab] = useState<"all" | "categories" | "subcategories" | "products">("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [showAllProducts, setShowAllProducts] = useState<boolean>(false);

  // Modals & Panels
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isAddSubcategoryOpen, setIsAddSubcategoryOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [movingProduct, setMovingProduct] = useState<ProductItem | null>(null);
  const [draggingProduct, setDraggingProduct] = useState<ProductItem | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [activeDetailProduct, setActiveDetailProduct] = useState<ProductItem | null>(null);

  // -------------------------------------------------------------
  // DATA LOADING (Instant SWR Cache Hydration + Background Refresh)
  // -------------------------------------------------------------
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [cats, subs, prods, brds, sups] = await Promise.all([
        getCategories(shop.shopId, activeBranchId),
        getSubcategories(shop.shopId, undefined, activeBranchId),
        getProducts(shop.shopId, undefined, undefined, activeBranchId),
        getBrands(shop.shopId),
        getSuppliers(shop.shopId),
      ]);
      setCategories(cats);
      setSubcategories(subs);
      setProducts(prods);
      setBrands(brds);
      setSuppliers(sups);
      saveCachedCatalogSnapshot(
        shop.shopId,
        {
          categories: cats,
          subcategories: subs,
          products: prods,
          brands: brds,
          suppliers: sups,
        },
        activeBranchId
      );

      if (selectedCategory) {
        const freshCat = cats.find((c) => c.id === selectedCategory.id);
        if (freshCat) setSelectedCategory(freshCat);
        else {
          setSelectedCategory(null);
          setSelectedSubcategory(null);
        }
      }
      if (selectedSubcategory) {
        const freshSub = subs.find((s) => s.id === selectedSubcategory.id);
        if (freshSub) setSelectedSubcategory(freshSub);
        else setSelectedSubcategory(null);
      }
      if (activeDetailProduct) {
        const freshProd = prods.find((p) => p.id === activeDetailProduct.id);
        if (freshProd) setActiveDetailProduct(freshProd);
        else setActiveDetailProduct(null);
      }
    } catch (err) {
      console.error("[ProductsCatalog] Error loading catalog:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!shop?.shopId) return;
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setActiveDetailProduct(null);
    // Immediately hydrate from SWR cache if present so listing is 0ms instant!
    const cached = getCachedCatalogSnapshot(shop.shopId, activeBranchId);
    if (cached) {
      setCategories(cached.categories);
      setSubcategories(cached.subcategories);
      setProducts(cached.products);
      setBrands(cached.brands);
      setSuppliers(cached.suppliers);
      setIsLoading(false);
      loadData(true);
    } else {
      loadData(false);
    }
  }, [shop?.shopId, activeBranchId]);

  // Move single product to any subcategory (or direct in Main Category) via Drag & Drop or Modal
  const handleMoveProduct = async (
    prod: ProductItem,
    targetCategoryId: string,
    targetCategoryName: string,
    targetSubcategoryId: string,
    targetSubcategoryName: string
  ) => {
    if (
      prod.categoryId === targetCategoryId &&
      (prod.subcategoryId || "") === (targetSubcategoryId || "")
    ) {
      return;
    }

    // Optimistic UI update so drag & drop feels instantaneous
    setProducts((prev) =>
      prev.map((p) =>
        p.id === prod.id
          ? {
              ...p,
              categoryId: targetCategoryId,
              categoryName: targetCategoryName,
              subcategoryId: targetSubcategoryId,
              subcategoryName: targetSubcategoryName,
              updatedAt: Date.now(),
            }
          : p
      )
    );

    if (activeDetailProduct?.id === prod.id) {
      setActiveDetailProduct((prev) =>
        prev
          ? {
              ...prev,
              categoryId: targetCategoryId,
              categoryName: targetCategoryName,
              subcategoryId: targetSubcategoryId,
              subcategoryName: targetSubcategoryName,
            }
          : null
      );
    }

    try {
      await moveProductToSubcategory(shop.shopId, prod.id, auditUser, {
        categoryId: targetCategoryId,
        categoryName: targetCategoryName,
        subcategoryId: targetSubcategoryId,
        subcategoryName: targetSubcategoryName,
        previousCategoryId: prod.categoryId,
        previousSubcategoryId: prod.subcategoryId,
        branchId: prod.branchId || effectiveBranchId,
      });
      await loadData(true);
    } catch (err) {
      console.error("Failed to move product:", err);
      alert("Failed to move product to selected subcategory.");
      await loadData(true);
    }
  };

  // Clean Query for Unified Search
  const cleanQuery = searchQuery.trim().toLowerCase();

  // Unified Search Results across Categories, Subcategories, and Products
  const matchingCategories = useMemo(() => {
    if (!cleanQuery) return [];
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(cleanQuery) ||
        (c.description && c.description.toLowerCase().includes(cleanQuery))
    );
  }, [categories, cleanQuery]);

  const matchingSubcategories = useMemo(() => {
    if (!cleanQuery) return [];
    return subcategories.filter(
      (s) =>
        s.name.toLowerCase().includes(cleanQuery) ||
        (s.categoryName && s.categoryName.toLowerCase().includes(cleanQuery)) ||
        (s.description && s.description.toLowerCase().includes(cleanQuery))
    );
  }, [subcategories, cleanQuery]);

  const matchingProducts = useMemo(() => {
    if (!cleanQuery) return [];
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(cleanQuery) ||
        p.sku.toLowerCase().includes(cleanQuery) ||
        (p.barcode && p.barcode.toLowerCase().includes(cleanQuery)) ||
        p.brand.toLowerCase().includes(cleanQuery) ||
        p.supplier.toLowerCase().includes(cleanQuery) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(cleanQuery)) ||
        (p.subcategoryName && p.subcategoryName.toLowerCase().includes(cleanQuery)) ||
        (p.variants &&
          p.variants.some(
            (v) =>
              v.sku.toLowerCase().includes(cleanQuery) ||
              (v.barcode && v.barcode.toLowerCase().includes(cleanQuery)) ||
              (v.size && v.size.toLowerCase().includes(cleanQuery)) ||
              (v.color && v.color.toLowerCase().includes(cleanQuery))
          ))
    );
  }, [products, cleanQuery]);

  const totalSearchMatches =
    matchingCategories.length + matchingSubcategories.length + matchingProducts.length;

  // Filtered views for current hierarchy level
  const currentSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    return subcategories.filter((s) => s.categoryId === selectedCategory.id);
  }, [subcategories, selectedCategory]);

  const currentProducts = useMemo(() => {
    if (selectedSubcategory) {
      return products.filter((p) => p.subcategoryId === selectedSubcategory.id);
    } else if (selectedCategory) {
      return products.filter((p) => p.categoryId === selectedCategory.id);
    }
    return products;
  }, [products, selectedCategory, selectedSubcategory]);

  // Direct products under a category (e.g. "Common" category or products with no subcategory)
  const directCategoryProducts = useMemo(() => {
    if (!selectedCategory) return [];
    const isCommon =
      selectedCategory.id === "cat_common" ||
      selectedCategory.name.trim().toLowerCase() === "common";
    return products.filter(
      (p) =>
        p.categoryId === selectedCategory.id &&
        (isCommon || !p.subcategoryId || p.subcategoryId.trim() === "")
    );
  }, [products, selectedCategory]);

  // -------------------------------------------------------------
  // DELETE HANDLERS
  // -------------------------------------------------------------
  const handleDeleteCategory = async (cat: Category, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await deleteCategory(shop.shopId, cat.id);
      if (selectedCategory?.id === cat.id) {
        setSelectedCategory(null);
        setSelectedSubcategory(null);
      }
      await loadData(true);
    } catch (err) {
      alert("Failed to delete category");
    }
  };

  const handleDeleteSubcategory = async (sub: Subcategory, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete subcategory "${sub.name}"?`)) return;
    try {
      await deleteSubcategory(shop.shopId, sub.id, sub.categoryId);
      if (selectedSubcategory?.id === sub.id) {
        setSelectedSubcategory(null);
      }
      await loadData(true);
    } catch (err) {
      alert("Failed to delete subcategory");
    }
  };

  const handleDeleteProduct = async (prod: ProductItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete product "${prod.name}"?`)) return;
    try {
      await deleteProduct(
        shop.shopId,
        prod.id,
        prod.categoryId,
        prod.subcategoryId,
        prod.branchId || effectiveBranchId
      );
      if (activeDetailProduct?.id === prod.id) {
        setActiveDetailProduct(null);
      }
      await loadData(true);
    } catch (err) {
      alert("Failed to delete product");
    }
  };

  return (
    <div className="min-h-screen bg-[#07080e] text-zinc-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* ========================================================================= */}
      {/* ULTRA-COMPACT STREAMLINED HEADER BAR WITH UNIFIED SEARCH                  */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 bg-[#0c0d14]/95 backdrop-blur-md border-b border-white/[0.08] px-3 sm:px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Left: Arrow-Only Back Icon + Breadcrumbs */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => router.push("/shop/dashboard")}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
              title="Return to POS"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-white/10 shrink-0" />

            {/* Compact Breadcrumbs + All Products Toggle */}
            <nav className="flex items-center gap-1 text-xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAllProducts(false);
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  !showAllProducts && !selectedCategory && !cleanQuery
                    ? "bg-white/[0.08] text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>Categories</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-white/10 text-zinc-300 font-mono">
                  {categories.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAllProducts(true);
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  showAllProducts && !cleanQuery
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Package className="w-3 h-3" />
                <span>All Products</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-white/10 text-zinc-300 font-mono">
                  {products.length}
                </span>
              </button>

              {selectedCategory && (
                <>
                  <ChevronRight className="w-3 h-3 text-zinc-600" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllProducts(false);
                      setSelectedSubcategory(null);
                      setSearchQuery("");
                    }}
                    onDragOver={(e) => {
                      if (!canManage || !draggingProduct) return;
                      e.preventDefault();
                      setDragOverTargetId(`cat_${selectedCategory.id}`);
                    }}
                    onDragLeave={() => setDragOverTargetId(null)}
                    onDrop={(e) => {
                      if (!canManage || !draggingProduct) return;
                      e.preventDefault();
                      setDragOverTargetId(null);
                      handleMoveProduct(draggingProduct, selectedCategory.id, selectedCategory.name, "", "");
                      setDraggingProduct(null);
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      dragOverTargetId === `cat_${selectedCategory.id}`
                        ? "bg-emerald-500/25 text-emerald-200 ring-2 ring-emerald-500/60 font-semibold"
                        : selectedCategory && !selectedSubcategory && !cleanQuery
                        ? "bg-white/[0.08] text-white font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    title="Click to open Main Category, or drag & drop a product here to place directly in Main Category"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: selectedCategory.color || "#6366f1" }}
                    />
                    <span className="truncate max-w-[120px]">{selectedCategory.name}</span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-white/10 text-zinc-300 font-mono">
                      {currentSubcategories.length}
                    </span>
                  </button>
                </>
              )}

              {selectedSubcategory && (
                <>
                  <ChevronRight className="w-3 h-3 text-zinc-600" />
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold">
                    <span className="truncate max-w-[120px]">{selectedSubcategory.name}</span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-200 font-mono">
                      {currentProducts.length}
                    </span>
                  </div>
                </>
              )}
            </nav>
          </div>

          {/* Center: Unified Search Bar across Categories, Subcategories & Products */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search products, subcategories, or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/60 text-xs text-white placeholder:text-zinc-500 outline-hidden transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5 rounded cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right: Quick Action Button + Refresh Icon */}
          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setIsQuickProductOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm transition-all cursor-pointer"
                  title="Create Quick Product (Automatically saved under Common Category with no subcategory)"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Quick Product</span>
                </button>

                {!selectedCategory ? (
                  <button
                    type="button"
                    onClick={() => setIsAddCategoryOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Category</span>
                  </button>
                ) : !selectedSubcategory ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsAddSubcategoryOpen(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">Subcategory</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddProductOpen(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
                      title={`Create individual product directly in ${selectedCategory.name} without a subcategory`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">Product</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddProductOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Product</span>
                  </button>
                )}
              </>
            )}

            {/* Barcode Center Quick Link */}
            <button
              type="button"
              onClick={() => router.push("/shop/barcode")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-indigo-600/20 hover:border-indigo-500/30 border border-white/[0.08] text-zinc-300 hover:text-indigo-300 text-xs font-medium transition-all cursor-pointer"
              title="Open Barcode Center"
            >
              <ScanLine className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Barcode Center</span>
            </button>

            {/* Refresh Icon Only (Reloads catalog) */}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer disabled:opacity-50"
              title="Reload catalog"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN BODY                                                                 */}
      {/* ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-2 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <p className="text-xs">Loading catalog...</p>
          </div>
        ) : cleanQuery ? (
          /* ========================================================================= */
          /* UNIFIED SEARCH RESULTS VIEW ACROSS CATEGORIES, SUBCATEGORIES & PRODUCTS   */
          /* ========================================================================= */
          <div className="flex flex-col gap-4">
            {/* Filter Tabs & Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSearchFilterTab("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    searchFilterTab === "all" ? "bg-white/10 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All ({totalSearchMatches})
                </button>
                <button
                  type="button"
                  onClick={() => setSearchFilterTab("categories")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    searchFilterTab === "categories" ? "bg-white/10 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Categories ({matchingCategories.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSearchFilterTab("subcategories")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    searchFilterTab === "subcategories" ? "bg-white/10 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Subcategories ({matchingSubcategories.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSearchFilterTab("products")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    searchFilterTab === "products" ? "bg-white/10 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Products ({matchingProducts.length})
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center p-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      viewMode === "table" ? "bg-white/10 text-white" : "text-zinc-400"
                    }`}
                    title="Table View"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      viewMode === "grid" ? "bg-white/10 text-white" : "text-zinc-400"
                    }`}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
                >
                  Clear Search
                </button>
              </div>
            </div>

            {/* Zero results */}
            {totalSearchMatches === 0 ? (
              <div className="border border-dashed border-white/10 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                <Search className="w-8 h-8 text-zinc-600" />
                <div className="text-xs text-zinc-400">
                  No categories, subcategories, or products match &quot;{searchQuery}&quot;.
                </div>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-1 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs font-medium cursor-pointer"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <>
                {/* 1. MATCHING MAIN CATEGORIES */}
                {(searchFilterTab === "all" || searchFilterTab === "categories") && matchingCategories.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                      <Package className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Main Categories ({matchingCategories.length})</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
                      {matchingCategories.map((cat) => {
                        const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
                        const catProds = products.filter((p) => p.categoryId === cat.id);
                        return (
                          <div
                            key={cat.id}
                            onClick={() => {
                              setSelectedCategory(cat);
                              setSelectedSubcategory(null);
                              setSearchQuery("");
                            }}
                            className="group relative flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.15] transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
                          >
                            <div
                              className="absolute top-0 left-3 right-3 h-0.5 rounded-full opacity-60 group-hover:opacity-100"
                              style={{ backgroundColor: cat.color || "#6366f1" }}
                            />
                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center border text-xs"
                                style={{
                                  backgroundColor: `${cat.color || "#6366f1"}20`,
                                  borderColor: `${cat.color || "#6366f1"}40`,
                                  color: cat.color || "#6366f1",
                                }}
                              >
                                <Package className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-[10px] text-indigo-400 font-medium group-hover:underline">Open &rarr;</span>
                            </div>
                            <h3 className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                              {cat.name}
                            </h3>
                            <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-[10px] text-zinc-400">
                              <span className="font-mono">{catSubs.length}s &bull; {catProds.length}p</span>
                              <span className="text-[9px] text-zinc-500 truncate">@{cat.createdBy?.username || "admin"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. MATCHING SUBCATEGORIES */}
                {(searchFilterTab === "all" || searchFilterTab === "subcategories") && matchingSubcategories.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                      <Box className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Subcategories ({matchingSubcategories.length})</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
                      {matchingSubcategories.map((sub) => {
                        const subProds = products.filter((p) => p.subcategoryId === sub.id);
                        return (
                          <div
                            key={sub.id}
                            onClick={() => {
                              const parent = categories.find((c) => c.id === sub.categoryId) || {
                                id: sub.categoryId,
                                name: sub.categoryName || "Category",
                                shopId: shop.shopId,
                                createdBy: auditUser,
                                createdAt: Date.now(),
                                updatedAt: Date.now(),
                              };
                              setSelectedCategory(parent);
                              setSelectedSubcategory(sub);
                              setSearchQuery("");
                            }}
                            className="group flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-cyan-500/40 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
                          >
                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
                                <Box className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-[10px] text-cyan-400 font-medium group-hover:underline">Open &rarr;</span>
                            </div>
                            <div>
                              <div className="text-[9px] text-zinc-500 truncate">{sub.categoryName || "Category"}</div>
                              <h3 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                                {sub.name}
                              </h3>
                            </div>
                            <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-[10px] text-zinc-400">
                              <span className="font-mono text-cyan-300 font-medium">{subProds.length} items</span>
                              <span className="text-[9px] text-zinc-500 truncate">@{sub.createdBy?.username || "admin"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. MATCHING PRODUCTS */}
                {(searchFilterTab === "all" || searchFilterTab === "products") && matchingProducts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-300">
                      <div className="flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Products ({matchingProducts.length})</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[11px]">
                        Total Stock: {matchingProducts.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs
                      </span>
                    </div>
                    {viewMode === "table" ? (
                      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-white/[0.08] bg-white/[0.03] text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                              <th className="py-2.5 px-3">Product</th>
                              <th className="py-2.5 px-3">Hierarchy</th>
                              <th className="py-2.5 px-3">SKU / Barcode</th>
                              <th className="py-2.5 px-3">Price / Cost (LKR)</th>
                              <th className="py-2.5 px-3">Stocks (Total)</th>
                              <th className="py-2.5 px-3">Unit</th>
                              <th className="py-2.5 px-3">Created By</th>
                              <th className="py-2.5 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.05]">
                            {matchingProducts.map((prod) => {
                              const totalStock = getProductTotalStock(prod);
                              const unitLabel = (prod.unit || "pcs").toLowerCase();
                              const varCount = prod.variants?.length || 0;
                              return (
                                <tr
                                  key={prod.id}
                                  draggable={canManage}
                                  onDragStart={() => setDraggingProduct(prod)}
                                  onDragEnd={() => {
                                    setDraggingProduct(null);
                                    setDragOverTargetId(null);
                                  }}
                                  onClick={() => setActiveDetailProduct(prod)}
                                  className="group hover:bg-white/[0.04] transition-colors cursor-pointer"
                                >
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2.5">
                                      {canManage && (
                                        <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 cursor-grab" />
                                      )}
                                      <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                        {prod.images && prod.images.length > 0 ? (
                                          <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <Package className="w-4 h-4 text-zinc-500" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate max-w-[180px]">
                                          {prod.name.toUpperCase()}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="text-[11px] text-zinc-400">
                                      <span>{prod.categoryName || "Common"}</span>
                                      {prod.subcategoryName ? (
                                        <>
                                          {" "}
                                          &rarr; <span className="text-zinc-200">{prod.subcategoryName}</span>
                                        </>
                                      ) : (
                                        <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[9px] font-mono">
                                          Direct
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-mono text-zinc-200">{prod.sku}</div>
                                    {prod.barcode && <div className="text-[10px] text-zinc-500 font-mono">{prod.barcode}</div>}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-emerald-400 font-mono">{formatLKR(prod.sellingPrice)}</div>
                                    <div className="text-[10px] text-zinc-500 font-mono">Cost: {formatLKR(prod.costPrice)}</div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col items-start gap-0.5">
                                      <span
                                        className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] border ${
                                          totalStock <= 0
                                            ? "bg-red-500/15 text-red-300 border-red-500/30"
                                            : totalStock <= (prod.minStockLevel || 5)
                                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                        }`}
                                      >
                                        {totalStock} {unitLabel} in stock
                                      </span>
                                      {varCount > 0 && (
                                        <span className="text-[10px] text-zinc-500">
                                          Includes {varCount} variation{varCount > 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[10px] uppercase font-mono">
                                      {prod.unit}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="text-zinc-300 font-medium">@{prod.createdBy?.username || "admin"}</div>
                                    <div className="text-[10px] text-zinc-500">{new Date(prod.createdAt).toLocaleDateString()}</div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {canManage && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setMovingProduct(prod);
                                            }}
                                            className="p-1 rounded bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                                            title="Move Product to Subcategory / Main Category"
                                          >
                                            <FolderInput className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingProduct(prod);
                                            }}
                                            className="p-1 rounded bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-300 hover:text-indigo-200 cursor-pointer"
                                            title="Edit Product Details"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveDetailProduct(prod);
                                        }}
                                        className="p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white cursor-pointer"
                                        title="Details"
                                      >
                                        <Info className="w-3.5 h-3.5" />
                                      </button>
                                      {canManage && (
                                        <button
                                          type="button"
                                          onClick={(e) => handleDeleteProduct(prod, e)}
                                          className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="border-t border-white/[0.1] bg-white/[0.04] text-xs font-semibold">
                            <tr>
                              <td colSpan={4} className="py-2.5 px-3 text-zinc-300 uppercase tracking-wider text-[10px]">
                                Total Stock Across {matchingProducts.length} Listed Product{matchingProducts.length === 1 ? "" : "s"} (All Variations Included)
                              </td>
                              <td colSpan={4} className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                                {matchingProducts.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs in stock
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                        {matchingProducts.map((prod) => {
                          const totalStock = getProductTotalStock(prod);
                          const unitLabel = (prod.unit || "pcs").toLowerCase();
                          return (
                            <div
                              key={prod.id}
                              draggable={canManage}
                              onDragStart={() => setDraggingProduct(prod)}
                              onDragEnd={() => {
                                setDraggingProduct(null);
                                setDragOverTargetId(null);
                              }}
                              onClick={() => setActiveDetailProduct(prod)}
                              className="group flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all cursor-pointer hover:-translate-y-0.5"
                            >
                              <div>
                                <div className="w-full h-24 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden mb-2">
                                  {prod.images && prod.images.length > 0 ? (
                                    <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Package className="w-6 h-6 text-zinc-600" />
                                  )}
                                </div>
                                <div className="text-[9px] text-zinc-500 truncate">
                                  {prod.categoryName || "Common"}
                                  {prod.subcategoryName ? ` → ${prod.subcategoryName}` : " (Direct)"}
                                </div>
                                <h4 className="text-xs font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate mt-0.5">
                                  {prod.name.toUpperCase()}
                                </h4>
                                <div className="text-[10px] font-mono text-zinc-400">SKU: {prod.sku}</div>
                                <div className="mt-1 text-[10px] font-mono text-emerald-300">
                                  {totalStock} {unitLabel} in stock
                                </div>
                              </div>
                              <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between">
                                <div className="text-xs font-bold text-emerald-400 font-mono">{formatLKR(prod.sellingPrice)}</div>
                                <div className="flex items-center gap-1">
                                  {canManage && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMovingProduct(prod);
                                        }}
                                        className="p-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 cursor-pointer"
                                        title="Move Product"
                                      >
                                        <FolderInput className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingProduct(prod);
                                        }}
                                        className="p-1 rounded bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 cursor-pointer"
                                        title="Edit Product"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                  <span className="text-[9px] text-zinc-500">@{prod.createdBy?.username || "staff"}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : showAllProducts ? (
          /* ========================================================================= */
          /* ALL PRODUCTS ACROSS ALL CATEGORIES VIEW                                   */
          /* ========================================================================= */
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="text-xs text-zinc-300 font-medium">
                  Showing all <span className="font-mono text-white font-semibold">{products.length}</span> products across{" "}
                  <span className="text-emerald-300 font-semibold">All Categories</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[11px] font-semibold">
                  Total Stock: {products.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs (All variations)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center p-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      viewMode === "table" ? "bg-white/10 text-white" : "text-zinc-400"
                    }`}
                    title="Table View"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      viewMode === "grid" ? "bg-white/10 text-white" : "text-zinc-400"
                    }`}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>

                {canManage && (
                  <button
                    type="button"
                    onClick={() => setIsQuickProductOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Quick Product (Common)</span>
                  </button>
                )}
              </div>
            </div>

            {products.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                <Package className="w-8 h-8 text-zinc-600" />
                <div className="text-xs text-zinc-400">No products created yet in any category.</div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setIsQuickProductOpen(true)}
                    className="mt-1 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer"
                  >
                    + Create Quick Product (Common)
                  </button>
                )}
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.03] text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Category / Subcategory</th>
                      <th className="py-2.5 px-3">SKU / Barcode</th>
                      <th className="py-2.5 px-3">Price / Cost (LKR)</th>
                      <th className="py-2.5 px-3">Stocks (Total)</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3">Variants</th>
                      <th className="py-2.5 px-3">Created By</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {products.map((prod) => {
                      const totalStock = getProductTotalStock(prod);
                      const unitLabel = (prod.unit || "pcs").toLowerCase();
                      const varCount = prod.variants?.length || 0;
                      return (
                        <tr
                          key={prod.id}
                          draggable={canManage}
                          onDragStart={() => setDraggingProduct(prod)}
                          onDragEnd={() => {
                            setDraggingProduct(null);
                            setDragOverTargetId(null);
                          }}
                          onClick={() => setActiveDetailProduct(prod)}
                          className="group hover:bg-white/[0.04] transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              {canManage && (
                                <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 cursor-grab" />
                              )}
                              <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                {prod.images && prod.images.length > 0 ? (
                                  <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-4 h-4 text-zinc-500" />
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate max-w-[180px]">
                                  {prod.name.toUpperCase()}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="text-[11px] text-zinc-400">
                              <span className="text-zinc-200 font-medium">{prod.categoryName || "Common"}</span>
                              {prod.subcategoryName ? (
                                <>
                                  {" "}
                                  &rarr; <span className="text-zinc-300">{prod.subcategoryName}</span>
                                </>
                              ) : (
                                <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[9px] font-mono border border-amber-500/30">
                                  Common / Direct
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="font-mono text-zinc-200">{prod.sku}</div>
                            {prod.barcode && <div className="text-[10px] text-zinc-500 font-mono">{prod.barcode}</div>}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-emerald-400 font-mono">{formatLKR(prod.sellingPrice)}</div>
                            <div className="text-[10px] text-zinc-500 font-mono">Cost: {formatLKR(prod.costPrice)}</div>
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex flex-col items-start gap-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] border ${
                                  totalStock <= 0
                                    ? "bg-red-500/15 text-red-300 border-red-500/30"
                                    : totalStock <= (prod.minStockLevel || 5)
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                }`}
                              >
                                {totalStock} {unitLabel} in stock
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                {varCount > 0
                                  ? `Total across ${varCount} variation${varCount > 1 ? "s" : ""}`
                                  : "Total stock"}
                              </span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[10px] uppercase font-mono">
                              {prod.unit}
                            </span>
                          </td>

                          <td className="py-2.5 px-3">
                            {prod.hasVariants && prod.variants && prod.variants.length > 0 ? (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                                {prod.variants.length} vars
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-[11px]">—</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="text-zinc-300 font-medium">@{prod.createdBy?.username || "admin"}</div>
                            <div className="text-[10px] text-zinc-500">{new Date(prod.createdAt).toLocaleDateString()}</div>
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canManage && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMovingProduct(prod);
                                    }}
                                    className="p-1 rounded bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                                    title="Move Product to Subcategory / Main Category"
                                  >
                                    <FolderInput className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingProduct(prod);
                                    }}
                                    className="p-1 rounded bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-300 hover:text-indigo-200 cursor-pointer"
                                    title="Edit Product Details"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDetailProduct(prod);
                                }}
                                className="p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white cursor-pointer"
                                title="Details"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteProduct(prod, e)}
                                  className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-white/[0.1] bg-white/[0.04] text-xs font-semibold">
                    <tr>
                      <td colSpan={4} className="py-2.5 px-3 text-zinc-300 uppercase tracking-wider text-[10px]">
                        Total Stock Across All {products.length} Products & Categories (Includes All Variations)
                      </td>
                      <td colSpan={5} className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                        {products.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs in stock
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {products.map((prod) => {
                  const totalStock = getProductTotalStock(prod);
                  const unitLabel = (prod.unit || "pcs").toLowerCase();
                  return (
                    <div
                      key={prod.id}
                      draggable={canManage}
                      onDragStart={() => setDraggingProduct(prod)}
                      onDragEnd={() => {
                        setDraggingProduct(null);
                        setDragOverTargetId(null);
                      }}
                      onClick={() => setActiveDetailProduct(prod)}
                      className="group flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all cursor-pointer hover:-translate-y-0.5"
                    >
                      <div>
                        <div className="w-full h-24 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden mb-2">
                          {prod.images && prod.images.length > 0 ? (
                            <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 text-zinc-600" />
                          )}
                        </div>
                        <div className="text-[9px] text-zinc-500 truncate">
                          {prod.categoryName || "Common"}
                          {prod.subcategoryName ? ` → ${prod.subcategoryName}` : " (Direct)"}
                        </div>
                        <h4 className="text-xs font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate mt-0.5">
                          {prod.name.toUpperCase()}
                        </h4>
                        <div className="text-[10px] font-mono text-zinc-400">SKU: {prod.sku}</div>
                        <div className="mt-1 text-[10px] font-mono text-emerald-300 font-semibold">
                          {totalStock} {unitLabel} in stock
                        </div>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between">
                        <div className="text-xs font-bold text-emerald-400 font-mono">{formatLKR(prod.sellingPrice)}</div>
                        <div className="flex items-center gap-1">
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMovingProduct(prod);
                                }}
                                className="p-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 cursor-pointer"
                                title="Move Product"
                              >
                                <FolderInput className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProduct(prod);
                                }}
                                className="p-1 rounded bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 cursor-pointer"
                                title="Edit Product"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          <span className="text-[9px] text-zinc-500">@{prod.createdBy?.username || "staff"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ------------------------------------------------------------- */}
            {/* TIER 1: HALF-SIZE CATEGORY CARDS                              */}
            {/* ------------------------------------------------------------- */}
            {!selectedCategory && (
              <div>
                {categories.length === 0 ? (
                  <div className="border border-dashed border-white/10 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                    <Layers className="w-8 h-8 text-zinc-600" />
                    <div className="text-xs text-zinc-400">No categories created yet.</div>
                    {canManage && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setIsAddCategoryOpen(true)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
                        >
                          + Create Category
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsQuickProductOpen(true)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer"
                        >
                          + Quick Product (Common)
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Compact Half-Size Grid (4 to 6 columns) */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
                    {categories.map((cat) => {
                      const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
                      const catProds = products.filter((p) => p.categoryId === cat.id);

                      return (
                        <div
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat)}
                          className="group relative flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.15] transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
                        >
                          <div
                            className="absolute top-0 left-3 right-3 h-0.5 rounded-full opacity-60 group-hover:opacity-100"
                            style={{ backgroundColor: cat.color || "#6366f1" }}
                          />

                          <div className="flex items-start justify-between gap-1.5 mb-1.5">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center border text-xs"
                              style={{
                                backgroundColor: `${cat.color || "#6366f1"}20`,
                                borderColor: `${cat.color || "#6366f1"}40`,
                                color: cat.color || "#6366f1",
                              }}
                            >
                              <Package className="w-3.5 h-3.5" />
                            </div>

                            {canManage && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteCategory(cat, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-opacity"
                                title="Delete Category"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div>
                            <h3 className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                              {cat.name}
                            </h3>
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-[10px] text-zinc-400">
                            <span className="font-mono">
                              {catSubs.length}s &bull; {catProds.length}p
                            </span>
                            <span className="text-[9px] text-zinc-500 truncate">
                              @{cat.createdBy?.username || "admin"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TIER 2: HALF-SIZE SUBCATEGORY CARDS + DIRECT CATEGORY PRODUCTS */}
            {/* ------------------------------------------------------------- */}
            {selectedCategory && !selectedSubcategory && (
              <div className="flex flex-col gap-4">
                {/* Subcategories Grid (also acts as Drag-and-Drop targets for products!) */}
                {currentSubcategories.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                        <Box className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Subcategories in {selectedCategory.name} ({currentSubcategories.length})</span>
                      </div>
                      {canManage && (
                        <span className="text-[10px] text-cyan-300/90 bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded-md">
                          Drag &amp; drop any product onto a subcategory card below (or click Move) to move it
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
                      {currentSubcategories.map((sub) => {
                        const subProds = products.filter((p) => p.subcategoryId === sub.id);
                        const isDropActive = dragOverTargetId === `sub_${sub.id}`;

                        return (
                          <div
                            key={sub.id}
                            onClick={() => setSelectedSubcategory(sub)}
                            onDragOver={(e) => {
                              if (!canManage || !draggingProduct) return;
                              e.preventDefault();
                              setDragOverTargetId(`sub_${sub.id}`);
                            }}
                            onDragLeave={() => setDragOverTargetId(null)}
                            onDrop={(e) => {
                              if (!canManage || !draggingProduct) return;
                              e.preventDefault();
                              setDragOverTargetId(null);
                              handleMoveProduct(
                                draggingProduct,
                                selectedCategory.id,
                                selectedCategory.name,
                                sub.id,
                                sub.name
                              );
                              setDraggingProduct(null);
                            }}
                            className={`group flex flex-col justify-between p-2.5 rounded-xl border transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
                              isDropActive
                                ? "bg-cyan-500/20 border-cyan-400 ring-2 ring-cyan-400/60 scale-[1.02]"
                                : "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06] hover:border-cyan-500/40"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
                                <Box className="w-3.5 h-3.5" />
                              </div>

                              {canManage && (
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteSubcategory(sub, e)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-opacity"
                                  title="Delete Subcategory"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <div>
                              <h3 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                                {sub.name}
                              </h3>
                              {isDropActive && (
                                <span className="inline-block mt-1 text-[9px] font-semibold text-cyan-200 bg-cyan-500/30 px-1.5 py-0.5 rounded">
                                  Drop to move here
                                </span>
                              )}
                            </div>

                            <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-[10px] text-zinc-400">
                              <span className="font-mono text-cyan-300 font-medium">
                                {subProds.length} items
                              </span>
                              <span className="text-[9px] text-zinc-500 truncate">
                                @{sub.createdBy?.username || "admin"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Direct Products in Main Category (No Subcategory Required) */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="text-xs text-zinc-300 font-medium">
                        Individual Products in <span className="text-white font-semibold">{selectedCategory.name}</span>{" "}
                        <span className="text-zinc-500">(Direct in Main Category — No Subcategory Needed)</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[11px] font-semibold">
                        Total Stock: {directCategoryProducts.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs (All variations)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center p-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08]">
                        <button
                          type="button"
                          onClick={() => setViewMode("table")}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            viewMode === "table" ? "bg-white/10 text-white" : "text-zinc-400"
                          }`}
                          title="Table View"
                        >
                          <TableIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("grid")}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            viewMode === "grid" ? "bg-white/10 text-white" : "text-zinc-400"
                          }`}
                          title="Grid View"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsAddSubcategoryOpen(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Subcategory</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAddProductOpen(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Product in {selectedCategory.name}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {directCategoryProducts.length === 0 ? (
                    <div className="border border-dashed border-white/10 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                      <Package className="w-8 h-8 text-zinc-600" />
                      <div className="text-xs text-zinc-400">
                        No direct products in <span className="text-zinc-200 font-medium">{selectedCategory.name}</span> yet. You can create individual products directly in this main category without creating a subcategory.
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setIsAddProductOpen(true)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                          >
                            + Add Product Directly in {selectedCategory.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAddSubcategoryOpen(true)}
                            className="px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs font-medium cursor-pointer"
                          >
                            + Add Subcategory
                          </button>
                        </div>
                      )}
                    </div>
                  ) : viewMode === "table" ? (
                    <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.08] bg-white/[0.03] text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                            <th className="py-2.5 px-3">Product</th>
                            <th className="py-2.5 px-3">SKU / Barcode</th>
                            <th className="py-2.5 px-3">Price / Cost (LKR)</th>
                            <th className="py-2.5 px-3">Stocks (Total)</th>
                            <th className="py-2.5 px-3">Unit</th>
                            <th className="py-2.5 px-3">Variants</th>
                            <th className="py-2.5 px-3">Created By</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                          {directCategoryProducts.map((prod) => {
                            const totalStock = getProductTotalStock(prod);
                            const unitLabel = (prod.unit || "pcs").toLowerCase();
                            const varCount = prod.variants?.length || 0;
                            return (
                              <tr
                                key={prod.id}
                                draggable={canManage}
                                onDragStart={() => setDraggingProduct(prod)}
                                onDragEnd={() => {
                                  setDraggingProduct(null);
                                  setDragOverTargetId(null);
                                }}
                                onClick={() => setActiveDetailProduct(prod)}
                                className="group hover:bg-white/[0.04] transition-colors cursor-pointer"
                              >
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2.5">
                                    {canManage && (
                                      <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 cursor-grab" />
                                    )}
                                    <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                      {prod.images && prod.images.length > 0 ? (
                                        <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <Package className="w-4 h-4 text-zinc-500" />
                                      )}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate max-w-[200px]">
                                        {prod.name.toUpperCase()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-mono text-zinc-200">{prod.sku}</div>
                                  {prod.barcode && (
                                    <div className="text-[10px] text-zinc-500 font-mono">{prod.barcode}</div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-emerald-400 font-mono">
                                    {formatLKR(prod.sellingPrice)}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 font-mono">
                                    Cost: {formatLKR(prod.costPrice)}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span
                                      className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] border ${
                                        totalStock <= 0
                                          ? "bg-red-500/15 text-red-300 border-red-500/30"
                                          : totalStock <= (prod.minStockLevel || 5)
                                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                          : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                      }`}
                                    >
                                      {totalStock} {unitLabel} in stock
                                    </span>
                                    <span className="text-[10px] text-zinc-500">
                                      {varCount > 0
                                        ? `Total across ${varCount} variation${varCount > 1 ? "s" : ""}`
                                        : "Total stock"}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[10px] uppercase font-mono">
                                    {prod.unit}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  {prod.hasVariants && prod.variants && prod.variants.length > 0 ? (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                                      {prod.variants.length} vars
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600 text-[11px]">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="text-zinc-300 font-medium">@{prod.createdBy?.username || "admin"}</div>
                                  <div className="text-[10px] text-zinc-500">
                                    {new Date(prod.createdAt).toLocaleDateString()}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {canManage && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMovingProduct(prod);
                                          }}
                                          className="p-1 rounded bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                                          title="Move Product to Subcategory"
                                        >
                                          <FolderInput className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingProduct(prod);
                                          }}
                                          className="p-1 rounded bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-300 hover:text-indigo-200 cursor-pointer"
                                          title="Edit Product Details"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDetailProduct(prod);
                                      }}
                                      className="p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white cursor-pointer"
                                      title="Details"
                                    >
                                      <Info className="w-3.5 h-3.5" />
                                    </button>
                                    {canManage && (
                                      <button
                                        type="button"
                                        onClick={(e) => handleDeleteProduct(prod, e)}
                                        className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-white/[0.1] bg-white/[0.04] text-xs font-semibold">
                          <tr>
                            <td colSpan={3} className="py-2.5 px-3 text-zinc-300 uppercase tracking-wider text-[10px]">
                              Total Stock in {selectedCategory.name} (Includes All Variations)
                            </td>
                            <td colSpan={5} className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                              {directCategoryProducts.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs in stock
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                      {directCategoryProducts.map((prod) => {
                        const totalStock = getProductTotalStock(prod);
                        const unitLabel = (prod.unit || "pcs").toLowerCase();
                        return (
                          <div
                            key={prod.id}
                            draggable={canManage}
                            onDragStart={() => setDraggingProduct(prod)}
                            onDragEnd={() => {
                              setDraggingProduct(null);
                              setDragOverTargetId(null);
                            }}
                            onClick={() => setActiveDetailProduct(prod)}
                            className="group flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all cursor-pointer hover:-translate-y-0.5"
                          >
                            <div>
                              <div className="w-full h-24 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden mb-2">
                                {prod.images && prod.images.length > 0 ? (
                                  <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-6 h-6 text-zinc-600" />
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-emerald-300 font-semibold">
                                {totalStock} {unitLabel} in stock
                              </div>
                              <h4 className="text-xs font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate mt-0.5">
                                {prod.name.toUpperCase()}
                              </h4>
                              <div className="text-[10px] font-mono text-zinc-400">SKU: {prod.sku}</div>
                            </div>

                            <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between">
                              <div className="text-xs font-bold text-emerald-400 font-mono">
                                {formatLKR(prod.sellingPrice)}
                              </div>
                              <div className="flex items-center gap-1">
                                {canManage && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMovingProduct(prod);
                                      }}
                                      className="p-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 cursor-pointer"
                                      title="Move Product to Subcategory"
                                    >
                                      <FolderInput className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingProduct(prod);
                                      }}
                                      className="p-1 rounded bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 cursor-pointer"
                                      title="Edit Product"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                                <span className="text-[9px] text-zinc-500">@{prod.createdBy?.username || "staff"}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TIER 3: PRODUCTS VIEW (COMPACT TOOLBAR + TABLE / GRID)        */}
            {/* ------------------------------------------------------------- */}
            {selectedCategory && selectedSubcategory && (
              <div className="flex flex-col gap-2.5">
                {/* Drag & Drop Subcategory Target Bar within Main Category */}
                {canManage && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/20 text-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300 mr-1 flex items-center gap-1">
                      <FolderInput className="w-3.5 h-3.5" />
                      <span>Drag &amp; Drop Product To Move:</span>
                    </span>

                    {/* Drop Target: Direct in Main Category */}
                    <button
                      type="button"
                      onClick={() => setSelectedSubcategory(null)}
                      onDragOver={(e) => {
                        if (!draggingProduct) return;
                        e.preventDefault();
                        setDragOverTargetId(`direct_${selectedCategory.id}`);
                      }}
                      onDragLeave={() => setDragOverTargetId(null)}
                      onDrop={(e) => {
                        if (!draggingProduct) return;
                        e.preventDefault();
                        setDragOverTargetId(null);
                        handleMoveProduct(draggingProduct, selectedCategory.id, selectedCategory.name, "", "");
                        setDraggingProduct(null);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                        dragOverTargetId === `direct_${selectedCategory.id}`
                          ? "bg-emerald-500/25 border-emerald-400 text-emerald-200 ring-2 ring-emerald-400/50 scale-105"
                          : "bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-zinc-300"
                      }`}
                    >
                      Direct in {selectedCategory.name} (No Subcategory)
                    </button>

                    {/* Drop Targets: Sibling Subcategories */}
                    {currentSubcategories.map((sub) => {
                      const isCurrent = sub.id === selectedSubcategory.id;
                      const isDropTarget = dragOverTargetId === `subpill_${sub.id}`;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedSubcategory(sub)}
                          onDragOver={(e) => {
                            if (!draggingProduct || isCurrent) return;
                            e.preventDefault();
                            setDragOverTargetId(`subpill_${sub.id}`);
                          }}
                          onDragLeave={() => setDragOverTargetId(null)}
                          onDrop={(e) => {
                            if (!draggingProduct || isCurrent) return;
                            e.preventDefault();
                            setDragOverTargetId(null);
                            handleMoveProduct(
                              draggingProduct,
                              selectedCategory.id,
                              selectedCategory.name,
                              sub.id,
                              sub.name
                            );
                            setDraggingProduct(null);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                            isCurrent
                              ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200 font-semibold"
                              : isDropTarget
                              ? "bg-cyan-500/30 border-cyan-400 text-cyan-100 ring-2 ring-cyan-400/60 scale-105"
                              : "bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-zinc-300"
                          }`}
                        >
                          {sub.name} {isCurrent ? "(Current)" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* View Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="text-xs text-zinc-400 font-medium">
                      Showing <span className="font-mono text-zinc-200">{currentProducts.length}</span> products in{" "}
                      <span className="text-white">{selectedSubcategory.name}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[11px] font-semibold">
                      Total Stock: {currentProducts.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs (All variations)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center p-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setViewMode("table")}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          viewMode === "table" ? "bg-white/10 text-white" : "text-zinc-400"
                        }`}
                        title="Table View"
                      >
                        <TableIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("grid")}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          viewMode === "grid" ? "bg-white/10 text-white" : "text-zinc-400"
                        }`}
                        title="Grid View"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setIsAddProductOpen(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Product</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Table or Grid */}
                {currentProducts.length === 0 ? (
                  <div className="border border-dashed border-white/10 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                    <Package className="w-8 h-8 text-zinc-600" />
                    <div className="text-xs text-zinc-400">
                      {searchQuery ? `No products match "${searchQuery}"` : "No products added yet."}
                    </div>
                    {canManage && !searchQuery && (
                      <button
                        type="button"
                        onClick={() => setIsAddProductOpen(true)}
                        className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                      >
                        + Add First Product
                      </button>
                    )}
                  </div>
                ) : viewMode === "table" ? (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.08] bg-white/[0.03] text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-3">SKU / Barcode</th>
                          <th className="py-2.5 px-3">Price / Cost (LKR)</th>
                          <th className="py-2.5 px-3">Stocks (Total)</th>
                          <th className="py-2.5 px-3">Unit</th>
                          <th className="py-2.5 px-3">Variants</th>
                          <th className="py-2.5 px-3">Created By</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {currentProducts.map((prod) => {
                          const totalStock = getProductTotalStock(prod);
                          const unitLabel = (prod.unit || "pcs").toLowerCase();
                          const varCount = prod.variants?.length || 0;
                          return (
                            <tr
                              key={prod.id}
                              draggable={canManage}
                              onDragStart={() => setDraggingProduct(prod)}
                              onDragEnd={() => {
                                setDraggingProduct(null);
                                setDragOverTargetId(null);
                              }}
                              onClick={() => setActiveDetailProduct(prod)}
                              className="group hover:bg-white/[0.04] transition-colors cursor-pointer"
                            >
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2.5">
                                  {canManage && (
                                    <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 cursor-grab" />
                                  )}
                                  <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                    {prod.images && prod.images.length > 0 ? (
                                      <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <Package className="w-4 h-4 text-zinc-500" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate max-w-[200px]">
                                      {prod.name.toUpperCase()}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="font-mono text-zinc-200">{prod.sku}</div>
                                {prod.barcode && (
                                  <div className="text-[10px] text-zinc-500 font-mono">{prod.barcode}</div>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-emerald-400 font-mono">
                                  {formatLKR(prod.sellingPrice)}
                                </div>
                                <div className="text-[10px] text-zinc-500 font-mono">
                                  Cost: {formatLKR(prod.costPrice)}
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="flex flex-col items-start gap-0.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] border ${
                                      totalStock <= 0
                                        ? "bg-red-500/15 text-red-300 border-red-500/30"
                                        : totalStock <= (prod.minStockLevel || 5)
                                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                    }`}
                                  >
                                    {totalStock} {unitLabel} in stock
                                  </span>
                                  <span className="text-[10px] text-zinc-500">
                                    {varCount > 0
                                      ? `Total across ${varCount} variation${varCount > 1 ? "s" : ""}`
                                      : "Total stock"}
                                  </span>
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[10px] uppercase font-mono">
                                  {prod.unit}
                                </span>
                              </td>

                              <td className="py-2.5 px-3">
                                {prod.hasVariants && prod.variants && prod.variants.length > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                                    {prod.variants.length} vars
                                  </span>
                                ) : (
                                  <span className="text-zinc-600 text-[11px]">—</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="text-zinc-300 font-medium">@{prod.createdBy?.username || "admin"}</div>
                                <div className="text-[10px] text-zinc-500">
                                  {new Date(prod.createdAt).toLocaleDateString()}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {canManage && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMovingProduct(prod);
                                        }}
                                        className="p-1 rounded bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                                        title="Move Product to Another Subcategory or Main Category"
                                      >
                                        <FolderInput className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingProduct(prod);
                                        }}
                                        className="p-1 rounded bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-300 hover:text-indigo-200 cursor-pointer"
                                        title="Edit Product Details"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveDetailProduct(prod);
                                    }}
                                    className="p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white cursor-pointer"
                                    title="Details"
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>
                                  {canManage && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteProduct(prod, e)}
                                      className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-white/[0.1] bg-white/[0.04] text-xs font-semibold">
                        <tr>
                          <td colSpan={3} className="py-2.5 px-3 text-zinc-300 uppercase tracking-wider text-[10px]">
                            Total Stock in {selectedSubcategory.name} (Includes All Variations)
                          </td>
                          <td colSpan={5} className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                            {currentProducts.reduce((sum, p) => sum + getProductTotalStock(p), 0)} pcs in stock
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {currentProducts.map((prod) => {
                      const totalStock = getProductTotalStock(prod);
                      const unitLabel = (prod.unit || "pcs").toLowerCase();
                      return (
                        <div
                          key={prod.id}
                          draggable={canManage}
                          onDragStart={() => setDraggingProduct(prod)}
                          onDragEnd={() => {
                            setDraggingProduct(null);
                            setDragOverTargetId(null);
                          }}
                          onClick={() => setActiveDetailProduct(prod)}
                          className="group flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all cursor-pointer hover:-translate-y-0.5"
                        >
                          <div>
                            <div className="w-full h-24 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden mb-2">
                              {prod.images && prod.images.length > 0 ? (
                                <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-6 h-6 text-zinc-600" />
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-emerald-300 font-semibold">
                              {totalStock} {unitLabel} in stock
                            </div>
                            <h4 className="text-xs font-semibold text-white uppercase group-hover:text-indigo-300 transition-colors truncate mt-0.5">
                              {prod.name.toUpperCase()}
                            </h4>
                            <div className="text-[10px] font-mono text-zinc-400">SKU: {prod.sku}</div>
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between">
                            <div className="text-xs font-bold text-emerald-400 font-mono">
                              {formatLKR(prod.sellingPrice)}
                            </div>
                            <div className="flex items-center gap-1">
                              {canManage && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMovingProduct(prod);
                                    }}
                                    className="p-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 cursor-pointer"
                                    title="Move Product"
                                  >
                                    <FolderInput className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingProduct(prod);
                                    }}
                                    className="p-1 rounded bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 cursor-pointer"
                                    title="Edit Product"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              <span className="text-[9px] text-zinc-500">@{prod.createdBy?.username || "staff"}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD CATEGORY                                                     */}
      {/* ========================================================================= */}
      {isAddCategoryOpen && (
        <AddCategoryModal
          onClose={() => setIsAddCategoryOpen(false)}
          onSubmit={async (input) => {
            await createCategory(shop.shopId, auditUser, {
              ...input,
              branchId: effectiveBranchId,
              branchName: activeBranchName,
            });
            setIsAddCategoryOpen(false);
            await loadData(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD SUBCATEGORY                                                 */}
      {/* ========================================================================= */}
      {isAddSubcategoryOpen && selectedCategory && (
        <AddSubcategoryModal
          parentCategory={selectedCategory}
          onClose={() => setIsAddSubcategoryOpen(false)}
          onSubmit={async (input) => {
            await createSubcategory(shop.shopId, auditUser, {
              ...input,
              branchId: selectedCategory.branchId || effectiveBranchId,
              branchName: selectedCategory.branchName || activeBranchName,
            });
            setIsAddSubcategoryOpen(false);
            await loadData(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD PRODUCT (IN SUBCATEGORY OR DIRECT IN MAIN CATEGORY)          */}
      {/* ========================================================================= */}
      {isAddProductOpen && selectedCategory && (
        <AddProductModal
          shopId={shop.shopId}
          auditUser={auditUser}
          category={selectedCategory}
          subcategory={selectedSubcategory}
          availableSubcategories={currentSubcategories}
          brands={brands}
          suppliers={suppliers}
          onBrandCreated={(newBrand) => setBrands((prev) => [...prev, newBrand])}
          onSupplierCreated={(newSup) => setSuppliers((prev) => [...prev, newSup])}
          onClose={() => setIsAddProductOpen(false)}
          onSubmit={async (input) => {
            await createProduct(shop.shopId, auditUser, {
              ...input,
              branchId: selectedCategory.branchId || effectiveBranchId,
              branchName: selectedCategory.branchName || activeBranchName,
            });
            setIsAddProductOpen(false);
            await loadData(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: QUICK PRODUCT (GOES UNDER COMMON CATEGORY, NO SUBCATEGORY)       */}
      {/* ========================================================================= */}
      {isQuickProductOpen && (
        <AddProductModal
          shopId={shop.shopId}
          auditUser={auditUser}
          isQuickProduct
          brands={brands}
          suppliers={suppliers}
          onBrandCreated={(newBrand) => setBrands((prev) => [...prev, newBrand])}
          onSupplierCreated={(newSup) => setSuppliers((prev) => [...prev, newSup])}
          onClose={() => setIsQuickProductOpen(false)}
          onSubmit={async (input) => {
            const commonCat = await ensureCommonCategory(shop.shopId, auditUser, effectiveBranchId);
            await createProduct(shop.shopId, auditUser, {
              ...input,
              branchId: effectiveBranchId,
              branchName: activeBranchName,
              categoryId: commonCat.id,
              categoryName: commonCat.name,
              subcategoryId: "",
              subcategoryName: "",
            });
            setIsQuickProductOpen(false);
            await loadData(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: EDIT PRODUCT DETAILS                                             */}
      {/* ========================================================================= */}
      {editingProduct && (
        <AddProductModal
          shopId={shop.shopId}
          auditUser={auditUser}
          initialProduct={editingProduct}
          availableSubcategories={subcategories.filter((s) => s.categoryId === editingProduct.categoryId)}
          brands={brands}
          suppliers={suppliers}
          onBrandCreated={(newBrand) => setBrands((prev) => [...prev, newBrand])}
          onSupplierCreated={(newSup) => setSuppliers((prev) => [...prev, newSup])}
          onClose={() => setEditingProduct(null)}
          onSubmit={async (input) => {
            await updateProduct(shop.shopId, editingProduct.id, auditUser, {
              ...input,
              branchId: editingProduct.branchId || effectiveBranchId,
              branchName: editingProduct.branchName || activeBranchName,
            });
            setEditingProduct(null);
            await loadData(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: MOVE PRODUCT TO ANY SUBCATEGORY / MAIN CATEGORY                  */}
      {/* ========================================================================= */}
      {movingProduct && (
        <MoveProductModal
          product={movingProduct}
          categories={categories}
          subcategories={subcategories}
          onClose={() => setMovingProduct(null)}
          onMove={async (targetCategoryId, targetCategoryName, targetSubcategoryId, targetSubcategoryName) => {
            await handleMoveProduct(
              movingProduct,
              targetCategoryId,
              targetCategoryName,
              targetSubcategoryId,
              targetSubcategoryName
            );
            setMovingProduct(null);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* PRODUCT DETAIL DRAWER                                                    */}
      {/* ========================================================================= */}
      {activeDetailProduct && (
        <ProductDetailDrawer
          product={activeDetailProduct}
          canManage={canManage}
          onClose={() => setActiveDetailProduct(null)}
          onEdit={() => {
            const prodToEdit = activeDetailProduct;
            setActiveDetailProduct(null);
            setEditingProduct(prodToEdit);
          }}
          onMove={() => {
            const prodToMove = activeDetailProduct;
            setActiveDetailProduct(null);
            setMovingProduct(prodToMove);
          }}
          onDelete={async () => {
            await handleDeleteProduct(activeDetailProduct, { stopPropagation: () => {} } as React.MouseEvent);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// MODAL: ADD CATEGORY
// =============================================================================
function AddCategoryModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: CreateCategoryInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        color: selectedColor,
      });
    } catch (e) {
      alert("Failed to create category");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#0f111a] border border-white/10 p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Create Category</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Smartphones & Devices"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white focus:border-indigo-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Description <span className="text-zinc-500 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="Optional summary..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white focus:border-indigo-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">Color</label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    selectedColor === c ? "scale-110 border-white" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-zinc-300 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL: ADD SUBCATEGORY
// =============================================================================
function AddSubcategoryModal({
  parentCategory,
  onClose,
  onSubmit,
}: {
  parentCategory: Category;
  onClose: () => void;
  onSubmit: (input: CreateSubcategoryInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        categoryId: parentCategory.id,
        categoryName: parentCategory.name,
        name: name.trim(),
        description: description.trim(),
      });
    } catch (e) {
      alert("Failed to create subcategory");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#0f111a] border border-white/10 p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Create Subcategory</h3>
            <p className="text-[10px] text-zinc-400">Inside {parentCategory.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Apple iPhones, Chargers"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white focus:border-cyan-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Description <span className="text-zinc-500 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="Optional summary..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white focus:border-cyan-500 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-zinc-300 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL: ADD / EDIT / QUICK PRODUCT
// =============================================================================
function AddProductModal({
  shopId,
  auditUser,
  category,
  subcategory,
  availableSubcategories = [],
  isQuickProduct = false,
  initialProduct = null,
  brands,
  suppliers,
  onBrandCreated,
  onSupplierCreated,
  onClose,
  onSubmit,
}: {
  shopId: string;
  auditUser: AuditUser;
  category?: Category | null;
  subcategory?: Subcategory | null;
  availableSubcategories?: Subcategory[];
  isQuickProduct?: boolean;
  initialProduct?: ProductItem | null;
  brands: Brand[];
  suppliers: Supplier[];
  onBrandCreated: (b: Brand) => void;
  onSupplierCreated: (s: Supplier) => void;
  onClose: () => void;
  onSubmit: (input: CreateProductInput) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEditMode = Boolean(initialProduct);

  // Initialize from initialProduct if editing, otherwise auto-generate SKU
  const [sku, setSku] = useState(() => initialProduct?.sku || generateUniqueSKU());
  const [barcode, setBarcode] = useState(() => initialProduct?.barcode || "");
  const [name, setName] = useState(() => (initialProduct?.name || "").toUpperCase());
  const [sellingPrice, setSellingPrice] = useState(() =>
    initialProduct ? String(initialProduct.sellingPrice ?? 0) : ""
  );
  const [costPrice, setCostPrice] = useState(() =>
    initialProduct ? String(initialProduct.costPrice ?? 0) : ""
  );
  const [unit, setUnit] = useState(() => initialProduct?.unit || "pcs");
  const [description, setDescription] = useState(() => initialProduct?.description || "");
  const [stockQuantity, setStockQuantity] = useState(() =>
    initialProduct ? String(initialProduct.stockQuantity ?? 0) : "50"
  );
  const [minStockLevel, setMinStockLevel] = useState(() =>
    initialProduct ? String(initialProduct.minStockLevel ?? 5) : "5"
  );

  // Subcategory placement (optional — allows creating directly in Main Category or inside any Subcategory)
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(() =>
    initialProduct ? initialProduct.subcategoryId || "" : subcategory?.id || ""
  );

  // Brands (with in-place creation)
  const [selectedBrand, setSelectedBrand] = useState(() => initialProduct?.brand || "");
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  // Suppliers (with in-place creation)
  const [selectedSupplier, setSelectedSupplier] = useState(() => initialProduct?.supplier || "");
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");

  // Variants System (Size & Color, each with its own Selling Price & Cost Price)
  const [hasVariants, setHasVariants] = useState(() =>
    Boolean(initialProduct?.hasVariants || (initialProduct?.variants && initialProduct.variants.length > 0))
  );
  const [variants, setVariants] = useState<ProductVariant[]>(() =>
    initialProduct?.variants
      ? initialProduct.variants.map((v) => ({
          ...v,
          costPrice: v.costPrice ?? initialProduct.costPrice ?? 0,
        }))
      : []
  );

  // Images
  const [uploadedImages, setUploadedImages] = useState<string[]>(() =>
    initialProduct?.images ? [...initialProduct.images] : []
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Barcode 1-click Auto Generator
  const handleAutoGenerateBarcode = () => {
    setBarcode(generateUniqueBarcode());
  };

  // SKU Regenerate
  const handleRegenerateSKU = () => {
    setSku(generateUniqueSKU(selectedBrand || "SKU"));
  };

  // In-place Brand creation
  const handleSaveNewBrand = async () => {
    if (!newBrandName.trim()) return;
    try {
      const b = await createBrand(shopId, auditUser, newBrandName.trim());
      onBrandCreated(b);
      setSelectedBrand(b.name);
      setNewBrandName("");
      setIsCreatingBrand(false);
    } catch (err) {
      alert("Failed to save new brand");
    }
  };

  // In-place Supplier creation
  const handleSaveNewSupplier = async () => {
    if (!newSupplierName.trim()) return;
    try {
      const s = await createSupplier(shopId, auditUser, newSupplierName.trim());
      onSupplierCreated(s);
      setSelectedSupplier(s.name);
      setNewSupplierName("");
      setIsCreatingSupplier(false);
    } catch (err) {
      alert("Failed to save new supplier");
    }
  };

  // Add Variant Row (each variation has its own one-to-one Selling Price & Cost Price)
  const handleAddVariant = () => {
    const defaultSelling = Number(sellingPrice) || 0;
    const defaultCost = Number(costPrice) || 0;
    const defaultStock = 10;
    const newVar: ProductVariant = {
      id: `var_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      size: "",
      color: "",
      sku: generateUniqueSKU("VAR"),
      barcode: generateUniqueBarcode(),
      sellingPrice: defaultSelling,
      costPrice: defaultCost,
      stockQuantity: defaultStock,
    };
    setVariants((prev) => [...prev, newVar]);
  };

  const handleUpdateVariant = (id: string, field: keyof ProductVariant, value: string | number) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  const handleRemoveVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  // Image Upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const downloadUrl = await uploadProductImage(shopId, file);
      setUploadedImages((prev) => [...prev, downloadUrl]);
    } catch (err) {
      alert("Failed to upload image to Firebase Storage.");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;

    setIsSubmitting(true);
    try {
      const totalVariantStock = hasVariants && variants.length > 0
        ? variants.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0)
        : Number(stockQuantity) || 0;

      const resolvedCategoryId = initialProduct
        ? initialProduct.categoryId
        : category?.id || "cat_common";
      const resolvedCategoryName = initialProduct
        ? initialProduct.categoryName || "Common"
        : category?.name || "Common";

      const matchedSub = availableSubcategories.find((s) => s.id === selectedSubcategoryId);
      const resolvedSubcategoryId = isQuickProduct
        ? ""
        : selectedSubcategoryId || "";
      const resolvedSubcategoryName = isQuickProduct
        ? ""
        : selectedSubcategoryId
        ? matchedSub?.name || subcategory?.name || initialProduct?.subcategoryName || ""
        : "";

      await onSubmit({
        categoryId: resolvedCategoryId,
        categoryName: resolvedCategoryName,
        subcategoryId: resolvedSubcategoryId,
        subcategoryName: resolvedSubcategoryName,
        name: name.trim().toUpperCase(),
        sku: sku.trim().toUpperCase(),
        barcode: barcode.trim() || undefined,
        sellingPrice: Number(sellingPrice) || 0,
        costPrice: Number(costPrice) || 0,
        unit: unit.trim() || "pcs",
        brand: selectedBrand.trim(),
        supplier: selectedSupplier.trim(),
        description: description.trim(), // Optional!
        hasVariants,
        variants: hasVariants
          ? variants.map((v) => ({
              ...v,
              sellingPrice: Number(v.sellingPrice) || 0,
              costPrice: Number(v.costPrice) || 0,
              stockQuantity: Number(v.stockQuantity) || 0,
            }))
          : [],
        stockQuantity: totalVariantStock,
        minStockLevel: Number(minStockLevel) || 5,
        images: uploadedImages,
      });
    } catch (e) {
      alert(isEditMode ? "Failed to update product details" : "Failed to create product");
      setIsSubmitting(false);
    }
  };

  const activeCategoryLabel = initialProduct?.categoryName || category?.name || "Common";

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-[#0f111a] border border-white/10 p-5 shadow-2xl flex flex-col gap-4 my-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">
              {isEditMode
                ? "Edit Product Details"
                : isQuickProduct
                ? "Create Quick Product"
                : "Add Product"}
            </h3>
            <p className="text-[11px] text-zinc-400">
              {isQuickProduct ? (
                <span>
                  Listed directly under <span className="text-amber-300 font-semibold">Common Category</span>{" "}
                  (No subcategory needed)
                </span>
              ) : (
                <>
                  <span>{activeCategoryLabel}</span> &rarr;{" "}
                  <span className="text-emerald-400 font-medium">
                    {selectedSubcategoryId
                      ? availableSubcategories.find((s) => s.id === selectedSubcategoryId)?.name ||
                        subcategory?.name ||
                        initialProduct?.subcategoryName ||
                        "Subcategory"
                      : `Direct in ${activeCategoryLabel} (No Subcategory)`}
                  </span>
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-xs">
          {/* Product Name (Always UPPERCASE) & Optional Subcategory Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={isQuickProduct ? "sm:col-span-3" : "sm:col-span-2"}>
              <label className="block text-zinc-300 font-medium mb-1">
                Product Name (UPPERCASE) *
              </label>
              <input
                type="text"
                required
                placeholder="E.G. IPHONE 15 PRO 256GB"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white font-semibold uppercase focus:border-emerald-500 outline-hidden"
              />
            </div>

            {!isQuickProduct && (
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Placement in {activeCategoryLabel}
                </label>
                <select
                  value={selectedSubcategoryId}
                  onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#141624] border border-white/[0.09] text-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="">Direct in {activeCategoryLabel} (No Subcategory)</option>
                  {availableSubcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      Subcategory: {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Auto SKU & Barcode Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-300 font-medium">SKU (Auto-Generated) *</label>
                <button
                  type="button"
                  onClick={handleRegenerateSKU}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  Regenerate
                </button>
              </div>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white font-mono focus:border-emerald-500 outline-hidden uppercase"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-300 font-medium">Barcode (Manual or Auto)</label>
                <button
                  type="button"
                  onClick={handleAutoGenerateBarcode}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 cursor-pointer font-medium"
                >
                  Auto-Generate
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter or generate barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white font-mono focus:border-emerald-500 outline-hidden"
                />
                <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              </div>
            </div>
          </div>

          {/* Pricing, Stock, Minimum Stock Alert & Unit */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Selling Price (LKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-emerald-400 font-mono font-semibold focus:border-emerald-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Cost Price (LKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white font-mono focus:border-emerald-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                {hasVariants ? "Total Variant Stock" : "Initial Stock *"}
              </label>
              <input
                type="number"
                min="0"
                disabled={hasVariants}
                value={
                  hasVariants
                    ? variants.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0)
                    : stockQuantity
                }
                onChange={(e) => setStockQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white font-mono focus:border-emerald-500 outline-hidden disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-amber-300 font-medium mb-1" title="Low stock warning threshold">
                Min Stock Alert *
              </label>
              <input
                type="number"
                min="0"
                required
                placeholder="5"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/30 text-amber-300 font-mono font-semibold focus:border-amber-400 outline-hidden"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-zinc-300 font-medium mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#141624] border border-white/[0.09] text-white focus:border-emerald-500 outline-hidden"
              >
                <option value="pcs">Pieces (pcs)</option>
                <option value="box">Box (box)</option>
                <option value="pack">Pack (pack)</option>
                <option value="set">Set (set)</option>
                <option value="kg">Kilogram (kg)</option>
              </select>
            </div>
          </div>

          {/* Brands & Suppliers (Selectable or Create in-place) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Brand */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-300 font-medium">Brand</label>
                <button
                  type="button"
                  onClick={() => setIsCreatingBrand(!isCreatingBrand)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  {isCreatingBrand ? "Select Existing" : "+ New Brand"}
                </button>
              </div>

              {isCreatingBrand ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="New brand name"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/[0.05] border border-indigo-500/40 text-white outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNewBrand}
                    className="px-2.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#141624] border border-white/[0.09] text-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="">Select a Brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                  {/* Fallback default brands */}
                  {!brands.some((b) => b.name === "Apple") && <option value="Apple">Apple</option>}
                  {!brands.some((b) => b.name === "Samsung") && <option value="Samsung">Samsung</option>}
                  {!brands.some((b) => b.name === "Anker") && <option value="Anker">Anker</option>}
                </select>
              )}
            </div>

            {/* Supplier */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-300 font-medium">Supplier</label>
                <button
                  type="button"
                  onClick={() => setIsCreatingSupplier(!isCreatingSupplier)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  {isCreatingSupplier ? "Select Existing" : "+ New Supplier"}
                </button>
              </div>

              {isCreatingSupplier ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="New supplier name"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/[0.05] border border-indigo-500/40 text-white outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNewSupplier}
                    className="px-2.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#141624] border border-white/[0.09] text-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="">Select a Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  {!suppliers.some((s) => s.name === "Apex Global Distro") && (
                    <option value="Apex Global Distro">Apex Global Distro</option>
                  )}
                  {!suppliers.some((s) => s.name === "TechWorld Wholesale") && (
                    <option value="TechWorld Wholesale">TechWorld Wholesale</option>
                  )}
                </select>
              )}
            </div>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Description <span className="text-zinc-500 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Specs, warranty, features..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white focus:border-emerald-500 outline-hidden resize-none"
            />
          </div>

          {/* PRODUCT VARIANTS (SIZE & COLOR — WITH INDIVIDUAL ONE-TO-ONE SELLING PRICE & COST PRICE) */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVariants}
                  onChange={(e) => {
                    setHasVariants(e.target.checked);
                    if (e.target.checked && variants.length === 0) {
                      handleAddVariant();
                    }
                  }}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-semibold text-white">
                  Enable Variants (Size, Color, Individual Selling Price &amp; Cost Price)
                </span>
              </label>

              {hasVariants && (
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Variant</span>
                </button>
              )}
            </div>

            {hasVariants && (
              <div className="flex flex-col gap-2 mt-1">
                {variants.map((v) => (
                  <div
                    key={v.id}
                    className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] grid grid-cols-2 sm:grid-cols-8 gap-2 items-center"
                  >
                    <div>
                      <span className="block text-[10px] text-zinc-400 mb-0.5">Size</span>
                      <input
                        type="text"
                        placeholder="128GB / M"
                        value={v.size || ""}
                        onChange={(e) => handleUpdateVariant(v.id, "size", e.target.value)}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-white text-[11px] outline-hidden"
                      />
                    </div>

                    <div>
                      <span className="block text-[10px] text-zinc-400 mb-0.5">Color</span>
                      <input
                        type="text"
                        placeholder="Black / Blue"
                        value={v.color || ""}
                        onChange={(e) => handleUpdateVariant(v.id, "color", e.target.value)}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-white text-[11px] outline-hidden"
                      />
                    </div>

                    <div>
                      <span className="block text-[10px] text-zinc-400 mb-0.5">SKU</span>
                      <input
                        type="text"
                        value={v.sku}
                        onChange={(e) => handleUpdateVariant(v.id, "sku", e.target.value)}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-white font-mono text-[10px] outline-hidden"
                      />
                    </div>

                    <div>
                      <span className="block text-[10px] text-zinc-400 mb-0.5">Barcode</span>
                      <input
                        type="text"
                        value={v.barcode || ""}
                        onChange={(e) => handleUpdateVariant(v.id, "barcode", e.target.value)}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-white font-mono text-[10px] outline-hidden"
                      />
                    </div>

                    <div>
                      <span className="block text-[10px] text-emerald-400 mb-0.5 font-medium">Price (LKR)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={v.sellingPrice}
                        onChange={(e) => handleUpdateVariant(v.id, "sellingPrice", Number(e.target.value))}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-emerald-400 font-mono text-[11px] outline-hidden"
                      />
                    </div>

                    <div>
                      <span className="block text-[10px] text-amber-300 mb-0.5 font-medium">Cost (LKR)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={v.costPrice ?? 0}
                        onChange={(e) => handleUpdateVariant(v.id, "costPrice", Number(e.target.value))}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-amber-500/25 text-amber-200 font-mono text-[11px] outline-hidden"
                      />
                    </div>

                    <div>
                      <span className="block text-[10px] text-zinc-400 mb-0.5">Stock</span>
                      <input
                        type="number"
                        value={v.stockQuantity}
                        onChange={(e) => handleUpdateVariant(v.id, "stockQuantity", Number(e.target.value))}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-white font-mono text-[11px] outline-hidden"
                      />
                    </div>

                    <div className="flex justify-end pt-3">
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(v.id)}
                        className="p-1 rounded text-red-400 hover:bg-red-500/10 cursor-pointer"
                        title="Remove Variant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Firebase Storage Product Image Upload */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Product Images</label>
            <div className="flex flex-wrap items-center gap-2">
              {uploadedImages.map((url, idx) => (
                <div
                  key={url}
                  className="relative w-14 h-14 rounded-xl bg-black/50 border border-white/15 overflow-hidden group"
                >
                  <img src={url} alt="Upload Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setUploadedImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className="w-20 h-14 rounded-xl border border-dashed border-white/20 hover:border-emerald-500/60 bg-white/[0.02] flex flex-col items-center justify-center text-zinc-400 hover:text-emerald-400 cursor-pointer text-[9px]"
              >
                {isUploadingImage ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5 mb-0.5" />
                    <span>Upload</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-white/[0.05] text-zinc-300 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !sku.trim()}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving..."
                : isEditMode
                ? "Update Product Details"
                : isQuickProduct
                ? "Save Quick Product"
                : "Save Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL: MOVE PRODUCT TO ANY SUBCATEGORY OR MAIN CATEGORY
// =============================================================================
function MoveProductModal({
  product,
  categories,
  subcategories,
  onClose,
  onMove,
}: {
  product: ProductItem;
  categories: Category[];
  subcategories: Subcategory[];
  onClose: () => void;
  onMove: (
    targetCategoryId: string,
    targetCategoryName: string,
    targetSubcategoryId: string,
    targetSubcategoryName: string
  ) => Promise<void>;
}) {
  const [targetCategoryId, setTargetCategoryId] = useState(product.categoryId || "");
  const [targetSubcategoryId, setTargetSubcategoryId] = useState(product.subcategoryId || "");
  const [isMoving, setIsMoving] = useState(false);

  const selectedCategoryObj = categories.find((c) => c.id === targetCategoryId) || {
    id: product.categoryId,
    name: product.categoryName || "Common",
  };

  const categorySubcategories = subcategories.filter((s) => s.categoryId === targetCategoryId);

  const handleConfirmMove = async (subId: string, subName: string) => {
    setIsMoving(true);
    try {
      await onMove(
        selectedCategoryObj.id,
        selectedCategoryObj.name,
        subId,
        subName
      );
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#0f111a] border border-white/10 p-5 shadow-2xl flex flex-col gap-4 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <FolderInput className="w-4 h-4 text-cyan-400" />
              <span>Move Product</span>
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5 uppercase font-semibold">
              {product.name.toUpperCase()}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Category Selector */}
        <div>
          <label className="block text-zinc-300 font-medium mb-1">Main Category</label>
          <select
            value={targetCategoryId}
            onChange={(e) => {
              setTargetCategoryId(e.target.value);
              setTargetSubcategoryId("");
            }}
            className="w-full px-3 py-2 rounded-xl bg-[#141624] border border-white/[0.09] text-white focus:border-cyan-500 outline-hidden"
          >
            {!categories.some((c) => c.id === product.categoryId) && (
              <option value={product.categoryId}>{product.categoryName || "Common"}</option>
            )}
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Subcategory Destinations inside Main Category */}
        <div className="flex flex-col gap-2">
          <label className="block text-zinc-300 font-medium">
            Select Destination in <span className="text-cyan-300">{selectedCategoryObj.name}</span>
          </label>

          {/* Option 1: Direct in Main Category (No Subcategory) */}
          <button
            type="button"
            disabled={isMoving}
            onClick={() => setTargetSubcategoryId("")}
            className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
              targetSubcategoryId === ""
                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-200 font-semibold"
                : "bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] text-zinc-300"
            }`}
          >
            <div>
              <div className="text-xs">Direct in {selectedCategoryObj.name}</div>
              <div className="text-[10px] text-zinc-400 font-normal">
                No subcategory — listed directly under {selectedCategoryObj.name}
              </div>
            </div>
            {targetSubcategoryId === "" && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
          </button>

          {/* Option 2..N: Subcategories within Main Category */}
          {categorySubcategories.length === 0 ? (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-zinc-500 text-center text-[11px]">
              No subcategories in {selectedCategoryObj.name}. Product will be placed directly in {selectedCategoryObj.name}.
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto flex flex-col gap-1.5 pr-1">
              {categorySubcategories.map((sub) => {
                const isSelected = targetSubcategoryId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    disabled={isMoving}
                    onClick={() => setTargetSubcategoryId(sub.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-200 font-semibold"
                        : "bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Box className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{sub.name}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-cyan-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.07]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-zinc-300 text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isMoving}
            onClick={() => {
              const chosenSub = categorySubcategories.find((s) => s.id === targetSubcategoryId);
              handleConfirmMove(targetSubcategoryId, chosenSub?.name || "");
            }}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {isMoving ? "Moving..." : "Move Product Here"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SLIDE-OVER DRAWER: PRODUCT DETAIL (WITH VARIANTS & AUDIT TIMELINE)
// =============================================================================
function ProductDetailDrawer({
  product,
  canManage,
  onClose,
  onEdit,
  onMove,
  onDelete,
}: {
  product: ProductItem;
  canManage: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onMove?: () => void;
  onDelete: () => Promise<void>;
}) {
  const totalStock = getProductTotalStock(product);
  const minAlert = product.minStockLevel ?? 5;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md h-full bg-[#0c0d16] border-l border-white/10 p-5 flex flex-col justify-between overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-150 text-xs">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.08] text-zinc-300">
              Product Details
            </span>
            <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="w-full h-40 rounded-xl bg-black/50 border border-white/10 overflow-hidden flex items-center justify-center">
              {product.images && product.images.length > 0 ? (
                <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-12 h-12 text-zinc-600" />
              )}
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                {product.brand ? `${product.brand} • ` : ""}
                {product.categoryName || "Common"}
                {product.subcategoryName ? ` → ${product.subcategoryName}` : " (Direct in Main Category)"}
              </div>
              <h2 className="text-sm font-bold text-white uppercase mt-0.5">
                {product.name.toUpperCase()}
              </h2>
              {product.description && <p className="text-xs text-zinc-400 mt-0.5">{product.description}</p>}
            </div>

            {/* Economics & Stock Alert */}
            <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div>
                <div className="text-[9px] text-zinc-400">Selling Price</div>
                <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
                  {formatLKR(product.sellingPrice)}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-zinc-400">Cost Price</div>
                <div className="text-xs font-bold text-zinc-300 font-mono mt-0.5">
                  {formatLKR(product.costPrice)}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-zinc-400">Total Stock</div>
                <div className="text-xs font-bold text-indigo-300 font-mono mt-0.5">
                  {totalStock} {(product.unit || "pcs").toLowerCase()}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-amber-300">Min Alert</div>
                <div className="text-xs font-bold text-amber-300 font-mono mt-0.5">
                  {minAlert} {(product.unit || "pcs").toLowerCase()}
                </div>
              </div>
            </div>

            {/* Variants table if present (shows both Selling Price & individual Cost Price per variation) */}
            {product.hasVariants && product.variants && product.variants.length > 0 && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[11px] font-semibold text-white mb-1.5 flex items-center justify-between">
                  <span>Product Variants ({product.variants.length})</span>
                  <span className="font-mono text-emerald-400 text-[10px]">
                    Total: {totalStock} {(product.unit || "pcs").toLowerCase()}
                  </span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {product.variants.map((v) => (
                    <div key={v.id} className="py-1.5 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-semibold text-white">
                          {v.size || "Standard"} {v.color ? `• ${v.color}` : ""}
                        </span>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {v.sku} {v.barcode ? `• ${v.barcode}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-emerald-400">{formatLKR(v.sellingPrice)}</div>
                        <div className="text-[10px] text-amber-300/90 font-mono">
                          Cost: {formatLKR(v.costPrice ?? product.costPrice)}
                        </div>
                        <div className="text-[10px] text-zinc-400">{v.stockQuantity} in stock</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Specs */}
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs">
              <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                <span className="text-zinc-400">SKU</span>
                <span className="font-mono text-zinc-200">{product.sku}</span>
              </div>
              {product.barcode && (
                <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                  <span className="text-zinc-400">Barcode</span>
                  <span className="font-mono text-zinc-200">{product.barcode}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                <span className="text-zinc-400">Minimum Stock Alert</span>
                <span className="font-mono text-amber-300">{minAlert} {(product.unit || "pcs").toLowerCase()}</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                <span className="text-zinc-400">Unit</span>
                <span className="uppercase text-zinc-200">{product.unit}</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                <span className="text-zinc-400">Supplier</span>
                <span className="text-zinc-200">{product.supplier || "—"}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-zinc-400">Tenant Shop ID</span>
                <span className="font-mono text-indigo-300">{product.shopId}</span>
              </div>
            </div>

            {/* Audit Trail Badge */}
            <div className="p-3 rounded-xl bg-indigo-500/[0.05] border border-indigo-500/20 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Audit &amp; Provenance Record</span>
              </div>
              <div className="text-[11px] text-zinc-300">
                Created by <span className="font-semibold text-white">@{product.createdBy?.username || "cashier"}</span>{" "}
                <span className="text-zinc-500 capitalize">({product.createdBy?.role || "staff"})</span> on{" "}
                <span className="text-indigo-200">{new Date(product.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-medium cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
              {onMove && (
                <button
                  type="button"
                  onClick={onMove}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium cursor-pointer"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  <span>Move</span>
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-white/[0.08] text-zinc-200 text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
