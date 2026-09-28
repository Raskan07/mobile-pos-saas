"use client";

/**
 * app/shop/purchases/page.tsx
 *
 * Dedicated Production-Ready Purchase History Module.
 * Features:
 * - Scoped strictly to active shopId (multi-tenant boundary)
 * - Decoupled status visualization (Purchase Status, Stock Status, Payment Status)
 * - Real-world lifecycles: partial payments, installments, post-dated cheques (clear/bounce), and returns
 * - Gray secondary color scheme with targeted visual accents
 * - Comprehensive filter toolbar and summary KPI metrics
 * - CSV audit export
 */

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Calendar,
  CreditCard,
  Banknote,
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Package,
  Layers,
  FileText,
  ChevronDown,
  ChevronRight,
  AlertOctagon,
  Eye,
  Sliders,
  X,
  CalendarDays,
  Trash2,
  Tag,
  Check,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  subscribeToPurchases,
  filterPurchases,
  calculatePurchaseSummaryMetrics,
  deletePurchase,
  canUserManagePurchases,
} from "@/lib/services/purchaseService";
import {
  PurchaseRecord,
  PurchaseStatus,
  PurchaseStockStatus,
  PurchasePaymentStatus,
  PurchaseFilterOptions,
} from "@/lib/types/purchase";
import NewPurchaseModal from "./NewPurchaseModal";
import PurchaseDetailDrawer from "./PurchaseDetailDrawer";

type DatePreset =
  | "all"
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_2_months"
  | "last_3_months"
  | "custom";

