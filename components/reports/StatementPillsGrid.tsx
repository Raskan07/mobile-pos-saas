"use client";

import React from "react";
import { AccountingReportType } from "@/lib/types/accountingReport";
import {
  STATEMENTS_CONFIG,
  StatementConfig,
} from "./AccountingStatementsSidebar";

export { STATEMENTS_CONFIG };
export type { StatementConfig };

interface StatementPillsGridProps {
  selectedReport: AccountingReportType;
  onSelectReport: (id: AccountingReportType) => void;
}

export default function StatementPillsGrid({
  selectedReport,
  onSelectReport,
}: StatementPillsGridProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Accounting Statements
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 border border-white/[0.08]">
            12 Reports Available
          </span>
        </div>
        <span className="text-xs text-zinc-500 hidden sm:inline">
          Click any statement button to inspect & export
        </span>
      </div>

      {/* 12 Statement Buttons Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {STATEMENTS_CONFIG.map((stmt) => {
          const Icon = stmt.icon;
          const isSelected = selectedReport === stmt.id;

          return (
            <button
              key={stmt.id}
              type="button"
              onClick={() => onSelectReport(stmt.id)}
              className={`group relative text-left p-3 rounded-xl transition-all duration-150 cursor-pointer border flex flex-col justify-between ${
                isSelected
                  ? "bg-gradient-to-b from-white/[0.12] to-white/[0.06] border-white/30 shadow-lg shadow-black/40 ring-1 ring-white/20"
                  : "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.07] hover:border-white/[0.15]"
              }`}
            >
              {/* Top Row: Icon + Badge */}
              <div className="flex items-start justify-between w-full mb-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-white text-zinc-950 font-bold"
                      : "bg-white/[0.06] text-zinc-300 group-hover:text-white group-hover:bg-white/[0.1]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                {stmt.badge && (
                  <span
                    className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                      stmt.badge === "SST Audit"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {stmt.badge}
                  </span>
                )}
              </div>

              {/* Title & Description */}
              <div>
                <h4
                  className={`text-xs font-semibold leading-snug transition-colors line-clamp-1 ${
                    isSelected
                      ? "text-white"
                      : "text-zinc-200 group-hover:text-white"
                  }`}
                >
                  {stmt.title}
                </h4>
                <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5 leading-tight group-hover:text-zinc-400">
                  {stmt.description}
                </p>
              </div>

              {/* Active Indicator Bar */}
              {isSelected && (
                <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
