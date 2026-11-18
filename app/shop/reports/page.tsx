"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  FileSpreadsheet,
  FileText,
  Layers,
  RefreshCw,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import {
  AccountingReportType,
  DateRangePreset,
  ReportDateFilter,
} from "@/lib/types/accountingReport";
import {
  getDateFilter,
  fetchRawAccountingData,
  getCachedRawAccountingData,
  generateMasterAccountingReport,
} from "@/lib/services/accountingReportsService";
import {
  exportAccountingReportToPdf,
  exportAccountingReportToExcel,
} from "@/lib/exporters/accountingReportsExporter";
import AccountingStatementsSidebar, {
  STATEMENTS_CONFIG,
} from "@/components/reports/AccountingStatementsSidebar";
import DateRangeDropdown from "@/components/reports/DateRangeDropdown";
import FinancialStatementsView from "@/components/reports/FinancialStatementsView";
import { IOSSpinner } from "@/components/ui/IOSSpinner";
import { getStoredReceiptSettings, fetchReceiptSettings } from "@/lib/services/receiptSettingsService";

function ReportsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, user, isAuthenticated, isLoading: authLoading } = useShopAuth();
  const { isShopAdmin } = useRBAC();

  // Active Report Type from query param or default to "pnl"
  const initialType = (searchParams.get("report") as AccountingReportType) || "pnl";
  const [activeReport, setActiveReport] = useState<AccountingReportType>(
    STATEMENTS_CONFIG.some((s) => s.id === initialType) ? initialType : "pnl"
  );

  // Open/Close Modal State for Statements Sidebar
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Date Filter State
  const [datePreset, setDatePreset] = useState<DateRangePreset>("this_month");
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Raw fetched data state
  const [rawData, setRawData] = useState<{
    sales: any[];
    purchases: any[];
    products: any[];
    customers: any[];
    expenses: any[];
    repairs: any[];
    repairParts: any[];
    installments?: any[];
  }>({ sales: [], purchases: [], products: [], customers: [], expenses: [], repairs: [], repairParts: [], installments: [] });

  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Compute Active Date Filter
  const dateFilter: ReportDateFilter = useMemo(() => {
    return getDateFilter(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  // Current authenticated Shop ID
  const currentShopId = shop?.shopId || "";
  const currentShopName = shop?.shopName || currentShopId || "Store";

  const [shopCurrency, setShopCurrency] = useState<string>(() =>
    getStoredReceiptSettings(currentShopId, currentShopName).currency || "LKR"
  );

  useEffect(() => {
    if (!currentShopId) return;
    const local = getStoredReceiptSettings(currentShopId, currentShopName);
    setShopCurrency(local.currency || "LKR");
    fetchReceiptSettings(currentShopId, currentShopName).then((remote) => {
      setShopCurrency(remote.currency || "LKR");
    });
  }, [currentShopId, currentShopName]);

  const loadData = async (targetShopId: string, silent = false) => {
    if (!targetShopId) return;
    if (!silent) setIsLoadingData(true);
    try {
      const data = await fetchRawAccountingData(targetShopId);
      setRawData(data);
    } catch (err) {
      console.error("[Reports] Failed to fetch accounting raw data for shop:", targetShopId, err);
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && currentShopId) {
      const cached = getCachedRawAccountingData(currentShopId);
      if (cached) {
        setRawData(cached);
        setIsLoadingData(false);
        loadData(currentShopId, true);
      } else {
        loadData(currentShopId, false);
      }
    }
  }, [isAuthenticated, currentShopId]);

  const handleRefresh = () => {
    if (currentShopId) {
      setIsRefreshing(true);
      loadData(currentShopId, true);
    }
  };

  // Handle URL param changes when report changes
  const handleSelectReport = (reportId: AccountingReportType) => {
    setActiveReport(reportId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("report", reportId);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Generate Master Reports Data based strictly on the current shop ID
  const masterReport = useMemo(() => {
    return generateMasterAccountingReport(
      currentShopId || "SHOP",
      currentShopName,
      dateFilter,
      rawData
    );
  }, [currentShopId, currentShopName, dateFilter, rawData]);

  // Active statement config
  const activeConfig = useMemo(() => {
    return (
      STATEMENTS_CONFIG.find((s) => s.id === activeReport) ||
      STATEMENTS_CONFIG[0]
    );
  }, [activeReport]);

  // Primary Exports in Top Bar
  const handleExportPdf = () => {
    exportAccountingReportToPdf({
      reportType: activeReport,
      reportTitle: activeConfig.title,
      reportData: masterReport,
      operatorName: user?.displayName || user?.username || "Admin",
      currency: shopCurrency,
    });
  };

  const handleExportExcel = () => {
    exportAccountingReportToExcel({
      reportType: activeReport,
      reportTitle: activeConfig.title,
      reportData: masterReport,
      operatorName: user?.displayName || user?.username || "Admin",
      currency: shopCurrency,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#07080d] flex items-center justify-center">
        <IOSSpinner size={36} color="#ffffff" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col">
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#07080d]/85 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Back Navigation & Title */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer active:scale-95"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Reports &amp; SST
              </h1>
              <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hidden sm:inline">
                Accounting Engine
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <Building2 className="w-3 h-3 text-zinc-500" />
              <span className="text-zinc-300 font-medium truncate max-w-[120px] sm:max-w-none">
                {currentShopName}
              </span>
              {shop?.shopId && (
                <span className="font-mono text-[9px] text-zinc-500">({shop.shopId})</span>
              )}
            </div>
          </div>
        </div>

        {/* Center / Right: Statements Modal Trigger, Date Range, Refresh, and Exports */}
        <div className="flex items-center gap-2">
          {/* Open/Close Statements Modal Trigger Button */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-semibold text-white transition-all cursor-pointer shadow-sm active:scale-95"
            title="Open Accounting Statements Menu"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-400 hidden md:inline">Statement:</span>
            <span className="text-white font-bold max-w-[140px] truncate">{activeConfig.title}</span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
              {STATEMENTS_CONFIG.length}
            </span>
          </button>

          {/* Date Range Dropdown */}
          <DateRangeDropdown
            preset={datePreset}
            onPresetChange={(newPreset) => setDatePreset(newPreset)}
            customStart={customStart}
            customEnd={customEnd}
            onCustomRangeChange={(start, end) => {
              setCustomStart(start);
              setCustomEnd(end);
            }}
            activeLabel={dateFilter.label}
          />

          {/* Refresh Action */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            title="Refresh Report Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-white" : ""}`} />
          </button>

          {/* Export PDF (Primary) */}
          <button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Export Selected Statement as PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Export Excel (Primary) */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 hover:text-white text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Export Selected Statement as Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </header>

      {/* ── Open / Close Statements Modal ──────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-start p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 sm:w-72 max-w-[85vw] animate-in slide-in-from-left duration-200">
            <AccountingStatementsSidebar
              selectedReport={activeReport}
              onSelectReport={handleSelectReport}
              onClose={() => setIsModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Main View (Full-Width / Maximum View Area) ─────────────── */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-5 lg:p-6">
        {isLoadingData ? (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-12 flex flex-col items-center justify-center gap-3 text-center">
            <IOSSpinner size={32} color="#ffffff" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-white">
                Loading Financial Statements...
              </p>
              <p className="text-[11px] text-zinc-400 max-w-sm">
                Reconciling live ledger data, sales, purchases, and tax accounts for{" "}
                <span className="text-zinc-200 font-medium">{currentShopName}</span>.
              </p>
            </div>
          </div>
        ) : (
          <FinancialStatementsView
            reportType={activeReport}
            reportTitle={activeConfig.title}
            reportData={masterReport}
            operatorName={user?.displayName || user?.username || "Admin"}
            currency={shopCurrency}
          />
        )}
      </main>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07080d] flex items-center justify-center">
          <IOSSpinner size={36} color="#ffffff" />
        </div>
      }
    >
      <ReportsPageContent />
    </Suspense>
  );
}
