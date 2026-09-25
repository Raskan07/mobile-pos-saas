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
  deleteProduct,
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

  // Modals & Panels
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isAddSubcategoryOpen, setIsAddSubcategoryOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [activeDetailProduct, setActiveDetailProduct] = useState<ProductItem | null>(null);

  // -------------------------------------------------------------
  // DATA LOADING (Reloadable via Refresh Icon)
  // -------------------------------------------------------------
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [cats, subs, prods, brds, sups] = await Promise.all([
        getCategories(shop.shopId),
        getSubcategories(shop.shopId),
        getProducts(shop.shopId),
        getBrands(shop.shopId),
        getSuppliers(shop.shopId),
      ]);
      setCategories(cats);
      setSubcategories(subs);
      setProducts(prods);
      setBrands(brds);
      setSuppliers(sups);

      if (selectedCategory) {
        const freshCat = cats.find((c) => c.id === selectedCategory.id);
        if (freshCat) setSelectedCategory(freshCat);
      }
      if (selectedSubcategory) {
        const freshSub = subs.find((s) => s.id === selectedSubcategory.id);
        if (freshSub) setSelectedSubcategory(freshSub);
      }
    } catch (err) {
      console.error("[ProductsCatalog] Error loading catalog:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (shop?.shopId) {
      loadData();
    }
  }, [shop?.shopId]);

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
      await deleteProduct(shop.shopId, prod.id, prod.categoryId, prod.subcategoryId);
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

            {/* Compact Breadcrumbs */}
            <nav className="flex items-center gap-1 text-xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  !selectedCategory && !cleanQuery
                    ? "bg-white/[0.08] text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>Categories</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-white/10 text-zinc-300 font-mono">
                  {categories.length}
                </span>
              </button>

              {selectedCategory && (
                <>
                  <ChevronRight className="w-3 h-3 text-zinc-600" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubcategory(null);
                      setSearchQuery("");
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      selectedCategory && !selectedSubcategory && !cleanQuery
                        ? "bg-white/[0.08] text-white font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
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
                  <button
                    type="button"
                    onClick={() => setIsAddSubcategoryOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Subcategory</span>
                  </button>
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
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                      <Package className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Products ({matchingProducts.length})</span>
                    </div>
                    {viewMode === "table" ? (
                      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-white/[0.08] bg-white/[0.03] text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                              <th className="py-2.5 px-3">Product</th>
                              <th className="py-2.5 px-3">Hierarchy</th>
                              <th className="py-2.5 px-3">SKU / Barcode</th>
                              <th className="py-2.5 px-3">Price / Cost</th>
                              <th className="py-2.5 px-3">Brand</th>
                              <th className="py-2.5 px-3">Unit</th>
                              <th className="py-2.5 px-3">Created By</th>
                              <th className="py-2.5 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.05]">
                            {matchingProducts.map((prod) => (
                              <tr
                                key={prod.id}
                                onClick={() => setActiveDetailProduct(prod)}
                                className="group hover:bg-white/[0.04] transition-colors cursor-pointer"
                              >
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                      {prod.images && prod.images.length > 0 ? (
                                        <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <Package className="w-4 h-4 text-zinc-500" />
                                      )}
                                    </div>
                                    <div>
                                      <div className="font-medium text-white group-hover:text-indigo-300 transition-colors truncate max-w-[180px]">
                                        {prod.name}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="text-[11px] text-zinc-400">
                                    <span>{prod.categoryName || "Category"}</span> &rarr;{" "}
                                    <span className="text-zinc-200">{prod.subcategoryName || "Subcategory"}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-mono text-zinc-200">{prod.sku}</div>
                                  {prod.barcode && <div className="text-[10px] text-zinc-500 font-mono">{prod.barcode}</div>}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-emerald-400 font-mono">${prod.sellingPrice.toFixed(2)}</div>
                                  <div className="text-[10px] text-zinc-500 font-mono">Cost: ${prod.costPrice.toFixed(2)}</div>
                                </td>
                                <td className="py-2.5 px-3 text-zinc-300">{prod.brand || "—"}</td>
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
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                        {matchingProducts.map((prod) => (
                          <div
                            key={prod.id}
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
                                {prod.categoryName} &rarr; {prod.subcategoryName}
                              </div>
                              <h4 className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors truncate mt-0.5">
                                {prod.name}
                              </h4>
                              <div className="text-[10px] font-mono text-zinc-400">SKU: {prod.sku}</div>
                            </div>
                            <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between">
                              <div className="text-xs font-bold text-emerald-400 font-mono">${prod.sellingPrice.toFixed(2)}</div>
                              <div className="text-[9px] text-zinc-500">@{prod.createdBy?.username || "staff"}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
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
                      <button
                        type="button"
                        onClick={() => setIsAddCategoryOpen(true)}
                        className="mt-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
                      >
                        + Create Category
                      </button>
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
            {/* TIER 2: HALF-SIZE SUBCATEGORY CARDS                           */}
            {/* ------------------------------------------------------------- */}
            {selectedCategory && !selectedSubcategory && (
              <div>
                {currentSubcategories.length === 0 ? (
                  <div className="border border-dashed border-white/10 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                    <Box className="w-8 h-8 text-zinc-600" />
                    <div className="text-xs text-zinc-400">No subcategories in {selectedCategory.name}.</div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setIsAddSubcategoryOpen(true)}
                        className="mt-1 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-medium cursor-pointer"
                      >
                        + Add Subcategory
                      </button>
                    )}
                  </div>
                ) : (
                  /* Compact Half-Size Grid */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
                    {currentSubcategories.map((sub) => {
                      const subProds = products.filter((p) => p.subcategoryId === sub.id);

                      return (
                        <div
                          key={sub.id}
                          onClick={() => setSelectedSubcategory(sub)}
                          className="group flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-cyan-500/40 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
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
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TIER 3: PRODUCTS VIEW (COMPACT TOOLBAR + TABLE / GRID)        */}
            {/* ------------------------------------------------------------- */}
            {selectedCategory && selectedSubcategory && (
              <div className="flex flex-col gap-2.5">
                {/* View Toolbar */}
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-xs text-zinc-400 font-medium">
                    Showing <span className="font-mono text-zinc-200">{currentProducts.length}</span> products in{" "}
                    <span className="text-white">{selectedSubcategory.name}</span>
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
                          <th className="py-2.5 px-3">Price / Cost</th>
                          <th className="py-2.5 px-3">Brand / Supplier</th>
                          <th className="py-2.5 px-3">Unit</th>
                          <th className="py-2.5 px-3">Variants</th>
                          <th className="py-2.5 px-3">Created By</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {currentProducts.map((prod) => (
                          <tr
                            key={prod.id}
                            onClick={() => setActiveDetailProduct(prod)}
                            className="group hover:bg-white/[0.04] transition-colors cursor-pointer"
                          >
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                  {prod.images && prod.images.length > 0 ? (
                                    <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Package className="w-4 h-4 text-zinc-500" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium text-white group-hover:text-indigo-300 transition-colors truncate max-w-[200px]">
                                    {prod.name}
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
                                ${prod.sellingPrice.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono">
                                Cost: ${prod.costPrice.toFixed(2)}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-zinc-300">
                              <div>{prod.brand || "—"}</div>
                              <div className="text-[10px] text-zinc-500">{prod.supplier || "—"}</div>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {currentProducts.map((prod) => (
                      <div
                        key={prod.id}
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
                          <div className="text-[9px] text-zinc-400 uppercase font-semibold">{prod.brand || "—"}</div>
                          <h4 className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                            {prod.name}
                          </h4>
                          <div className="text-[10px] font-mono text-zinc-400">SKU: {prod.sku}</div>
                        </div>

                        <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between">
                          <div className="text-xs font-bold text-emerald-400 font-mono">
                            ${prod.sellingPrice.toFixed(2)}
                          </div>
                          <div className="text-[9px] text-zinc-500">@{prod.createdBy?.username || "staff"}</div>
                        </div>
                      </div>
                    ))}
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
            await createCategory(shop.shopId, auditUser, input);
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
            await createSubcategory(shop.shopId, auditUser, input);
            setIsAddSubcategoryOpen(false);
            await loadData(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD PRODUCT (VARIANTS, BRANDS/SUPPLIERS IN-PLACE, AUTO CODES)    */}
      {/* ========================================================================= */}
      {isAddProductOpen && selectedCategory && selectedSubcategory && (
        <AddProductModal
          shopId={shop.shopId}
          auditUser={auditUser}
          category={selectedCategory}
          subcategory={selectedSubcategory}
          brands={brands}
          suppliers={suppliers}
          onBrandCreated={(newBrand) => setBrands((prev) => [...prev, newBrand])}
          onSupplierCreated={(newSup) => setSuppliers((prev) => [...prev, newSup])}
          onClose={() => setIsAddProductOpen(false)}
          onSubmit={async (input) => {
            await createProduct(shop.shopId, auditUser, input);
            setIsAddProductOpen(false);
            await loadData(true);
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
// MODAL: ADD PRODUCT (VARIANTS, IN-PLACE BRANDS/SUPPLIERS, AUTO SKU & BARCODE)
// =============================================================================
function AddProductModal({
  shopId,
  auditUser,
  category,
  subcategory,
  brands,
  suppliers,
  onBrandCreated,
  onSupplierCreated,
  onClose,
  onSubmit,
}: {
  shopId: string;
  auditUser: AuditUser;
  category: Category;
  subcategory: Subcategory;
  brands: Brand[];
  suppliers: Supplier[];
  onBrandCreated: (b: Brand) => void;
  onSupplierCreated: (s: Supplier) => void;
  onClose: () => void;
  onSubmit: (input: CreateProductInput) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-generate SKU on open
  const [sku, setSku] = useState(() => generateUniqueSKU());
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [description, setDescription] = useState(""); // Optional
  const [stockQuantity, setStockQuantity] = useState("50");

  // Brands (with in-place creation)
  const [selectedBrand, setSelectedBrand] = useState("");
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  // Suppliers (with in-place creation)
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");

  // Variants System (Size & Color)
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Images
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
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

  // Add Variant Row
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

      await onSubmit({
        categoryId: category.id,
        categoryName: category.name,
        subcategoryId: subcategory.id,
        subcategoryName: subcategory.name,
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        barcode: barcode.trim() || undefined,
        sellingPrice: Number(sellingPrice) || 0,
        costPrice: Number(costPrice) || 0,
        unit: unit.trim() || "pcs",
        brand: selectedBrand.trim(),
        supplier: selectedSupplier.trim(),
        description: description.trim(), // Optional!
        hasVariants,
        variants: hasVariants ? variants : [],
        stockQuantity: totalVariantStock,
        images: uploadedImages,
      });
    } catch (e) {
      alert("Failed to create product");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0f111a] border border-white/10 p-5 shadow-2xl flex flex-col gap-4 my-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Add Product</h3>
            <p className="text-[11px] text-zinc-400">
              {category.name} &rarr; <span className="text-emerald-400">{subcategory.name}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-xs">
          {/* Product Name */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Product Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. iPhone 15 Pro 256GB"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-white focus:border-emerald-500 outline-hidden"
            />
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

          {/* Pricing & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Selling Price ($) *</label>
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
              <label className="block text-zinc-300 font-medium mb-1">Cost Price ($) *</label>
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

          {/* PRODUCT VARIANTS (SIZE & COLOR) */}
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
                  Enable Variants (Size & Color)
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
                {variants.map((v, i) => (
                  <div
                    key={v.id}
                    className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] grid grid-cols-2 sm:grid-cols-7 gap-2 items-center"
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
                      <span className="block text-[10px] text-zinc-400 mb-0.5">Price ($)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={v.sellingPrice}
                        onChange={(e) => handleUpdateVariant(v.id, "sellingPrice", Number(e.target.value))}
                        className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-emerald-400 font-mono text-[11px] outline-hidden"
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
              {isSubmitting ? "Saving..." : "Save Product"}
            </button>
          </div>
        </form>
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
  onDelete,
}: {
  product: ProductItem;
  canManage: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const margin = product.sellingPrice - product.costPrice;
  const marginPct =
    product.costPrice > 0 ? ((margin / product.costPrice) * 100).toFixed(1) : "100.0";

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
                {product.brand} &bull; {product.categoryName} &rarr; {product.subcategoryName}
              </div>
              <h2 className="text-sm font-bold text-white mt-0.5">{product.name}</h2>
              {product.description && <p className="text-xs text-zinc-400 mt-0.5">{product.description}</p>}
            </div>

            {/* Economics */}
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div>
                <div className="text-[9px] text-zinc-400">Selling Price</div>
                <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
                  ${product.sellingPrice.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-zinc-400">Cost Price</div>
                <div className="text-xs font-bold text-zinc-300 font-mono mt-0.5">
                  ${product.costPrice.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-zinc-400">Margin</div>
                <div className="text-xs font-bold text-indigo-300 font-mono mt-0.5">
                  +{marginPct}%
                </div>
              </div>
            </div>

            {/* Variants table if present */}
            {product.hasVariants && product.variants && product.variants.length > 0 && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[11px] font-semibold text-white mb-1.5 flex items-center justify-between">
                  <span>Product Variants ({product.variants.length})</span>
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
                        <div className="font-mono text-emerald-400">${v.sellingPrice.toFixed(2)}</div>
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
                <span>Audit & Provenance Record</span>
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
          <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between">
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Product</span>
            </button>
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
