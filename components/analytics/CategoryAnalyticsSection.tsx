"use client";

/**
 * components/analytics/CategoryAnalyticsSection.tsx
 *
 * Category-level distribution & revenue share derived from the single filtered dataset.
 */

import React from "react";
import { FolderTree, PieChart, Layers, Tag } from "lucide-react";
import { CategoryAnalyticsItem } from "@/lib/services/salesAnalyticsService";
import IOSFeaturedCard from "./IOSFeaturedCard";

interface CategoryAnalyticsSectionProps {
  categories: CategoryAnalyticsItem[];
  currencySymbol?: string;
}

export default function CategoryAnalyticsSection({
  categories,
  currencySymbol = "LKR",
}: CategoryAnalyticsSectionProps) {
  const topCategory = categories[0];
  const totalCategoryRevenue = categories.reduce((sum, c) => sum + c.grossRevenue, 0);

  // Palette of subtle neon accents for categories
  const barColors = [
    "bg-emerald-400",
    "bg-blue-400",
    "bg-purple-400",
    "bg-amber-400",
    "bg-cyan-400",
    "bg-rose-400",
    "bg-indigo-400",
    "bg-teal-400",
  ];

  return (
    <div className="space-y-4">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        <IOSFeaturedCard
          eyebrow="DOMINANT CATEGORY"
          title="Top Category by Sales"
          icon={FolderTree}
          value={topCategory ? `${currencySymbol} ${topCategory.grossRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          subtitle={topCategory ? `${topCategory.categoryName} (${topCategory.percentageShare.toFixed(1)}% market share)` : "No categories recorded"}
          badge={topCategory ? { text: `${topCategory.percentageShare.toFixed(0)}% Share`, variant: "positive" } : undefined}
        />

        <IOSFeaturedCard
          eyebrow="CATEGORY SPREAD"
          title="Active Categories"
          icon={Tag}
          value={`${categories.length} Categories`}
          subtitle="Departments with confirmed orders in period"
          badge={{ text: "Departments", variant: "neutral" }}
        />

        <IOSFeaturedCard
          eyebrow="AVERAGE DEPARTMENT VALUE"
          title="Mean Revenue per Category"
          icon={PieChart}
          value={categories.length > 0 ? `${currencySymbol} ${(totalCategoryRevenue / categories.length).toFixed(2)}` : `${currencySymbol} 0.00`}
          subtitle="Equally distributed catalog weight"
          badge={{ text: "Benchmark", variant: "info" }}
        />
      </div>

      {/* ── Category Breakdown List ── */}
      <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
            DEPARTMENT ALLOCATION
          </span>
          <h3 className="text-sm font-bold text-white tracking-tight">
            Revenue Share per Product Category
          </h3>
        </div>

        {categories.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <Layers className="w-7 h-7 mx-auto text-zinc-600 mb-2" />
            <div className="text-xs">No category data available for current date range</div>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat, idx) => {
              const colorClass = barColors[idx % barColors.length];
              return (
                <div key={cat.categoryName} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
                      <span className="text-xs font-bold text-zinc-200">{cat.categoryName}</span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        ({cat.productsCount} {cat.productsCount === 1 ? "SKU" : "SKUs"})
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-white">
                        {currencySymbol} {cat.grossRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400 ml-2">
                        ({cat.percentageShare.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 w-full rounded-full bg-zinc-900 border border-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
                      style={{ width: `${Math.min(100, Math.max(2, cat.percentageShare))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
                    <span>Units Sold: {cat.unitsSold} pcs</span>
                    <span>Contribution to gross: {cat.percentageShare.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
