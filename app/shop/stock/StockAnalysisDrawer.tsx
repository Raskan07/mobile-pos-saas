"use client";

/**
 * app/shop/stock/StockAnalysisDrawer.tsx
 *
 * Slide-over Stock Analysis & Valuation drawer for Mobile POS SaaS.
 * Provides a comprehensive analysis suite in the dark neutral gray POS theme:
 * - Valuation KPIs (Cost Basis, Retail Potential, Projected Gross Margin)
 * - Stock Health Distribution (Healthy, Low Stock, Out of Stock)
 * - Category Value Distribution (share of inventory value per category)
 * - Movement Volume & Loss Summaries (Stock In, Stock Out, Damaged write-offs, POS Sales)
 */

import React, { useMemo } from "react";
import {
  X,
  BarChart3,
  DollarSign,
  Package,
  Layers,
  AlertOctagon,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  FileSpreadsheet,
  PieChart,
  Boxes,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { ProductItem, Category } from "@/lib/types/catalog";
import { StockTransaction, StockValuationSummary } from "@/lib/types/stock";
import { calculateStockValuation, getProductStockStatus } from "@/lib/services/stockService";

interface StockAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  categories: Category[];
  transactions: StockTransaction[];
  shopId: string;
}

export default function StockAnalysisDrawer({
  isOpen,
  onClose,
  products,
  categories,
  transactions,
  shopId,
}: StockAnalysisDrawerProps) {
  // Currency formatter
  const fmt = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Valuation summary
  const summary: StockValuationSummary = useMemo(() => {
    return calculateStockValuation(products, transactions);
  }, [products, transactions]);

  // Projected Margin
  const potentialProfit = Math.max(0, summary.totalRetailValue - summary.totalCostValue);
  const potentialMarginPct =
    summary.totalRetailValue > 0
      ? ((potentialProfit / summary.totalRetailValue) * 100).toFixed(1)
      : "0";

  // Category breakdown
  const categoryStats = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; totalUnits: number; totalCost: number; totalRetail: number; count: number }
    >();

    // Initialize with categories
    categories.forEach((c) => {
      map.set(c.id, {
        id: c.id,
        name: c.name,
        totalUnits: 0,
        totalCost: 0,
        totalRetail: 0,
        count: 0,
      });
    });

    // Aggregate products
    products.forEach((p) => {
      const catId = p.categoryId || "uncategorized";
      const catName = p.categoryName || "Uncategorized";
      const stock = typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
      const cost = typeof p.costPrice === "number" ? p.costPrice : 0;
      const retail = typeof p.sellingPrice === "number" ? p.sellingPrice : 0;

      if (!map.has(catId)) {
        map.set(catId, {
          id: catId,
          name: catName,
          totalUnits: 0,
          totalCost: 0,
          totalRetail: 0,
          count: 0,
        });
      }

      const entry = map.get(catId)!;
      entry.totalUnits += stock;
      entry.totalCost += stock * cost;
      entry.totalRetail += stock * retail;
      entry.count += 1;
    });

    return Array.from(map.values())
      .filter((c) => c.count > 0)
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [products, categories]);

  // Movement activity summaries
  const movementStats = useMemo(() => {
    let stockInUnits = 0;
    let stockInVal = 0;
    let stockOutUnits = 0;
    let stockOutVal = 0;
    let damagedUnits = 0;
    let damagedVal = 0;
    let salesUnits = 0;
    let salesVal = 0;

    transactions.forEach((tx) => {
      const units = Math.abs(tx.quantityDelta);
      const val = Math.abs(tx.totalValueChange);

      if (tx.type === "STOCK_IN") {
        stockInUnits += units;
        stockInVal += val;
      } else if (tx.type === "STOCK_OUT") {
        stockOutUnits += units;
        stockOutVal += val;
      } else if (tx.type === "DAMAGED") {
        damagedUnits += units;
        damagedVal += val;
      } else if (tx.type === "SALE") {
        salesUnits += units;
        salesVal += val;
      }
    });

    return {
      stockInUnits,
      stockInVal,
      stockOutUnits,
      stockOutVal,
      damagedUnits,
      damagedVal,
      salesUnits,
      salesVal,
    };
  }, [transactions]);

  // Export Analysis Report to CSV
  const handleExportAnalysis = () => {
    const lines: string[] = [
      `"STOCK ANALYSIS REPORT - ${shopId}"`,
      `"Generated At","${new Date().toLocaleString()}"`,
      "",
      `"VALUATION KPIS"`,
      `"Total Stocked Units",${summary.totalUnits}`,
      `"Total Catalog Products",${summary.totalProducts}`,
      `"Total Cost Basis (Asset Value)",${summary.totalCostValue.toFixed(2)}`,
      `"Total Retail Value",${summary.totalRetailValue.toFixed(2)}`,
      `"Projected Gross Margin",${potentialProfit.toFixed(2)}`,
      `"Margin Percentage","${potentialMarginPct}%"`,
      "",
      `"STOCK HEALTH"`,
      `"Healthy Count",${summary.healthyCount}`,
      `"Low Stock Count",${summary.lowStockCount}`,
      `"Out of Stock Count",${summary.outOfStockCount}`,
      "",
      `"CATEGORY BREAKDOWN"`,
      `"Category Name","Product Count","Total Units","Cost Valuation (LKR)","Retail Valuation (LKR)"`,
    ];

    categoryStats.forEach((c) => {
      lines.push(
        `"${c.name.replace(/"/g, '""')}",${c.count},${c.totalUnits},${c.totalCost.toFixed(2)},${c.totalRetail.toFixed(2)}`
      );
    });

    lines.push("");
    lines.push(`"MOVEMENT SUMMARIES"`);
    lines.push(`"Stock In Units",${movementStats.stockInUnits},${movementStats.stockInVal.toFixed(2)}`);
    lines.push(`"Stock Out Units",${movementStats.stockOutUnits},${movementStats.stockOutVal.toFixed(2)}`);
    lines.push(`"Damaged Units",${movementStats.damagedUnits},${movementStats.damagedVal.toFixed(2)}`);
    lines.push(`"POS Sales Units",${movementStats.salesUnits},${movementStats.salesVal.toFixed(2)}`);

    const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `stock_analysis_${shopId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over panel (Gray POS Aesthetic) */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <aside className="w-screen max-w-2xl bg-[#0c0d15] border-l border-white/[0.08] shadow-2xl flex flex-col text-zinc-100 animate-in slide-in-from-right duration-250">
          {/* Drawer Header */}
          <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/70 flex items-center justify-center text-zinc-300">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Stock Analysis & Valuation</h2>
                <p className="text-[11px] text-zinc-400">
                  Comprehensive inventory metrics and asset breakdown
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportAnalysis}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs text-zinc-200 transition-all cursor-pointer"
                title="Export analysis to CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-400" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
                title="Close Analysis"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 text-xs">
            {/* ── Section 1: Valuation KPIs ── */}
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-3">
                Inventory Valuation KPIs
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Cost Basis */}
                <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between gap-1">
                  <span className="text-[11px] text-zinc-400">Total Cost Basis</span>
                  <div className="text-base font-bold font-mono text-zinc-100">
                    {fmt(summary.totalCostValue)}
                  </div>
                  <span className="text-[10px] text-zinc-500">Asset value</span>
                </div>

                {/* Retail Value */}
                <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between gap-1">
                  <span className="text-[11px] text-zinc-400">Retail Potential</span>
                  <div className="text-base font-bold font-mono text-zinc-100">
                    {fmt(summary.totalRetailValue)}
                  </div>
                  <span className="text-[10px] text-zinc-500">Sales value</span>
                </div>

                {/* Projected Profit */}
                <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between gap-1">
                  <span className="text-[11px] text-zinc-400">Projected Margin</span>
                  <div className="text-base font-bold font-mono text-zinc-200">
                    {fmt(potentialProfit)}
                  </div>
                  <span className="text-[10px] text-zinc-500">{potentialMarginPct}% markup</span>
                </div>

                {/* Total Units */}
                <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between gap-1">
                  <span className="text-[11px] text-zinc-400">Total Quantity</span>
                  <div className="text-base font-bold font-mono text-zinc-100">
                    {summary.totalUnits.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-zinc-500">{summary.totalProducts} items</span>
                </div>
              </div>
            </div>

            {/* ── Section 2: Stock Health Distribution ── */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                  Stock Health Breakdown
                </span>
                <span className="text-[11px] font-mono text-zinc-400">
                  {summary.totalProducts} Total Catalog Items
                </span>
              </div>

              {/* Multi-segment Progress Bar */}
              {summary.totalProducts > 0 && (
                <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden flex mb-3">
                  <div
                    style={{
                      width: `${(summary.healthyCount / summary.totalProducts) * 100}%`,
                    }}
                    className="bg-emerald-600 h-full transition-all"
                    title={`Healthy: ${summary.healthyCount}`}
                  />
                  <div
                    style={{
                      width: `${(summary.lowStockCount / summary.totalProducts) * 100}%`,
                    }}
                    className="bg-amber-600 h-full transition-all"
                    title={`Low Stock: ${summary.lowStockCount}`}
                  />
                  <div
                    style={{
                      width: `${(summary.outOfStockCount / summary.totalProducts) * 100}%`,
                    }}
                    className="bg-rose-600 h-full transition-all"
                    title={`Out of Stock: ${summary.outOfStockCount}`}
                  />
                </div>
              )}

              {/* Counts Grid */}
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Healthy Stock
                  </div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                    {summary.healthyCount}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {summary.totalProducts > 0
                      ? `${((summary.healthyCount / summary.totalProducts) * 100).toFixed(0)}%`
                      : "0%"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Low Stock Alerts
                  </div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                    {summary.lowStockCount}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {summary.totalProducts > 0
                      ? `${((summary.lowStockCount / summary.totalProducts) * 100).toFixed(0)}%`
                      : "0%"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Out of Stock
                  </div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                    {summary.outOfStockCount}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {summary.totalProducts > 0
                      ? `${((summary.outOfStockCount / summary.totalProducts) * 100).toFixed(0)}%`
                      : "0%"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 3: Category Valuation Distribution ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                  Inventory by Category
                </span>
                <span className="text-[11px] text-zinc-500">
                  {categoryStats.length} active categories
                </span>
              </div>

              <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden divide-y divide-zinc-800/60">
                {categoryStats.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500">No categories found.</div>
                ) : (
                  categoryStats.map((cat) => {
                    const sharePct =
                      summary.totalCostValue > 0
                        ? ((cat.totalCost / summary.totalCostValue) * 100).toFixed(1)
                        : "0";

                    return (
                      <div key={cat.id} className="p-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200 truncate">{cat.name}</span>
                            <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800 font-mono">
                              {cat.count} items
                            </span>
                          </div>
                          <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div
                              style={{ width: `${Math.min(100, Math.max(2, parseFloat(sharePct)))}%` }}
                              className="bg-zinc-400 h-full rounded-full"
                            />
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono font-semibold text-zinc-200">
                            {fmt(cat.totalCost)}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {cat.totalUnits} units • {sharePct}% share
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── Section 4: Movement Volume & Loss Summary ── */}
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-3">
                Movement Activity & Loss Logs
              </span>
              <div className="grid grid-cols-2 gap-3">
                {/* Stock In */}
                <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Stock In Additions</span>
                    <span className="text-sm font-bold font-mono text-zinc-200 block">
                      +{movementStats.stockInUnits} units
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {fmt(movementStats.stockInVal)}
                    </span>
                  </div>
                </div>

                {/* Stock Out */}
                <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 shrink-0 mt-0.5">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Stock Out Deductions</span>
                    <span className="text-sm font-bold font-mono text-zinc-200 block">
                      -{movementStats.stockOutUnits} units
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {fmt(movementStats.stockOutVal)}
                    </span>
                  </div>
                </div>

                {/* Damaged Stock */}
                <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                    <AlertOctagon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Damaged Write-offs</span>
                    <span className="text-sm font-bold font-mono text-rose-300 block">
                      {movementStats.damagedUnits} units loss
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Loss: {fmt(movementStats.damagedVal)}
                    </span>
                  </div>
                </div>

                {/* POS Sales Deductions */}
                <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">POS Checkout Sales</span>
                    <span className="text-sm font-bold font-mono text-zinc-200 block">
                      {movementStats.salesUnits} units sold
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Cost: {fmt(movementStats.salesVal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
