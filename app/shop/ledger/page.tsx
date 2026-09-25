"use client";

/**
 * app/shop/ledger/page.tsx
 *
 * Sales Ledger & Invoice Historical Records
 *
 * Key Architecture Guarantees:
 * 1. Strict Multi-Tenant Boundary: Every query is filtered by the active authenticated `shopId`.
 *    Shops can NEVER access or view another shop's sales records.
 * 2. Product Snapshot Integrity: Every invoice renders the frozen product snapshot
 *    (name, variant, SKU, unitPrice, costPrice, discount, subtotal) stored at transaction time.
 *    Modifying or repricing catalog items in the future never alters these historical invoices.
 * 3. Cashier Audit Trail: Captures exact cashier UID, username, role, tender details, and timestamps.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  BookOpen,
  Calendar,
  Filter,
  CreditCard,
  Banknote,
  Building2,
  Smartphone,
  ShieldCheck,
  Printer,
  Download,
  Eye,
  X,
  Clock,
  CheckCircle2,
  TrendingUp,
  Receipt,
  RotateCcw,
  Tag,
  Package,
  FileText,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Database,
  RefreshCw,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  getSalesByShop,
  subscribeToSalesByShop,
  getShopSalesSummary,
} from "@/lib/services/salesService";
import { SaleRecord, SaleItemSnapshot, ShopSalesSummary } from "@/lib/types/sale";
import ReceiptModal from "../dashboard/ReceiptModal";

export default function ShopSalesLedgerPage() {
  const router = useRouter();
  const { shop, user, activeBranchName, isAuthenticated, isLoading: isAuthLoading } = useShopAuth();

  // Sales data state
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [summary, setSummary] = useState<ShopSalesSummary | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "7days" | "30days">("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/shop");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  // Real-time listener strictly scoped to active shopId
  useEffect(() => {
    if (!shop?.shopId) return;

    setIsLoading(true);

    const unsubscribe = subscribeToSalesByShop(
      shop.shopId,
      (fetchedSales) => {
        setSales(fetchedSales);
        setIsLoading(false);
      },
      (err) => {
        console.error("[SalesLedger] Subscription error:", err);
        setIsLoading(false);
      }
    );

    // Compute summary stats
    getShopSalesSummary(shop.shopId)
      .then((sum) => setSummary(sum))
      .catch((err) => console.warn("[SalesLedger] Summary error:", err));

    return () => unsubscribe();
  }, [shop?.shopId]);

  // Date boundary calculator
  const dateBoundaries = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOf30Days = startOfToday - 30 * 24 * 60 * 60 * 1000;
    return { startOfToday, startOfYesterday, startOf7Days, startOf30Days };
  }, []);

  // Filtered sales in memory for responsiveness
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // 1. Date filter
      if (dateFilter === "today" && sale.createdAt < dateBoundaries.startOfToday) {
        return false;
      }
      if (
        dateFilter === "yesterday" &&
        (sale.createdAt < dateBoundaries.startOfYesterday || sale.createdAt >= dateBoundaries.startOfToday)
      ) {
        return false;
      }
      if (dateFilter === "7days" && sale.createdAt < dateBoundaries.startOf7Days) {
        return false;
      }
      if (dateFilter === "30days" && sale.createdAt < dateBoundaries.startOf30Days) {
        return false;
      }

      // 2. Payment method filter
      if (paymentFilter !== "all" && sale.paymentMethod?.toLowerCase() !== paymentFilter.toLowerCase()) {
        return false;
      }

      // 3. Cashier filter
      if (cashierFilter !== "all" && sale.cashierId !== cashierFilter) {
        return false;
      }

      // 4. Text search (invoice #, customer name, items, sku)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesInvoice = sale.invoiceNumber.toLowerCase().includes(q);
        const matchesCashier = sale.cashierName.toLowerCase().includes(q);
        const matchesCustomer = sale.customer?.name?.toLowerCase().includes(q);
        const matchesItems = sale.items.some(
          (it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        );
        if (!matchesInvoice && !matchesCashier && !matchesCustomer && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [sales, dateFilter, paymentFilter, cashierFilter, searchQuery, dateBoundaries]);

  // Unique cashiers list for filter dropdown
  const uniqueCashiers = useMemo(() => {
    const map = new Map<string, string>();
    sales.forEach((s) => {
      if (s.cashierId && s.cashierName) {
        map.set(s.cashierId, s.cashierName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sales]);

  // Helper to format currency
  const fmt = (val: number) => `LKR ${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Format payment icon
  const getPaymentIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case "cash":
        return <Banknote className="w-3.5 h-3.5 text-emerald-400" />;
      case "card":
        return <CreditCard className="w-3.5 h-3.5 text-blue-400" />;
      case "bank-transfer":
      case "bank":
        return <Building2 className="w-3.5 h-3.5 text-amber-400" />;
      case "mobile-qr":
      case "mobile":
        return <Smartphone className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <CreditCard className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#07080d] text-zinc-400">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 font-sans select-none flex flex-col">
      {/* ── Background Cosmic Ambiance ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[700px] h-[500px] bg-orange-600/5 rounded-full blur-[180px]" />
        <div className="absolute bottom-0 right-10 w-[600px] h-[600px] bg-indigo-600/6 rounded-full blur-[170px]" />
      </div>

      {/* ── Top Header Navigation Bar ── */}
      <header className="relative z-10 h-16 px-4 md:px-8 bg-[#0c0d15]/80 backdrop-blur-xl border-b border-white/[0.07] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Back to POS Terminal"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm md:text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Sales Ledger & Audit Invoices</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/25">
                {shop?.shopId || "SHP"}
              </span>
            </h1>
            <p className="text-[11px] text-zinc-400">
              Immutable product snapshots & customer transactions strictly isolated for {shop?.shopName || "Active Store"}
            </p>
          </div>
        </div>

        {/* Right Info: Cloud Isolation Status */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Multi-Tenant Isolated</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white transition-all cursor-pointer"
          >
            Open POS Terminal
          </button>
        </div>
      </header>

      {/* ── Main Ledger Body ── */}
      <main className="relative z-10 flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* ── Metric Summary Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#0f111a]/90 border border-white/[0.08] backdrop-blur-md space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Total Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl md:text-2xl font-black text-white font-mono">
              {fmt(summary?.totalRevenue || sales.reduce((acc, s) => acc + s.grandTotal, 0))}
            </div>
            <div className="text-[11px] text-zinc-500">
              {sales.length} completed transactions
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0f111a]/90 border border-white/[0.08] backdrop-blur-md space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Today's Sales</span>
              <TrendingUp className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-xl md:text-2xl font-black text-orange-300 font-mono">
              {fmt(summary?.todayRevenue || 0)}
            </div>
            <div className="text-[11px] text-zinc-500">
              {summary?.todayTransactions || 0} tickets today
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0f111a]/90 border border-white/[0.08] backdrop-blur-md space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Average Ticket Size</span>
              <Receipt className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl md:text-2xl font-black text-white font-mono">
              {fmt(summary?.averageOrderValue || 0)}
            </div>
            <div className="text-[11px] text-zinc-500">
              Avg revenue per invoice
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0f111a]/90 border border-white/[0.08] backdrop-blur-md space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Items Dispensed</span>
              <Package className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl md:text-2xl font-black text-purple-300 font-mono">
              {(summary?.totalItemsSold || sales.reduce((acc, s) => acc + s.itemCount, 0)).toLocaleString()}
            </div>
            <div className="text-[11px] text-zinc-500">
              Total products sold
            </div>
          </div>
        </div>

        {/* ── Filters & Search Control Bar ── */}
        <div className="p-4 rounded-2xl bg-[#0f111a]/90 border border-white/[0.08] backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice, SKU, product, cashier..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none transition-all"
            />
          </div>

          {/* Filter Selectors */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Date Range Selector */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-xs font-medium text-zinc-300 focus:border-orange-500/60 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-zinc-900">All Dates</option>
              <option value="today" className="bg-zinc-900">Today</option>
              <option value="yesterday" className="bg-zinc-900">Yesterday</option>
              <option value="7days" className="bg-zinc-900">Last 7 Days</option>
              <option value="30days" className="bg-zinc-900">Last 30 Days</option>
            </select>

            {/* Payment Method Selector */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-xs font-medium text-zinc-300 focus:border-orange-500/60 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-zinc-900">All Payments</option>
              <option value="cash" className="bg-zinc-900">Cash</option>
              <option value="card" className="bg-zinc-900">Card</option>
              <option value="bank-transfer" className="bg-zinc-900">Bank Wire</option>
              <option value="mobile-qr" className="bg-zinc-900">Mobile / QR</option>
            </select>

            {/* Cashier Selector */}
            {uniqueCashiers.length > 1 && (
              <select
                value={cashierFilter}
                onChange={(e) => setCashierFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-xs font-medium text-zinc-300 focus:border-orange-500/60 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-zinc-900">All Cashiers</option>
                {uniqueCashiers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900">
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <span className="text-xs text-zinc-500 font-mono ml-1">
              {filteredSales.length} records
            </span>
          </div>
        </div>

        {/* ── Invoices Table ── */}
        <div className="rounded-2xl bg-[#0f111a]/90 border border-white/[0.08] backdrop-blur-md overflow-hidden shadow-xl">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <div className="w-8 h-8 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
              <p className="text-xs">Loading shop sales records from Firebase...</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
              <Receipt className="w-10 h-10 text-zinc-600 mb-1" />
              <h3 className="text-sm font-semibold text-zinc-300">No Sales Records Found</h3>
              <p className="text-xs text-zinc-500 max-w-sm">
                {sales.length === 0
                  ? "No sales have been finalized yet for this shop. Complete transactions at the POS terminal to record invoices here."
                  : "No sales match the current search query or date/payment filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.02] text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                    <th className="py-3.5 px-4">Invoice #</th>
                    <th className="py-3.5 px-4">Date & Time</th>
                    <th className="py-3.5 px-4">Cashier</th>
                    <th className="py-3.5 px-4">Items Snapshot</th>
                    <th className="py-3.5 px-4">Payment</th>
                    <th className="py-3.5 px-4 text-right">Grand Total</th>
                    <th className="py-3.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredSales.map((sale) => (
                    <tr
                      key={sale.saleId}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      onClick={() => setSelectedSale(sale)}
                    >
                      {/* Invoice Number */}
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <span className="text-orange-400">{sale.invoiceNumber}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          ID: {sale.saleId.slice(0, 16)}…
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-4 text-zinc-300">
                        <div>
                          {new Date(sale.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {new Date(sale.createdAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      {/* Cashier */}
                      <td className="py-3 px-4 text-zinc-300">
                        <div className="font-medium text-zinc-200">{sale.cashierName}</div>
                        <div className="text-[10px] text-zinc-500 capitalize">{sale.cashierRole}</div>
                      </td>

                      {/* Snapshot Items Summary */}
                      <td className="py-3 px-4 text-zinc-300 max-w-xs truncate">
                        <div className="font-medium text-zinc-200 truncate">
                          {sale.items.map((it) => `${it.quantity}x ${it.name}`).join(", ")}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {sale.itemCount} items • {sale.items.length} line{sale.items.length > 1 ? "s" : ""}
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 capitalize font-medium text-zinc-300">
                          {getPaymentIcon(sale.paymentMethod)}
                          <span>{sale.paymentMethod}</span>
                        </div>
                        {sale.paymentMethod.toLowerCase() === "cash" && sale.change !== undefined && (
                          <div className="text-[10px] text-zinc-500">
                            Chg: {fmt(sale.change)}
                          </div>
                        )}
                      </td>

                      {/* Grand Total */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-emerald-400">
                        {fmt(sale.grandTotal)}
                      </td>

                      {/* View Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSale(sale);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Slide-Over / Modal: Full Frozen Snapshot Invoice Detail ── */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-tight">
                    {selectedSale.invoiceNumber}
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Immutable Snapshot
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Sale ID: <code className="text-orange-300">{selectedSale.saleId}</code> • Scoped to Shop:{" "}
                  <code className="text-zinc-300">{selectedSale.shopId}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Immutability Banner Note */}
            <div className="px-5 py-3 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent border-b border-orange-500/20 flex items-center gap-2.5 text-xs text-orange-300">
              <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" />
              <span>
                <strong>Guaranteed Historical Accuracy:</strong> Item names, SKUs, and unit prices shown below
                are frozen snapshots taken at checkout. Future catalog modifications will never change this record.
              </span>
            </div>

            {/* Body: Meta & Itemized Snapshot List */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5 text-zinc-300">
              {/* Transaction Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-3.5 rounded-xl bg-black/40 border border-white/[0.06]">
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Date & Time</div>
                  <div className="font-medium text-zinc-200 mt-0.5">
                    {new Date(selectedSale.createdAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Cashier</div>
                  <div className="font-medium text-zinc-200 mt-0.5">{selectedSale.cashierName}</div>
                  <div className="text-[10px] text-zinc-500">{selectedSale.cashierId}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Branch</div>
                  <div className="font-medium text-zinc-200 mt-0.5">{selectedSale.branchName}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Payment Method</div>
                  <div className="flex items-center gap-1 font-medium text-zinc-200 mt-0.5 capitalize">
                    {getPaymentIcon(selectedSale.paymentMethod)}
                    <span>{selectedSale.paymentMethod}</span>
                  </div>
                </div>
              </div>

              {/* Items Snapshot Table */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Itemized Product Snapshots ({selectedSale.items.length})
                </div>

                <div className="rounded-xl border border-white/[0.08] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-zinc-400 border-b border-white/[0.06]">
                        <th className="py-2.5 px-3">Product Name & Variant</th>
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {selectedSale.items.map((item, idx) => (
                        <tr key={item.productId + idx} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-zinc-100">{item.name}</div>
                            {item.variant && (
                              <div className="text-[10px] text-zinc-400">Variant: {item.variant}</div>
                            )}
                            {item.brand && (
                              <div className="text-[10px] text-zinc-500">Brand: {item.brand}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                            {item.sku || "N/A"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                            {fmt(item.unitPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-zinc-200">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-300">
                            {fmt(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span className="font-mono">{fmt(selectedSale.subtotal)}</span>
                </div>
                {selectedSale.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>
                      Order Discount{" "}
                      {selectedSale.discountSetting.type === "percentage"
                        ? `(${selectedSale.discountSetting.value}%)`
                        : "(Fixed)"}
                    </span>
                    <span className="font-mono">-{fmt(selectedSale.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-zinc-400">
                  <span>Sales Tax ({((selectedSale.taxRate || 0.08) * 100).toFixed(0)}%)</span>
                  <span className="font-mono">{fmt(selectedSale.taxAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/[0.08]">
                  <span>Grand Total</span>
                  <span className="font-mono text-emerald-400">{fmt(selectedSale.grandTotal)}</span>
                </div>

                {selectedSale.paymentMethod.toLowerCase() === "cash" && selectedSale.cashReceived !== undefined && (
                  <div className="pt-2 border-t border-dashed border-zinc-800 space-y-1 text-[11px]">
                    <div className="flex justify-between text-zinc-400">
                      <span>Cash Tendered</span>
                      <span className="font-mono">{fmt(selectedSale.cashReceived)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span>Change Given</span>
                      <span className="font-mono">{fmt(selectedSale.change || 0)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-zinc-900/80 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-600/20 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Reprint Customer Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reprint Customer Receipt Modal ── */}
      {selectedSale && isReceiptModalOpen && (
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          onNewSale={() => {
            setIsReceiptModalOpen(false);
            setSelectedSale(null);
          }}
          persistedSale={selectedSale}
        />
      )}
    </div>
  );
}
