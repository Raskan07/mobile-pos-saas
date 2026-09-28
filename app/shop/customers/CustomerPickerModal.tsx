"use client";

/**
 * app/shop/customers/CustomerPickerModal.tsx
 *
 * Reusable customer picker modal for the POS sales flow.
 * - Search by name or phone with instant in-memory filtering
 * - Shows loyalty points balance per customer
 * - Walk-in (no customer) always remains an option
 * - Never blocks a sale — customer attachment is always optional
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Search,
  User,
  Phone,
  Star,
  UserPlus,
  Loader2,
  Check,
} from "lucide-react";
import { subscribeToCustomers, filterCustomers } from "@/lib/services/customerService";
import { CustomerRecord } from "@/lib/types/customer";

export interface SelectedCustomerSummary {
  customerId: string;
  name: string;
  phone: string;
  email?: string;
  pointsBalance: number;
}

interface CustomerPickerModalProps {
  shopId: string;
  /** Currently attached customer (null = walk-in) */
  selectedCustomerId: string | null;
  onSelect: (customer: SelectedCustomerSummary | null) => void;
  onClose: () => void;
}

export default function CustomerPickerModal({
  shopId,
  selectedCustomerId,
  onSelect,
  onClose,
}: CustomerPickerModalProps) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Subscribe to customers for this shop
  useEffect(() => {
    if (!shopId) return;
    setLoading(true);
    const unsub = subscribeToCustomers(
      shopId,
      (records) => {
        setCustomers(records);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [shopId]);

  // Auto-focus search on open
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(
    () => filterCustomers(customers, searchQuery),
    [customers, searchQuery]
  );

  const handleSelect = (customer: CustomerRecord) => {
    onSelect({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      pointsBalance: customer.pointsBalance,
    });
    onClose();
  };

  const handleWalkIn = () => {
    onSelect(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Attach Customer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search name or phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-8 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Walk-in option */}
        <div className="px-4 pb-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleWalkIn}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
              selectedCustomerId === null
                ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-zinc-200">Walk-in Guest</p>
              <p className="text-zinc-500 text-[10px]">No customer attached</p>
            </div>
            {selectedCustomerId === null && (
              <Check className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="border-t border-zinc-800/60" />
        </div>

        {/* Customer List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {loading ? (
            <div className="py-8 flex flex-col items-center gap-2 text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-mono">Loading customers…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-zinc-600 text-xs font-mono">
              {searchQuery ? "No customers match your search." : "No active customers yet."}
            </div>
          ) : (
            filtered.map((customer) => {
              const isSelected = selectedCustomerId === customer.id;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelect(customer)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all cursor-pointer text-left ${
                    isSelected
                      ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                      : "border-zinc-800/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/60"
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-zinc-300 uppercase">
                      {customer.name.charAt(0)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-100 truncate">{customer.name}</p>
                    <p className="text-zinc-500 text-[10px] flex items-center gap-1 truncate">
                      <Phone className="w-2.5 h-2.5" />
                      {customer.phone}
                    </p>
                  </div>

                  {/* Points badge */}
                  {customer.pointsBalance > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      <Star className="w-2.5 h-2.5" />
                      {customer.pointsBalance}
                    </div>
                  )}

                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
