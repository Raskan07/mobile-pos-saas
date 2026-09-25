"use client";

/**
 * components/stock/StockReportModal.tsx
 *
 * Reusable modal for configuring, previewing, and exporting Stock Reports.
 * Features:
 * - Role-based permission check (Admin/Manager or inventory_reports permission)
 * - Embeds reusable StockReportFilters
 * - Live normalized report metrics preview
 * - Dual export buttons: Download PDF and Download XML (guaranteeing exact numerical parity)
 */

import React, { useState, useMemo } from "react";
import {
  X,
  FileText,
  FileSpreadsheet,
  Download,
  ShieldAlert,
  Layers,
  DollarSign,
  Package,
  CheckCircle2,
  Code2,
  AlertTriangle,
  History,
} from "lucide-react";
import { ProductItem, Category, AuditUser } from "@/lib/types/catalog";
import { StockTransaction } from "@/lib/types/stock";
import {
  StockReportFilters,
  NormalizedStockReport,
} from "@/lib/types/stockReport";
import {
  canUserAccessStockReports,
  buildNormalizedStockReport,
} from "@/lib/services/stockReportService";
import { downloadStockReportPdf } from "@/lib/exporters/stockPdfExporter";
import { downloadStockReportXml } from "@/lib/exporters/stockXmlExporter";
import StockReportFiltersComponent from "./StockReportFilters";

interface StockReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  shopName: string;
  branchName?: string;
  user: AuditUser;
  userRole?: string;
  userPermissions?: string[];
  products: ProductItem[];
  transactions: StockTransaction[];
  categories: Category[];
}

export default function StockReportModal({
  isOpen,
  onClose,
  shopId,
  shopName,
  branchName,
  user,
  userRole,
  userPermissions,
  products,
  transactions,
  categories,
}: StockReportModalProps) {
  // Default filter state
  const [filters, setFilters] = useState<StockReportFilters>({
    reportType: "INVENTORY_VALUATION",
    dateRangePreset: "all",
    status: "ALL",
    categoryId: "ALL",
    movementType: "ALL",
    searchQuery: "",
  });

  const [isExporting, setIsExporting] = useState(false);

  // Check access permission
  const hasAccess = useMemo(() => {
    return canUserAccessStockReports(userRole || user.role, userPermissions);
  }, [userRole, user.role, userPermissions]);

  // Compute normalized report in real-time
  const normalizedReport: NormalizedStockReport = useMemo(() => {
    return buildNormalizedStockReport({
      shopId,
      shopName,
      branchName,
      user,
      products,
      transactions,
      categories,
      filters,
    });
  }, [shopId, shopName, branchName, user, products, transactions, categories, filters]);

  // Format currency
  const fmt = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Export handlers
  const handleDownloadPdf = () => {
    setIsExporting(true);
    try {
      downloadStockReportPdf(normalizedReport);
    } catch (err) {
      console.error("[StockReportModal] PDF export error:", err);
      alert("Failed to generate PDF report.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadXml = () => {
    setIsExporting(true);
    try {
      downloadStockReportXml(normalizedReport);
    } catch (err) {
      console.error("[StockReportModal] XML export error:", err);
      alert("Failed to generate XML report.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/70 flex items-center justify-center text-zinc-300">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Stock Reporting & Data Exporter
              </h3>
              <p className="text-[11px] text-zinc-400">
                Multi-tenant normalized reporting for {shopName} ({shopId})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 text-xs">
          {/* Permission Warning */}
          {!hasAccess ? (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-900/50 flex items-start gap-3 text-amber-300">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold block text-sm mb-0.5">
                  Report Access Restricted
                </span>
                <p className="text-xs text-amber-200/80">
                  Your current user role (<strong>{userRole || user.role}</strong>) does not have
                  authorization to generate stock valuations or financial exports. Please contact an
                  administrator or manager to access this feature.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Reusable Filters Bar */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
                <StockReportFiltersComponent
                  filters={filters}
                  onFiltersChange={setFilters}
                  categories={categories}
                />
              </div>

              {/* Normalized Data Preview Summary Box */}
              <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">
                      Normalized Dataset Preview
                    </span>
                    <h4 className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {normalizedReport.metadata.reportTitle}
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                    {normalizedReport.summary.totalProducts} items matching
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-500 block">Cost Valuation</span>
                    <span className="text-xs font-bold font-mono text-zinc-200 block mt-0.5">
                      {fmt(normalizedReport.summary.totalCostValue)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-500 block">Retail Turnover</span>
                    <span className="text-xs font-bold font-mono text-zinc-200 block mt-0.5">
                      {fmt(normalizedReport.summary.totalRetailValue)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-500 block">Total Units</span>
                    <span className="text-xs font-bold font-mono text-zinc-200 block mt-0.5">
                      {normalizedReport.summary.totalUnits.toLocaleString()} units
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-500 block">Health Status</span>
                    <span className="text-[11px] font-mono text-zinc-300 block mt-0.5">
                      H:{normalizedReport.summary.healthyCount} • L:{normalizedReport.summary.lowStockCount} • O:{normalizedReport.summary.outOfStockCount}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 flex items-center justify-between pt-1 border-t border-zinc-800/60">
                  <span>
                    Scope: <strong className="text-zinc-400">{shopId}</strong> ({normalizedReport.metadata.branchName})
                  </span>
                  <span>
                    Guaranteed identical data across PDF and XML
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer / Exporter Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white transition-all cursor-pointer font-medium text-xs"
          >
            Close
          </button>

          {hasAccess && (
            <div className="flex items-center gap-2.5">
              {/* XML Download Button */}
              <button
                type="button"
                onClick={handleDownloadXml}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white text-xs font-medium transition-all cursor-pointer active:scale-95 shadow-xs"
                title="Download structured XML data set"
              >
                <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Export XML</span>
              </button>

              {/* PDF Download Button */}
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 text-xs font-medium transition-all cursor-pointer active:scale-95 shadow-sm"
                title="Download formatted enterprise PDF report"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
