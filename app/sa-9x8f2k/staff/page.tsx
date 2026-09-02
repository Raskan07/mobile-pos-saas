"use client";

/**
 * app/sa-9x8f2k/staff/page.tsx
 *
 * Staff Management Directory with transparent glassmorphism UI.
 */

import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Search,
  Store,
  ShieldCheck,
  Mail,
  Trash2,
  Layers,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ShopUser, ROLE_CONFIG } from "@/lib/types/user";
import { Shop } from "@/lib/types/shop";
import { subscribeToAllUsers, deleteUser } from "@/lib/services/userService";
import { subscribeToShops } from "@/lib/services/shopService";
import { AssignUserModal } from "@/components/shops/AssignUserModal";

export default function StaffDirectoryPage() {
  const [users, setUsers] = useState<ShopUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedShopFilter, setSelectedShopFilter] = useState<string>("ALL");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubUsers = subscribeToAllUsers((fetchedUsers) => {
      setUsers(fetchedUsers);
      setLoading(false);
    });

    const unsubShops = subscribeToShops((fetchedShops) => {
      setShops(fetchedShops);
    });

    return () => {
      unsubUsers();
      unsubShops();
    };
  }, []);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.shopId.toLowerCase().includes(q);

    const matchesShop =
      selectedShopFilter === "ALL" || u.shopId === selectedShopFilter;
    const matchesRole =
      selectedRoleFilter === "ALL" || u.role === selectedRoleFilter;

    return matchesSearch && matchesShop && matchesRole;
  });

  const handleDelete = async (user: ShopUser) => {
    if (confirm(`Remove staff user ${user.displayName}?`)) {
      try {
        await deleteUser(user.uid, user.shopId);
      } catch (err) {
        console.error("Error removing staff member:", err);
      }
    }
  };

  return (
    <AppShell defaultSectionId="shops">
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0 p-6 lg:p-8 space-y-6 relative">
        {/* ── Top Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl flex items-center justify-center text-orange-400"
              style={{
                background: "rgba(249, 115, 22, 0.12)",
                border: "1px solid rgba(249, 115, 22, 0.25)",
                boxShadow: "0 0 15px rgba(249, 115, 22, 0.15)",
              }}
            >
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
                Staff Directory & Roles
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 font-mono font-normal border border-orange-500/20">
                  {users.length} Total
                </span>
              </h1>
              <p className="text-xs text-zinc-400">
                User accounts bound to specific Shop IDs with Firebase Authentication
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAssignModalOpen(true)}
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all duration-200"
          >
            <UserPlus className="w-4 h-4" />
            <span>Assign Staff Member</span>
          </button>
        </div>

        {/* ── Transparent Glassmorphism Filters Bar ── */}
        <div
          className="p-3 rounded-2xl flex flex-wrap items-center gap-3"
          style={{
            background: "rgba(18, 17, 26, 0.45)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name, email, or Shop ID…"
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/30 border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-orange-500/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Shop Filter */}
          <div className="flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={selectedShopFilter}
              onChange={(e) => setSelectedShopFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-black/30 border border-white/[0.08] text-xs text-zinc-300 focus:border-orange-500/50"
            >
              <option value="ALL" className="bg-zinc-900">All Shops</option>
              {shops.map((s) => (
                <option key={s.shopId} value={s.shopId} className="bg-zinc-900">
                  {s.shopId} — {s.shopName}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-black/30 border border-white/[0.08] text-xs text-zinc-300 focus:border-orange-500/50"
            >
              <option value="ALL" className="bg-zinc-900">All Roles</option>
              <option value="admin" className="bg-zinc-900">Admin</option>
              <option value="manager" className="bg-zinc-900">Manager</option>
              <option value="cashier" className="bg-zinc-900">Cashier</option>
            </select>
          </div>
        </div>

        {/* ── Transparent Glassmorphic Table Container ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-400">
            <div className="w-8 h-8 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
            <span className="text-xs font-mono">Syncing staff directory…</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 px-6 text-center rounded-2xl space-y-3"
            style={{
              background: "rgba(18, 17, 26, 0.4)",
              backdropFilter: "blur(24px)",
              border: "1px dashed rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-300">No staff members found</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Try clearing search filters or click "Assign Staff Member" to add a user.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: "rgba(16, 15, 23, 0.55)",
              backdropFilter: "blur(32px) saturate(190%)",
              WebkitBackdropFilter: "blur(32px) saturate(190%)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow:
                "0 20px 50px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
            }}
          >
            <table className="w-full text-left text-xs">
              <thead
                className="border-b border-white/[0.08] text-zinc-400 font-medium uppercase tracking-wider text-[11px]"
                style={{ background: "rgba(255, 255, 255, 0.02)" }}
              >
                <tr>
                  <th className="py-4 px-5">Staff Member</th>
                  <th className="py-4 px-5">Assigned Shop</th>
                  <th className="py-4 px-5">Role</th>
                  <th className="py-4 px-5">Firebase UID</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredUsers.map((user) => {
                  const cfg = ROLE_CONFIG[user.role] || ROLE_CONFIG.cashier;
                  return (
                    <tr
                      key={user.uid}
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-zinc-200 group-hover:text-orange-200 transition-colors">
                          {user.displayName}
                        </div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 text-zinc-500" />
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold"
                          style={{
                            background: "rgba(249, 115, 22, 0.12)",
                            border: "1px solid rgba(249, 115, 22, 0.3)",
                            color: "rgb(253, 186, 116)",
                            boxShadow: "0 0 10px rgba(249, 115, 22, 0.1)",
                          }}
                        >
                          <Layers className="w-3 h-3 text-orange-400" />
                          {user.shopId}
                        </span>
                        {user.shopName && (
                          <span className="text-zinc-400 text-xs ml-2 font-normal">
                            {user.shopName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <span
                          className={`text-[10px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider ${cfg.bg} ${cfg.color} ${cfg.border} border`}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-zinc-400 font-mono text-[11px]">
                        {user.uid.substring(0, 14)}…
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors inline-flex items-center gap-1 text-xs"
                          title="Remove staff account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AssignUserModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        allShops={shops}
      />
    </AppShell>
  );
}
