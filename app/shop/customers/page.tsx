"use client";

/**
 * app/shop/customers/page.tsx
 *
 * Customer Management Page — Production-Ready.
 *
 * Features:
 * - Multi-tenant scoped strictly to authenticated shopId
 * - Real-time Firestore subscription via subscribeToCustomers
 * - Inline registration form (name, phone, email[optional], date of birth)
 * - Search by name or phone with instant in-memory filter
 * - Loyalty points balance visible per customer
 * - Gray secondary color scheme throughout
 * - RBAC: cashiers can view & add; admin/manager can deactivate
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Search,
  X,
  User,
  Phone,
  Mail,
  CalendarDays,
  Star,
  UserCheck,
  UserX,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
  Gift,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  subscribeToCustomers,
  createCustomer,
  updateCustomer,
  filterCustomers,
} from "@/lib/services/customerService";
import { CustomerRecord, CreateCustomerInput } from "@/lib/types/customer";

// ── RBAC helper ──────────────────────────────────────────────────────────────

function canManageCustomers(role?: string, permissions?: string[]): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  if (r === "admin" || r === "manager") return true;
  if (permissions && Array.isArray(permissions)) {
    return (
      permissions.includes("customers") ||
      permissions.includes("manage_customers") ||
      permissions.includes("admin")
    );
  }
  return false;
}

// ── Empty form ───────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateCustomerInput = {
  name: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  notes: "",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter();
  const { shop, user, isAuthenticated, isLoading: authLoading } = useShopAuth();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);

  // Form state
  const [form, setForm] = useState<CreateCustomerInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/shop");
    }
  }, [authLoading, isAuthenticated, router]);

  // Real-time subscription
  useEffect(() => {
    if (!shop?.shopId) return;
    setLoading(true);
    const unsub = subscribeToCustomers(
      shop.shopId,
      (records) => {
        setCustomers(records);
        setLoading(false);
      },
      (err) => {
        console.error("[Customers] Subscription error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [shop?.shopId]);

  // Filtered list
  const filteredCustomers = useMemo(() => {
    return filterCustomers(customers, searchQuery);
  }, [customers, searchQuery]);

  const canManage = canManageCustomers(user?.role, user?.permissions);

  // ── Form handlers ──────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormSuccess(false);
  }, []);

  const handleOpenForm = () => {
    resetForm();
    setShowForm(true);
    setSelectedCustomer(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !user) return;

    setFormError(null);
    setFormSaving(true);

    try {
      await createCustomer(
        shop.shopId,
        {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email?.trim() || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          notes: form.notes?.trim() || undefined,
        },
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );

      setFormSuccess(true);
      setTimeout(() => {
        setShowForm(false);
        resetForm();
      }, 1200);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to register customer.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleActive = async (customer: CustomerRecord) => {
    if (!shop?.shopId || !user || !canManage) return;
    try {
      await updateCustomer(
        shop.shopId,
        customer.id,
        { isActive: !customer.isActive },
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );
    } catch (err) {
      console.error("[Customers] Toggle active error:", err);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#090a0f] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans selection:bg-zinc-800">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#090a0f]/95 backdrop-blur border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => router.push("/shop/dashboard")}
            className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
            <span className="text-zinc-500">{shop?.shopName || "POS"}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-semibold flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              Customers
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleOpenForm}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl w-full mx-auto">
        {/* Summary Strip */}
        <div className="flex items-center gap-2 px-1 text-xs font-mono text-zinc-400">
          <span>
            <strong className="text-zinc-100">{customers.filter((c) => c.isActive).length}</strong> active customer{customers.filter((c) => c.isActive).length !== 1 ? "s" : ""}
          </span>
          {customers.some((c) => c.loyaltyPoints > 0) && (
            <>
              <span className="text-zinc-700">•</span>
              <span className="text-zinc-400 flex items-center gap-1">
                <Gift className="w-3 h-3 text-zinc-500" />
                Loyalty active
              </span>
            </>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            id="customer-search"
            placeholder="Search by name or phone…"
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
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Customer List */}
        <section className="space-y-1.5">
          {loading ? (
            <div className="py-16 text-center text-zinc-500 font-mono text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
              Loading customers…
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl space-y-2">
              <User className="w-8 h-8 text-zinc-700 mx-auto" />
              <p className="text-xs font-mono">
                {searchQuery ? "No customers match your search." : "No customers registered yet."}
              </p>
              {!searchQuery && (
                <button
                  onClick={handleOpenForm}
                  className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline font-mono cursor-pointer"
                >
                  Register the first customer
                </button>
              )}
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                className="px-3.5 py-2.5 rounded-lg bg-zinc-950/60 hover:bg-zinc-900/80 border border-zinc-800/60 hover:border-zinc-700 transition-all flex items-center justify-between gap-3 cursor-pointer group"
              >
                {/* Left: avatar + info */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-zinc-300 uppercase">
                      {customer.name.charAt(0)}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-100 truncate">
                        {customer.name}
                      </span>
                      {!customer.isActive && (
                        <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded font-mono">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {customer.phone}
                      </span>
                      {customer.email && (
                        <span className="text-[11px] text-zinc-600 font-mono hidden sm:flex items-center gap-1 truncate max-w-[160px]">
                          <Mail className="w-3 h-3" />
                          {customer.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: loyalty + visits + toggle */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  {/* Points */}
                  {customer.pointsBalance > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3 text-zinc-500" />
                      <span>{customer.pointsBalance.toLocaleString()} pts</span>
                    </div>
                  )}

                  {/* Total visits */}
                  {customer.totalVisits > 0 && (
                    <span className="text-[11px] text-zinc-600 font-mono hidden sm:block">
                      {customer.totalVisits} visit{customer.totalVisits !== 1 ? "s" : ""}
                    </span>
                  )}

                  {/* Toggle active/inactive (manager/admin only) */}
                  {canManage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(customer);
                      }}
                      title={customer.isActive ? "Deactivate customer" : "Reactivate customer"}
                      className="w-7 h-7 rounded-md hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {customer.isActive ? (
                        <UserCheck className="w-3.5 h-3.5" />
                      ) : (
                        <UserX className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                </div>
              </div>
            ))
          )}
        </section>
      </main>

      {/* ── Registration Form Modal ── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseForm();
          }}
        >
          <div className="w-full max-w-md bg-[#0f1117] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-100">Register Customer</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseForm}
                className="w-7 h-7 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3.5">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="cust-name"
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleFormChange}
                    placeholder="e.g. Amara Silva"
                    required
                    autoFocus
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider">
                  Phone Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="cust-phone"
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleFormChange}
                    placeholder="e.g. 0712345678"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                </div>
              </div>

              {/* Email (optional) */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider flex items-center gap-1">
                  Email
                  <span className="text-zinc-600 font-sans normal-case tracking-normal text-[10px]">(optional)</span>
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="cust-email"
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleFormChange}
                    placeholder="e.g. amara@email.com"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                  />
                </div>
              </div>

              {/* Date of Birth */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider flex items-center gap-1">
                  Date of Birth
                  <span className="text-zinc-600 font-sans normal-case tracking-normal text-[10px]">(optional)</span>
                </label>
                <div className="relative">
                  <CalendarDays className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="cust-dob"
                    type="date"
                    name="dateOfBirth"
                    value={form.dateOfBirth}
                    onChange={handleFormChange}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider flex items-center gap-1">
                  Notes
                  <span className="text-zinc-600 font-sans normal-case tracking-normal text-[10px]">(optional)</span>
                </label>
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-3 pointer-events-none" />
                  <textarea
                    id="cust-notes"
                    name="notes"
                    value={form.notes}
                    onChange={handleFormChange}
                    placeholder="Any notes about this customer…"
                    rows={2}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono resize-none"
                  />
                </div>
              </div>

              {/* Error */}
              {formError && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs font-mono">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="flex-1 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving || formSuccess}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    formSuccess
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-100 hover:bg-white text-zinc-950"
                  } disabled:opacity-60`}
                >
                  {formSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : formSuccess ? (
                    "✓ Registered!"
                  ) : (
                    "Register Customer"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Customer Detail Side Panel ── */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCustomer(null);
          }}
        >
          <div className="w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <span className="text-sm font-bold text-zinc-300 uppercase">
                    {selectedCustomer.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{selectedCustomer.name}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">{selectedCustomer.phone}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="w-7 h-7 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-3">
              {/* Email */}
              {selectedCustomer.email && (
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <Mail className="w-3.5 h-3.5 text-zinc-600" />
                  {selectedCustomer.email}
                </div>
              )}

              {/* DOB */}
              {selectedCustomer.dateOfBirth && (
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <CalendarDays className="w-3.5 h-3.5 text-zinc-600" />
                  {new Date(selectedCustomer.dateOfBirth + "T00:00:00").toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <p className="text-base font-bold text-zinc-100">
                    {selectedCustomer.pointsBalance.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5 flex items-center justify-center gap-0.5">
                    <Star className="w-2.5 h-2.5" /> Points
                  </p>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <p className="text-base font-bold text-zinc-100">
                    {selectedCustomer.totalVisits}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Visits</p>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <p className="text-sm font-bold text-zinc-100">
                    {selectedCustomer.totalSpend > 0
                      ? `${(selectedCustomer.totalSpend / 1000).toFixed(1)}k`
                      : "—"}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Spend</p>
                </div>
              </div>

              {/* Notes */}
              {selectedCustomer.notes && (
                <div className="px-3 py-2 bg-zinc-900/50 border border-zinc-800/60 rounded-lg text-xs text-zinc-400 font-mono">
                  {selectedCustomer.notes}
                </div>
              )}

              {/* Status & joined */}
              <div className="flex items-center justify-between text-[11px] text-zinc-600 font-mono pt-1 border-t border-zinc-800/60">
                <span>
                  Joined {new Date(selectedCustomer.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className={selectedCustomer.isActive ? "text-emerald-500" : "text-zinc-500"}>
                  {selectedCustomer.isActive ? "● Active" : "○ Inactive"}
                </span>
              </div>

              {/* Toggle active */}
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    handleToggleActive(selectedCustomer);
                    setSelectedCustomer(null);
                  }}
                  className="w-full py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  {selectedCustomer.isActive ? "Deactivate Customer" : "Reactivate Customer"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
