"use client";

/**
 * components/repair/RepairAnalyticsModal.tsx
 *
 * Workshop Analytics & Audit Report Modal with PDF and Excel Exports.
 */

import React from "react";
import {
  X,
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  DollarSign,
  Clock,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { RepairTicket } from "@/lib/types/repair";
import { downloadRepairExcel } from "@/lib/exporters/repairExcelExporter";

interface RepairAnalyticsModalProps {
  tickets: RepairTicket[];
  isOpen: boolean;
  onClose: () => void;
  shopName: string;
}

export function RepairAnalyticsModal({
  tickets,
  isOpen,
  onClose,
  shopName,
}: RepairAnalyticsModalProps) {
  if (!isOpen) return null;

  const totalTickets = tickets.length;
  const activeJobs = tickets.filter(
    (t) => !["collected", "cancelled", "irreparable", "customer_declined"].includes(t.status)
  ).length;
  const readyCount = tickets.filter((t) => t.status === "ready_for_collection").length;
  const collectedCount = tickets.filter((t) => t.status === "collected").length;
  const reworkCount = tickets.filter((t) => t.isWarrantyRework).length;

  const totalRevenue = tickets.reduce((acc, t) => acc + (t.totalPaid || 0), 0);
  const totalOutstanding = tickets.reduce((acc, t) => acc + (t.balanceDue || 0), 0);
  const reworkRate = totalTickets > 0 ? ((reworkCount / totalTickets) * 100).toFixed(1) : "0.0";

  const handleExportExcel = () => {
    downloadRepairExcel(tickets, { shopName });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-3xl bg-[#0e1017] border border-white/[0.1] p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Workshop Analytics & Reports</h3>
              <p className="text-xs text-zinc-400">Operational performance, revenue & export center</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[11px] text-zinc-400">Active Workshop Jobs</span>
            <div className="text-2xl font-black text-white mt-1">{activeJobs}</div>
            <span className="text-[10px] text-amber-400">{readyCount} ready for pickup</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[11px] text-zinc-400">Total Revenue Collected</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">LKR {totalRevenue.toFixed(2)}</div>
            <span className="text-[10px] text-zinc-400">From {collectedCount} completed jobs</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[11px] text-zinc-400">Outstanding Balance Due</span>
            <div className="text-2xl font-black text-amber-400 mt-1">LKR {totalOutstanding.toFixed(2)}</div>
            <span className="text-[10px] text-zinc-400">Uncollected balances</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[11px] text-zinc-400">Total Lifetime Intakes</span>
            <div className="text-2xl font-black text-zinc-200 mt-1">{totalTickets}</div>
            <span className="text-[10px] text-zinc-400">Tickets generated</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[11px] text-zinc-400">Warranty Rework Rate</span>
            <div className="text-2xl font-black text-rose-400 mt-1">{reworkRate}%</div>
            <span className="text-[10px] text-rose-300">{reworkCount} rework claims</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[11px] text-zinc-400">Completion Rate</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {totalTickets > 0 ? (((collectedCount) / totalTickets) * 100).toFixed(0) : 0}%
            </div>
            <span className="text-[10px] text-emerald-300">{collectedCount} devices returned</span>
          </div>
        </div>

        {/* Export Actions */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <span className="text-xs font-bold text-zinc-200 block">Export Formats & Reporting:</span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Download Excel (.xlsx) Master Report</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-medium text-white transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