export default function PurchaseHistoryPage() {
  const router = useRouter();
  const { shop, user, isAuthenticated, isLoading: authLoading } = useShopAuth();

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected purchase for drawer
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRecord | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // Delete state
  const [purchaseToDelete, setPurchaseToDelete] = useState<PurchaseRecord | null>(null);
  const [revertStockOnDelete, setRevertStockOnDelete] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("last_2_months");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Multi-Attribute Color Filter Sets (Multi-select enabled)
  const [selectedPaymentFilters, setSelectedPaymentFilters] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedStockFilters, setSelectedStockFilters] = useState<string[]>([]);
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState<string[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);

  // Filter Modal State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Per-section search queries inside filter modal
  const [filterSearchPayment, setFilterSearchPayment] = useState("");
  const [filterSearchSupplier, setFilterSearchSupplier] = useState("");
  const [filterSearchStock, setFilterSearchStock] = useState("");
  const [filterSearchMethod, setFilterSearchMethod] = useState("");
  const [filterSearchOrder, setFilterSearchOrder] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/shop");
    }
  }, [authLoading, isAuthenticated, router]);

  // Real-time Firestore subscription
  useEffect(() => {
    if (!shop?.shopId) return;
    setLoading(true);

    const unsub = subscribeToPurchases(
      shop.shopId,
      (records) => {
        setPurchases(records);
        setLoading(false);

        // Update selected purchase if currently open in drawer
        setSelectedPurchase((prev) => {
          if (!prev) return null;
          return records.find((r) => r.id === prev.id) || prev;
        });
      },
      (err) => {
        console.error("[PurchaseHistory] Subscription error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [shop?.shopId]);

  // Compute Date Boundaries
  const dateBounds = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    switch (datePreset) {
      case "all":
        return { start: undefined, end: undefined, label: "All Time" };
      case "today": {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
        return { start, end: endOfToday, label: "Today" };
      }
      case "last_7_days": {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
        return { start, end: endOfToday, label: "Last 7 Days" };
      }
      case "last_30_days": {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0).getTime();
        return { start, end: endOfToday, label: "Last 30 Days" };
      }
      case "this_month": {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
        return { start, end: endOfToday, label: "This Month" };
      }
      case "last_2_months": {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
        return { start, end: endOfToday, label: "Last 2 Months" };
      }
      case "last_3_months": {
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0).getTime();
        return { start, end: endOfToday, label: "Last 3 Months" };
      }
      case "custom": {
        const start = customStart ? new Date(`${customStart}T00:00:00`).getTime() : undefined;
        const end = customEnd ? new Date(`${customEnd}T23:59:59`).getTime() : undefined;
        return { start, end, label: "Custom Range" };
      }
    }
  }, [datePreset, customStart, customEnd]);

  // Dynamically extract unique suppliers from existing purchases
  const availableSuppliers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    purchases.forEach((p) => {
      const name = p.supplierName?.trim() || "Unknown Supplier";
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(name, { id: p.supplierId, name, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [purchases]);

  // Color-coded Attribute Definitions
  const PAYMENT_ATTRIBUTES = [
    {
      id: "NEED_TO_PAY",
      label: "Need to Pay / Due",
      colorName: "Amber",
      activeCls: "bg-amber-500/20 text-amber-300 border-amber-500/80 shadow-amber-500/20 shadow-sm ring-1 ring-amber-500/40",
      dotCls: "bg-amber-400",
    },
    {
      id: "PAID",
      label: "Fully Paid / Settled",
      colorName: "Emerald",
      activeCls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/80 shadow-emerald-500/20 shadow-sm ring-1 ring-emerald-500/40",
      dotCls: "bg-emerald-400",
    },
    {
      id: "PARTIALLY_PAID",
      label: "Partially Paid",
      colorName: "Yellow",
      activeCls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/80 shadow-yellow-500/20 shadow-sm ring-1 ring-yellow-500/40",
      dotCls: "bg-yellow-400",
    },
    {
      id: "UNPAID",
      label: "Unpaid (Credit)",
      colorName: "Rose",
      activeCls: "bg-rose-500/20 text-rose-300 border-rose-500/80 shadow-rose-500/20 shadow-sm ring-1 ring-rose-500/40",
      dotCls: "bg-rose-400",
    },
    {
      id: "CHEQUE_PENDING",
      label: "Cheque Pending",
      colorName: "Purple",
      activeCls: "bg-purple-500/20 text-purple-300 border-purple-500/80 shadow-purple-500/20 shadow-sm ring-1 ring-purple-500/40",
      dotCls: "bg-purple-400",
    },
    {
      id: "HAS_INSTALLMENTS",
      label: "With Installments",
      colorName: "Fuchsia",
      activeCls: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/80 shadow-fuchsia-500/20 shadow-sm ring-1 ring-fuchsia-500/40",
      dotCls: "bg-fuchsia-400",
    },
    {
      id: "OVERDUE_INSTALLMENTS",
      label: "Overdue Installments",
      colorName: "Orange",
      activeCls: "bg-orange-500/20 text-orange-300 border-orange-500/80 shadow-orange-500/20 shadow-sm ring-1 ring-orange-500/40",
      dotCls: "bg-orange-400",
    },
  ];

  const STOCK_ATTRIBUTES = [
    {
      id: "STOCKED",
      label: "In Catalog Stock",
      colorName: "Cyan",
      activeCls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/80 shadow-cyan-500/20 shadow-sm ring-1 ring-cyan-500/40",
      dotCls: "bg-cyan-400",
    },
    {
      id: "PENDING",
      label: "Pending Delivery",
      colorName: "Slate",
      activeCls: "bg-zinc-800 text-zinc-100 border-zinc-500 shadow-zinc-500/20 shadow-sm ring-1 ring-zinc-500",
      dotCls: "bg-zinc-400",
    },
    {
      id: "PARTIALLY_STOCKED",
      label: "Partially Received",
      colorName: "Sky",
      activeCls: "bg-sky-500/20 text-sky-300 border-sky-500/80 shadow-sky-500/20 shadow-sm ring-1 ring-sky-500/40",
      dotCls: "bg-sky-400",
    },
    {
      id: "HAS_RETURNS",
      label: "Has Returns Logged",
      colorName: "Red",
      activeCls: "bg-red-500/20 text-red-300 border-red-500/80 shadow-red-500/20 shadow-sm ring-1 ring-red-500/40",
      dotCls: "bg-red-400",
    },
  ];

  const ORDER_ATTRIBUTES = [
    { id: "ORDERED", label: "Ordered" },
    { id: "PARTIALLY_RECEIVED", label: "Partially Received" },
    { id: "RECEIVED", label: "Received" },
    { id: "CANCELLED", label: "Cancelled" },
  ];

  const PAYMENT_METHODS = [
    { id: "CASH", label: "Cash" },
    { id: "CHEQUE", label: "Cheque" },
    { id: "BANK_TRANSFER", label: "Bank Transfer" },
    { id: "CARD", label: "Card" },
  ];

  const toggleItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  // Multi-Attribute Filter Logic (Simultaneous filtering across all categories)
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          p.purchaseOrderNumber.toLowerCase().includes(q) ||
          (p.supplierInvoiceNumber && p.supplierInvoiceNumber.toLowerCase().includes(q)) ||
          p.supplierName.toLowerCase().includes(q) ||
          (p.supplierPhone && p.supplierPhone.includes(q)) ||
          p.items.some(
            (i) =>
              i.name.toLowerCase().includes(q) ||
              i.sku.toLowerCase().includes(q) ||
              (i.barcode && i.barcode.includes(q))
          ) ||
          (p.createdBy?.displayName && p.createdBy.displayName.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q));
        if (!match) return false;
      }

      // 2. Date Bounds
      if (dateBounds.start && p.orderedAt < dateBounds.start) return false;
      if (dateBounds.end && p.orderedAt > dateBounds.end) return false;

      // 3. Payment Attributes (OR within Payment category)
      if (selectedPaymentFilters.length > 0) {
        const matchPayment = selectedPaymentFilters.some((f) => {
          if (f === "NEED_TO_PAY") return p.balanceDue > 0;
          if (f === "PAID") return p.paymentStatus === "PAID";
          if (f === "PARTIALLY_PAID") return p.paymentStatus === "PARTIALLY_PAID";
          if (f === "UNPAID") return p.paymentStatus === "UNPAID";
          if (f === "CHEQUE_PENDING") return p.payments.some((pay) => pay.cheque?.chequeStatus === "PENDING");
          if (f === "HAS_INSTALLMENTS") return p.hasInstallments;
          if (f === "OVERDUE_INSTALLMENTS") {
            const now = Date.now();
            return p.installments.some((i) => i.status === "OVERDUE" || (i.status === "PENDING" && i.dueDate < now));
          }
          return false;
        });
        if (!matchPayment) return false;
      }

      // 4. Supplier Attributes (OR within Supplier category)
      if (selectedSuppliers.length > 0) {
        const matchSupplier = selectedSuppliers.includes(p.supplierName) || selectedSuppliers.includes(p.supplierId);
        if (!matchSupplier) return false;
      }

      // 5. Stock / Fulfillment Attributes (OR within Stock category)
      if (selectedStockFilters.length > 0) {
        const matchStock = selectedStockFilters.some((s) => {
          if (s === "STOCKED") return p.stockStatus === "STOCKED";
          if (s === "PENDING") return p.stockStatus === "PENDING";
          if (s === "PARTIALLY_STOCKED") return p.stockStatus === "PARTIALLY_STOCKED";
          if (s === "HAS_RETURNS") return p.hasReturns && p.returns && p.returns.length > 0;
          return false;
        });
        if (!matchStock) return false;
      }

      // 6. Order Statuses
      if (selectedOrderStatuses.length > 0) {
        if (!selectedOrderStatuses.includes(p.purchaseStatus)) return false;
      }

      // 7. Payment Methods Used
      if (selectedPaymentMethods.length > 0) {
        const matchMethod = p.payments.some((pay) => selectedPaymentMethods.includes(pay.paymentMethod));
        if (!matchMethod) return false;
      }

      return true;
    });
  }, [
    purchases,
    searchQuery,
    dateBounds,
    selectedPaymentFilters,
    selectedSuppliers,
    selectedStockFilters,
    selectedOrderStatuses,
    selectedPaymentMethods,
  ]);

  // Overall KPI Summary
  const summary = useMemo(() => {
    return calculatePurchaseSummaryMetrics(filteredPurchases);
  }, [filteredPurchases]);

  // Active filter counts
  const totalActiveAttributeCount =
    selectedPaymentFilters.length +
    selectedSuppliers.length +
    selectedStockFilters.length +
    selectedOrderStatuses.length +
    selectedPaymentMethods.length;

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    datePreset !== "last_2_months" ||
    totalActiveAttributeCount > 0;

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery("");
    setDatePreset("last_2_months");
    setSelectedPaymentFilters([]);
    setSelectedSuppliers([]);
    setSelectedStockFilters([]);
    setSelectedOrderStatuses([]);
    setSelectedPaymentMethods([]);
  };

  // Active Badges for the Active Filter Strip
  const activePills = useMemo(() => {
    const pills: { key: string; label: string; dotCls: string; activeCls: string; onRemove: () => void }[] = [];

    // Payments
    selectedPaymentFilters.forEach((id) => {
      const attr = PAYMENT_ATTRIBUTES.find((a) => a.id === id);
      if (attr) {
        pills.push({
          key: `pay_${id}`,
          label: attr.label,
          dotCls: attr.dotCls,
          activeCls: attr.activeCls,
          onRemove: () => toggleItem(selectedPaymentFilters, setSelectedPaymentFilters, id),
        });
      }
    });

    // Suppliers
    selectedSuppliers.forEach((name) => {
      pills.push({
        key: `supp_${name}`,
        label: `Supplier: ${name}`,
        dotCls: "bg-indigo-400",
        activeCls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/80 shadow-indigo-500/20 shadow-sm ring-1 ring-indigo-500/40",
        onRemove: () => toggleItem(selectedSuppliers, setSelectedSuppliers, name),
      });
    });

    // Stock
    selectedStockFilters.forEach((id) => {
      const attr = STOCK_ATTRIBUTES.find((a) => a.id === id);
      if (attr) {
        pills.push({
          key: `stock_${id}`,
          label: attr.label,
          dotCls: attr.dotCls,
          activeCls: attr.activeCls,
          onRemove: () => toggleItem(selectedStockFilters, setSelectedStockFilters, id),
        });
      }
    });

    // Order statuses
    selectedOrderStatuses.forEach((status) => {
      pills.push({
        key: `order_${status}`,
        label: `Order: ${status}`,
        dotCls: "bg-zinc-400",
        activeCls: "bg-zinc-800 text-zinc-200 border-zinc-600 shadow-sm ring-1 ring-zinc-500",
        onRemove: () => toggleItem(selectedOrderStatuses, setSelectedOrderStatuses, status),
      });
    });

    // Payment Methods
    selectedPaymentMethods.forEach((method) => {
      pills.push({
        key: `method_${method}`,
        label: `Method: ${method}`,
        dotCls: "bg-blue-400",
        activeCls: "bg-blue-500/20 text-blue-300 border-blue-500/80 shadow-blue-500/20 shadow-sm ring-1 ring-blue-500/40",
        onRemove: () => toggleItem(selectedPaymentMethods, setSelectedPaymentMethods, method),
      });
    });

    return pills;
  }, [
    selectedPaymentFilters,
    selectedSuppliers,
    selectedStockFilters,
    selectedOrderStatuses,
    selectedPaymentMethods,
  ]);

  // CSV Export
  const handleExportCsv = () => {
    const shopDisplayName = shop?.shopName || "POS Store";
    const lines: string[] = [
      `"SUPPLIER PURCHASE AUDIT LEDGER - ${shopDisplayName}"`,
      `"Date Range","${dateBounds.label}"`,
      `"Generated At","${new Date().toLocaleString()}"`,
      "",
      `"SUMMARY METRICS"`,
      `"Total Purchases",${summary.totalPurchasesCount}`,
      `"Total Spend (Payables)",${summary.totalSpend.toFixed(2)}`,
      `"Total Paid",${summary.totalPaid.toFixed(2)}`,
      `"Balance Due",${summary.totalBalanceDue.toFixed(2)}`,
      `"Pending Cheques Amount",${summary.pendingChequesAmount.toFixed(2)}`,
      `"Overdue Installments Amount",${summary.overdueInstallmentsAmount.toFixed(2)}`,
      `"Total Returns Amount",${summary.totalReturnsAmount.toFixed(2)}`,
      "",
      `"PURCHASE ORDER AUDIT RECORDS"`,
      `"PO Number","Supplier Bill #","Date","Supplier Name","Phone","Purchase Status","Stock Status","Payment Status","Total Amount","Amount Paid","Balance Due","Ordered Units","Received Units","Returned Units","Cheque Pending","Has Installments","Has Returns"`,
    ];

    filteredPurchases.forEach((p) => {
      const d = new Date(p.orderedAt);
      const hasPendingCheque = p.payments.some(
        (pay) => pay.cheque && pay.cheque.chequeStatus === "PENDING"
      );
      lines.push(
        `"${p.purchaseOrderNumber}","${p.supplierInvoiceNumber || ""}","${d.toISOString().slice(0, 10)}","${(p.supplierName || "").replace(/"/g, '""')}","${p.supplierPhone || ""}","${p.purchaseStatus}","${p.stockStatus}","${p.paymentStatus}",${p.totalAmount.toFixed(2)},${p.amountPaid.toFixed(2)},${p.balanceDue.toFixed(2)},${p.totalOrderedQuantity},${p.totalReceivedQuantity},${p.totalReturnedQuantity},"${hasPendingCheque ? "YES" : "NO"}","${p.hasInstallments ? "YES" : "NO"}","${p.hasReturns ? "YES" : "NO"}"`
      );
    });

    const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `purchases_${shop?.shopId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canManage = canUserManagePurchases(user?.role, user?.permissions);

  const handleConfirmDelete = async () => {
    if (!shop?.shopId || !user || !purchaseToDelete) return;
    setIsDeleting(true);

    try {
      await deletePurchase(
        shop.shopId,
        purchaseToDelete.id,
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        },
        revertStockOnDelete
      );

      if (selectedPurchase?.id === purchaseToDelete.id) {
        setSelectedPurchase(null);
      }
      setPurchaseToDelete(null);
    } catch (err) {
      console.error("[PurchaseHistory] Delete error:", err);
      alert(err instanceof Error ? err.message : "Failed to delete purchase order.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans selection:bg-zinc-800">
      {/* ── Top Header (Clean, sleek gray secondary styling) ── */}
      <header className="sticky top-0 z-40 bg-[#090a0f]/95 backdrop-blur border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => router.push("/shop/dashboard")}
            className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
            <span className="text-zinc-500">{shop?.shopName || "POS"}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-semibold flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-zinc-400" />
              Purchase History
            </span>
          </div>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
            title="Export Purchases to CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {canManage && (
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold shadow-lg transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Purchase</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main Page Content ── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5 max-w-7xl w-full mx-auto">
        {/* Minimalist Summary Strip (Replaces bulky metric cards) */}
        <div className="flex items-center justify-between flex-wrap gap-2 px-1 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-400">
              <strong className="text-zinc-100 font-semibold">{filteredPurchases.length}</strong> {filteredPurchases.length === 1 ? "order" : "orders"}
            </span>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-400">
              Spend: <span className="text-zinc-200 font-medium">LKR {summary.totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </span>
            {summary.totalBalanceDue > 0 && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="text-amber-400">
                  Due: <span className="font-semibold">LKR {summary.totalBalanceDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {summary.pendingChequesCount > 0 && (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                {summary.pendingChequesCount} Cheque{summary.pendingChequesCount !== 1 ? "s" : ""} Pending
              </span>
            )}
            {summary.totalReturnsCount > 0 && (
              <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                {summary.totalReturnsCount} Return{summary.totalReturnsCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 2. ADVANCED ATTRIBUTE COLOR-HIGHLIGHT FILTER SYSTEM     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
          {/* Top Search & Filter Trigger Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search PO #, supplier, invoice #, SKU, staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "today", label: "Today" },
                { id: "last_7_days", label: "7D" },
                { id: "last_30_days", label: "30D" },
                { id: "last_2_months", label: "2M" },
                { id: "last_3_months", label: "3M" },
                { id: "all", label: "All" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDatePreset(p.id as DatePreset)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${datePreset === p.id
                    ? "bg-zinc-800 text-white font-semibold border border-zinc-700"
                    : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800/80"
                    }`}
                >
                  {p.label}
                </button>
              ))}

              {/* The "Filter" Trigger Button → opens modal */}
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all cursor-pointer ${isFilterModalOpen || totalActiveAttributeCount > 0
                  ? "bg-zinc-800 text-white border-zinc-600 shadow-md ring-1 ring-zinc-700"
                  : "bg-zinc-950 text-zinc-300 hover:text-white border-zinc-800 hover:border-zinc-700"
                  }`}
              >
                <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-semibold">Filter</span>

                {totalActiveAttributeCount > 0 && (
                  <span className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 rounded-full text-[10px]">
                    <span className="font-bold text-zinc-100">{totalActiveAttributeCount}</span>
                    <span className="flex items-center gap-0.5 ml-0.5">
                      {selectedPaymentFilters.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Payment filter active" />
                      )}
                      {selectedSuppliers.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" title="Supplier filter active" />
                      )}
                      {selectedStockFilters.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" title="Stock filter active" />
                      )}
                      {selectedPaymentMethods.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Method filter active" />
                      )}
                    </span>
                  </span>
                )}

                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-zinc-400 hover:text-rose-400 font-mono cursor-pointer ml-1 transition-colors"
                  title="Clear all filters"
                >
                  Reset
                </button>
              )}
            </div>
          </div>


          {/* ── Filter Modal rendered via portal in JSX tree below ── */}

          {/* ── Active Filters Color Badges Strip (Visible whenever filters are active) ── */}
          {activePills.length > 0 && (
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-zinc-500 font-sans uppercase tracking-wider font-semibold mr-1">
                  Active ({activePills.length}):
                </span>
                {activePills.map((pill) => (
                  <span
                    key={pill.key}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-mono transition-all ${pill.activeCls}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${pill.dotCls}`} />
                    <span>{pill.label}</span>
                    <button
                      type="button"
                      onClick={pill.onRemove}
                      className="hover:opacity-75 transition-opacity ml-0.5 cursor-pointer"
                      title="Remove filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] text-zinc-400 hover:text-rose-400 underline font-mono cursor-pointer transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 3. PURCHASES LEDGER TABLE / CARDS                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section className="space-y-2">
          {loading ? (
            <div className="py-16 text-center text-zinc-500 font-mono text-xs">
              Loading purchase records...
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl space-y-2">
              <Package className="w-8 h-8 text-zinc-600 mx-auto" />
              {canManage && (
                <button
                  onClick={() => setIsNewModalOpen(true)}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono"
                >
                  Create First Purchase
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredPurchases.map((purchase) => {
                const dateStr = new Date(purchase.orderedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                const hasPendingCheque = purchase.payments.some(
                  (p) => p.cheque && p.cheque.chequeStatus === "PENDING"
                );

                const isSupplierFiltered = selectedSuppliers.includes(purchase.supplierName);
                const isDueFiltered = selectedPaymentFilters.includes("NEED_TO_PAY") && purchase.balanceDue > 0;

                return (
                  <div
                    key={purchase.id}
                    onClick={() => setSelectedPurchase(purchase)}
                    className={`px-3.5 py-2 rounded-lg bg-zinc-950/60 hover:bg-zinc-900/80 border transition-all flex items-center justify-between gap-3 cursor-pointer group ${isDueFiltered
                      ? "border-amber-500/50 hover:border-amber-500/80 bg-amber-500/[0.03]"
                      : isSupplierFiltered
                        ? "border-indigo-500/50 hover:border-indigo-500/80 bg-indigo-500/[0.03]"
                        : "border-zinc-800/70 hover:border-zinc-700"
                      }`}
                  >
                    {/* Left: Identification, Supplier & Status */}
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Row 1: PO #, Date, Supplier & Invoice */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-zinc-100 font-mono text-xs group-hover:text-white transition-colors">
                          {purchase.purchaseOrderNumber}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {dateStr}
                        </span>
                        <span className="text-zinc-700 hidden sm:inline">•</span>
                        <span
                          className={`text-xs font-semibold truncate max-w-[160px] sm:max-w-[240px] transition-colors ${isSupplierFiltered
                            ? "text-indigo-300 bg-indigo-500/15 px-1.5 py-0.5 rounded border border-indigo-500/30"
                            : "text-zinc-300"
                            }`}
                        >
                          {purchase.supplierName}
                        </span>
                        {purchase.supplierInvoiceNumber && (
                          <span className="text-[9.5px] text-zinc-400 font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800/80 hidden md:inline">
                            Inv #{purchase.supplierInvoiceNumber}
                          </span>
                        )}
                        <span className="text-zinc-700 hidden md:inline">•</span>
                        <span className="text-[10.5px] text-zinc-500 font-mono hidden md:inline">
                          {purchase.items.length} item{purchase.items.length !== 1 ? "s" : ""} ({purchase.totalOrderedQuantity} units)
                        </span>
                      </div>

                      {/* Row 2: Status Badges (Clean, ultra-compact) */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-mono">
                        {/* 1. Purchase Status */}
                        <span className="px-1.5 py-0.2 rounded border bg-zinc-900/90 text-zinc-300 border-zinc-700/60">
                          {purchase.purchaseStatus}
                        </span>

                        {/* 2. Stock Status */}
                        <span
                          className={`px-1.5 py-0.2 rounded border ${purchase.stockStatus === "STOCKED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : purchase.stockStatus === "PARTIALLY_STOCKED"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                              : purchase.stockStatus.includes("RETURN")
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                                : "bg-zinc-900/90 text-zinc-500 border-zinc-800"
                            }`}
                        >
                          {purchase.stockStatus}
                        </span>

                        {/* 3. Payment Status */}
                        <span
                          className={`px-1.5 py-0.2 rounded border ${purchase.paymentStatus === "PAID"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : purchase.paymentStatus === "PARTIALLY_PAID"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                              : purchase.paymentStatus === "UNPAID"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                                : "bg-zinc-900/90 text-zinc-400 border-zinc-800"
                            }`}
                        >
                          {purchase.paymentStatus}
                        </span>

                        {/* Cheque tag */}
                        {hasPendingCheque && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Cheque Pending
                          </span>
                        )}

                        {/* Returns tag */}
                        {purchase.hasReturns && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Has Returns
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Total Amount, Due/Settled & Action buttons */}
                    <div className="flex items-center gap-2.5 flex-shrink-0 text-right">
                      <div className="font-mono">
                        <span className="text-xs sm:text-sm font-bold text-zinc-100 block group-hover:text-white transition-colors">
                          LKR {purchase.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {purchase.balanceDue > 0 ? (
                          <span
                            className={`text-[10px] font-semibold block transition-all ${isDueFiltered
                              ? "text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-500/50 shadow-sm shadow-amber-500/30"
                              : "text-amber-400"
                              }`}
                          >
                            Due: {purchase.balanceDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-medium block">
                            Settled
                          </span>
                        )}
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPurchaseToDelete(purchase);
                          }}
                          className="w-7 h-7 rounded-md hover:bg-rose-500/20 text-zinc-600 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                          title="Delete Purchase Order"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors hidden sm:block" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ADVANCED FILTER MODAL (Searchable dropdown per section)   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsFilterModalOpen(false); }}
        >
          <div className="relative w-full max-w-lg max-h-[88vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <Sliders className="w-4 h-4 text-zinc-300" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">Advanced Filters</h2>
                  <p className="text-[11px] text-zinc-500 font-mono">
                    {totalActiveAttributeCount > 0
                      ? `${totalActiveAttributeCount} filter${totalActiveAttributeCount !== 1 ? "s" : ""} active`
                      : "Select one or more filters"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {totalActiveAttributeCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPaymentFilters([]);
                      setSelectedSuppliers([]);
                      setSelectedStockFilters([]);
                      setSelectedOrderStatuses([]);
                      setSelectedPaymentMethods([]);
                    }}
                    className="text-[11px] font-mono text-zinc-400 hover:text-rose-400 transition-colors underline cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Modal Body – scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* ── Section 1: Payment Attributes ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                    <span className="text-xs font-semibold text-zinc-200">Payment Attributes</span>
                    {selectedPaymentFilters.length > 0 && (
                      <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-full">
                        {selectedPaymentFilters.length} selected
                      </span>
                    )}
                  </div>
                  {selectedPaymentFilters.length > 0 && (
                    <button type="button" onClick={() => setSelectedPaymentFilters([])} className="text-[10px] text-zinc-500 hover:text-rose-400 underline cursor-pointer transition-colors">
                      Clear
                    </button>
                  )}
                </div>

                {/* Searchable input */}
                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search payment options..."
                    value={filterSearchPayment}
                    onChange={(e) => setFilterSearchPayment(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                  {filterSearchPayment && (
                    <button type="button" onClick={() => setFilterSearchPayment("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Options list */}
                <div className="space-y-0.5 max-h-44 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                  {PAYMENT_ATTRIBUTES.filter((a) =>
                    !filterSearchPayment || a.label.toLowerCase().includes(filterSearchPayment.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-[11px] text-zinc-600 font-mono italic py-3 text-center">No matches</p>
                  ) : (
                    PAYMENT_ATTRIBUTES.filter((a) =>
                      !filterSearchPayment || a.label.toLowerCase().includes(filterSearchPayment.toLowerCase())
                    ).map((attr) => {
                      const isSelected = selectedPaymentFilters.includes(attr.id);
                      return (
                        <button
                          key={attr.id}
                          type="button"
                          onClick={() => toggleItem(selectedPaymentFilters, setSelectedPaymentFilters, attr.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono transition-all cursor-pointer ${isSelected
                            ? "bg-amber-500/10 text-amber-300"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? attr.dotCls : "bg-zinc-600"}`} />
                            {attr.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Section 2: Supplier ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50" />
                    <span className="text-xs font-semibold text-zinc-200">Supplier</span>
                    {selectedSuppliers.length > 0 && (
                      <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded-full">
                        {selectedSuppliers.length} selected
                      </span>
                    )}
                  </div>
                  {selectedSuppliers.length > 0 && (
                    <button type="button" onClick={() => setSelectedSuppliers([])} className="text-[10px] text-zinc-500 hover:text-rose-400 underline cursor-pointer transition-colors">
                      Clear
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search suppliers..."
                    value={filterSearchSupplier}
                    onChange={(e) => setFilterSearchSupplier(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                  {filterSearchSupplier && (
                    <button type="button" onClick={() => setFilterSearchSupplier("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-0.5 max-h-36 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                  {availableSuppliers.length === 0 ? (
                    <p className="text-[11px] text-zinc-600 font-mono italic py-3 text-center">No suppliers recorded yet.</p>
                  ) : availableSuppliers.filter((s) =>
                    !filterSearchSupplier || s.name.toLowerCase().includes(filterSearchSupplier.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-[11px] text-zinc-600 font-mono italic py-3 text-center">No matches</p>
                  ) : (
                    availableSuppliers.filter((s) =>
                      !filterSearchSupplier || s.name.toLowerCase().includes(filterSearchSupplier.toLowerCase())
                    ).map((supp) => {
                      const isSelected = selectedSuppliers.includes(supp.name);
                      return (
                        <button
                          key={supp.name}
                          type="button"
                          onClick={() => toggleItem(selectedSuppliers, setSelectedSuppliers, supp.name)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono transition-all cursor-pointer ${isSelected
                            ? "bg-indigo-500/10 text-indigo-300"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? "bg-indigo-400" : "bg-zinc-600"}`} />
                            <span className="truncate">{supp.name}</span>
                            <span className="text-[10px] text-zinc-600 flex-shrink-0">{supp.count}</span>
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Section 3: Stock & Delivery ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                    <span className="text-xs font-semibold text-zinc-200">Stock & Delivery</span>
                    {selectedStockFilters.length > 0 && (
                      <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded-full">
                        {selectedStockFilters.length} selected
                      </span>
                    )}
                  </div>
                  {selectedStockFilters.length > 0 && (
                    <button type="button" onClick={() => setSelectedStockFilters([])} className="text-[10px] text-zinc-500 hover:text-rose-400 underline cursor-pointer transition-colors">
                      Clear
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search stock options..."
                    value={filterSearchStock}
                    onChange={(e) => setFilterSearchStock(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                  {filterSearchStock && (
                    <button type="button" onClick={() => setFilterSearchStock("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-0.5 max-h-36 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                  {STOCK_ATTRIBUTES.filter((a) =>
                    !filterSearchStock || a.label.toLowerCase().includes(filterSearchStock.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-[11px] text-zinc-600 font-mono italic py-3 text-center">No matches</p>
                  ) : (
                    STOCK_ATTRIBUTES.filter((a) =>
                      !filterSearchStock || a.label.toLowerCase().includes(filterSearchStock.toLowerCase())
                    ).map((attr) => {
                      const isSelected = selectedStockFilters.includes(attr.id);
                      return (
                        <button
                          key={attr.id}
                          type="button"
                          onClick={() => toggleItem(selectedStockFilters, setSelectedStockFilters, attr.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono transition-all cursor-pointer ${isSelected
                            ? "bg-cyan-500/10 text-cyan-300"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? attr.dotCls : "bg-zinc-600"}`} />
                            {attr.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Section 4: Payment Method ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
                    <span className="text-xs font-semibold text-zinc-200">Payment Method Used</span>
                    {selectedPaymentMethods.length > 0 && (
                      <span className="text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full">
                        {selectedPaymentMethods.length} selected
                      </span>
                    )}
                  </div>
                  {selectedPaymentMethods.length > 0 && (
                    <button type="button" onClick={() => setSelectedPaymentMethods([])} className="text-[10px] text-zinc-500 hover:text-rose-400 underline cursor-pointer transition-colors">
                      Clear
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search payment methods..."
                    value={filterSearchMethod}
                    onChange={(e) => setFilterSearchMethod(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                  {filterSearchMethod && (
                    <button type="button" onClick={() => setFilterSearchMethod("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-0.5 max-h-36 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                  {PAYMENT_METHODS.filter((m) =>
                    !filterSearchMethod || m.label.toLowerCase().includes(filterSearchMethod.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-[11px] text-zinc-600 font-mono italic py-3 text-center">No matches</p>
                  ) : (
                    PAYMENT_METHODS.filter((m) =>
                      !filterSearchMethod || m.label.toLowerCase().includes(filterSearchMethod.toLowerCase())
                    ).map((m) => {
                      const isSelected = selectedPaymentMethods.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleItem(selectedPaymentMethods, setSelectedPaymentMethods, m.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono transition-all cursor-pointer ${isSelected
                            ? "bg-blue-500/10 text-blue-300"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? "bg-blue-400" : "bg-zinc-600"}`} />
                            {m.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Section 5: Order Status ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-zinc-400 shadow-sm" />
                    <span className="text-xs font-semibold text-zinc-200">Order Status</span>
                    {selectedOrderStatuses.length > 0 && (
                      <span className="text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded-full">
                        {selectedOrderStatuses.length} selected
                      </span>
                    )}
                  </div>
                  {selectedOrderStatuses.length > 0 && (
                    <button type="button" onClick={() => setSelectedOrderStatuses([])} className="text-[10px] text-zinc-500 hover:text-rose-400 underline cursor-pointer transition-colors">
                      Clear
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search order statuses..."
                    value={filterSearchOrder}
                    onChange={(e) => setFilterSearchOrder(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                  {filterSearchOrder && (
                    <button type="button" onClick={() => setFilterSearchOrder("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-0.5 max-h-36 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                  {ORDER_ATTRIBUTES.filter((a) =>
                    !filterSearchOrder || a.label.toLowerCase().includes(filterSearchOrder.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-[11px] text-zinc-600 font-mono italic py-3 text-center">No matches</p>
                  ) : (
                    ORDER_ATTRIBUTES.filter((a) =>
                      !filterSearchOrder || a.label.toLowerCase().includes(filterSearchOrder.toLowerCase())
                    ).map((attr) => {
                      const isSelected = selectedOrderStatuses.includes(attr.id);
                      return (
                        <button
                          key={attr.id}
                          type="button"
                          onClick={() => toggleItem(selectedOrderStatuses, setSelectedOrderStatuses, attr.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono transition-all cursor-pointer ${isSelected
                            ? "bg-zinc-800 text-zinc-100"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? "bg-zinc-300" : "bg-zinc-600"}`} />
                            {attr.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

            </div>{/* end modal body */}

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/80 flex-shrink-0 bg-zinc-950">
              <p className="text-[11px] text-zinc-500 font-mono">
                {filteredPurchases.length} result{filteredPurchases.length !== 1 ? "s" : ""} matching
              </p>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold transition-all cursor-pointer shadow"
              >
                Apply & Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Modals & Drawers ── */}
      {isNewModalOpen && (
        <NewPurchaseModal
          isOpen={isNewModalOpen}
          onClose={() => setIsNewModalOpen(false)}
          onCreated={() => {
            // Subscription auto updates, but we can trigger state if needed
          }}
        />
      )}

      {selectedPurchase && (
        <PurchaseDetailDrawer
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          onUpdated={() => {
            // Handled via real-time subscription
          }}
        />
      )}

      {/* ── Delete Purchase Confirmation Modal ── */}
      {purchaseToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs font-sans">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-xs space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Purchase Order</h3>
                <p className="text-zinc-400 text-[11px] font-mono">{purchaseToDelete.purchaseOrderNumber}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between text-zinc-400">
                <span>Supplier:</span>
                <span className="text-zinc-200 font-semibold">{purchaseToDelete.supplierName}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Total Amount:</span>
                <span className="text-zinc-200 font-semibold">
                  LKR {purchaseToDelete.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Received Units:</span>
                <span className="text-zinc-200 font-semibold">
                  {purchaseToDelete.totalReceivedQuantity} / {purchaseToDelete.totalOrderedQuantity}
                </span>
              </div>
              {purchaseToDelete.amountPaid > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Recorded Payments:</span>
                  <span className="font-semibold">
                    LKR {purchaseToDelete.amountPaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {purchaseToDelete.totalReceivedQuantity > 0 && (
              <label className="flex items-start gap-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={revertStockOnDelete}
                  onChange={(e) => setRevertStockOnDelete(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-500 mt-0.5"
                />
                <span>
                  Reverse received catalog inventory (automatically deduct {purchaseToDelete.totalReceivedQuantity} received units via Stock Out)
                </span>
              </label>
            )}

            <p className="text-zinc-400 text-[11px]">
              Are you sure you want to permanently delete this purchase record? This operation cannot be undone.
            </p>

            <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setPurchaseToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                {isDeleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
