"use client";

import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  Scale,
  Waves,
  Columns2,
  ReceiptText,
  Package,
  ClipboardList,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Landmark,
  Percent,
  Search,
  X,
  Layers,
  ChevronRight,
  Wrench,
} from "lucide-react";
import { AccountingReportType } from "@/lib/types/accountingReport";

export interface StatementConfig {
  id: AccountingReportType;
  title: string;
  category: "Financials" | "Operations" | "Ledgers & Tax" | "Working Capital";
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badge?: string;
}

export const STATEMENTS_CONFIG: StatementConfig[] = [
  {
    id: "pnl",
    title: "Profit & Loss",
    category: "Financials",
    description: "Net profit, margins & operating revenue",
    icon: TrendingUp,
    accentColor: "emerald",
    badge: "Core",
  },
  {
    id: "balance_sheet",
    title: "Balance Sheet",
    category: "Financials",
    description: "Assets, liabilities & owner's equity",
    icon: Scale,
    accentColor: "blue",
    badge: "Core",
  },
  {
    id: "cash_flow",
    title: "Cash Flow Statement",
    category: "Financials",
    description: "Operating, investing & financing liquidity",
    icon: Waves,
    accentColor: "cyan",
  },
  {
    id: "trial_balance",
    title: "Trial Balance & GL",
    category: "Ledgers & Tax",
    description: "Double-entry debit/credit ledger verification",
    icon: Columns2,
    accentColor: "indigo",
  },
  {
    id: "tax_statement",
    title: "Tax Statement (SST)",
    category: "Ledgers & Tax",
    description: "Output tax, input tax & net SST payable",
    icon: Percent,
    accentColor: "purple",
    badge: "SST Audit",
  },
  {
    id: "sales_statement",
    title: "Sales Statement",
    category: "Operations",
    description: "Invoiced sales, tender methods & totals",
    icon: ReceiptText,
    accentColor: "emerald",
  },
  {
    id: "repair_statement",
    title: "Repair Statement",
    category: "Operations",
    description: "Workshop revenue, part costs & net profit",
    icon: Wrench,
    accentColor: "teal",
    badge: "Workshop",
  },
  {
    id: "inventory_valuation",
    title: "Inventory Valuation",
    category: "Operations",
    description: "Stock at cost, retail valuation & margin",
    icon: Package,
    accentColor: "amber",
  },
  {
    id: "purchase_statement",
    title: "Purchase Statement",
    category: "Operations",
    description: "Supplier POs, bills, paid & balance due",
    icon: ClipboardList,
    accentColor: "sky",
  },
  {
    id: "accounts_receivable",
    title: "Accounts Receivable",
    category: "Working Capital",
    description: "Customer credit balances & AR aging",
    icon: ArrowDownLeft,
    accentColor: "teal",
  },
  {
    id: "accounts_payable",
    title: "Accounts Payable",
    category: "Working Capital",
    description: "Supplier bills, balances due & AP aging",
    icon: ArrowUpRight,
    accentColor: "rose",
  },
  {
    id: "expense_statement",
    title: "Expense Statement",
    category: "Operations",
    description: "Overhead expenditures & deductibles",
    icon: Receipt,
    accentColor: "orange",
  },
  {
    id: "bank_cash_reconciliation",
    title: "Bank & Cash Recon",
    category: "Ledgers & Tax",
    description: "Drawer sessions, cash float & digital clearing",
    icon: Landmark,
    accentColor: "violet",
  },
];

const CATEGORIES: ("Financials" | "Operations" | "Ledgers & Tax" | "Working Capital")[] = [
  "Financials",
  "Operations",
  "Ledgers & Tax",
  "Working Capital",
];

interface AccountingStatementsSidebarProps {
  selectedReport: AccountingReportType;
  onSelectReport: (id: AccountingReportType) => void;
  onClose?: () => void;
  className?: string;
}

