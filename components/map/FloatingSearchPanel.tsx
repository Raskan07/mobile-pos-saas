"use client";

/**
 * FloatingSearchPanel.tsx
 *
 * Floating glass search panel for the Shop Map.
 * Provides live filtering, shop counts, and filter options.
 */

import React from "react";
import { Search, SlidersHorizontal, Plus, Store, Sparkles, X } from "lucide-react";
import { Shop } from "@/lib/types/shop";

interface FloatingSearchPanelProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: "ALL" | "active" | "inactive";
  onStatusFilterChange: (s: "ALL" | "active" | "inactive") => void;
  totalShops: number;
  filteredCount: number;
  onOpenAddShop: () => void;
}

export function FloatingSearchPanel({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  totalShops,
  filteredCount,
  onOpenAddShop,
}: FloatingSearchPanelProps) {
  return (
    <div className="absolute top-6 inset-x-6 z-30 flex items-center justify-between pointer-events-none">
      {/* ── Left Floating Search Bar ── */}
      <div
        className="pointer-events-auto flex items-center gap-3 p-2 pl-4 rounded-2xl transition-all duration-300 w-full max-w-lg group"
        style={{
          background: "rgba(14, 13, 22, 0.65)",
          backdropFilter: "blur(28px) saturate(190%) brightness(1.05)",
          WebkitBackdropFilter: "blur(28px) saturate(190%) brightness(1.05)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow:
            "0 15px 35px rgba(0, 0, 0, 0.6), 0 0 25px rgba(249, 115, 22, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        <Search className="w-4 h-4 text-orange-400 flex-shrink-0" />
        
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search shops by name, ID, or owner…"
          className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />

        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="h-4 w-px bg-white/[0.1] mx-1" />

        {/* Filter Toggle */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as any)}
          className="bg-transparent text-[11px] text-zinc-300 focus:outline-none cursor-pointer pr-1"
        >
          <option value="ALL" className="bg-zinc-900 text-zinc-200">All Status</option>
          <option value="active" className="bg-zinc-900 text-emerald-400">Active</option>
          <option value="inactive" className="bg-zinc-900 text-zinc-400">Inactive</option>
        </select>
      </div>

      {/* ── Right Floating Action & Stats Pill ── */}
      <div className="pointer-events-auto flex items-center gap-3">
        {/* Count Pill */}
        <div
          className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono"
          style={{
            background: "rgba(14, 13, 22, 0.65)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
          }}
        >
          <Store className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-zinc-300">
            {filteredCount} / <span className="text-zinc-500">{totalShops} on map</span>
          </span>
        </div>

        {/* Add Shop Trigger */}
        <button
          type="button"
          onClick={onOpenAddShop}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Shop</span>
        </button>
      </div>
    </div>
  );
}
