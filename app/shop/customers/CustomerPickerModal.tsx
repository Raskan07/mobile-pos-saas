"use client";

/**
 * app/shop/customers/CustomerPickerModal.tsx
 *
 * Fast Customer Picker & Instant Registration Modal for POS Billing.
 *
 * Features:
 * - Direct shortcut access (Alt+C / F2 for Quick Add, Alt+A for Search)
 * - Switch seamlessly between Search & Select and + Quick Add Customer
 * - Smart auto-detect: Typing phone or name in search allows 1-click transition to Quick Add
 * - Instant duplicate phone detection with 1-click "Attach Existing" option
 * - Auto-attaches newly created customer to the current bill in one step
 * - Keyboard shortcuts: Enter to submit, Esc to close, Alt+S/Alt+N to switch tabs
 * - Gray secondary color scheme throughout
 * - Fully multi-tenant isolated to shopId in Firestore
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Search,
  User,
  Phone,
  Mail,
  FileText,
  Star,
  UserPlus,
  Loader2,
  Check,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  subscribeToCustomers,
  filterCustomers,
  createCustomer,
} from "@/lib/services/customerService";
import { CustomerRecord } from "@/lib/types/customer";
import { AuditUser } from "@/lib/types/catalog";

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
  initialMode?: "search" | "add";
  initialSearchQuery?: string;
  currentUser?: {
    userId: string;
    username: string;
    role: string;
    displayName?: string;
  };
}

export default function CustomerPickerModal({
  shopId,
  selectedCustomerId,
  onSelect,
  onClose,
  initialMode = "search",
  initialSearchQuery = "",
  currentUser,
}: CustomerPickerModalProps) {
  const [mode, setMode] = useState<"search" | "add">(initialMode);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  // Quick Add Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-focus appropriate input on mode switch
  useEffect(() => {
    const t = setTimeout(() => {
      if (mode === "search") {
        searchInputRef.current?.focus();
      } else {
        nameInputRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(t);
  }, [mode]);

  // Handle global modal keyboard shortcuts (Esc, Alt+S, Alt+N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        setMode("search");
        return;
      }
      if (e.altKey && (e.key === "n" || e.key === "N" || e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setMode("add");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filtered = useMemo(
    () => filterCustomers(customers, searchQuery),
    [customers, searchQuery]
  );

  // Check if entered phone already matches an existing customer
  const phoneDuplicateMatch = useMemo(() => {
    const clean = phone.trim();
    if (!clean || clean.length < 4) return null;
    return customers.find(
      (c) => c.phone.replace(/[\s-]/g, "") === clean.replace(/[\s-]/g, "")
    );
  }, [customers, phone]);

  const handleSelect = (customer: CustomerRecord) => {
    onSelect({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      pointsBalance: customer.pointsBalance || 0,
    });
    onClose();
  };

  const handleWalkIn = () => {
    onSelect(null);
    onClose();
  };

  // Convert current search query to quick add fields
  const handleTransitionToQuickAdd = () => {
    const q = searchQuery.trim();
    const isDigits = /^[\d+ -]{4,}$/.test(q);
    if (isDigits) {
      setPhone(q);
      setName("");
    } else {
      setName(q);
      setPhone("");
    }
    setMode("add");
  };

  // Submit Quick Add Form
  const handleQuickAddSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setFormError("Customer name is required.");
      nameInputRef.current?.focus();
      return;
    }
    if (!trimmedPhone) {
      setFormError("Phone number is required.");
      phoneInputRef.current?.focus();
      return;
    }

    // If duplicate phone found, prompt or attach
    if (phoneDuplicateMatch) {
      setFormError(`Phone is already registered to "${phoneDuplicateMatch.name}".`);
      return;
    }

    try {
      setIsSaving(true);
      setFormError(null);

      const auditUser: AuditUser = {
        userId: currentUser?.userId || "cashier",
        username: currentUser?.username || "Cashier",
        role: currentUser?.role || "cashier",
        displayName: currentUser?.displayName || currentUser?.username || "Cashier",
      };

      const newRecord = await createCustomer(
        shopId,
        {
          name: trimmedName,
          phone: trimmedPhone,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        auditUser
      );

      // Auto attach to current sale and close modal
      onSelect({
        customerId: newRecord.id,
        name: newRecord.name,
        phone: newRecord.phone,
        email: newRecord.email,
        pointsBalance: 0,
      });

      onClose();
    } catch (err: any) {
      console.error("[CustomerPickerModal] Failed to create customer:", err);
      setFormError(err.message || "Failed to save customer. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md px-4 pb-4 sm:pb-0 transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[#0e1017] border border-zinc-800/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[88vh] text-zinc-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header Tabs: Search vs Quick Add (Gray palette) */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-zinc-800/80 bg-zinc-950/60 flex-shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-zinc-900/80 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode("search");
                setFormError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === "search"
                  ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search / Select</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("add");
                setFormError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === "add"
                  ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-zinc-300" />
              <span>+ Quick Add</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 rounded">
              Esc
            </kbd>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="w-8 h-8 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors cursor-pointer"
              title="Close modal (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── MODE 1: SEARCH & SELECT ────────────────────────────────────────── */}
        {mode === "search" && (
          <>
            {/* Search Input Bar */}
            <div className="px-4 pt-3 pb-2 flex-shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search customer name, phone, or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-9 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* If search query has no exact match, show Quick Add banner */}
            {searchQuery.trim().length > 0 && (
              <div className="px-4 pb-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleTransitionToQuickAdd}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-700/80 text-xs font-mono text-zinc-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <UserPlus className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span className="truncate">
                      Add <strong>&ldquo;{searchQuery}&rdquo;</strong> as new customer
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-300 font-semibold group-hover:translate-x-0.5 transition-transform flex-shrink-0">
                    <span>Quick Add</span>
                    <ArrowRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>
              </div>
            )}

            {/* Walk-in Guest option */}
            <div className="px-4 pb-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleWalkIn}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                  selectedCustomerId === null
                    ? "bg-zinc-800/80 border-zinc-600 text-zinc-100 shadow-sm"
                    : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-zinc-200">Walk-in Guest</p>
                  <p className="text-zinc-500 text-[10px]">No customer attached to bill</p>
                </div>
                {selectedCustomerId === null && (
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="border-t border-zinc-800/70" />
            </div>

            {/* Customer List */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5 custom-scrollbar">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                  <span className="text-xs font-mono">Loading customers…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-300 font-medium">
                      {searchQuery
                        ? `No customers match "${searchQuery}"`
                        : "No customers in this shop yet"}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Add the customer now to earn loyalty points and track sales.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTransitionToQuickAdd}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-semibold transition-all cursor-pointer shadow-md"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-zinc-300" />
                    <span>+ Quick Add Customer</span>
                  </button>
                </div>
              ) : (
                filtered.map((customer) => {
                  const isSelected = selectedCustomerId === customer.id;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleSelect(customer)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-all cursor-pointer text-left ${
                        isSelected
                          ? "bg-zinc-800/90 border-zinc-600 text-zinc-100 shadow-sm"
                          : "bg-zinc-900/30 border-zinc-800/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/40"
                      }`}
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 font-bold text-zinc-200 uppercase text-xs">
                        {customer.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-100 truncate">
                            {customer.name}
                          </span>
                          {customer.pointsBalance > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/50 border border-amber-500/30 px-1.5 py-0.5 rounded-md flex-shrink-0">
                              <Star className="w-2.5 h-2.5 fill-amber-400" />
                              {customer.pointsBalance} pts
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-[11px] flex items-center gap-1.5 mt-0.5 truncate">
                          <Phone className="w-2.5 h-2.5 text-zinc-500 flex-shrink-0" />
                          <span>{customer.phone}</span>
                          {customer.email && (
                            <>
                              <span className="text-zinc-600">•</span>
                              <span className="text-zinc-500 truncate">{customer.email}</span>
                            </>
                          )}
                        </p>
                      </div>

                      {isSelected ? (
                        <Check className="w-4 h-4 text-zinc-200 flex-shrink-0" />
                      ) : (
                        <div className="text-[10px] font-medium text-zinc-500 opacity-0 hover:opacity-100 transition-opacity">
                          Select
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── MODE 2: QUICK ADD CUSTOMER (Gray Scheme) ───────────────────────── */}
        {mode === "add" && (
          <form onSubmit={handleQuickAddSubmit} className="flex-1 flex flex-col overflow-y-auto px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                  Quick Customer Registration
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Save customer to Firestore and immediately attach to active bill.
                </p>
              </div>
            </div>

            {/* Error banner */}
            {formError && (
              <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span className="flex-1">{formError}</span>
              </div>
            )}

            {/* Duplicate detection warning with 1-click attach */}
            {phoneDuplicateMatch && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Customer already registered!</span>
                </div>
                <p className="text-[11px] text-amber-200/90">
                  A profile with phone &ldquo;{phone}&rdquo; already exists for <strong>{phoneDuplicateMatch.name}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => handleSelect(phoneDuplicateMatch)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Attach &ldquo;{phoneDuplicateMatch.name}&rdquo; to Bill</span>
                </button>
              </div>
            )}

            {/* Name Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                <span>Customer Name <span className="text-zinc-400">*</span></span>
                <span className="text-[10px] text-zinc-500">Required</span>
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder="e.g. Kasun Perera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono transition-colors"
                />
              </div>
            </div>

            {/* Phone Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                <span>Phone Number <span className="text-zinc-400">*</span></span>
                <span className="text-[10px] text-zinc-500">Unique identifier</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={phoneInputRef}
                  type="tel"
                  required
                  placeholder="e.g. 0771234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono transition-colors"
                />
              </div>
            </div>

            {/* Email Input (Optional) */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                <span>Email Address</span>
                <span className="text-[10px] text-zinc-500">Optional</span>
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  placeholder="e.g. kasun@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono transition-colors"
                />
              </div>
            </div>

            {/* Notes / Address (Optional) */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                <span>Notes / Address</span>
                <span className="text-[10px] text-zinc-500">Optional</span>
              </label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="e.g. Regular client, Colombo 03"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono transition-colors"
                />
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center gap-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setMode("search")}
                disabled={isSaving}
                className="px-3.5 py-2.5 rounded-xl border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Back to Search
              </button>

              <button
                type="submit"
                disabled={isSaving || !!phoneDuplicateMatch}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-zinc-700 via-zinc-700 to-zinc-600 hover:from-zinc-600 hover:to-zinc-500 border border-zinc-600/60 text-white font-bold text-xs shadow-lg shadow-black/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                    <span>Saving to Firestore…</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-zinc-200" />
                    <span>Save & Attach to Bill</span>
                    <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[9px] font-mono bg-zinc-800/90 border border-zinc-600/60 rounded text-zinc-300">
                      Enter
                    </kbd>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
