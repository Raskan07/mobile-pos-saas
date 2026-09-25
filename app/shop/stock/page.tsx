"use client";

/**
 * app/shop/stock/page.tsx
 *
 * Dedicated Stock Management Terminal for Mobile POS SaaS.
 *
 * Core Features:
 * - Real-time product inventory strictly scoped by authenticated shopId.
 * - Track Stock In, Stock Out, Damaged Stock, and Minimum Stock alert thresholds.
 * - Status classification: Healthy, Low Stock, or Out of Stock.
 * - Comprehensive stock valuation calculations (Total Cost & Retail Valuation).
 * - High-speed search bar, status tabs, and category filters.
 * - Immutable real-time audit trail capturing timestamps, cashier UID, name, role, delta, reason, and notes.
 * - Integration with Sales Ledger, Product Catalog, and Barcode Printing modules.
 * - Strict POS Dark Theme using professional, neutral gray aesthetics.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Warehouse,
  Package,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  AlertOctagon,
  ScanLine,
  Filter,
  History,
  Barcode,
  Tag,
  Store,
  DollarSign,
  Layers,
  FileSpreadsheet,
  RefreshCw,
  X,
  Calendar,
  SlidersHorizontal,
  ChevronDown,
  ShoppingCart,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Building2,
  Info,
  Check,
  BarChart3,
  FileText,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { ProductItem, Category } from "@/lib/types/catalog";
import {
  StockTransaction,
  StockMovementType,
  StockStatus,
  CreateStockMovementInput,
  StockValuationSummary,
} from "@/lib/types/stock";
import { getProducts, getCategories } from "@/lib/services/catalogService";
import {
  recordStockMovement,
  updateProductMinStockLevel,
  subscribeToStockTransactions,
  calculateStockValuation,
  getProductStockStatus,
} from "@/lib/services/stockService";
import StockAnalysisDrawer from "./StockAnalysisDrawer";
import StockReportModal from "@/components/stock/StockReportModal";

export default function StockManagementPage() {
  const router = useRouter();
  const { shop, user, activeBranchName, isAuthenticated, isLoading: isAuthLoading } = useShopAuth();

  // Shop context fallbacks
  const activeShopId = shop?.shopId || "SHOP-7294";
  const activeUser = {
    userId: user?.uid || "usr-cashier-01",
    username: user?.username || "raskan",
    displayName: user?.displayName || user?.username || "Raskan",
    role: user?.role || "cashier",
  };

  // State: Products & Transactions
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Navigation / View state
  const [activeTab, setActiveTab] = useState<"inventory" | "audit">("inventory");
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | StockStatus>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [auditTypeFilter, setAuditTypeFilter] = useState<"ALL" | StockMovementType>("ALL");
  const [auditProductFilter, setAuditProductFilter] = useState<string>("");

  // Modal states
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementProduct, setMovementProduct] = useState<ProductItem | null>(null);
  const [movementType, setMovementType] = useState<StockMovementType>("STOCK_IN");
  const [movementQuantity, setMovementQuantity] = useState("1");
  const [movementReason, setMovementReason] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [movementUnitCost, setMovementUnitCost] = useState("");
  const [movementNotes, setMovementNotes] = useState("");

  const [thresholdModalOpen, setThresholdModalOpen] = useState(false);
  const [thresholdProduct, setThresholdProduct] = useState<ProductItem | null>(null);
  const [newThreshold, setNewThreshold] = useState("10");

  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState("");

  // Hardware barcode scanner buffer
  const barcodeBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  // Authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/shop");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  // Load products & categories strictly scoped to shopId
  const loadData = useCallback(async () => {
    if (!activeShopId) return;
    setIsLoading(true);
    try {
      const [fetchedProducts, fetchedCats] = await Promise.all([
        getProducts(activeShopId),
        getCategories(activeShopId),
      ]);
      setProducts(fetchedProducts);
      setCategories(fetchedCats);
    } catch (err) {
      console.error("[StockManagement] Error loading catalog:", err);
      setStatusMessage({ text: "Failed to load inventory products.", isError: true });
    } finally {
      setIsLoading(false);
    }
  }, [activeShopId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time listener for stock transactions audit trail
  useEffect(() => {
    if (!activeShopId) return;

    const unsubscribe = subscribeToStockTransactions(
      activeShopId,
      (txs) => {
        setTransactions(txs);
      },
      (err) => {
        console.error("[StockManagement] Transactions subscription error:", err);
      }
    );

    return () => unsubscribe();
  }, [activeShopId]);

  // Hardware barcode scanner listener (e.g. USB HID scanner)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in standard text inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 120) {
        barcodeBufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        const code = barcodeBufferRef.current.trim();
        if (code.length >= 3) {
          handleBarcodeScanned(code);
        }
        barcodeBufferRef.current = "";
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [products]);

  // Handle scanned barcode lookup
  const handleBarcodeScanned = (code: string) => {
    const cleanCode = code.trim().toLowerCase();
    const matched = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === cleanCode) ||
        (p.sku && p.sku.toLowerCase() === cleanCode)
    );

    if (matched) {
      openMovementModal(matched, "STOCK_IN");
      setStatusMessage({ text: `Barcode recognized: ${matched.name}` });
    } else {
      setStatusMessage({
        text: `No product matched barcode "${code}".`,
        isError: true,
      });
    }
  };

  // Live valuation summary
  const valuationSummary: StockValuationSummary = useMemo(() => {
    return calculateStockValuation(products, transactions);
  }, [products, transactions]);

  // Currency formatter
  const fmt = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Status filter
      if (statusFilter !== "ALL") {
        const st = getProductStockStatus(p);
        if (st !== statusFilter) return false;
      }

      // 2. Category filter
      if (selectedCategory !== "ALL" && p.categoryId !== selectedCategory) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q);
        const matchesBarcode = p.barcode?.toLowerCase().includes(q);
        const matchesBrand = p.brand?.toLowerCase().includes(q);
        const matchesCat = p.categoryName?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBarcode && !matchesBrand && !matchesCat) {
          return false;
        }
      }

      return true;
    });
  }, [products, statusFilter, selectedCategory, searchQuery]);

  // Filtered audit transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (auditTypeFilter !== "ALL" && tx.type !== auditTypeFilter) {
        return false;
      }
      if (auditProductFilter && tx.productId !== auditProductFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesProd = tx.productName.toLowerCase().includes(q);
        const matchesSku = tx.sku?.toLowerCase().includes(q);
        const matchesRef = tx.referenceNumber?.toLowerCase().includes(q);
        const matchesReason = tx.reason.toLowerCase().includes(q);
        const matchesUser = tx.performedBy?.displayName?.toLowerCase().includes(q);
        if (!matchesProd && !matchesSku && !matchesRef && !matchesReason && !matchesUser) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, auditTypeFilter, auditProductFilter, searchQuery]);

  // Modal triggers
  const openMovementModal = (product: ProductItem, type: StockMovementType) => {
    setMovementProduct(product);
    setMovementType(type);
    setMovementQuantity("1");
    setMovementReference("");
    setMovementNotes("");
    setMovementUnitCost(product.costPrice ? product.costPrice.toString() : "0");

    // Defaults for reasons
    if (type === "STOCK_IN") setMovementReason("Supplier Restock Delivery");
    else if (type === "STOCK_OUT") setMovementReason("Store Transfer / Internal Use");
    else if (type === "DAMAGED") setMovementReason("Damaged / Defective Stock");
    else setMovementReason("Inventory Reconcile Adjustment");

    setMovementModalOpen(true);
  };

  const openThresholdModal = (product: ProductItem) => {
    setThresholdProduct(product);
    setNewThreshold((product.minStockLevel ?? 10).toString());
    setThresholdModalOpen(true);
  };

  // Submit stock movement
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementProduct) return;

    const qty = parseFloat(movementQuantity);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid positive quantity.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const input: CreateStockMovementInput = {
        productId: movementProduct.id,
        productName: movementProduct.name,
        sku: movementProduct.sku,
        barcode: movementProduct.barcode,
        type: movementType,
        quantity: qty,
        reason: movementReason.trim() || "Manual Inventory Adjustment",
        referenceNumber: movementReference.trim(),
        unitCost: parseFloat(movementUnitCost) || movementProduct.costPrice || 0,
        notes: movementNotes.trim(),
      };

      const { newStock } = await recordStockMovement(
        activeShopId,
        {
          userId: activeUser.userId,
          username: activeUser.username,
          role: activeUser.role,
          displayName: activeUser.displayName,
        },
        input
      );

      // Update local product state immediately
      setProducts((prev) =>
        prev.map((p) => (p.id === movementProduct.id ? { ...p, stockQuantity: newStock } : p))
      );

      setMovementModalOpen(false);
      setStatusMessage({
        text: `Successfully recorded ${movementType.replace("_", " ")} for "${movementProduct.name}". New stock: ${newStock} units.`,
      });
    } catch (err: unknown) {
      console.error("[StockManagement] Error saving movement:", err);
      const errMsg = err instanceof Error ? err.message : "Failed to record stock movement.";
      alert(`Error: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit threshold change
  const handleSaveThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thresholdProduct) return;

    const minLevel = parseInt(newThreshold, 10);
    if (isNaN(minLevel) || minLevel < 0) {
      alert("Please enter a valid minimum stock level (0 or higher).");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateProductMinStockLevel(
        activeShopId,
        {
          userId: activeUser.userId,
          username: activeUser.username,
          role: activeUser.role,
          displayName: activeUser.displayName,
        },
        thresholdProduct.id,
        minLevel
      );

      setProducts((prev) =>
        prev.map((p) => (p.id === thresholdProduct.id ? { ...p, minStockLevel: minLevel } : p))
      );

      setThresholdModalOpen(false);
      setStatusMessage({
        text: `Alert threshold for "${thresholdProduct.name}" set to ${minLevel} units.`,
      });
    } catch (err: unknown) {
      console.error("[StockManagement] Error updating threshold:", err);
      const errMsg = err instanceof Error ? err.message : "Failed to update alert threshold.";
      alert(`Error: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // CSV Export for Stock Valuation & Audit
  const handleExportCSV = () => {
    if (activeTab === "inventory") {
      const headers = [
        "Product Name",
        "SKU",
        "Barcode",
        "Category",
        "Current Stock",
        "Min Level",
        "Status",
        "Cost Price (LKR)",
        "Selling Price (LKR)",
        "Cost Valuation (LKR)",
        "Retail Valuation (LKR)",
      ];

      const rows = products.map((p) => {
        const stock = p.stockQuantity || 0;
        const cost = p.costPrice || 0;
        const retail = p.sellingPrice || 0;
        return [
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.sku}"`,
          `"${p.barcode || ""}"`,
          `"${p.categoryName || ""}"`,
          stock,
          p.minStockLevel ?? 10,
          getProductStockStatus(p),
          cost.toFixed(2),
          retail.toFixed(2),
          (stock * cost).toFixed(2),
          (stock * retail).toFixed(2),
        ];
      });

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `inventory_valuation_${activeShopId}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = [
        "Date",
        "Transaction ID",
        "Type",
        "Product",
        "SKU",
        "Barcode",
        "Delta",
        "Previous Stock",
        "New Stock",
        "Reason",
        "Reference",
        "Performed By",
        "Role",
        "Value Change (LKR)",
      ];

      const rows = transactions.map((tx) => [
        `"${new Date(tx.createdAt).toLocaleString()}"`,
        `"${tx.id}"`,
        tx.type,
        `"${tx.productName.replace(/"/g, '""')}"`,
        `"${tx.sku}"`,
        `"${tx.barcode || ""}"`,
        tx.quantityDelta,
        tx.previousStock,
        tx.newStock,
        `"${tx.reason.replace(/"/g, '""')}"`,
        `"${tx.referenceNumber || ""}"`,
        `"${tx.performedBy?.displayName || tx.performedBy?.username || ""}"`,
        `"${tx.performedBy?.role || ""}"`,
        tx.totalValueChange.toFixed(2),
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `stock_audit_log_${activeShopId}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#07080d] text-zinc-400">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-500/30 border-t-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 font-sans select-none flex flex-col">
      {/* ── Background Subtle Ambiance (Pure Dark & Gray) ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 w-[600px] h-[450px] bg-zinc-700/5 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-10 w-[500px] h-[500px] bg-zinc-800/6 rounded-full blur-[150px]" />
      </div>

      {/* ── Minimal Top Header Navigation Bar ── */}
      <header className="relative z-10 h-16 px-4 md:px-8 bg-[#0c0d15]/90 backdrop-blur-xl border-b border-white/[0.07] flex items-center justify-between gap-4 shrink-0">
        <button
          type="button"
          onClick={() => router.push("/shop/dashboard")}
          className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
          title="Back to POS Terminal"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => router.push("/shop/stock/analysis")}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
          title="Open Dedicated Stock Analysis & Activity Ledger"
        >
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <span>Stock Analysis</span>
        </button>
      </header>

      {/* ── Status Banner Message ── */}
      {statusMessage && (
        <div
          className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
            statusMessage.isError
              ? "bg-rose-950/40 text-rose-300 border-rose-900/40"
              : "bg-zinc-900/80 text-zinc-200 border-zinc-800"
          }`}
        >
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
            <Info className="w-4 h-4 shrink-0 text-zinc-400" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-zinc-400 hover:text-zinc-200 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Main Container ── */}
      <main className="relative z-10 flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto flex flex-col gap-5 overflow-y-auto">

        {/* ── 2. Primary Tabs & Utility Bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          {/* Main View Tabs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("inventory");
                setAuditProductFilter("");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "inventory"
                  ? "bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Inventory & Stock Levels</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700/60 text-zinc-400 font-mono">
                {filteredProducts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "audit"
                  ? "bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit Trail Logs</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700/60 text-zinc-400 font-mono">
                {filteredTransactions.length}
              </span>
            </button>
          </div>

          {/* Action Tools: Quick Barcode Scan, CSV Export, Refresh */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Quick Barcode Scan Modal Button */}
            <button
              type="button"
              onClick={() => setBarcodeModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all cursor-pointer active:scale-95"
              title="Look up product by Barcode or SKU"
            >
              <ScanLine className="w-3.5 h-3.5 text-zinc-400" />
              <span>Scan Barcode</span>
            </button>

            {/* Export CSV Report */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all cursor-pointer active:scale-95"
              title="Download CSV Report"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Reusable Stock Report (PDF / XML) */}
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all cursor-pointer active:scale-95 shadow-xs"
              title="Generate and download Stock Reports (PDF / XML)"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              <span>Stock Report</span>
            </button>

            {/* Refresh Data */}
            <button
              type="button"
              onClick={() => loadData()}
              disabled={isLoading}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh Inventory"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── 3. Search & Filter Bar ── */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-[#0c0d15] border border-white/[0.08]">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product name, SKU, barcode, brand..."
              className="w-full h-10 pl-10 pr-9 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Controls for Inventory View */}
          {activeTab === "inventory" && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Chips */}
              <div className="flex items-center p-1 rounded-xl bg-zinc-900/90 border border-zinc-800">
                {(["ALL", "HEALTHY", "LOW_STOCK", "OUT_OF_STOCK"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                      statusFilter === st
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/80 shadow-xs"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {st === "ALL" && "All"}
                    {st === "HEALTHY" && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Healthy
                      </span>
                    )}
                    {st === "LOW_STOCK" && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Low Stock
                      </span>
                    )}
                    {st === "OUT_OF_STOCK" && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        Out
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Category Dropdown Filter */}
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-9 px-3 pr-8 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Controls for Audit Trail View */}
          {activeTab === "audit" && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Type Filter */}
              <div className="relative">
                <select
                  value={auditTypeFilter}
                  onChange={(e) => setAuditTypeFilter(e.target.value as "ALL" | StockMovementType)}
                  className="h-9 px-3 pr-8 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
                >
                  <option value="ALL">All Movement Types</option>
                  <option value="STOCK_IN">Stock In (+)</option>
                  <option value="STOCK_OUT">Stock Out (-)</option>
                  <option value="DAMAGED">Damaged Goods (-)</option>
                  <option value="SALE">POS Sales (-)</option>
                  <option value="ADJUSTMENT">Threshold / Recount</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>

              {/* Active Product Filter Tag */}
              {auditProductFilter && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-200">
                  <span className="text-zinc-400">Product:</span>
                  <span className="font-medium truncate max-w-[150px]">
                    {products.find((p) => p.id === auditProductFilter)?.name || auditProductFilter}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAuditProductFilter("")}
                    className="text-zinc-400 hover:text-zinc-200 ml-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 4. Main Content: Inventory Table / Audit Trail ── */}
        {activeTab === "inventory" ? (
          /* INVENTORY TABLE */
          <div className="rounded-2xl bg-[#0c0d15] border border-white/[0.08] overflow-hidden shadow-xl flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/80 border-b border-white/[0.06] text-zinc-400 uppercase text-[10px] tracking-wider font-semibold">
                    <th className="py-3 px-4">Product Details</th>
                    <th className="py-3 px-3">SKU / Barcode</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-center">In Stock</th>
                    <th className="py-3 px-3 text-center">Alert Level</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-right">Cost Price</th>
                    <th className="py-3 px-3 text-right">Cost Valuation</th>
                    <th className="py-3 px-4 text-center">Quick Stock Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-zinc-500">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No products found matching the current search or filters.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const stock = typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
                      const minLevel = typeof p.minStockLevel === "number" ? p.minStockLevel : 10;
                      const status = getProductStockStatus(p);
                      const cost = p.costPrice || 0;
                      const valuation = stock * cost;

                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-white/[0.02] transition-colors group"
                        >
                          {/* Product Details */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {p.images && p.images[0] ? (
                                <img
                                  src={p.images[0]}
                                  alt={p.name}
                                  className="w-10 h-10 rounded-xl object-cover border border-white/[0.08] bg-zinc-900 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/[0.06] flex items-center justify-center text-zinc-500 shrink-0">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-medium text-zinc-200 truncate max-w-[220px]" title={p.name}>
                                  {p.name}
                                </div>
                                <div className="text-[11px] text-zinc-500 truncate">
                                  {p.brand ? `${p.brand} • ` : ""}
                                  {p.unit || "pcs"}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* SKU & Barcode */}
                          <td className="py-3.5 px-3 font-mono text-[11px]">
                            <div className="text-zinc-300">{p.sku}</div>
                            {p.barcode && (
                              <div className="text-zinc-500 text-[10px] flex items-center gap-1 mt-0.5">
                                <Barcode className="w-3 h-3" />
                                {p.barcode}
                              </div>
                            )}
                          </td>

                          {/* Category */}
                          <td className="py-3.5 px-3">
                            <span className="text-zinc-400 text-[11px]">
                              {p.categoryName || "General"}
                            </span>
                          </td>

                          {/* Stock Quantity */}
                          <td className="py-3.5 px-3 text-center">
                            <span
                              className={`font-mono text-sm font-bold ${
                                stock <= 0
                                  ? "text-rose-400"
                                  : stock <= minLevel
                                  ? "text-amber-400"
                                  : "text-zinc-100"
                              }`}
                            >
                              {stock}
                            </span>
                          </td>

                          {/* Min Threshold */}
                          <td className="py-3.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => openThresholdModal(p)}
                              className="group/btn inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                              title="Click to change low stock threshold"
                            >
                              <span>{minLevel}</span>
                              <SlidersHorizontal className="w-2.5 h-2.5 opacity-40 group-hover/btn:opacity-100" />
                            </button>
                          </td>

                          {/* Status Badge (Neutral Gray POS Palette with Status Dot) */}
                          <td className="py-3.5 px-3 text-center">
                            {status === "HEALTHY" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 text-[11px] font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Healthy
                              </span>
                            )}
                            {status === "LOW_STOCK" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 text-[11px] font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Low Stock
                              </span>
                            )}
                            {status === "OUT_OF_STOCK" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 text-[11px] font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                Out of Stock
                              </span>
                            )}
                          </td>

                          {/* Cost Price */}
                          <td className="py-3.5 px-3 text-right font-mono text-zinc-400">
                            {cost.toFixed(2)}
                          </td>

                          {/* Cost Valuation */}
                          <td className="py-3.5 px-3 text-right font-mono font-semibold text-zinc-200">
                            {fmt(valuation)}
                          </td>

                          {/* Quick Actions */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Stock In */}
                              <button
                                type="button"
                                onClick={() => openMovementModal(p, "STOCK_IN")}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white transition-all cursor-pointer active:scale-95 text-[11px] font-medium"
                                title="Stock In / Restock"
                              >
                                <Plus className="w-3 h-3 text-zinc-400" />
                                <span>In</span>
                              </button>

                              {/* Stock Out */}
                              <button
                                type="button"
                                onClick={() => openMovementModal(p, "STOCK_OUT")}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white transition-all cursor-pointer active:scale-95 text-[11px] font-medium"
                                title="Stock Out / Transfer"
                              >
                                <Minus className="w-3 h-3 text-zinc-400" />
                                <span>Out</span>
                              </button>

                              {/* Damaged Stock */}
                              <button
                                type="button"
                                onClick={() => openMovementModal(p, "DAMAGED")}
                                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer active:scale-95"
                                title="Record Damaged Stock write-off"
                              >
                                <AlertOctagon className="w-3.5 h-3.5" />
                              </button>

                              {/* History / Audit for this product */}
                              <button
                                type="button"
                                onClick={() => {
                                  setAuditProductFilter(p.id);
                                  setActiveTab("audit");
                                }}
                                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer active:scale-95"
                                title="View Movement Audit Trail for this item"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>

                              {/* Barcode Center Jump */}
                              <button
                                type="button"
                                onClick={() => router.push(`/shop/barcode?productId=${p.id}`)}
                                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer active:scale-95"
                                title="Print Barcode Labels for this product"
                              >
                                <Barcode className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* AUDIT TRAIL LOGS VIEW */
          <div className="rounded-2xl bg-[#0c0d15] border border-white/[0.08] overflow-hidden shadow-xl flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/80 border-b border-white/[0.06] text-zinc-400 uppercase text-[10px] tracking-wider font-semibold">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-3">Movement Type</th>
                    <th className="py-3 px-3">Product Name & SKU</th>
                    <th className="py-3 px-3 text-center">Change (Delta)</th>
                    <th className="py-3 px-3 text-center">Stock Flow</th>
                    <th className="py-3 px-3">Reason & Reference</th>
                    <th className="py-3 px-3">Cashier / User</th>
                    <th className="py-3 px-4 text-right">Value Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-zinc-500">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No stock movement logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const isPositive = tx.quantityDelta > 0;
                      const isSale = tx.type === "SALE";
                      const isDamaged = tx.type === "DAMAGED";

                      return (
                        <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                          {/* Date & Time */}
                          <td className="py-3 px-4 text-zinc-400 font-mono text-[11px] whitespace-nowrap">
                            <div>{new Date(tx.createdAt).toLocaleDateString()}</div>
                            <div className="text-[10px] text-zinc-500">{new Date(tx.createdAt).toLocaleTimeString()}</div>
                          </td>

                          {/* Movement Type Badge */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-zinc-300">
                              {tx.type === "STOCK_IN" && (
                                <>
                                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                                  Stock In
                                </>
                              )}
                              {tx.type === "STOCK_OUT" && (
                                <>
                                  <TrendingDown className="w-3 h-3 text-zinc-400" />
                                  Stock Out
                                </>
                              )}
                              {tx.type === "DAMAGED" && (
                                <>
                                  <AlertOctagon className="w-3 h-3 text-rose-400" />
                                  Damaged
                                </>
                              )}
                              {tx.type === "SALE" && (
                                <>
                                  <ShoppingCart className="w-3 h-3 text-blue-400" />
                                  POS Sale
                                </>
                              )}
                              {tx.type === "ADJUSTMENT" && (
                                <>
                                  <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                                  Adjustment
                                </>
                              )}
                            </span>
                          </td>

                          {/* Product Name & SKU */}
                          <td className="py-3 px-3">
                            <div className="font-medium text-zinc-200 truncate max-w-[200px]" title={tx.productName}>
                              {tx.productName}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500">
                              {tx.sku}
                              {tx.barcode ? ` • ${tx.barcode}` : ""}
                            </div>
                          </td>

                          {/* Change Delta */}
                          <td className="py-3 px-3 text-center font-mono font-bold">
                            <span
                              className={
                                isPositive
                                  ? "text-emerald-400"
                                  : isDamaged
                                  ? "text-rose-400"
                                  : isSale
                                  ? "text-blue-400"
                                  : "text-zinc-300"
                              }
                            >
                              {isPositive ? `+${tx.quantityDelta}` : tx.quantityDelta}
                            </span>
                          </td>

                          {/* Stock Flow (Prev -> New) */}
                          <td className="py-3 px-3 text-center font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                            {tx.type === "SALE" ? (
                              <span className="text-zinc-500">-</span>
                            ) : (
                              <span>
                                {tx.previousStock}{" "}
                                <ArrowRight className="inline w-3 h-3 text-zinc-600 mx-0.5" />{" "}
                                <strong className="text-zinc-200">{tx.newStock}</strong>
                              </span>
                            )}
                          </td>

                          {/* Reason & Reference */}
                          <td className="py-3 px-3">
                            <div className="text-zinc-300 truncate max-w-[200px]" title={tx.reason}>
                              {tx.reason}
                            </div>
                            {tx.referenceNumber && (
                              <div className="text-[10px] font-mono text-zinc-500 truncate">
                                Ref: {tx.referenceNumber}
                              </div>
                            )}
                            {tx.notes && (
                              <div className="text-[10px] text-zinc-500 italic truncate max-w-[200px]">
                                {tx.notes}
                              </div>
                            )}
                          </td>

                          {/* Performed By User */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="text-zinc-200 font-medium text-[11px]">
                              {tx.performedBy?.displayName || tx.performedBy?.username || "Staff"}
                            </div>
                            <div className="text-[10px] text-zinc-500 uppercase font-mono">
                              {tx.performedBy?.role || "cashier"}
                            </div>
                          </td>

                          {/* Value Impact */}
                          <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                            <span className={isPositive ? "text-zinc-300" : "text-zinc-400"}>
                              {fmt(tx.totalValueChange)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL 1: Stock Movement (Stock In / Stock Out / Damaged) ── */}
      {movementModalOpen && movementProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/70 flex items-center justify-center text-zinc-300">
                  {movementType === "STOCK_IN" && <Plus className="w-4 h-4" />}
                  {movementType === "STOCK_OUT" && <Minus className="w-4 h-4" />}
                  {movementType === "DAMAGED" && <AlertOctagon className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {movementType === "STOCK_IN" && "Stock In (Restock)"}
                    {movementType === "STOCK_OUT" && "Stock Out (Transfer / Deduct)"}
                    {movementType === "DAMAGED" && "Record Damaged Goods"}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Product: <span className="text-zinc-200 font-medium">{movementProduct.name}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveMovement} className="p-5 flex flex-col gap-4 text-xs">
              {/* Product Quick Info Card */}
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-zinc-400 block text-[11px]">Current On-Hand Stock</span>
                  <span className="text-base font-bold font-mono text-zinc-100">
                    {movementProduct.stockQuantity || 0} {movementProduct.unit || "units"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-zinc-400 block text-[11px]">Cost Price</span>
                  <span className="text-sm font-mono text-zinc-300">
                    {fmt(movementProduct.costPrice || 0)}
                  </span>
                </div>
              </div>

              {/* Movement Type Selector */}
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1.5 font-medium">Movement Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMovementType("STOCK_IN");
                      setMovementReason("Supplier Restock Delivery");
                    }}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer font-medium ${
                      movementType === "STOCK_IN"
                        ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                        : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800/50"
                    }`}
                  >
                    + Stock In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementType("STOCK_OUT");
                      setMovementReason("Store Transfer / Internal Use");
                    }}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer font-medium ${
                      movementType === "STOCK_OUT"
                        ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                        : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800/50"
                    }`}
                  >
                    - Stock Out
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementType("DAMAGED");
                      setMovementReason("Damaged / Defective Stock");
                    }}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer font-medium ${
                      movementType === "DAMAGED"
                        ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                        : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800/50"
                    }`}
                  >
                    Damaged
                  </button>
                </div>
              </div>

              {/* Quantity Input */}
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                  Quantity ({movementProduct.unit || "units"})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={movementQuantity}
                    onChange={(e) => setMovementQuantity(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    placeholder="Enter quantity"
                  />
                </div>
              </div>

              {/* Reason Dropdown & Custom Field */}
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Reason for Movement</label>
                <div className="relative mb-2">
                  <select
                    value={movementReason}
                    onChange={(e) => setMovementReason(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
                  >
                    {movementType === "STOCK_IN" && (
                      <>
                        <option value="Supplier Restock Delivery">Supplier Restock Delivery</option>
                        <option value="Purchase Order Received">Purchase Order Received</option>
                        <option value="Customer Return Restock">Customer Return Restock</option>
                        <option value="Physical Count Surplus Reconcile">Physical Count Surplus Reconcile</option>
                        <option value="Branch Inventory Transfer In">Branch Inventory Transfer In</option>
                      </>
                    )}
                    {movementType === "STOCK_OUT" && (
                      <>
                        <option value="Store Transfer / Internal Use">Store Transfer / Internal Use</option>
                        <option value="Stock Sent to Other Branch">Stock Sent to Other Branch</option>
                        <option value="Supplier Return (RMA)">Supplier Return (RMA)</option>
                        <option value="Physical Count Deficit Reconcile">Physical Count Deficit Reconcile</option>
                        <option value="Sample / Marketing Demo">Sample / Marketing Demo</option>
                      </>
                    )}
                    {movementType === "DAMAGED" && (
                      <>
                        <option value="Damaged / Defective Stock">Damaged / Defective Stock</option>
                        <option value="Broken in Transit / Shipping">Broken in Transit / Shipping</option>
                        <option value="Water / Moisture Damage">Water / Moisture Damage</option>
                        <option value="Customer Handling Breakage">Customer Handling Breakage</option>
                        <option value="Expired / Perished Goods">Expired / Perished Goods</option>
                      </>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                </div>
                <input
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Or write custom reason..."
                  className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                />
              </div>

              {/* Reference Number & Unit Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Reference # (PO/Inv)</label>
                  <input
                    type="text"
                    value={movementReference}
                    onChange={(e) => setMovementReference(e.target.value)}
                    placeholder="e.g. PO-8921, INV-01"
                    className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Unit Cost (LKR)</label>
                  <input
                    type="number"
                    step="any"
                    value={movementUnitCost}
                    onChange={(e) => setMovementUnitCost(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Internal Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={movementNotes}
                  onChange={(e) => setMovementNotes(e.target.value)}
                  placeholder="Additional audit notes or incident description..."
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none"
                />
              </div>

              {/* Projected Stock Preview */}
              {(() => {
                const q = parseFloat(movementQuantity) || 0;
                const prev = movementProduct.stockQuantity || 0;
                const next = movementType === "STOCK_IN" ? prev + q : Math.max(0, prev - q);
                return (
                  <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Stock After Movement:</span>
                    <span className="font-mono font-bold text-zinc-100">
                      {prev} units → <span className="text-zinc-200 underline">{next} units</span>
                    </span>
                  </div>
                );
              })()}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setMovementModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white transition-all cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 font-medium transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm Movement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Minimum Stock Alert Threshold Modal ── */}
      {thresholdModalOpen && thresholdProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Set Minimum Stock Alert</h3>
              </div>
              <button
                type="button"
                onClick={() => setThresholdModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveThreshold} className="p-5 flex flex-col gap-4 text-xs">
              <div>
                <span className="text-zinc-400 block text-[11px] mb-1">Product</span>
                <span className="text-sm font-medium text-zinc-200 block truncate">
                  {thresholdProduct.name}
                </span>
                <span className="text-[11px] font-mono text-zinc-500">
                  Current Stock: {thresholdProduct.stockQuantity || 0}
                </span>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                  Reorder Point / Low Stock Threshold
                </label>
                <input
                  type="number"
                  min="0"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  required
                  className="w-full h-10 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                  placeholder="e.g. 10"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  When stock falls to or below this amount, the status will automatically flag as "Low Stock".
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setThresholdModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium border border-zinc-600 cursor-pointer"
                >
                  Save Alert Level
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Quick Barcode Scan Modal ── */}
      {barcodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Barcode Lookup</h3>
              </div>
              <button
                type="button"
                onClick={() => setBarcodeModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 text-xs">
              <p className="text-[11px] text-zinc-400">
                Type or scan a barcode to immediately find the item and initiate stock movement.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (scannedBarcode.trim()) {
                    handleBarcodeScanned(scannedBarcode.trim());
                    setBarcodeModalOpen(false);
                    setScannedBarcode("");
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  autoFocus
                  value={scannedBarcode}
                  onChange={(e) => setScannedBarcode(e.target.value)}
                  placeholder="Scan or enter barcode / SKU..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-600 cursor-pointer font-medium"
                >
                  Find
                </button>
              </form>

              <div className="text-[10px] text-zinc-500">
                Tip: Hardware USB barcode scanners can be used anywhere on this screen without opening this popup.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Analysis & Valuation Drawer ── */}
      <StockAnalysisDrawer
        isOpen={isAnalysisOpen}
        onClose={() => setIsAnalysisOpen(false)}
        products={products}
        categories={categories}
        transactions={transactions}
        shopId={activeShopId}
      />

      {/* ── Reusable Stock Report Modal (PDF & XML Exporters) ── */}
      <StockReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        shopId={activeShopId}
        shopName={shop?.shopName || "POS Hub"}
        branchName={activeBranchName}
        user={activeUser}
        userRole={user?.role}
        userPermissions={user?.permissions}
        products={products}
        transactions={transactions}
        categories={categories}
      />
    </div>
  );
}
