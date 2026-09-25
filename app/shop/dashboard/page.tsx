"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Search,
  ScanLine,
  Trash2,
  Plus,
  Minus,
  X,
  CreditCard,
  Banknote,
  Building2,
  Smartphone,
  Tag,
  CheckCircle2,
  ChevronDown,
  Clock,
  Sparkles,
  Percent,
  DollarSign,
  ArrowRight,
  ShoppingCart,
  Layers,
  LayoutGrid,
  Headphones,
  Wrench,
  Radio,
  Store,
  LogOut,
  BookOpen,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  Product,
  CartItem,
  DiscountSetting,
} from "./posData";
import { getProducts, getCategories } from "@/lib/services/catalogService";
import { createSaleRecord } from "@/lib/services/salesService";
import { SaleRecord } from "@/lib/types/sale";
import { Category } from "@/lib/types/catalog";
import ProductImage from "./ProductImage";
import PaymentModal from "./PaymentModal";
import ReceiptModal from "./ReceiptModal";
import BarcodeScannerModal from "./BarcodeScannerModal";
import NavigationView from "./NavigationView";

export default function ShopDashboardPOS() {
  const router = useRouter();
  const shopAuth = useShopAuth();

  // Shop & Cashier data
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
    role: "cashier",
    isActive: true,
    createdAt: Date.now(),
  };

  const activeBranchName = shopAuth?.activeBranchName || "Main Store";

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  // Clean cart initialized without any mock items
  const [cart, setCart] = useState<CartItem[]>([]);

  // Discount configuration: Percentage or Fixed
  const [discountSetting, setDiscountSetting] = useState<DiscountSetting>({
    type: "fixed",
    value: 0,
  });
  const [isDiscountPopoverOpen, setIsDiscountPopoverOpen] = useState(false);
  const [discountInputValue, setDiscountInputValue] = useState<string>("0");

  // Selected quick payment method
  const [selectedQuickPayment, setSelectedQuickPayment] = useState<
    "cash" | "card" | "bank" | "mobile"
  >("cash");

  // Modals & Navigation Views
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [persistedSale, setPersistedSale] = useState<SaleRecord | null>(null);
  const [isSavingSale, setIsSavingSale] = useState(false);
  const [receiptData, setReceiptData] = useState<{
    method: string;
    tendered: number;
    change: number;
  }>({ method: "Cash", tendered: 0, change: 0 });

  // Status indicators
  const [isOnline, setIsOnline] = useState(true);
  const [currentDateTime, setCurrentDateTime] = useState<string>("");
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);
  const [addedAnimationId, setAddedAnimationId] = useState<string | null>(null);

  // Dynamic Shop Data strictly from Firebase filtered by active shop ID
  const [shopCategories, setShopCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);

  useEffect(() => {
    if (!shop?.shopId) return;
    let isMounted = true;

    async function loadShopCatalog() {
      setIsLoadingCatalog(true);
      try {
        const [cats, firestoreItems] = await Promise.all([
          getCategories(shop.shopId),
          getProducts(shop.shopId),
        ]);

        if (!isMounted) return;
        setShopCategories(cats);

        const mapped: Product[] = firestoreItems.map((item) => ({
          id: item.id,
          name: item.name,
          specs: [item.brand, item.unit].filter(Boolean).join(" • "),
          price: item.sellingPrice,
          category: item.categoryId || "",
          categoryName: item.categoryName || "",
          subcategoryId: item.subcategoryId,
          barcode: item.barcode || item.sku,
          stock: item.stockQuantity ?? 0,
          imageUrl: item.images && item.images.length > 0 ? item.images[0] : undefined,
          badge: item.brand,
          // Immutable product snapshot fields
          sku: item.sku || item.barcode || "",
          costPrice: item.costPrice ?? 0,
          unit: item.unit || "pcs",
          brand: item.brand || "",
        }));
        setProducts(mapped);
      } catch (err) {
        console.error("[DashboardPOS] Error loading shop products from Firebase:", err);
      } finally {
        if (isMounted) setIsLoadingCatalog(false);
      }
    }

    loadShopCatalog();
    return () => {
      isMounted = false;
    };
  }, [shop?.shopId]);

  // Filtered products strictly from active shop's Firebase catalog
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchesCategory =
        !selectedCategory ||
        selectedCategory === "all" ||
        prod.category === selectedCategory ||
        prod.categoryName?.toLowerCase() === selectedCategory.toLowerCase();

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        prod.name.toLowerCase().includes(q) ||
        prod.specs.toLowerCase().includes(q) ||
        prod.barcode.toLowerCase().includes(q) ||
        (prod.badge && prod.badge.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Live real-time clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentDateTime(
        now.toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);


  // Cart operations
  const addToCart = (product: Product) => {
    // Subtle visual animation trigger
    setAddedAnimationId(product.id);
    setTimeout(() => setAddedAnimationId(null), 300);

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm("Clear all items from the current bill?")) {
      setCart([]);
      setDiscountSetting({ type: "fixed", value: 0 });
      setDiscountInputValue("0");
    }
  };

  // Financial calculations
  const subtotal = useMemo(() => {
    return cart.reduce(
      (acc, item) => acc + (item.customPrice ?? item.product.price) * item.quantity,
      0
    );
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (subtotal <= 0) return 0;
    if (discountSetting.type === "percentage") {
      return (subtotal * Math.min(100, Math.max(0, discountSetting.value))) / 100;
    }
    return Math.min(subtotal, Math.max(0, discountSetting.value));
  }, [subtotal, discountSetting]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = 0.08; // 8% sales tax
  const taxAmount = taxableAmount * taxRate;
  const grandTotal = taxableAmount + taxAmount;

  // Apply discount changes
  const applyDiscount = () => {
    const val = parseFloat(discountInputValue) || 0;
    setDiscountSetting((prev) => ({ ...prev, value: val }));
    setIsDiscountPopoverOpen(false);
  };

  // Payment completed callback: Persists sale with immutable product snapshots to Firebase
  const handleCompleteSale = async (
    method: string,
    tendered: number,
    change: number
  ) => {
    if (!shop?.shopId) {
      alert("Security alert: Active shop session missing. Cannot complete sale.");
      return;
    }

    setIsSavingSale(true);
    try {
      // 1. Build product snapshots for all items in the cart
      const snapshotItems = cart.map((cartItem) => {
        const unitPrice = cartItem.customPrice ?? cartItem.product.price;
        const itemTotal = unitPrice * cartItem.quantity;
        // Allocate order discount proportionally
        const ratio = subtotal > 0 ? itemTotal / subtotal : 0;
        const lineDiscount = discountAmount * ratio;
        const lineSubtotal = Math.max(0, itemTotal - lineDiscount);

        return {
          productId: cartItem.product.id,
          name: cartItem.product.name,
          variant: cartItem.variant || cartItem.product.variant || "",
          variantId: cartItem.variantId || cartItem.product.variantId || "",
          sku: cartItem.product.sku || cartItem.product.barcode || "SKU-GEN",
          barcode: cartItem.product.barcode || "",
          unitPrice,
          costPrice: cartItem.product.costPrice ?? 0,
          quantity: cartItem.quantity,
          discount: lineDiscount,
          subtotal: lineSubtotal,
          unit: cartItem.product.unit || "pcs",
          brand: cartItem.product.brand || "",
          categoryName: cartItem.product.categoryName || "",
          imageUrl: cartItem.product.imageUrl || "",
        };
      });

      // 2. Persist to Firestore via salesService
      const savedSale = await createSaleRecord(shop.shopId, {
        shopId: shop.shopId,
        shopName: shop.shopName,
        branchId: shopAuth?.activeBranchId || "main",
        branchName: activeBranchName,
        cashier: {
          userId: user.uid,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role,
        },
        items: snapshotItems,
        subtotal,
        discountSetting,
        discountAmount,
        taxRate,
        taxAmount,
        grandTotal,
        paymentMethod: method,
        cashReceived: tendered,
        change,
      });

      setPersistedSale(savedSale);
      setReceiptData({ method, tendered, change });
      setIsPaymentModalOpen(false);
      setIsReceiptOpen(true);
    } catch (err: any) {
      console.error("[DashboardPOS] Error saving sale to Firestore:", err);
      alert(err.message || "Failed to record sale in Firebase. Please check connection.");
    } finally {
      setIsSavingSale(false);
    }
  };

  const handleNewSale = () => {
    setCart([]);
    setDiscountSetting({ type: "fixed", value: 0 });
    setDiscountInputValue("0");
    setPersistedSale(null);
    setIsReceiptOpen(false);
  };

  // Category Icon Resolver
  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case "LayoutGrid":
        return <LayoutGrid className="w-4 h-4" />;
      case "Smartphone":
        return <Smartphone className="w-4 h-4" />;
      case "Headphones":
        return <Headphones className="w-4 h-4" />;
      case "Wrench":
        return <Wrench className="w-4 h-4" />;
      case "SimCard":
        return <Radio className="w-4 h-4" />;
      case "Tag":
        return <Tag className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  const cartTotalItemCount = cart.reduce((acc, c) => acc + c.quantity, 0);

  return (
    <div className="flex h-screen w-screen bg-[#07080d] text-zinc-100 font-sans select-none overflow-hidden">
      {/* ── Background Ambient Glows ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[700px] h-[500px] bg-zinc-700/10 rounded-full blur-[180px]" />
        <div className="absolute bottom-0 right-10 w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-[170px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* ── SEPARATE NAVIGATION PAGE VIEW (when menu icon clicked) ── */}
      {isNavOpen && (
        <NavigationView
          onClose={() => setIsNavOpen(false)}
          shopName={shop.shopName}
          shopId={shop.shopId}
          cashierName={user.displayName || user.username}
          cashierRole={user.role}
          activeBranchName={activeBranchName}
          cartCount={cartTotalItemCount}
        />
      )}

      {/* ── MAIN FULL DESKTOP POS INTERFACE ── */}
      <div className="relative z-10 flex flex-col flex-1 h-full overflow-hidden">
        {/* ── TOP APP BAR ── */}
        <header className="h-16 px-4 md:px-6 bg-[#0c0d15]/80 backdrop-blur-xl border-b border-white/[0.07] flex items-center justify-between gap-4 shrink-0">
          {/* Left: Hamburger menu icon + Logo */}
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setIsNavOpen(true)}
              className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm group"
              title="Open Navigation Hub"
            >
              <Menu className="w-5 h-5 group-hover:text-zinc-400 transition-colors" />
            </button>

            {/* Brand Logo */}
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white flex items-center">
                HM <span className="text-zinc-400 ml-1.5 font-bold text-sm tracking-widest uppercase">POS</span>
              </span>
            </div>
          </div>

          {/* Center: Search Bar + Barcode Scanner Trigger */}
          <div className="flex-1 max-w-xl mx-2">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, brand or barcode..."
                className="w-full pl-10 pr-32 py-2 rounded-xl bg-[#141622]/80 border border-white/[0.08] focus:border-zinc-500/60 focus:bg-[#181a28] focus:outline-none text-xs text-zinc-100 placeholder:text-zinc-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setIsBarcodeModalOpen(true)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-zinc-700/40 hover:border-zinc-500/40 border border-white/[0.08] text-[11px] font-medium text-zinc-300 hover:text-zinc-300 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ScanLine className="w-3.5 h-3.5 text-zinc-400" />
                <span>Scan Barcode</span>
              </button>
            </div>
          </div>

          {/* Right: Date Time, Online Status, Branch, Cashier */}
          <div className="flex items-center gap-2.5">
            {/* Sales Ledger Shortcut */}
            <button
              type="button"
              onClick={() => router.push("/shop/ledger")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 text-xs font-semibold text-orange-300 transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
              title="View Sales Ledger & Past Invoices"
            >
              <BookOpen className="w-3.5 h-3.5 text-orange-400" />
              <span className="hidden sm:inline">Sales Ledger</span>
            </button>

            {/* Live Date Time */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 font-mono">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>{currentDateTime || "Syncing clock…"}</span>
            </div>

            {/* Online / Offline status toggle */}
            <button
              type="button"
              onClick={() => setIsOnline(!isOnline)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              title="Click to toggle network status simulation"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnline
                    ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"
                    : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
                }`}
              />
              <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
            </button>

            {/* Branch Selector Dropdown */}
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setIsBranchMenuOpen(!isBranchMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-zinc-400" />
                <span>{activeBranchName}</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {isBranchMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#12141f] border border-white/10 shadow-2xl p-1.5 z-50">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-mono text-zinc-400">
                    Switch Branch
                  </div>
                  {["Main Store", "Downtown Kiosk", "Westside Mall"].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        shopAuth?.switchBranch?.(b.toLowerCase().replace(/\s+/g, "_"), b);
                        setIsBranchMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between ${
                        activeBranchName === b
                          ? "bg-zinc-500/20 text-zinc-300 font-semibold"
                          : "text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      <span>{b}</span>
                      {activeBranchName === b && (
                        <CheckCircle2 className="w-3 h-3 text-zinc-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cashier Info */}
            <div className="flex items-center gap-2 pl-1.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-xs shadow-md shadow-zinc-700/40">
                {(user.displayName || "Raskan").slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left leading-none">
                <div className="text-xs font-bold text-zinc-200">
                  {user.displayName || user.username}
                </div>
                <div className="text-[10px] text-zinc-400 capitalize mt-0.5 font-mono">
                  {user.role}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── POS WORKSPACE: LEFT PRODUCTS + RIGHT BILLING PANEL ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── LEFT AREA: CATEGORIES + PRODUCTS GRID ── */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#07080d]/40 overflow-hidden">
            {/* Category Filter Pills (Dynamically loaded from active shop in Firebase) */}
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2.5 overflow-x-auto no-scrollbar shrink-0 bg-[#090a12]/50">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === "all" || !selectedCategory
                    ? "bg-zinc-700/40 border border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                    : "bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-zinc-400" />
                <span>All Products</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-zinc-300">
                  {products.length}
                </span>
              </button>

              {shopCategories.map((cat) => {
                const isActive = selectedCategory === cat.id;
                const count = products.filter((p) => p.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? "bg-zinc-700/40 border border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                        : "bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cat.color || "#6366f1" }}
                    />
                    <span>{cat.name}</span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-white/10 text-zinc-400">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Product Grid Area strictly from Firebase */}
            <div className="flex-1 p-5 overflow-y-auto">
              {isLoadingCatalog ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs py-20 gap-2">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p>Loading shop products from Firebase...</p>
                </div>
              ) : products.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs py-20 text-center max-w-sm mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-600 mb-3">
                    <LayoutGrid className="w-6 h-6 text-zinc-500" />
                  </div>
                  <p className="font-semibold text-zinc-300 text-sm">No Products in Shop Catalog</p>
                  <p className="text-zinc-500 mt-1 text-xs mb-4">
                    This shop currently has no products stored in Firebase. Add categories and products to start billing.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/shop/products")}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    Manage Products
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs py-20">
                  <Search className="w-8 h-8 mb-2 text-zinc-600" />
                  <p className="font-semibold text-zinc-400">No matching products found</p>
                  <p className="text-zinc-600 mt-1">Try a different search query or select "All Products".</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                  {filteredProducts.map((prod) => {
                    const isJustAdded = addedAnimationId === prod.id;
                    return (
                      <div
                        key={prod.id}
                        onClick={() => addToCart(prod)}
                        className={`group relative p-2 rounded-xl bg-[#11131d]/70 hover:bg-[#151724]/90 backdrop-blur-xl border border-white/[0.07] hover:border-zinc-500/40 transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between h-[116px] shadow-sm hover:shadow-xl hover:shadow-zinc-900/20 ${
                          isJustAdded ? "ring-2 ring-zinc-400 scale-[0.98]" : ""
                        }`}
                      >
                        {/* Top Badges */}
                        <div className="flex justify-between items-start w-full leading-none">
                          {prod.badge ? (
                            <span className="text-[7px] font-mono font-bold px-1 py-0.5 rounded bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">
                              {prod.badge}
                            </span>
                          ) : (
                            <span className="text-[7px] font-mono text-zinc-500">
                              #{prod.barcode.slice(-4)}
                            </span>
                          )}
                          <span className="text-[7px] font-mono text-zinc-500">
                            {prod.stock} stk
                          </span>
                        </div>

                        {/* Centered Firebase Product Image */}
                        <div className="flex-1 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-150 py-1">
                          <ProductImage imageUrl={prod.imageUrl} name={prod.name} className="w-12 h-12 rounded-xl shrink-0" />
                        </div>

                        {/* Product Title, Specs & Price */}
                        <div className="flex items-end justify-between leading-none mt-0.5">
                          <div className="min-w-0 pr-1">
                            <h3 className="text-[9px] font-bold text-zinc-100 truncate group-hover:text-zinc-300 transition-colors leading-tight">
                              {prod.name}
                            </h3>
                            <div className="text-[9.5px] font-black text-white mt-0.5 font-mono">
                              LKR {prod.price.toLocaleString()}
                            </div>
                          </div>

                          {/* Plus Add Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(prod);
                            }}
                            className="w-5 h-5 rounded-md bg-white/[0.06] group-hover:bg-zinc-600 text-zinc-300 group-hover:text-white border border-white/[0.1] group-hover:border-zinc-500 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-sm"
                            title="Add to bill"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT AREA: CURRENT BILLING PANEL ── */}
          <aside className="w-[360px] lg:w-[410px] bg-[#0c0d16]/90 backdrop-blur-2xl border-l border-white/[0.07] flex flex-col shrink-0">
            {/* Header: Cart title + Clear All */}
            <div className="p-4 border-b border-white/[0.07] flex items-center justify-between shrink-0 bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-zinc-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">Current Bill</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-500/15 border border-zinc-500/30 text-zinc-300 font-bold">
                  {cartTotalItemCount}
                </span>
              </div>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {/* Scrollable Bill Items List */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-2">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs text-center p-6 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-600 mb-1">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <div className="font-semibold text-zinc-300">Cart is empty</div>
                  <div className="text-zinc-500 max-w-xs text-[11px]">
                    Tap products from the grid or scan a barcode to begin billing.
                  </div>
                </div>
              ) : (
                cart.map((item) => {
                  const lineTotal = (item.customPrice ?? item.product.price) * item.quantity;
                  return (
                    <div
                      key={item.product.id}
                      className="p-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.06] transition-all flex items-center justify-between gap-3 group"
                    >
                      {/* Product Thumbnail with Firebase Image */}
                      <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                        <ProductImage imageUrl={item.product.imageUrl} name={item.product.name} className="w-full h-full rounded-lg" />
                      </div>

                      {/* Info & Quantity controls */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-zinc-200 truncate">
                          {item.product.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {item.product.specs}
                        </div>

                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="w-5 h-5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-zinc-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-mono font-bold text-white px-1">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="w-5 h-5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-zinc-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Line Total & Remove */}
                      <div className="text-right shrink-0 flex flex-col items-end justify-between h-full">
                        <button
                          type="button"
                          onClick={() => removeItem(item.product.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                          title="Remove item"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <div className="text-xs font-black text-white font-mono mt-1">
                          LKR {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Billing Financial Summary */}
            <div className="p-4 border-t border-white/[0.07] bg-[#0e0f19]/70 space-y-2.5 shrink-0">
              {/* Subtotal */}
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Subtotal</span>
                <span className="font-mono text-zinc-200">LKR {subtotal.toFixed(2)}</span>
              </div>

              {/* Discount Row with interactive popover / toggle */}
              <div className="relative">
                <div className="flex justify-between items-center text-xs">
                  <button
                    type="button"
                    onClick={() => setIsDiscountPopoverOpen(!isDiscountPopoverOpen)}
                    className="flex items-center gap-1.5 text-zinc-300 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    <Tag className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      Discount{" "}
                      {discountSetting.value > 0 &&
                        (discountSetting.type === "percentage"
                          ? `(${discountSetting.value}%)`
                          : `(LKR ${discountSetting.value})`)}
                    </span>
                    <span className="text-[10px] text-zinc-400 underline ml-0.5">
                      {discountSetting.value > 0 ? "Edit" : "+Add"}
                    </span>
                  </button>

                  <span className="font-mono text-emerald-400">
                    -{discountAmount > 0 ? `LKR ${discountAmount.toFixed(2)}` : "LKR 0.00"}
                  </span>
                </div>

                {/* Popover for Percentage or Fixed Discount */}
                {isDiscountPopoverOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 p-3.5 rounded-xl bg-[#141624] border border-white/10 shadow-2xl z-40 space-y-3 backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Apply Discount</span>
                      <button
                        onClick={() => setIsDiscountPopoverOpen(false)}
                        className="text-zinc-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Mode Toggle: Percentage vs Fixed */}
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-black/40 border border-white/10">
                      <button
                        type="button"
                        onClick={() =>
                          setDiscountSetting((prev) => ({ ...prev, type: "percentage" }))
                        }
                        className={`py-1 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                          discountSetting.type === "percentage"
                            ? "bg-zinc-600 text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <Percent className="w-3 h-3" />
                        <span>Percent (%)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDiscountSetting((prev) => ({ ...prev, type: "fixed" }))
                        }
                        className={`py-1 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                          discountSetting.type === "fixed"
                            ? "bg-zinc-600 text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <DollarSign className="w-3 h-3" />
                        <span>Fixed (LKR)</span>
                      </button>
                    </div>

                    {/* Presets */}
                    <div className="flex gap-1.5">
                      {discountSetting.type === "percentage"
                        ? [5, 10, 15, 20].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => {
                                setDiscountInputValue(pct.toString());
                                setDiscountSetting((prev) => ({ ...prev, value: pct }));
                              }}
                              className="flex-1 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 transition-colors"
                            >
                              {pct}%
                            </button>
                          ))
                        : [5, 10, 25, 50].map((fxd) => (
                            <button
                              key={fxd}
                              type="button"
                              onClick={() => {
                                setDiscountInputValue(fxd.toString());
                                setDiscountSetting((prev) => ({ ...prev, value: fxd }));
                              }}
                              className="flex-1 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 transition-colors"
                            >
                              LKR {fxd}
                            </button>
                          ))}
                    </div>

                    {/* Custom Input */}
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="any"
                        value={discountInputValue}
                        onChange={(e) => setDiscountInputValue(e.target.value)}
                        placeholder="Custom value..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={applyDiscount}
                        className="px-3 py-1.5 rounded-lg bg-zinc-600 hover:bg-zinc-500 text-xs font-bold text-white transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tax */}
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Tax (8%)</span>
                <span className="font-mono text-zinc-200">LKR {taxAmount.toFixed(2)}</span>
              </div>

              {/* Grand Total Row */}
              <div className="pt-2 border-t border-white/[0.07] flex justify-between items-baseline">
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  Total
                </span>
                <div className="text-2xl font-black text-white font-mono tracking-tight">
                  LKR {grandTotal.toFixed(2)}
                </div>
              </div>

              {/* Quick Payment Method Selector */}
              <div className="pt-1">
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: "cash", label: "Cash", icon: Banknote },
                    { id: "card", label: "Card", icon: CreditCard },
                    { id: "bank", label: "Bank Transfer", icon: Building2 },
                    { id: "mobile", label: "Mobile Payment", icon: Smartphone },
                  ].map((pm) => {
                    const Icon = pm.icon;
                    const isSelected = selectedQuickPayment === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setSelectedQuickPayment(pm.id as any)}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-zinc-700/40 border-zinc-500/60 text-white shadow-sm"
                            : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                        }`}
                        title={pm.label}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-medium leading-tight truncate max-w-[65px]">
                          {pm.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Big Pay Now / Proceed to Payment Button */}
              <div className="pt-1">
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setIsPaymentModalOpen(true)}
                  className={`w-full py-3.5 px-4 rounded-xl active:scale-[0.99] disabled:pointer-events-none text-white font-bold flex items-center justify-between transition-all cursor-pointer group ${
                    cart.length === 0
                      ? "bg-gradient-to-r from-zinc-700 via-zinc-600 to-zinc-600 shadow-lg shadow-zinc-900/20 opacity-35"
                      : "bg-gradient-to-r from-[#ea4815] via-[#f95721] to-[#ff6229] hover:from-[#f95721] hover:via-[#ff6229] hover:to-[#ff7340] shadow-lg shadow-orange-600/30 hover:shadow-orange-500/50"
                  }`}
                >
                  <span className="text-sm tracking-wide">Pay Now</span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-black">
                      LKR {grandTotal.toFixed(2)}
                    </span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── MODALS ── */}
      {/* 1. Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        onScanItem={addToCart}
        products={products}
      />

      {/* 2. Payment Checkout Modal (Cash / Card) */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onCompleteSale={handleCompleteSale}
        cart={cart}
        subtotal={subtotal}
        discountSetting={discountSetting}
        discountAmount={discountAmount}
        taxAmount={taxAmount}
        grandTotal={grandTotal}
      />

      {/* 3. Printable Receipt & Completion Modal */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        onNewSale={handleNewSale}
        persistedSale={persistedSale}
        cart={cart}
        subtotal={subtotal}
        discountSetting={discountSetting}
        discountAmount={discountAmount}
        taxAmount={taxAmount}
        grandTotal={grandTotal}
        paymentMethod={receiptData.method}
        cashTendered={receiptData.tendered}
        changeDue={receiptData.change}
        cashierName={user.displayName || user.username}
        shopName={shop.shopName}
        shopId={shop.shopId}
        branchName={activeBranchName}
      />

      {/* 4. Asynchronous Cloud Ledger Syncing Overlay */}
      {isSavingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="p-6 rounded-2xl bg-[#10121a] border border-white/10 shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-12 h-12 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin flex items-center justify-center" />
            <div>
              <h3 className="text-sm font-bold text-white">Finalizing Sale</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Persisting product snapshots & syncing cloud audit ledger...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