export default function AccountingStatementsSidebar({
  selectedReport,
  onSelectReport,
  onClose,
  className = "",
}: AccountingStatementsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter statements according to search input
  const filteredStatements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return STATEMENTS_CONFIG;
    return STATEMENTS_CONFIG.filter(
      (stmt) =>
        stmt.title.toLowerCase().includes(q) ||
        stmt.description.toLowerCase().includes(q) ||
        stmt.category.toLowerCase().includes(q) ||
        (stmt.badge && stmt.badge.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  // Group filtered statements by category
  const grouped = useMemo(() => {
    const map = new Map<string, StatementConfig[]>();
    CATEGORIES.forEach((cat) => map.set(cat, []));

    filteredStatements.forEach((stmt) => {
      const list = map.get(stmt.category) || [];
      list.push(stmt);
      map.set(stmt.category, list);
    });

    return map;
  }, [filteredStatements]);

  const handleItemClick = (id: AccountingReportType) => {
    onSelectReport(id);
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      className={`w-full rounded-2xl bg-[#0b0c14]/95 border border-white/[0.08] backdrop-blur-xl flex flex-col overflow-hidden shadow-2xl ${className}`}
    >
      {/* Sidebar Compact Header (50% smaller) */}
      <div className="p-2.5 sm:p-3 border-b border-white/[0.08] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Layers className="w-3 h-3" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white tracking-tight leading-none">Statements</h2>
              <p className="text-[9px] text-zinc-500 mt-0.5">{STATEMENTS_CONFIG.length} Reports</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.08]">
              {filteredStatements.length} / {STATEMENTS_CONFIG.length}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
                title="Close modal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Compact Search Bar */}
        <div className="relative">
          <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search statement..."
            className="w-full bg-white/[0.05] hover:bg-white/[0.08] focus:bg-white/[0.08] border border-white/[0.08] focus:border-white/20 rounded-lg pl-7 pr-6 py-1 text-[11px] text-white placeholder:text-zinc-500 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Vertical Navigation Tabs (Reduced 50% in footprint) */}
      <div className="p-1.5 sm:p-2 space-y-2.5 max-h-[calc(85vh-90px)] overflow-y-auto custom-scrollbar">
        {CATEGORIES.map((cat) => {
          const items = grouped.get(cat) || [];
          if (items.length === 0) return null;

          return (
            <div key={cat} className="space-y-0.5">
              {/* Category Header */}
              <div className="px-2 py-0.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                <span>{cat}</span>
                <span className="font-mono text-[8px] text-zinc-500">{items.length}</span>
              </div>

              {/* Items in Category */}
              <div className="space-y-0.5">
                {items.map((stmt) => {
                  const Icon = stmt.icon;
                  const isSelected = selectedReport === stmt.id;

                  return (
                    <button
                      key={stmt.id}
                      type="button"
                      onClick={() => handleItemClick(stmt.id)}
                      className={`w-full group relative text-left px-2 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-between border ${
                        isSelected
                          ? "bg-gradient-to-r from-white/[0.12] to-white/[0.06] border-white/25 shadow-sm shadow-black/30"
                          : "bg-transparent hover:bg-white/[0.04] border-transparent hover:border-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        {/* Icon (Compact 20x20) */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? "bg-white text-zinc-950 font-bold shadow-xs"
                              : "bg-white/[0.05] text-zinc-400 group-hover:text-white group-hover:bg-white/[0.09]"
                          }`}
                        >
                          <Icon className="w-3 h-3" />
                        </div>

                        {/* Title & Badge */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-[11px] font-medium leading-tight truncate transition-colors ${
                                isSelected
                                  ? "text-white font-semibold"
                                  : "text-zinc-300 group-hover:text-white"
                              }`}
                            >
                              {stmt.title}
                            </span>
                            {stmt.badge && (
                              <span
                                className={`text-[7.5px] font-semibold px-1 py-0.2 rounded shrink-0 uppercase tracking-tight ${
                                  stmt.badge === "SST Audit"
                                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                }`}
                              >
                                {stmt.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-zinc-500 truncate mt-0.5 group-hover:text-zinc-400">
                            {stmt.description}
                          </p>
                        </div>
                      </div>

                      {/* Right indicator arrow */}
                      <ChevronRight
                        className={`w-3 h-3 shrink-0 transition-all ${
                          isSelected
                            ? "text-white opacity-100"
                            : "text-zinc-500 opacity-0 group-hover:opacity-100"
                        }`}
                      />

                      {/* Active Indicator Bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredStatements.length === 0 && (
          <div className="py-6 px-3 text-center space-y-1">
            <p className="text-[11px] text-zinc-400 font-medium">No statements matched</p>
            <p className="text-[9px] text-zinc-500">
              Try searching &ldquo;tax&rdquo; or &ldquo;pnl&rdquo;.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
