"use client";

/**
 * app/shop/role-access/page.tsx
 *
 * Role-Based Access Control (RBAC) & Staff User Management Screen.
 *
 * Design & Architecture:
 * - Minimalist top header: Just the back icon and quick add action.
 * - Secondary color palette: Neutral grey / zinc throughout.
 * - Fast user creation: Optimized minimal modal with rapid registration.
 * - Dynamic Roles: Dropdown with standard presets (Admin, Manager, Partner, Cashier)
 *   plus ability to define new custom roles (e.g. Partner, Supervisor).
 * - Comprehensive Modules: Products, Barcode, Purchases, Sales, Stock, Customers, Returns, Roles.
 * - Multi-Tenant: Filtered strictly by authenticated shopId.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  X,
  Check,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  SlidersHorizontal,
  Package,
  ScanLine,
  ClipboardList,
  Receipt,
  Warehouse,
  Users,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import {
  APP_MODULES,
  PERMISSION_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
  getEffectivePermissions,
} from "@/lib/rbac/permissions";
import {
  subscribeToUsersByShop,
  updateShopUserRBAC,
  createUserAndAssignToShop,
  deleteShopUser,
} from "@/lib/services/userService";
import { ShopUser, UserRole, PermissionKey, AppModule, getRoleBadge } from "@/lib/types/user";

export default function ShopRoleAccessPage() {
  const router = useRouter();
  const { shop, user: activeUser, isAuthenticated, isLoading: authLoading } = useShopAuth();
  const { isShopAdmin } = useRBAC();

  // Staff state
  const [users, setUsers] = useState<ShopUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Fine-tune modal state
  const [editingUser, setEditingUser] = useState<ShopUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("cashier");
  const [isCustomRoleInput, setIsCustomRoleInput] = useState(false);
  const [customRoleName, setCustomRoleName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [editStatus, setEditStatus] = useState<"active" | "suspended">("active");

  // Minimal create user modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("cashier");
  const [isNewCustomRole, setIsNewCustomRole] = useState(false);
  const [newCustomRoleName, setNewCustomRoleName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete modal
  const [userToDelete, setUserToDelete] = useState<ShopUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // ── Real-time Firestore Subscription ──────────────────────────────────────
  useEffect(() => {
    if (!shop?.shopId) return;

    setIsLoadingUsers(true);
    const unsubscribe = subscribeToUsersByShop(
      shop.shopId,
      (fetchedUsers) => {
        setUsers(fetchedUsers);
        setIsLoadingUsers(false);
      },
      (err) => {
        console.error("Error subscribing to shop staff:", err);
        setIsLoadingUsers(false);
        showToast("Failed to load staff list.", "error");
      }
    );

    return () => unsubscribe();
  }, [shop?.shopId, showToast]);

  // Dynamic list of all available roles in this shop (presets + custom created)
  const availableRoles = useMemo(() => {
    const base = ["admin", "manager", "partner", "cashier"];
    const existingFromUsers = users.map((u) => (u.role || "").toLowerCase()).filter(Boolean);
    const combined = Array.from(new Set([...base, ...existingFromUsers]));
    return combined;
  }, [users]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all") {
        if (roleFilter === "suspended") {
          if (u.status !== "suspended") return false;
        } else if ((u.role || "").toLowerCase() !== roleFilter.toLowerCase()) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (u.displayName || "").toLowerCase();
        const username = (u.username || "").toLowerCase();
        const role = (u.role || "").toLowerCase();
        return name.includes(q) || username.includes(q) || role.includes(q);
      }

      return true;
    });
  }, [users, roleFilter, searchQuery]);

  // ── Open Edit Permissions Modal ────────────────────────────────────────────
  const handleOpenEdit = (targetUser: ShopUser) => {
    setEditingUser(targetUser);
    const roleVal = targetUser.role || "cashier";
    setSelectedRole(roleVal);
    setIsCustomRoleInput(false);
    setCustomRoleName("");
    setEditStatus(targetUser.status === "suspended" ? "suspended" : "active");

    const effective = getEffectivePermissions(targetUser);
    setSelectedPermissions(effective);
  };

  // ── Role Dropdown Change Handler ───────────────────────────────────────────
  const handleRoleSelectChange = (value: string) => {
    if (value === "__create_new__") {
      setIsCustomRoleInput(true);
      setCustomRoleName("");
      return;
    }

    setIsCustomRoleInput(false);
    setSelectedRole(value);
    const lower = value.toLowerCase();
    if (ROLE_DEFAULT_PERMISSIONS[lower]) {
      setSelectedPermissions([...ROLE_DEFAULT_PERMISSIONS[lower]]);
    }
  };

  // ── Toggle Single Permission ───────────────────────────────────────────────
  const handleTogglePermission = (key: PermissionKey) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  // ── Toggle Module All ──────────────────────────────────────────────────────
  const handleToggleModuleAll = (module: AppModule) => {
    const modulePerms = PERMISSION_CATALOG.filter((p) => p.module === module).map((p) => p.key);
    const allSelected = modulePerms.every((k) => selectedPermissions.includes(k));

    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((k) => !modulePerms.includes(k)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...modulePerms])));
    }
  };

  // ── Save Permissions ───────────────────────────────────────────────────────
  const handleSavePermissions = async () => {
    if (!editingUser || !shop?.shopId) return;

    const finalRole = isCustomRoleInput
      ? customRoleName.trim().toLowerCase() || selectedRole
      : selectedRole;

    try {
      setIsSavingPermissions(true);
      await updateShopUserRBAC(shop.shopId, editingUser.uid, {
        role: finalRole as UserRole,
        permissions: selectedPermissions,
        status: editStatus,
      });

      showToast(`Permissions saved for @${editingUser.username}`);
      setEditingUser(null);
    } catch (err: any) {
      console.error("Error saving permissions:", err);
      showToast(err.message || "Failed to update permissions.", "error");
    } finally {
      setIsSavingPermissions(false);
    }
  };

  // ── Minimal Fast User Creation ─────────────────────────────────────────────
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId) return;

    setCreateError(null);
    const cleanUsername = newUsername.trim().toLowerCase();
    const cleanPassword = newPassword.trim();
    const finalRole = isNewCustomRole
      ? newCustomRoleName.trim().toLowerCase() || "custom"
      : newRole;

    if (!cleanUsername) {
      setCreateError("Username is required.");
      return;
    }

    if (!cleanPassword || cleanPassword.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      return;
    }

    try {
      setIsCreatingUser(true);
      const defaultPerms =
        ROLE_DEFAULT_PERMISSIONS[finalRole.toLowerCase()] ||
        ROLE_DEFAULT_PERMISSIONS.cashier ||
        [];

      // Fast non-blocking registration
      const createPromise = createUserAndAssignToShop(
        {
          shopId: shop.shopId,
          username: cleanUsername,
          displayName: cleanUsername,
          role: finalRole as UserRole,
          branchId: activeUser?.branchId || "main",
          branchName: activeUser?.branchName || "Main Branch",
          permissions: defaultPerms,
        },
        cleanPassword
      );

      // Auto close modal immediately so UI is snappy
      setIsCreateModalOpen(false);
      showToast(`Registering user @${cleanUsername}...`);

      await createPromise;
      showToast(`User @${cleanUsername} registered successfully!`);

      // Reset fields
      setNewUsername("");
      setNewPassword("");
      setNewRole("cashier");
      setIsNewCustomRole(false);
      setNewCustomRoleName("");
    } catch (err: any) {
      console.error("Error creating user:", err);
      showToast(err.message || "Failed to register user.", "error");
    } finally {
      setIsCreatingUser(false);
    }
  };

  // ── Toggle Active / Suspended ──────────────────────────────────────────────
  const handleToggleStatus = async (targetUser: ShopUser) => {
    if (!shop?.shopId) return;
    const nextStatus = targetUser.status === "suspended" ? "active" : "suspended";

    try {
      await updateShopUserRBAC(shop.shopId, targetUser.uid, {
        status: nextStatus,
      });
      showToast(
        `User @${targetUser.username} is now ${nextStatus === "active" ? "active" : "suspended"}.`
      );
    } catch (err: any) {
      console.error("Error toggling status:", err);
      showToast(err.message || "Failed to toggle status.", "error");
    }
  };

  // ── Delete User ────────────────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!userToDelete || !shop?.shopId) return;

    try {
      setIsDeletingUser(true);
      await deleteShopUser(shop.shopId, userToDelete.uid);
      showToast(`User @${userToDelete.username} deleted.`);
      setUserToDelete(null);
    } catch (err: any) {
      console.error("Error deleting user:", err);
      showToast(err.message || "Failed to delete user.", "error");
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Access check
  if (!authLoading && (!isAuthenticated || !isShopAdmin)) {
    return (
      <div className="min-h-screen bg-[#07080d] text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center flex flex-col items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-zinc-400" />
          <h2 className="text-base font-bold text-white">Access Restricted</h2>
          <p className="text-xs text-zinc-400">
            Only authenticated Shop Administrators can access role management.
          </p>
          <button
            onClick={() => router.push("/shop/dashboard")}
            className="w-full mt-2 py-2 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-all cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-200 flex flex-col selection:bg-zinc-700 selection:text-white">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl text-xs text-zinc-200">
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ── TOP HEADER (Minimal: Back Icon + Actions) ── */}
      <header className="sticky top-0 z-30 bg-[#07080d]/95 backdrop-blur-md border-b border-zinc-800/80 px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Back Icon Button Only */}
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Quick Right Actions */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-400 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800">
              {shop?.shopId}
            </span>

            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setIsCreateModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-100 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-5">
        {/* Search & Role Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Role Filter Tabs in grey palette */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setRoleFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                roleFilter === "all"
                  ? "bg-zinc-800 text-white border border-zinc-700"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              All
            </button>
            {availableRoles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all cursor-pointer ${
                  roleFilter === r
                    ? "bg-zinc-800 text-white border border-zinc-700"
                    : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRoleFilter("suspended")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                roleFilter === "suspended"
                  ? "bg-zinc-800 text-white border border-zinc-700"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              Suspended
            </button>
          </div>
        </div>

        {/* User List */}
        {isLoadingUsers ? (
          <div className="p-16 flex flex-col items-center justify-center gap-2.5 text-zinc-500">
            <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
            <span className="text-xs">Loading users...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 rounded-2xl bg-zinc-900/30 border border-zinc-800/60 text-center text-xs text-zinc-500">
            No users found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {filteredUsers.map((u) => {
              const roleBadge = getRoleBadge(u.role);
              const isSuspended = u.status === "suspended";

              return (
                <div
                  key={u.uid}
                  className={`p-4 rounded-xl bg-zinc-900/40 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSuspended
                      ? "border-zinc-800/80 opacity-60 bg-zinc-950/40"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {/* Left: User identity */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 font-bold text-xs">
                      {(u.username || "U").substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-100">
                          {u.displayName || u.username}
                        </span>
                        <span className="text-[11px] text-zinc-500">@{u.username}</span>
                        {u.uid === activeUser?.uid && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                            You
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        ID: {u.uid.slice(-8)}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Role Badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${roleBadge.bg} ${roleBadge.color} ${roleBadge.border}`}
                    >
                      {roleBadge.label}
                    </span>

                    {isSuspended && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                        Suspended
                      </span>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(u)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 transition-all cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-zinc-400" />
                      <span>Permissions</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(u)}
                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                      title={isSuspended ? "Activate" : "Suspend"}
                    >
                      {isSuspended ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    </button>

                    {u.uid !== activeUser?.uid && (
                      <button
                        type="button"
                        onClick={() => setUserToDelete(u)}
                        className="p-1.5 rounded-lg bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── MINIMAL ADD USER MODAL ── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4 text-zinc-200 shadow-2xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-100">Add Staff Account</span>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. cashier1"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-9 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Role Dropdown */}
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Role Preset
                </label>
                <select
                  value={isNewCustomRole ? "__create_new__" : newRole}
                  onChange={(e) => {
                    if (e.target.value === "__create_new__") {
                      setIsNewCustomRole(true);
                    } else {
                      setIsNewCustomRole(false);
                      setNewRole(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="partner">Partner</option>
                  <option value="admin">Admin</option>
                  {availableRoles
                    .filter((r) => !["cashier", "manager", "partner", "admin"].includes(r))
                    .map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  <option value="__create_new__">+ Create New Role...</option>
                </select>
              </div>

              {isNewCustomRole && (
                <div>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                    New Role Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Partner, Supervisor"
                    value={newCustomRoleName}
                    onChange={(e) => setNewCustomRoleName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isCreatingUser ? "Registering..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PERMISSIONS & ROLES MODAL ── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 space-y-5 text-zinc-200 shadow-2xl animate-in zoom-in-95 duration-100">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <span className="text-sm font-semibold text-zinc-100 block">
                  Permissions: @{editingUser.username}
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {editingUser.displayName || editingUser.username}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Role Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 block">Role</label>
              <select
                value={isCustomRoleInput ? "__create_new__" : selectedRole}
                onChange={(e) => handleRoleSelectChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="partner">Partner</option>
                <option value="admin">Admin</option>
                {availableRoles
                  .filter((r) => !["cashier", "manager", "partner", "admin"].includes(r))
                  .map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                <option value="__create_new__">+ Create New Role...</option>
              </select>

              {isCustomRoleInput && (
                <input
                  type="text"
                  placeholder="Enter role title (e.g. Partner, Supervisor)"
                  value={customRoleName}
                  onChange={(e) => setCustomRoleName(e.target.value)}
                  className="w-full px-3 py-2 mt-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              )}
            </div>

            {/* Modules & Granular Permissions List */}
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {(
                [
                  "products",
                  "barcode",
                  "purchases",
                  "sales",
                  "stock",
                  "customers",
                  "returns",
                  "roles",
                ] as AppModule[]
              ).map((moduleId) => {
                const mod = APP_MODULES[moduleId];
                const modulePerms = PERMISSION_CATALOG.filter((p) => p.module === moduleId);
                const grantedCount = modulePerms.filter((p) =>
                  selectedPermissions.includes(p.key)
                ).length;
                const allGranted = grantedCount === modulePerms.length;

                return (
                  <div
                    key={moduleId}
                    className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-200">{mod.name}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          ({grantedCount}/{modulePerms.length})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleModuleAll(moduleId)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        {allGranted ? "Deselect All" : "Select All"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {modulePerms.map((perm) => {
                        const isChecked = selectedPermissions.includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer transition-all ${
                              isChecked
                                ? "bg-zinc-800/60 border-zinc-700 text-zinc-100"
                                : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:bg-zinc-900"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePermission(perm.key)}
                              className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-zinc-400 focus:ring-0 cursor-pointer"
                            />
                            <div className="space-y-0.5">
                              <span className="text-xs font-medium block">{perm.label}</span>
                              <span className="text-[10px] text-zinc-500 leading-tight block">
                                {perm.description}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Status toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
              <span className="text-zinc-400">Account Status</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditStatus("active")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    editStatus === "active"
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditStatus("suspended")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    editStatus === "suspended"
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Suspended
                </button>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={isSavingPermissions}
                className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingPermissions ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE MODAL ── */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-xs rounded-2xl bg-zinc-900 border border-zinc-800 p-5 text-center space-y-3 text-zinc-200 shadow-2xl">
            <h3 className="text-xs font-bold text-zinc-100">Delete Account?</h3>
            <p className="text-[11px] text-zinc-400">
              Remove @{userToDelete.username}? Past sales recorded by this cashier will remain
              preserved.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isDeletingUser}
                className="flex-1 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeletingUser ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
