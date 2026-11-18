"use client";

/**
 * app/shop/role-access/page.tsx
 *
 * Complete Dynamic Role-Based Access Control (RBAC) Management Interface
 * under Main Menu -> Role Access.
 *
 * Capabilities:
 * 1. Left Section: Dynamic Role Selection (Admin, Manager, Cashier, Partner, Technician +
 *    any custom roles created in the shop or assigned to staff).
 * 2. Right Section: Permission Configuration for all 16 Main Menu Modules
 *    using permanent permission identifiers (`products`, `barcode`, `purchase_history`,
 *    `repair`, `stock_management`, `stock_analysis`, `role_access`, `sales_ledger`,
 *    `sales_analytics`, `reports_sst`, `expenditures`, `operational_summary`,
 *    `customers`, `messages`, `settings`, `installment_sales`).
 * 3. Nested Settings Submenu Permissions (`settings.receipt_modification`,
 *    `settings.store_profile`, `settings.hardware_printer`, `settings.currency`,
 *    `settings.profile`, `settings.audio_scanner`, `settings.security_lock`).
 * 4. Select All, Deselect All, Cancel / Reset Changes, Save Changes with dirty-state
 *    tracking, administrator self-lockout protection, and real-time Firestore persistence.
 * 5. Staff Accounts & Role Assignment tab + Immutable Permission Audit Logs tab.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Check,
  X,
  Plus,
  RotateCcw,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  History,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Package,
  ScanLine,
  ClipboardList,
  Wrench,
  Warehouse,
  BarChart3,
  BookOpen,
  BarChart2,
  FileText,
  Receipt,
  LayoutDashboard,
  Bell,
  Settings,
  CreditCard,
  Store,
  Printer,
  Percent,
  User,
  Volume2,
  Search,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import {
  MAIN_MENU_MODULE_REGISTRY,
  SETTINGS_SUBMENU_REGISTRY,
  normalizeRolePermissionDocument,
  buildDefaultRolePermissions,
} from "@/lib/rbac/permissions";
import {
  subscribeToAllShopRolePermissions,
  saveRolePermissionConfiguration,
  subscribeToPermissionAuditLogs,
  ensureDefaultShopRolePermissions,
  DEFAULT_SYSTEM_ROLES,
} from "@/lib/services/rolePermissionService";
import {
  subscribeToUsersByShop,
  updateShopUserRBAC,
  createUserAndAssignToShop,
  deleteShopUser,
} from "@/lib/services/userService";
import {
  ShopUser,
  UserRole,
  RolePermissionDocument,
  RolePermissionsMap,
  PermissionAuditLogRecord,
  getRoleBadge,
} from "@/lib/types/user";

type ActiveSectionTab = "permissions" | "staff" | "audit";

const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  Package,
  ScanLine,
  ClipboardList,
  Wrench,
  Warehouse,
  BarChart3,
  ShieldCheck,
  BookOpen,
  BarChart2,
  FileText,
  Receipt,
  LayoutDashboard,
  Users,
  Bell,
  Settings,
  CreditCard,
  Store,
  Printer,
  Percent,
  User,
  Volume2,
};

export default function ShopRoleAccessPage() {
  const router = useRouter();
  const { shop, user: activeUser, branches, activeBranchId, isLoading: authLoading } = useShopAuth();
  const { isShopAdmin, canAccessModule, isPermissionsLoading } = useRBAC();

  const [activeTab, setActiveTab] = useState<ActiveSectionTab>("permissions");

  // ── Firestore Role Permission Documents Map ──
  const [roleDocsMap, setRoleDocsMap] = useState<Record<string, RolePermissionDocument>>({});
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);

  // ── Selected Role & Working Draft State ──
  const [selectedRoleId, setSelectedRoleId] = useState<string>("cashier");
  const [draftPermissions, setDraftPermissions] = useState<RolePermissionsMap>({});
  const [draftSettingsSubs, setDraftSettingsSubs] = useState<Record<string, boolean>>({});
  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(true);
  const [isSavingRole, setIsSavingRole] = useState<boolean>(false);

  // ── Create New Role Modal State ──
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [newRoleIdInput, setNewRoleIdInput] = useState("");
  const [newRoleDescInput, setNewRoleDescInput] = useState("");

  // ── Shop Staff State ──
  const [users, setUsers] = useState<ShopUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [staffSearch, setStaffSearch] = useState("");
  const [heldStaffUid, setHeldStaffUid] = useState<string | null>(null);

  // ── Create Staff Modal State ──
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<string>("cashier");
  const [newUserBranchId, setNewUserBranchId] = useState<string>("main");
  const [showPassword, setShowPassword] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // ── Audit Logs State ──
  const [auditLogs, setAuditLogs] = useState<PermissionAuditLogRecord[]>([]);

  // ── Toast Notification ──
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Seed & Subscribe to Role Permissions + Staff + Audit Logs ──
  useEffect(() => {
    if (!shop?.shopId) return;

    ensureDefaultShopRolePermissions(shop.shopId, activeUser);

    setIsLoadingRoles(true);
    const unsubRoles = subscribeToAllShopRolePermissions(
      shop.shopId,
      (docsMap) => {
        setRoleDocsMap(docsMap);
        setIsLoadingRoles(false);
      },
      () => {
        setIsLoadingRoles(false);
        showToast("Failed to load role permissions from Firebase.", "error");
      }
    );

    setIsLoadingUsers(true);
    const unsubUsers = subscribeToUsersByShop(
      shop.shopId,
      (fetchedUsers) => {
        setUsers(fetchedUsers);
        setIsLoadingUsers(false);
      },
      () => setIsLoadingUsers(false)
    );

    const unsubAudit = subscribeToPermissionAuditLogs(shop.shopId, setAuditLogs);

    return () => {
      unsubRoles();
      unsubUsers();
      unsubAudit();
    };
  }, [shop?.shopId, activeUser, showToast]);

  // ── Dynamic List of All Roles in Shop ──
  const allRolesList = useMemo(() => {
    const roleSet = new Set<string>(DEFAULT_SYSTEM_ROLES);
    Object.keys(roleDocsMap).forEach((r) => roleSet.add(r.toLowerCase()));
    users.forEach((u) => {
      const r = (u.role || "").trim().toLowerCase();
      if (r) roleSet.add(r);
    });

    const shopId = shop?.shopId || "DEFAULT";
    return Array.from(roleSet).map((rId) => {
      const doc =
        roleDocsMap[rId] || normalizeRolePermissionDocument(shopId, rId, null);
      const staffCount = users.filter(
        (u) => (u.role || "").trim().toLowerCase() === rId
      ).length;
      const enabledModulesCount = MAIN_MENU_MODULE_REGISTRY.filter((m) =>
        m.id === "settings"
          ? Boolean(
              doc.permissions.settings &&
                Object.values(doc.subPermissions?.settings || {}).some(Boolean)
            )
          : Boolean(doc.permissions[m.id])
      ).length;

      return {
        roleId: rId,
        label: doc.roleLabel || rId.charAt(0).toUpperCase() + rId.slice(1).replace(/_/g, " "),
        isSystemRole: Boolean(doc.isSystemRole),
        staffCount,
        enabledModulesCount,
        doc,
      };
    });
  }, [roleDocsMap, users, shop?.shopId]);

  // Saved baseline document for the currently selected role
  const savedSelectedRoleDoc = useMemo(() => {
    const shopId = shop?.shopId || "DEFAULT";
    return (
      roleDocsMap[selectedRoleId] ||
      normalizeRolePermissionDocument(shopId, selectedRoleId, null)
    );
  }, [roleDocsMap, selectedRoleId, shop?.shopId]);

  // Sync working draft whenever `selectedRoleId` changes or initial load completes
  useEffect(() => {
    setDraftPermissions({ ...savedSelectedRoleDoc.permissions });
    setDraftSettingsSubs({
      ...(savedSelectedRoleDoc.subPermissions?.settings || {}),
    });
  }, [selectedRoleId, savedSelectedRoleDoc]);

  // Check if there are unsaved modifications compared to Firestore state
  const hasUnsavedChanges = useMemo(() => {
    for (const mod of MAIN_MENU_MODULE_REGISTRY) {
      if (Boolean(draftPermissions[mod.id]) !== Boolean(savedSelectedRoleDoc.permissions[mod.id])) {
        return true;
      }
    }
    for (const sub of SETTINGS_SUBMENU_REGISTRY) {
      const draftVal = Boolean(draftSettingsSubs[sub.subKey]);
      const savedVal = Boolean(savedSelectedRoleDoc.subPermissions?.settings?.[sub.subKey]);
      if (draftVal !== savedVal) {
        return true;
      }
    }
    return false;
  }, [draftPermissions, draftSettingsSubs, savedSelectedRoleDoc]);

  const isSelectedRoleAdmin = selectedRoleId === "admin";

  // ── Module Toggle Handler ──
  const handleToggleModule = (moduleId: string) => {
    // Administrator protection: prevent disabling `role_access` on `admin`
    if (isSelectedRoleAdmin && moduleId === "role_access") {
      showToast("Administrator Protection: 'role_access' cannot be disabled for the Admin role.", "error");
      return;
    }

    if (moduleId === "settings") {
      const nextSettingsVal = !draftPermissions.settings;
      setDraftPermissions((prev) => ({ ...prev, settings: nextSettingsVal }));

      if (nextSettingsVal) {
        // If turning Settings ON and no submenus were enabled, enable default submenus (or all)
        const anySubOn = Object.values(draftSettingsSubs).some(Boolean);
        if (!anySubOn) {
          const defaults = buildDefaultRolePermissions(selectedRoleId);
          const defaultSubs = defaults.subPermissions.settings || {};
          const hasAnyDefault = Object.values(defaultSubs).some(Boolean);
          const nextSubs: Record<string, boolean> = {};
          for (const sub of SETTINGS_SUBMENU_REGISTRY) {
            nextSubs[sub.subKey] = hasAnyDefault ? Boolean(defaultSubs[sub.subKey]) : true;
          }
          setDraftSettingsSubs(nextSubs);
        }
        setIsSettingsExpanded(true);
      } else {
        // Turning Settings OFF disables all Settings submenus
        const clearedSubs: Record<string, boolean> = {};
        for (const sub of SETTINGS_SUBMENU_REGISTRY) {
          clearedSubs[sub.subKey] = false;
        }
        setDraftSettingsSubs(clearedSubs);
      }
      return;
    }

    setDraftPermissions((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  // ── Settings Submenu Toggle Handler ──
  const handleToggleSettingsSubmenu = (subKey: string) => {
    const nextVal = !draftSettingsSubs[subKey];
    const nextSubs = {
      ...draftSettingsSubs,
      [subKey]: nextVal,
    };
    setDraftSettingsSubs(nextSubs);

    // Automatically synchronize parent `settings` permission:
    // If at least one submenu is enabled -> `settings: true`
    // If zero submenus are enabled -> `settings: false`
    const anySubEnabled = Object.values(nextSubs).some(Boolean);
    setDraftPermissions((prev) => ({
      ...prev,
      settings: anySubEnabled,
    }));
  };

  // ── Select All / Deselect All / Reset Handlers ──
  const handleSelectAll = () => {
    const nextPerms: RolePermissionsMap = {};
    for (const mod of MAIN_MENU_MODULE_REGISTRY) {
      nextPerms[mod.id] = true;
    }
    const nextSubs: Record<string, boolean> = {};
    for (const sub of SETTINGS_SUBMENU_REGISTRY) {
      nextSubs[sub.subKey] = true;
    }
    setDraftPermissions(nextPerms);
    setDraftSettingsSubs(nextSubs);
  };

  const handleDeselectAll = () => {
    const nextPerms: RolePermissionsMap = {};
    for (const mod of MAIN_MENU_MODULE_REGISTRY) {
      // Admin protection: never allow deselecting `role_access` on `admin`
      nextPerms[mod.id] = isSelectedRoleAdmin && mod.id === "role_access" ? true : false;
    }
    const nextSubs: Record<string, boolean> = {};
    for (const sub of SETTINGS_SUBMENU_REGISTRY) {
      nextSubs[sub.subKey] = false;
    }
    setDraftPermissions(nextPerms);
    setDraftSettingsSubs(nextSubs);
  };

  const handleCancelResetChanges = () => {
    setDraftPermissions({ ...savedSelectedRoleDoc.permissions });
    setDraftSettingsSubs({
      ...(savedSelectedRoleDoc.subPermissions?.settings || {}),
    });
    showToast("Reverted unsaved changes");
  };

  const handleResetToRoleDefaults = () => {
    const defaults = buildDefaultRolePermissions(selectedRoleId);
    setDraftPermissions({ ...defaults.permissions });
    setDraftSettingsSubs({ ...(defaults.subPermissions.settings || {}) });
    showToast(`Loaded recommended defaults for ${selectedRoleId}. Click Save Changes to apply.`);
  };

  // ── Save Permission Configuration to Firebase ──
  const handleSavePermissions = async () => {
    if (!shop?.shopId || !activeUser) {
      showToast("Active administrator session required", "error");
      return;
    }

    setIsSavingRole(true);
    try {
      await saveRolePermissionConfiguration({
        shopId: shop.shopId,
        roleId: selectedRoleId,
        roleLabel: savedSelectedRoleDoc.roleLabel,
        description: savedSelectedRoleDoc.description,
        permissions: draftPermissions,
        subPermissions: {
          settings: draftSettingsSubs,
        },
        adminUser: activeUser,
      });
      showToast(`Permissions saved to Firebase for role "${savedSelectedRoleDoc.roleLabel || selectedRoleId}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save permissions";
      showToast(msg, "error");
    } finally {
      setIsSavingRole(false);
    }
  };

  // ── Create Custom Role ──
  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !activeUser) return;

    const cleanRoleId = newRoleIdInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    if (!cleanRoleId) {
      showToast("Please enter a valid role name", "error");
      return;
    }

    setIsSavingRole(true);
    try {
      const defaults = buildDefaultRolePermissions(cleanRoleId);
      await saveRolePermissionConfiguration({
        shopId: shop.shopId,
        roleId: cleanRoleId,
        roleLabel: newRoleIdInput.trim(),
        description: newRoleDescInput.trim(),
        permissions: defaults.permissions,
        subPermissions: defaults.subPermissions,
        adminUser: activeUser,
      });
      setSelectedRoleId(cleanRoleId);
      setNewRoleIdInput("");
      setNewRoleDescInput("");
      setIsAddRoleOpen(false);
      showToast(`Created role "${newRoleIdInput.trim()}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create role";
      showToast(msg, "error");
    } finally {
      setIsSavingRole(false);
    }
  };

  // ── Staff Management Handlers ──
  const handleAssignUserRole = async (targetUser: ShopUser, nextRole: string) => {
    if (!shop?.shopId) return;
    // Prevent admin from demoting their own active admin account if they are the only admin
    if (
      targetUser.uid === activeUser?.uid &&
      targetUser.role === "admin" &&
      nextRole !== "admin"
    ) {
      showToast("Administrator Protection: You cannot demote your own active administrator account.", "error");
      return;
    }

    try {
      await updateShopUserRBAC(shop.shopId, targetUser.uid, {
        role: nextRole as UserRole,
      });
      showToast(`Updated @${targetUser.username} role to ${nextRole}`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to update user role", "error");
    }
  };

  const handleToggleUserStatus = async (targetUser: ShopUser) => {
    if (!shop?.shopId) return;
    if (targetUser.uid === activeUser?.uid) {
      showToast("You cannot suspend your own active account.", "error");
      return;
    }
    const nextStatus = targetUser.status === "suspended" ? "active" : "suspended";
    try {
      await updateShopUserRBAC(shop.shopId, targetUser.uid, { status: nextStatus });
      showToast(`@${targetUser.username} is now ${nextStatus}`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
    }
  };

  const handleCreateStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId) return;
    if (!newUsername.trim() || newPassword.trim().length < 6) {
      showToast("Username and password (min 6 chars) are required", "error");
      return;
    }

    setIsCreatingUser(true);
    try {
      const targetBranchId =
        newUserBranchId ||
        (activeBranchId && activeBranchId !== "ALL" ? activeBranchId : branches[0]?.branchId || "main");
      const targetBranchObj = branches.find((b) => b.branchId === targetBranchId);
      await createUserAndAssignToShop(
        {
          shopId: shop.shopId,
          username: newUsername.trim().toLowerCase(),
          displayName: newDisplayName.trim() || newUsername.trim(),
          role: newUserRole,
          branchId: targetBranchId,
          branchName: targetBranchObj?.name || "Main Branch",
          primaryBranchId: targetBranchId,
          assignedBranchIds: [targetBranchId],
          allBranchesAccess: newUserRole.toLowerCase() === "admin",
        },
        newPassword.trim()
      );
      setNewUsername("");
      setNewDisplayName("");
      setNewPassword("");
      setIsCreateUserOpen(false);
      showToast(`Staff account @${newUsername.trim().toLowerCase()} created`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to create user", "error");
    } finally {
      setIsCreatingUser(false);
    }
  };

  // ── Loading & Authorization Guard ──
  if (authLoading || isPermissionsLoading) {
    return (
      <div className="min-h-screen bg-[#07080d] text-zinc-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
          <p className="text-xs font-mono text-zinc-400">Loading Role Access Control…</p>
        </div>
      </div>
    );
  }

  if (!isShopAdmin || !canAccessModule("role_access")) {
    return (
      <div className="min-h-screen bg-[#07080d] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#0d1018] border border-rose-500/30 p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-white">Administrator Access Only</h1>
          <p className="text-xs text-zinc-400">
            Only authorized shop administrators can view or modify Role Access permissions.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/shop/dashboard")}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            Return to POS Dashboard
          </button>
        </div>
      </div>
    );
  }

  const enabledDraftModulesCount = MAIN_MENU_MODULE_REGISTRY.filter((m) =>
    m.id === "settings"
      ? Boolean(
          draftPermissions.settings &&
            Object.values(draftSettingsSubs).some(Boolean)
        )
      : Boolean(draftPermissions[m.id])
  ).length;

  const enabledDraftSettingsSubCount = SETTINGS_SUBMENU_REGISTRY.filter((s) =>
    Boolean(draftSettingsSubs[s.subKey])
  ).length;

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col select-none">
      {/* ── Toast Notification ── */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2 ${
            toast.type === "error"
              ? "bg-zinc-900 border-rose-500/40 text-rose-300"
              : "bg-zinc-900 border-emerald-500/40 text-emerald-300"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Top Header Bar ── */}
      <header className="h-16 px-4 sm:px-6 bg-[#0b0d14] border-b border-white/[0.07] flex items-center justify-between gap-4 shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Back to POS Terminal"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white leading-tight">
                Role Access & Permission Control
              </h1>
              <p className="text-[11px] text-zinc-400 font-mono">
                {shop?.shopName || "POS Store"} • {shop?.shopId || "DEFAULT"} • 16 Main Modules & Settings Submenus
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.07]">
          <button
            type="button"
            onClick={() => setActiveTab("permissions")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "permissions"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Role Permissions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "staff"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff Accounts ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "audit"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Audit Logs</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono">
              {auditLogs.length}
            </span>
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: ROLE PERMISSIONS CONFIGURATION (LEFT ROLES / RIGHT 16 MODULES)    */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "permissions" && (
        <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── LEFT SECTION: ROLE SELECTION ── */}
          <aside className="lg:col-span-4 rounded-2xl bg-[#0c0e16] border border-white/[0.07] p-4 space-y-4 lg:sticky lg:top-22">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Shop Roles ({allRolesList.length})
                </h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Select a role to configure its module & submenu access
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddRoleOpen((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Role</span>
              </button>
            </div>

            {/* Inline Create Role Form */}
            {isAddRoleOpen && (
              <form
                onSubmit={handleCreateCustomRole}
                className="p-3.5 rounded-xl bg-black/50 border border-emerald-500/30 space-y-2.5 text-xs"
              >
                <div className="font-semibold text-white">Create Custom Shop Role</div>
                <input
                  type="text"
                  value={newRoleIdInput}
                  onChange={(e) => setNewRoleIdInput(e.target.value)}
                  placeholder="Role Name (e.g. Supervisor, Accountant)"
                  className="w-full px-3 py-2 rounded-lg bg-[#0c0e16] border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  type="text"
                  value={newRoleDescInput}
                  onChange={(e) => setNewRoleDescInput(e.target.value)}
                  placeholder="Optional description"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0c0e16] border border-white/10 text-zinc-300 focus:outline-none focus:border-emerald-500/50"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddRoleOpen(false)}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingRole}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                  >
                    Create Role
                  </button>
                </div>
              </form>
            )}

            {/* Role Cards List */}
            {isLoadingRoles ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Loading roles…</span>
              </div>
            ) : (
              <div className="space-y-2">
                {allRolesList.map((roleItem) => {
                  const isSelected = roleItem.roleId === selectedRoleId;
                  const isRoleDirty = isSelected && hasUnsavedChanges;
                  return (
                    <button
                      key={roleItem.roleId}
                      type="button"
                      onClick={() => {
                        if (hasUnsavedChanges && roleItem.roleId !== selectedRoleId) {
                          if (!window.confirm("You have unsaved permission changes. Discard them and switch role?")) {
                            return;
                          }
                        }
                        setSelectedRoleId(roleItem.roleId);
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-emerald-500/12 border-emerald-500/45 shadow-lg shadow-emerald-950/20"
                          : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white capitalize truncate">
                            {roleItem.label}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-[10px] font-mono text-zinc-400">
                            {roleItem.roleId}
                          </span>
                          {roleItem.roleId === "admin" && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-mono text-amber-300">
                              Protected
                            </span>
                          )}
                          {isRoleDirty && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-400 font-mono">
                          <span>
                            {roleItem.enabledModulesCount} / {MAIN_MENU_MODULE_REGISTRY.length} modules
                          </span>
                          <span>•</span>
                          <span>
                            {roleItem.staffCount} staff
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isSelected ? "text-emerald-400 translate-x-0.5" : "text-zinc-600"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* ── RIGHT SECTION: PERMISSION CONFIGURATION FOR SELECTED ROLE ── */}
          <section className="lg:col-span-8 space-y-5">
            {/* Sticky Action & Status Header Card */}
            <div className="rounded-2xl bg-[#0c0e16] border border-white/[0.08] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-lg font-bold text-white capitalize">
                      {savedSelectedRoleDoc.roleLabel || selectedRoleId} Permissions
                    </h2>
                    <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-zinc-300">
                      shops/{shop?.shopId}/rolePermissions/{selectedRoleId}
                    </span>
                    {hasUnsavedChanges ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-semibold animate-pulse">
                        Unsaved Modifications
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
                        Synced with Firebase
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {enabledDraftModulesCount} of {MAIN_MENU_MODULE_REGISTRY.length} main modules enabled •{" "}
                    {enabledDraftSettingsSubCount} of {SETTINGS_SUBMENU_REGISTRY.length} Settings submenus enabled
                  </p>
                </div>

                {/* Primary Save & Cancel Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!hasUnsavedChanges || isSavingRole}
                    onClick={handleCancelResetChanges}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-40 border border-white/[0.08] text-xs font-medium text-zinc-300 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Cancel / Reset</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingRole}
                    onClick={handleSavePermissions}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                      hasUnsavedChanges
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
                        : "bg-emerald-600/80 hover:bg-emerald-500 text-white"
                    }`}
                  >
                    {isSavingRole ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{isSavingRole ? "Saving to Firebase…" : "Save Changes"}</span>
                  </button>
                </div>
              </div>

              {/* Bulk Toggle Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-emerald-500/20 hover:text-emerald-300 border border-white/[0.08] text-zinc-200 font-medium transition-colors cursor-pointer"
                  >
                    Select All (16 Modules)
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 hover:text-rose-300 border border-white/[0.08] text-zinc-300 font-medium transition-colors cursor-pointer"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToRoleDefaults}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                  >
                    Load Role Preset
                  </button>
                </div>

                {isSelectedRoleAdmin && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90 font-mono">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Admin Self-Lockout Protection Active</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── 16 MAIN MENU MODULES TABLE ── */}
            <div className="rounded-2xl bg-[#0c0e16] border border-white/[0.07] overflow-hidden">
              <div className="px-5 py-3.5 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
                <span>Module & Permanent Permission ID</span>
                <span>Access (ON / OFF)</span>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {MAIN_MENU_MODULE_REGISTRY.map((mod, idx) => {
                  const Icon = ICON_COMPONENTS[mod.iconName] || Package;
                  const isSettingsMod = mod.id === "settings";
                  const isEnabled = isSettingsMod
                    ? Boolean(draftPermissions.settings && enabledDraftSettingsSubCount > 0)
                    : Boolean(draftPermissions[mod.id]);
                  const isLockedAdminModule = isSelectedRoleAdmin && mod.id === "role_access";

                  return (
                    <div key={mod.id} className="flex flex-col">
                      <div
                        className={`px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                          isEnabled ? "bg-emerald-500/[0.02]" : "hover:bg-white/[0.015]"
                        }`}
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                              isEnabled
                                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400"
                                : "bg-white/[0.03] border-white/[0.07] text-zinc-500"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-mono text-zinc-500">
                                {String(idx + 1).padStart(2, "0")}.
                              </span>
                              <span className="text-sm font-bold text-white">
                                {mod.displayName}
                              </span>
                              <code className="px-2 py-0.5 rounded bg-black/50 border border-white/[0.07] text-[10px] font-mono text-emerald-300/90">
                                {mod.id}
                              </code>
                              {isLockedAdminModule && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300">
                                  <Lock className="w-2.5 h-2.5" /> Protected
                                </span>
                              )}
                              {isSettingsMod && (
                                <button
                                  type="button"
                                  onClick={() => setIsSettingsExpanded((prev) => !prev)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-[10px] font-semibold text-sky-300 cursor-pointer"
                                >
                                  <span>
                                    {enabledDraftSettingsSubCount}/{SETTINGS_SUBMENU_REGISTRY.length} Submenus
                                  </span>
                                  <ChevronDown
                                    className={`w-3 h-3 transition-transform ${
                                      isSettingsExpanded ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                              {mod.description}
                            </p>
                          </div>
                        </div>

                        {/* ON / OFF Toggle Switch */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`text-[11px] font-mono font-bold w-8 text-right ${
                              isEnabled ? "text-emerald-400" : "text-zinc-500"
                            }`}
                          >
                            {isEnabled ? "ON" : "OFF"}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            disabled={isLockedAdminModule}
                            onClick={() => handleToggleModule(mod.id)}
                            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                              isEnabled
                                ? "bg-emerald-500 border-emerald-400"
                                : "bg-zinc-800 border-zinc-700"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-150 ${
                                isEnabled ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* ── NESTED SETTINGS SUBMENU PERMISSIONS ── */}
                      {isSettingsMod && isSettingsExpanded && (
                        <div className="bg-[#080a10] border-t border-white/[0.06] px-5 py-4 pl-10 sm:pl-14 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h4 className="text-xs font-bold text-sky-300 flex items-center gap-2">
                                <Settings className="w-3.5 h-3.5" />
                                <span>Settings Submenu Permissions (Granular Control)</span>
                              </h4>
                              <p className="text-[11px] text-zinc-400 mt-0.5">
                                Users with this role will only see and access the enabled Settings submenus below. If all are OFF, Settings is hidden.
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const allOn: Record<string, boolean> = {};
                                  SETTINGS_SUBMENU_REGISTRY.forEach((s) => (allOn[s.subKey] = true));
                                  setDraftSettingsSubs(allOn);
                                  setDraftPermissions((prev) => ({ ...prev, settings: true }));
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-emerald-500/20 text-[11px] text-zinc-300 hover:text-emerald-300 border border-white/[0.07] cursor-pointer"
                              >
                                Enable All Submenus
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const allOff: Record<string, boolean> = {};
                                  SETTINGS_SUBMENU_REGISTRY.forEach((s) => (allOff[s.subKey] = false));
                                  setDraftSettingsSubs(allOff);
                                  setDraftPermissions((prev) => ({ ...prev, settings: false }));
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-[11px] text-zinc-400 hover:text-rose-300 border border-white/[0.07] cursor-pointer"
                              >
                                Disable All
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 pt-1">
                            {SETTINGS_SUBMENU_REGISTRY.map((sub) => {
                              const SubIcon = ICON_COMPONENTS[sub.iconName] || Settings;
                              const subEnabled = Boolean(draftSettingsSubs[sub.subKey]);
                              return (
                                <div
                                  key={sub.id}
                                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                                    subEnabled
                                      ? "bg-emerald-500/[0.05] border-emerald-500/30"
                                      : "bg-white/[0.015] border-white/[0.05]"
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                        subEnabled
                                          ? "bg-emerald-500/20 text-emerald-300"
                                          : "bg-white/[0.04] text-zinc-500"
                                      }`}
                                    >
                                      <SubIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-white">
                                          {sub.displayName}
                                        </span>
                                        <code className="px-1.5 py-0.2 rounded bg-black/50 border border-white/[0.06] text-[10px] font-mono text-sky-300">
                                          {sub.id}
                                        </code>
                                      </div>
                                      <p className="text-[11px] text-zinc-400 truncate">
                                        {sub.description}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <span
                                      className={`text-[10px] font-mono font-bold ${
                                        subEnabled ? "text-emerald-400" : "text-zinc-500"
                                      }`}
                                    >
                                      {subEnabled ? "ON" : "OFF"}
                                    </span>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={subEnabled}
                                      onClick={() => handleToggleSettingsSubmenu(sub.subKey)}
                                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-150 cursor-pointer ${
                                        subEnabled
                                          ? "bg-emerald-500 border-emerald-400"
                                          : "bg-zinc-800 border-zinc-700"
                                      }`}
                                    >
                                      <span
                                        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-150 ${
                                          subEnabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: STAFF ACCOUNTS & ROLE ASSIGNMENT                                  */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "staff" && (
        <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-5">
          <div className="rounded-2xl bg-[#0c0e16] border border-white/[0.07] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">Shop Staff & Role Assignment</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Assign staff accounts to roles. Each user inherits their role&apos;s live permissions for shop {shop?.shopId}.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="Search staff…"
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Staff Account</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0c0e16] border border-white/[0.07] overflow-hidden">
            {isLoadingUsers ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Loading staff accounts…</span>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {users
                  .filter((u) => {
                    if (!staffSearch.trim()) return true;
                    const q = staffSearch.toLowerCase();
                    return (
                      u.username.toLowerCase().includes(q) ||
                      (u.displayName || "").toLowerCase().includes(q) ||
                      (u.role || "").toLowerCase().includes(q)
                    );
                  })
                  .map((staff) => {
                    const badge = getRoleBadge(staff.role);
                    const isHolding = heldStaffUid === staff.uid;
                    const holdHandlers = {
                      onMouseDown: () => setHeldStaffUid(staff.uid),
                      onMouseUp: () => setHeldStaffUid(null),
                      onMouseLeave: () => {
                        if (heldStaffUid === staff.uid) setHeldStaffUid(null);
                      },
                      onTouchStart: () => setHeldStaffUid(staff.uid),
                      onTouchEnd: () => setHeldStaffUid(null),
                      onTouchCancel: () => setHeldStaffUid(null),
                    };
                    return (
                      <div
                        key={staff.uid}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.015]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center font-bold text-sm text-white">
                            {(staff.displayName || staff.username || "U").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div
                              {...holdHandlers}
                              title="Press and hold name or username to view password"
                              className="flex flex-wrap items-center gap-2 cursor-pointer select-none"
                            >
                              <span className="text-sm font-bold text-white underline decoration-dotted decoration-zinc-600 underline-offset-4">
                                {staff.displayName || staff.username}
                              </span>
                              <span className="text-xs font-mono text-emerald-400">
                                @{staff.username}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                  isHolding
                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-semibold"
                                    : "bg-white/[0.04] border-white/10 text-zinc-400"
                                }`}
                              >
                                {isHolding
                                  ? `Password: ${staff.password || "Not stored"}`
                                  : "•••••• (Hold name)"}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${badge.bg} ${badge.color} ${badge.border}`}
                              >
                                {badge.label}
                              </span>
                              {staff.status === "suspended" && (
                                <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-[10px] font-mono text-rose-300">
                                  Suspended
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                              Shop: {staff.shopId} • Branch: {staff.branchName || staff.primaryBranchId || staff.branchId || "Main Branch"} • UID: {staff.uid}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <label className="text-[11px] text-zinc-400">Assigned Role:</label>
                          <select
                            value={(staff.role || "cashier").toLowerCase()}
                            onChange={(e) => handleAssignUserRole(staff, e.target.value)}
                            className="px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                          >
                            {allRolesList.map((r) => (
                              <option key={r.roleId} value={r.roleId}>
                                {r.label} ({r.roleId})
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRoleId((staff.role || "cashier").toLowerCase());
                              setActiveTab("permissions");
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-zinc-300 cursor-pointer"
                          >
                            Configure Role
                          </button>

                          {staff.uid !== activeUser?.uid && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(staff)}
                                className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-amber-500/15 border border-white/[0.08] text-xs text-zinc-300 hover:text-amber-300 cursor-pointer"
                              >
                                {staff.status === "suspended" ? "Activate" : "Suspend"}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!shop?.shopId) return;
                                  if (!window.confirm(`Delete staff user @${staff.username}?`)) return;
                                  await deleteShopUser(shop.shopId, staff.uid);
                                  showToast(`Deleted @${staff.username}`);
                                }}
                                className="p-1.5 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                title="Delete user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: IMMUTABLE PERMISSION AUDIT LOGS                                   */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "audit" && (
        <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-4">
          <div className="rounded-2xl bg-[#0c0e16] border border-white/[0.07] p-5">
            <h2 className="text-base font-bold text-white">Permission Change Audit Trail</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Immutable audit records stored in <code className="text-emerald-300">shops/{shop?.shopId}/permissionAuditLogs</code>. Every role permission update is logged with administrator ID, role, and before/after diff.
            </p>
          </div>

          <div className="rounded-2xl bg-[#0c0e16] border border-white/[0.07] overflow-hidden">
            {auditLogs.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                No permission modifications recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {auditLogs.slice(0, 50).map((log) => (
                  <div key={log.id} className="p-4 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 font-mono text-emerald-300 font-semibold uppercase">
                          Role: {log.updatedRole}
                        </span>
                        <span className="text-zinc-300">
                          Updated by <b className="text-white">{log.adminUsername}</b>{" "}
                          <span className="font-mono text-zinc-500">({log.adminUserId})</span>
                        </span>
                      </div>
                      <span className="font-mono text-zinc-400">
                        {new Date(log.timestampMs).toLocaleString()}
                      </span>
                    </div>

                    {log.changedSummary && log.changedSummary.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {log.changedSummary.map((change, idx) => {
                          const isAdded = change.startsWith("+");
                          return (
                            <span
                              key={idx}
                              className={`px-2 py-0.5 rounded font-mono text-[11px] border ${
                                isAdded
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                              }`}
                            >
                              {change}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500 font-mono">
                        Permission snapshot saved (no key delta)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create Staff Account Modal ── */}
      {isCreateUserOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStaffMember}
            className="w-full max-w-md rounded-2xl bg-[#0e111a] border border-white/10 p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white">Create Staff Account</h3>
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Display Name</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="e.g. Nimal Perera"
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Username</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. cashier1"
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Password (min 6 chars)</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-black/50 border border-white/10 text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Assign Role</label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-semibold"
              >
                {allRolesList.map((r) => (
                  <option key={r.roleId} value={r.roleId}>
                    {r.label} ({r.roleId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Assign Branch</label>
              <select
                value={newUserBranchId}
                onChange={(e) => setNewUserBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-semibold"
              >
                {branches.length === 0 ? (
                  <option value="main">Main Branch (MAIN)</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.branchId} value={b.branchId}>
                      {b.name} ({b.code})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.06] text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingUser}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
              >
                {isCreatingUser ? "Creating…" : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
