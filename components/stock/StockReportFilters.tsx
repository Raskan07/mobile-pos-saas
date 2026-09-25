"use client";

/**
 * components/stock/StockReportFilters.tsx
 *
 * Reusable filter component for the Stock Reporting System.
 * Supports:
 * - Date & Time range presets (Today, Yesterday, 7 Days, 30 Days, All, Custom Datetime)
 * - Report type selection (Inventory Valuation, Movements / Audit, Low Stock Alert)
 * - Stock status filters (Healthy, Low Stock, Out of Stock)
 * - Category and Movement Type filtering
 * - Text search
 */

import React from "react";
import {
  Calendar,
  Filter,
  Search,
  ChevronDown,
  Layers,
  SlidersHorizontal,
  Clock,
  X,
  TrendingUp,
  AlertTriangle,
  History,
} from "lucide-react";
import { Category } from "@/lib/types/catalog";
import { StockStatus, StockMovementType } from "@/lib/types/stock";
import {
  StockReportFilters,
  StockReportType,
  DateRangePreset,
} from "@/lib/types/stockReport";

interface StockReportFiltersProps {
  filters: StockReportFilters;
  onFiltersChange: (nextFilters: StockReportFilters) => void;
  categories: Category[];
  className?: string;
}

export default function StockReportFiltersComponent({
  filters,
  onFiltersChange,
  categories,
  className = "",
}: StockReportFiltersProps) {
  // Update a single filter field helper
  const update = <K extends keyof StockReportFilters>(
    field: K,
    val: StockReportFilters[K]
  ) => {
    onFiltersChange({
      ...filters,
      [field]: val,
    });
  };

  // Preset Date buttons
  const datePresets: { id: DateRangePreset; label: string }[] = [
    { id: "all", label: "All Time" },
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "7days", label: "7 Days" },
    { id: "30days", label: "30 Days" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className={`flex flex-col gap-4 text-xs ${className}`}>
      {/* ── 1. Report Type Selector ── */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
          Report Focus
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => update("reportType", "INVENTORY_VALUATION")}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              filters.reportType === "INVENTORY_VALUATION"
                ? "bg-zinc-800 text-zinc-100 border-zinc-600 shadow-xs"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Inventory Valuation</span>
          </button>

          <button
            type="button"
            onClick={() => update("reportType", "STOCK_MOVEMENTS")}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              filters.reportType === "STOCK_MOVEMENTS"
                ? "bg-zinc-800 text-zinc-100 border-zinc-600 shadow-xs"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800/50"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Stock Movements</span>
          </button>

          <button
            type="button"
            onClick={() => update("reportType", "LOW_STOCK_ALERT")}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              filters.reportType === "LOW_STOCK_ALERT"
                ? "bg-zinc-800 text-zinc-100 border-zinc-600 shadow-xs"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800/50"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Low Stock Alerts</span>
          </button>
        </div>
      </div>

      {/* ── 2. Date & Time Range Presets ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <span>Date & Time Range</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {datePresets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => update("dateRangePreset", p.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                filters.dateRangePreset === p.id
                  ? "bg-zinc-800 text-zinc-100 border-zinc-600 shadow-xs"
                  : "bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Date & Time Pickers */}
        {filters.dateRangePreset === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <div>
              <span className="block text-[10px] text-zinc-500 mb-1">Start Date & Time</span>
              <input
                type="datetime-local"
                value={
                  filters.startDate
                    ? new Date(filters.startDate - new Date().getTimezoneOffset() * 60000)
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  const val = e.target.value ? new Date(e.target.value).getTime() : undefined;
                  update("startDate", val);
                }}
                className="w-full h-8 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <span className="block text-[10px] text-zinc-500 mb-1">End Date & Time</span>
              <input
                type="datetime-local"
                value={
                  filters.endDate
                    ? new Date(filters.endDate - new Date().getTimezoneOffset() * 60000)
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  const val = e.target.value ? new Date(e.target.value).getTime() : undefined;
                  update("endDate", val);
                }}
                className="w-full h-8 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Stock Field Filters (Status, Category, Movement) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Status Filter (Hidden if Low Stock report is chosen) */}
        {filters.reportType !== "LOW_STOCK_ALERT" && (
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Stock Status
            </label>
            <div className="relative">
              <select
                value={filters.status || "ALL"}
                onChange={(e) => update("status", e.target.value as "ALL" | StockStatus)}
                className="w-full h-9 px-3 pr-8 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="HEALTHY">Healthy Stock</option>
                <option value="LOW_STOCK">Low Stock Alert</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Category Filter */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Category
          </label>
          <div className="relative">
            <select
              value={filters.categoryId || "ALL"}
              onChange={(e) => update("categoryId", e.target.value)}
              className="w-full h-9 px-3 pr-8 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
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

        {/* Movement Type Filter (if movements report) */}
        {filters.reportType === "STOCK_MOVEMENTS" && (
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Movement Action
            </label>
            <div className="relative">
              <select
                value={filters.movementType || "ALL"}
                onChange={(e) =>
                  update("movementType", e.target.value as "ALL" | StockMovementType)
                }
                className="w-full h-9 px-3 pr-8 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
              >
                <option value="ALL">All Movement Types</option>
                <option value="STOCK_IN">Stock In (+)</option>
                <option value="STOCK_OUT">Stock Out (-)</option>
                <option value="DAMAGED">Damaged Goods (-)</option>
                <option value="SALE">POS Checkout Sales (-)</option>
                <option value="ADJUSTMENT">Threshold / Count Adjustments</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Search Filter ── */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
          Search Filter (Product, SKU, Barcode, Reason)
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={filters.searchQuery || ""}
            onChange={(e) => update("searchQuery", e.target.value)}
            placeholder="Search keyword or SKU..."
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => update("searchQuery", "")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
