"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import { DateRangePreset } from "@/lib/types/accountingReport";

export interface DateRangeDropdownProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomRangeChange: (start: string, end: string) => void;
  activeLabel: string;
}

const PRESET_OPTIONS: { id: DateRangePreset; label: string; description?: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
  { id: "all_time", label: "All Time" },
  { id: "custom", label: "Custom Range" },
];

export default function DateRangeDropdown({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomRangeChange,
  activeLabel,
}: DateRangeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localStart, setLocalStart] = useState(customStart);
  const [localEnd, setLocalEnd] = useState(customEnd);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal custom inputs if props change
  useEffect(() => {
    setLocalStart(customStart);
    setLocalEnd(customEnd);
  }, [customStart, customEnd]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelectPreset = (pId: DateRangePreset) => {
    onPresetChange(pId);
    if (pId !== "custom") {
      setIsOpen(false);
    }
  };

  const handleApplyCustom = () => {
    if (localStart && localEnd) {
      onCustomRangeChange(localStart, localEnd);
      onPresetChange("custom");
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Dropdown trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-xs font-medium text-zinc-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-[0.98]"
        title="Filter reports by date range"
      >
        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
        <span className="font-semibold">{activeLabel || "Date Filter"}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 p-3.5 rounded-2xl bg-[#0c0d15]/95 backdrop-blur-2xl border border-white/[0.12] shadow-2xl space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Reporting Window
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">Filter by Date</span>
          </div>

          {/* Preset Buttons Grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_OPTIONS.map((item) => {
              const isSelected = preset === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPreset(item.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white text-zinc-950 font-semibold shadow-sm"
                      : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <span>{item.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-zinc-950 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs Section */}
          {preset === "custom" && (
            <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                Custom Range Bounds
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={localStart}
                    onChange={(e) => setLocalStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={localEnd}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleApplyCustom}
                disabled={!localStart || !localEnd}
                className="w-full py-1.5 rounded-lg bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.12] text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
