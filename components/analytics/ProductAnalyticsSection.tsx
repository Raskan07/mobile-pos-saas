"use client";

/**
 * components/analytics/ProductAnalyticsSection.tsx
 *
 * Product-level sales intelligence derived from the single filtered dataset.
 * Features:
 * - Best-sellers by Net Revenue & Quantity
 * - Product return rate audit
 * - Real-time client-side search & sort
 * - iOS featured cards styling with clean secondary gray metrics
 */

import React, { useState, useMemo } from "react";
import {
  Package,
  Search,
  ArrowUpDown,
  TrendingUp,
  RotateCcw,
  Flame,
  Award,
  Layers,
} from "lucide-react";
import { ProductAnalyticsItem } from "@/lib/services/salesAnalyticsService";
import IOSFeaturedCard from "./IOSFeaturedCard";

interface ProductAnalyticsSectionProps {
  products: {
    topByRevenue: ProductAnalyticsItem[];
    topByQuantity: ProductAnalyticsItem[];
    topReturned: ProductAnalyticsItem[];
    allProducts: ProductAnalyticsItem[];
  };
  currencySymbol?: string;
}

export default function ProductAnalyticsSection({
  products,
  currencySymbol = "LKR",
}: ProductAnalyticsSectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"netRevenue" | "unitsSold" | "returnRate">("netRevenue");
  const [activeTab, setActiveTab] = useState<"topRevenue" | "topQuantity" | "all">("topRevenue");

  const topProduct = products.topByRevenue[0];
  const mostSoldProduct = products.topByQuantity[0];

  // Filtered & Sorted items
  const displayItems = useMemo(() => {
    let list = [...products.allProducts];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q)
      );
    }

    if (sortBy === "netRevenue") {
      list.sort((a, b) => b.netRevenue - a.netRevenue);
    } else if (sortBy === "unitsSold") {
      list.sort((a, b) => b.grossUnitsSold - a.grossUnitsSold);
    } else if (sortBy === "returnRate") {
      list.sort((a, b) => b.returnRate - a.returnRate);
    }

    return list;
  }, [products.allProducts, searchTerm, sortBy]);

  return (
    <div className="space-y-4">
      {/* ── Highlight iOS Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Top Performer Card */}
        <IOSFeaturedCard
          eyebrow="TOP PERFORMER"
          title="Highest Revenue Product"
          icon={Flame}
          value={topProduct ? `${currencySymbol} ${topProduct.netRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          subtitle={topProduct ? `${topProduct.name} (${topProduct.netUnitsSold} units net sold)` : "No sales in current period"}
          badge={topProduct ? { text: "Rank #1", variant: "positive" } : undefined}
        />

        {/* Highest Volume Card */}
        <IOSFeaturedCard
          eyebrow="VOLUME LEADER"
          title="Most Units Sold"
          icon={Award}
          value={mostSoldProduct ? `${mostSoldProduct.grossUnitsSold} Units` : "0 Units"}
          subtitle={mostSoldProduct ? `${mostSoldProduct.name} (${currencySymbol} ${mostSoldProduct.netRevenue.toFixed(2)})` : "No sales in current period"}
          badge={mostSoldProduct ? { text: "Top Volume", variant: "info" } : undefined}
        />

        {/* Distinct Catalog Range */}
        <IOSFeaturedCard
          eyebrow="CATALOG DIVERSITY"
          title="Active Products Sold"
          icon={Package}
          value={`${products.allProducts.length} Items`}
          subtitle="Distinct catalog items ordered in this period"
          badge={{ text: "Active SKUs", variant: "neutral" }}
        />
      </div>

      {/* ── Table & Interactive Catalog Performance ── */}
      <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
        {/* Header Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              CATALOG PERFORMANCE
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Itemized Sales & Return Metrics
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search SKU or product…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 w-48 sm:w-56"
              />
            </div>

            {/* Sort Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSortBy("netRevenue")}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  sortBy === "netRevenue"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Revenue
              </button>
              <button
                type="button"
                onClick={() => setSortBy("unitsSold")}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  sortBy === "unitsSold"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Units
              </button>
              <button
                type="button"
                onClick={() => setSortBy("returnRate")}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  sortBy === "returnRate"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Returns
              </button>
            </div>
          </div>
        </div>

        {/* Product Items Table / Grid */}
        <div className="overflow-x-auto">
          {displayItems.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <Package className="w-8 h-8 mx-auto text-zinc-600" />
              <div className="text-xs">No products found matching criteria</div>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="py-2.5 px-3">Product / SKU</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Returns</th>
                  <th className="py-2.5 px-3 text-right">Net Units</th>
                  <th className="py-2.5 px-3 text-right">Gross Revenue</th>
                  <th className="py-2.5 px-3 text-right">Net Revenue</th>
                  <th className="py-2.5 px-3 text-right">Return Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {displayItems.map((prod, idx) => (
                  <tr key={prod.productId || idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-zinc-200">{prod.name}</div>
                      <div className="text-[10px] font-mono text-zinc-400">SKU: {prod.sku}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/5 text-[10px] text-zinc-400">
                        {prod.categoryName || "Uncategorized"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-300">
                      {prod.grossUnitsSold}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {prod.unitsReturned > 0 ? (
                        <span className="text-rose-400 font-semibold">-{prod.unitsReturned}</span>
                      ) : (
                        <span className="text-zinc-600">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-white font-bold">
                      {prod.netUnitsSold}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-400">
                      {currencySymbol} {prod.grossRevenue.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400 font-bold">
                      {currencySymbol} {prod.netRevenue.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {prod.returnRate > 0 ? (
                        <span className="text-rose-400 font-semibold">{prod.returnRate.toFixed(1)}%</span>
                      ) : (
                        <span className="text-zinc-600">0%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
