"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Building2, ChevronDown, Check, Globe } from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { ALL_BRANCHES_ID } from "@/lib/types/branch";

interface BranchSelectorProps {
  className?: string;
  compact?: boolean;
}

export function BranchSelector({ className = "", compact = false }: BranchSelectorProps) {
  const {
    activeBranchId,
    activeBranchName,
    authorizedBranches,
    canSwitchBranches,
    canViewAllBranches,
    switchBranch,
  } = useShopAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen]);

  const isAll = activeBranchId === ALL_BRANCHES_ID;

  if (!canSwitchBranches) {
    return (
      <div
        title={`Active Branch: ${activeBranchName}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-zinc-300 select-none ${className}`}
      >
        <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="truncate max-w-[110px] sm:max-w-[140px] font-medium">
          {activeBranchName}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title="Switch Active Branch"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer select-none ${
          isAll
            ? "bg-violet-500/15 border-violet-500/35 text-violet-200 hover:bg-violet-500/20"
            : "bg-white/[0.05] border-white/10 text-zinc-200 hover:bg-white/[0.09] hover:border-white/20"
        }`}
      >
        {isAll ? (
          <Globe className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        ) : (
          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        )}
        <span className={`truncate ${compact ? "max-w-[90px]" : "max-w-[120px] sm:max-w-[150px]"}`}>
          {activeBranchName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ top: coords.top, right: coords.right }}
            className="fixed z-[9999] w-64 rounded-2xl bg-[#111018]/95 backdrop-blur-xl border border-white/10 shadow-2xl p-1.5 text-zinc-200"
          >
            <div className="px-2.5 py-1.5 border-b border-white/[0.06] mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Active Branch
              </p>
            </div>

            <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
              {canViewAllBranches && (
                <button
                  type="button"
                  role="option"
                  aria-selected={isAll}
                  onClick={() => {
                    switchBranch(ALL_BRANCHES_ID, "All Branches");
                    setIsOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 rounded-xl text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isAll
                      ? "bg-violet-500/15 text-violet-200"
                      : "hover:bg-white/[0.06] text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">All Branches</p>
                      <p className="text-[10px] text-zinc-400">Consolidated business view</p>
                    </div>
                  </div>
                  {isAll && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                </button>
              )}

              {authorizedBranches.map((branch) => {
                const selected = activeBranchId === branch.branchId;
                return (
                  <button
                    key={branch.branchId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      switchBranch(branch.branchId, branch.name);
                      setIsOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      selected
                        ? "bg-emerald-500/15 text-emerald-200"
                        : "hover:bg-white/[0.06] text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{branch.name}</p>
                        <p className="text-[10px] text-zinc-400 font-mono truncate">
                          {branch.code}
                          {branch.isDefault ? " · Default" : ""}
                        </p>
                      </div>
                    </div>
                    {selected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

