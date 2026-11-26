/**
 * lib/rbac/permissions.ts
 *
 * Centralized, Extensible Role-Based Access Control (RBAC) Registry & Evaluators
 * for Skyfox POS Multi-Tenant SaaS.
 *
 * Features:
 * 1. Permanent unique permission IDs for all 16 Main Menu Modules (never display names).
 * 2. Hierarchical Submenu Permission Registry (e.g. `settings.receipt_modification`,
 *    `settings.store_profile`, `settings.hardware_printer`, `settings.currency`, etc.).
 * 3. Extensible Feature Registration (`registerPermissionFeature`) with safe Default-Deny
 *    for any newly introduced modules or unknown roles.
 * 4. Administrator Self-Lockout Protection: `admin` role always retains `role_access`
 *    and full administrative recovery privileges.
 * 5. Backward-compatible granular `PermissionKey` helpers (`products:view`, `sales:void`, etc.)
 *    derived dynamically from the active `RolePermissionDocument`.
 */

import {
  ShopUser,
  AppModule,
  PermissionKey,
  PermissionDefinition,
  PosModuleId,
  SettingsSubPermissionId,
  RolePermissionDocument,
  RolePermissionsMap,
  RoleSubPermissionsMap,
} from "../types/user";
import { BranchPermissionKey } from "../types/branch";

// ── 1. CENTRALIZED PERMISSION REGISTRY TYPES ─────────────────────────────────

export interface RegisteredSubPermission {
  /** Full hierarchical identifier, e.g. "settings.receipt_modification" */
  id: string;
  /** Key stored inside `subPermissions[parentModule][subKey]`, e.g. "receipt_modification" */
  subKey: SettingsSubPermissionId;
  /** Parent module ID, e.g. "settings" */
  parentModule: PosModuleId;
  /** Human-readable display name */
  displayName: string;
  /** Detailed description shown in Role Access UI */
  description: string;
  /** Maps to `?view=` query parameter in `/shop/settings` or sub-route */
  viewParam?: string;
  /** Optional dedicated route path (e.g. `/shop/settings/profile`) */
  routePath?: string;
  /** Icon identifier */
  iconName: string;
  /** Default access policy per known preset role (unknown roles default to false) */
  defaultAccessByRole: Record<string, boolean>;
}

export interface RegisteredModulePermission {
  /** Unique, permanent permission identifier (e.g. "purchase_history", "reports_sst") */
  id: PosModuleId;
  /** Display name shown in Main Menu and Role Access table */
  displayName: string;
  /** Parent module (null for top-level main menu modules) */
  parentModule: PosModuleId | null;
  /** Optional submenu definitions under this module */
  submenus?: RegisteredSubPermission[];
  /** Description of what this module controls */
  description: string;
  /** Primary navigation href in POS Main Menu */
  href: string;
  /** Additional route prefixes guarded by this module */
  routePrefixes: string[];
  /** Lucide icon name */
  iconName: string;
  /** Whether this module is locked ON for the highest-level administrator */
  adminProtected?: boolean;
  /** Default access policy for built-in roles (any unlisted role defaults to false - Default Deny) */
  defaultAccessByRole: Record<string, boolean>;
}

// ── 2. SETTINGS SUBMENU PERMISSION REGISTRY ──────────────────────────────────

export const SETTINGS_SUBMENU_REGISTRY: RegisteredSubPermission[] = [
  {
    id: "settings.receipt_modification",
    subKey: "receipt_modification",
    parentModule: "settings",
    displayName: "Receipt Modification",
    description: "Customize thermal receipt layout, store logo, header/footer text, and field visibility.",
    viewParam: "receipt",
    iconName: "Receipt",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: false,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "settings.store_profile",
    subKey: "store_profile",
    parentModule: "settings",
    displayName: "Store Profile",
    description: "Manage store name, contact phone, official email, and branch address.",
    viewParam: "store",
    iconName: "Store",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: false,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "settings.hardware_printer",
    subKey: "hardware_printer",
    parentModule: "settings",
    displayName: "Hardware & Printer Settings",
    description: "Configure 80mm/58mm thermal paper size, auto-print, and cash drawer pulse kick.",
    viewParam: "hardware",
    iconName: "Printer",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: false,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "settings.currency",
    subKey: "currency",
    parentModule: "settings",
    displayName: "Currency & Tax Settings",
    description: "Configure store currency symbol (LKR, USD, etc.), default sales tax rate, and TIN.",
    viewParam: "tax",
    iconName: "Percent",
    defaultAccessByRole: {
      admin: true,
      manager: false,
      partner: false,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "settings.profile",
    subKey: "profile",
    parentModule: "settings",
    displayName: "User Profile & Personal Notes",
    description: "Update personal staff profile, avatar image, view sales under user, and save shift notes.",
    viewParam: "profile",
    routePath: "/shop/settings/profile",
    iconName: "User",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: true,
    },
  },
  {
    id: "settings.audio_scanner",
    subKey: "audio_scanner",
    parentModule: "settings",
    displayName: "Audio & Scanner Feedback",
    description: "Configure barcode scan beep chimes and out-of-stock error alert sounds.",
    viewParam: "audio",
    iconName: "Volume2",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: false,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "settings.security_lock",
    subKey: "security_lock",
    parentModule: "settings",
    displayName: "Security & Terminal Lock",
    description: "Configure supervisor PIN requirements for refunds/voids and terminal auto-lock.",
    viewParam: "security",
    iconName: "ShieldCheck",
    defaultAccessByRole: {
      admin: true,
      manager: false,
      partner: false,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "settings.bill_transfer_logs",
    subKey: "bill_transfer_logs",
    parentModule: "settings",
    displayName: "Bill Transfer Logs",
    description: "View real-time inter-machine bill transfer logs, registered shop devices, and safe USB print queue history.",
    viewParam: "bill_transfer_logs",
    iconName: "ArrowLeftRight",
    defaultAccessByRole: {
      admin: true,
      manager: false,
      partner: false,
      cashier: false,
      technician: false,
    },
  },
];

// ── 3. THE 16 MAIN MENU MODULES PERMISSION REGISTRY ──────────────────────────

export const MAIN_MENU_MODULE_REGISTRY: RegisteredModulePermission[] = [
  {
    id: "products",
    displayName: "Products",
    parentModule: null,
    description: "Product catalog, categories, subcategories, brands, suppliers, and retail pricing.",
    href: "/shop/products",
    routePrefixes: ["/shop/products"],
    iconName: "Package",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "barcode",
    displayName: "Barcode",
    parentModule: null,
    description: "Barcode label generation, thermal sticker printing, and SKU barcode lookup.",
    href: "/shop/barcode",
    routePrefixes: ["/shop/barcode"],
    iconName: "ScanLine",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "purchase_history",
    displayName: "Purchase History",
    parentModule: null,
    description: "Supplier purchase bills, stock receiving history, and supplier payment tracking.",
    href: "/shop/purchases",
    routePrefixes: ["/shop/purchases"],
    iconName: "ClipboardList",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "repair",
    displayName: "Repair",
    parentModule: null,
    description: "Smartphone repair intake, diagnostics, technician workflow, QC checks, and repair billing.",
    href: "/shop/repair",
    routePrefixes: ["/shop/repair"],
    iconName: "Wrench",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: true,
    },
  },
  {
    id: "stock_management",
    displayName: "Stock Management",
    parentModule: null,
    description: "Warehouse inventory counts, stock adjustments, low-stock alerts, and audit trail.",
    href: "/shop/stock",
    routePrefixes: ["/shop/stock"],
    iconName: "Warehouse",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "stock_analysis",
    displayName: "Stock Analysis",
    parentModule: null,
    description: "Inventory valuation, fast/slow moving stock analytics, and reorder forecasting.",
    href: "/shop/stock/analysis",
    routePrefixes: ["/shop/stock/analysis"],
    iconName: "BarChart3",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "role_access",
    displayName: "Role Access",
    parentModule: null,
    description: "Configure role permissions, manage shop staff accounts, and review permission audit logs.",
    href: "/shop/role-access",
    routePrefixes: ["/shop/role-access"],
    iconName: "ShieldCheck",
    adminProtected: true,
    defaultAccessByRole: {
      admin: true,
      manager: false,
      partner: false,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "sales_ledger",
    displayName: "Sales Ledger",
    parentModule: null,
    description: "Complete invoice history, receipt reprints, sales returns, and item exchanges.",
    href: "/shop/ledger",
    routePrefixes: ["/shop/ledger"],
    iconName: "BookOpen",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "sales_analytics",
    displayName: "Sales Analytics",
    parentModule: null,
    description: "Revenue trends, profit margins, top-selling products, and cashier performance charts.",
    href: "/shop/analytics",
    routePrefixes: ["/shop/analytics"],
    iconName: "BarChart2",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "reports_sst",
    displayName: "Reports & SST",
    parentModule: null,
    description: "Financial statements, tax/SST compliance reports, and exportable accounting summaries.",
    href: "/shop/reports",
    routePrefixes: ["/shop/reports"],
    iconName: "FileText",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "expenditures",
    displayName: "Expenditures",
    parentModule: null,
    description: "Shop expense vouchers, recurring bills, category budgets, and ledger approvals.",
    href: "/shop/expenditure",
    routePrefixes: ["/shop/expenditure", "/shop/expenditures"],
    iconName: "Receipt",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "operational_summary",
    displayName: "Operational Summary",
    parentModule: null,
    description: "Daily sales summary, thermal statement printing, tender breakdown, and cash desk reconciliation.",
    href: "/shop/operational",
    routePrefixes: ["/shop/operational"],
    iconName: "LayoutDashboard",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "customers",
    displayName: "Customers",
    parentModule: null,
    description: "Customer directory, purchase history, loyalty points, and contact management.",
    href: "/shop/customers",
    routePrefixes: ["/shop/customers"],
    iconName: "Users",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "messages",
    displayName: "Messages",
    parentModule: null,
    description: "Shop inbox for administrative broadcasts, system updates, release notes, and billing alerts.",
    href: "/shop/notifications",
    routePrefixes: ["/shop/notifications"],
    iconName: "Bell",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "settings",
    displayName: "Settings",
    parentModule: null,
    description: "Store configuration, receipt design, hardware printers, currency/tax, and user profile.",
    href: "/shop/settings",
    routePrefixes: ["/shop/settings"],
    iconName: "Settings",
    submenus: SETTINGS_SUBMENU_REGISTRY,
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: true,
    },
  },
  {
    id: "installment_sales",
    displayName: "Installment Sales",
    parentModule: null,
    description: "Installment plans, down payments, monthly schedules, customer agreements, and overdue tracking.",
    href: "/shop/installments",
    routePrefixes: ["/shop/installments"],
    iconName: "CreditCard",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: true,
      technician: false,
    },
  },
  {
    id: "promotions",
    displayName: "Discount Management",
    parentModule: null,
    description: "Create, schedule, prioritize, and analyze promotional discounts across products, variants, categories, and brands.",
    href: "/shop/promotions",
    routePrefixes: ["/shop/promotions", "/v1-shop/promotions"],
    iconName: "Percent",
    defaultAccessByRole: {
      admin: true,
      manager: true,
      partner: true,
      cashier: false,
      technician: false,
    },
  },
  {
    id: "branch_management",
    displayName: "Branches",
    parentModule: null,
    description: "Multi-branch management: create & edit branches, assign employees, transfer stock, and view consolidated reports (Admin only).",
    href: "/shop/branches",
    routePrefixes: ["/shop/branches"],
    iconName: "Building2",
    adminProtected: true,
    defaultAccessByRole: {
      admin: true,
      manager: false,
      partner: false,
      cashier: false,
      technician: false,
    },
  },
];

// ── 4. EXTENSIBLE FEATURE REGISTRATION API (FUTURE MODULE SUPPORT) ───────────

/**
 * Dynamically registers a new top-level module into the central permission registry
 * without rewriting the permission architecture.
 * Newly registered modules follow a strict Default-Deny policy (`false`) for non-admin roles
 * unless explicitly specified.
 */
export function registerModulePermission(feature: RegisteredModulePermission): void {
  const existingIdx = MAIN_MENU_MODULE_REGISTRY.findIndex((m) => m.id === feature.id);
  const safeFeature: RegisteredModulePermission = {
    ...feature,
    defaultAccessByRole: {
      ...feature.defaultAccessByRole,
      admin: true, // Highest-level admin always retains access
    },
  };
  if (existingIdx >= 0) {
    MAIN_MENU_MODULE_REGISTRY[existingIdx] = safeFeature;
  } else {
    MAIN_MENU_MODULE_REGISTRY.push(safeFeature);
  }
}

/**
 * Dynamically registers a new submenu permission under an existing parent module (e.g. `settings`).
 */
export function registerSubmenuPermission(subFeature: RegisteredSubPermission): void {
  const safeSub: RegisteredSubPermission = {
    ...subFeature,
    defaultAccessByRole: {
      ...subFeature.defaultAccessByRole,
      admin: true,
    },
  };

  if (subFeature.parentModule === "settings") {
    const idx = SETTINGS_SUBMENU_REGISTRY.findIndex((s) => s.subKey === safeSub.subKey);
    if (idx >= 0) {
      SETTINGS_SUBMENU_REGISTRY[idx] = safeSub;
    } else {
      SETTINGS_SUBMENU_REGISTRY.push(safeSub);
    }
  }

  const parent = MAIN_MENU_MODULE_REGISTRY.find((m) => m.id === subFeature.parentModule);
  if (parent) {
    const subs = parent.submenus || [];
    const idx = subs.findIndex((s) => s.subKey === safeSub.subKey);
    if (idx >= 0) {
      subs[idx] = safeSub;
    } else {
      subs.push(safeSub);
    }
    parent.submenus = subs;
  }
}

// ── 5. DEFAULT POLICY BUILDERS & NORMALIZERS ─────────────────────────────────

/**
 * Builds the default `permissions` and `subPermissions` maps for a role.
 * Unknown/custom roles default to safe Default-Deny (`false`) except `settings.profile` (`true`).
 */
export function buildDefaultRolePermissions(roleId: string): {
  permissions: RolePermissionsMap;
  subPermissions: RoleSubPermissionsMap;
} {
  const cleanRole = (roleId || "").trim().toLowerCase();
  const isAdminRole = cleanRole === "admin";

  const permissions: RolePermissionsMap = {};
  for (const mod of MAIN_MENU_MODULE_REGISTRY) {
    if (isAdminRole) {
      permissions[mod.id] = true;
    } else {
      permissions[mod.id] = Boolean(mod.defaultAccessByRole[cleanRole] ?? false);
    }
  }

  const settingsSubs: Record<string, boolean> = {};
  for (const sub of SETTINGS_SUBMENU_REGISTRY) {
    if (isAdminRole) {
      settingsSubs[sub.subKey] = true;
    } else {
      settingsSubs[sub.subKey] = Boolean(sub.defaultAccessByRole[cleanRole] ?? false);
    }
  }

  // Ensure parent `settings` flag reflects whether at least one submenu is enabled
  const hasAnySettingsSub = Object.values(settingsSubs).some(Boolean);
  permissions.settings = isAdminRole ? true : Boolean(permissions.settings && hasAnySettingsSub);

  // Admin protection: `admin` must always have `role_access: true`
  if (isAdminRole) {
    permissions.role_access = true;
  }

  return {
    permissions,
    subPermissions: {
      settings: settingsSubs,
    },
  };
}

/**
 * Normalizes a partial or existing Firestore `RolePermissionDocument` against the live
 * `MAIN_MENU_MODULE_REGISTRY` so newly introduced modules default to `false` (or `true` for admin),
 * and `admin` protection rules are strictly enforced.
 */
export function normalizeRolePermissionDocument(
  shopId: string,
  roleId: string,
  rawDoc?: Partial<RolePermissionDocument> | null
): RolePermissionDocument {
  const cleanRole = (roleId || "cashier").trim().toLowerCase();
  const cleanShopId = (shopId || "DEFAULT").trim().toUpperCase();
  const isAdminRole = cleanRole === "admin";
  const defaults = buildDefaultRolePermissions(cleanRole);

  const mergedPermissions: RolePermissionsMap = { ...defaults.permissions };
  if (rawDoc?.permissions && typeof rawDoc.permissions === "object") {
    for (const mod of MAIN_MENU_MODULE_REGISTRY) {
      if (typeof rawDoc.permissions[mod.id] === "boolean") {
        mergedPermissions[mod.id] = rawDoc.permissions[mod.id];
      } else {
        // Safe default-deny for newly registered modules not yet saved on existing docs
        mergedPermissions[mod.id] = isAdminRole ? true : false;
      }
    }
    // Preserve any extra registered dynamic module keys
    for (const [k, v] of Object.entries(rawDoc.permissions)) {
      if (typeof v === "boolean" && !(k in mergedPermissions)) {
        mergedPermissions[k] = v;
      }
    }
  }

  const mergedSettingsSubs: Record<string, boolean> = {
    ...(defaults.subPermissions.settings || {}),
  };
  const rawSettingsSubs = rawDoc?.subPermissions?.settings;
  if (rawSettingsSubs && typeof rawSettingsSubs === "object") {
    for (const sub of SETTINGS_SUBMENU_REGISTRY) {
      if (typeof rawSettingsSubs[sub.subKey] === "boolean") {
        mergedSettingsSubs[sub.subKey] = rawSettingsSubs[sub.subKey];
      } else {
        mergedSettingsSubs[sub.subKey] = isAdminRole ? true : false;
      }
    }
    for (const [k, v] of Object.entries(rawSettingsSubs)) {
      if (typeof v === "boolean" && !(k in mergedSettingsSubs)) {
        mergedSettingsSubs[k] = v;
      }
    }
  }

  // Enforce Administrator Protection: Admin cannot lose `role_access` or core recovery access
  if (isAdminRole) {
    for (const mod of MAIN_MENU_MODULE_REGISTRY) {
      if (mod.adminProtected) {
        mergedPermissions[mod.id] = true;
      }
    }
    mergedPermissions.role_access = true;
  }

  // Synchronize `settings` parent permission with `subPermissions.settings`:
  // - If `settings` is false, no settings submenus are accessible.
  // - If all `settings` submenus are false, `settings` is false.
  const anySubEnabled = Object.values(mergedSettingsSubs).some(Boolean);
  if (!mergedPermissions.settings || !anySubEnabled) {
    mergedPermissions.settings = false;
  }

  return {
    roleId: cleanRole,
    shopId: cleanShopId,
    roleLabel:
      rawDoc?.roleLabel ||
      cleanRole.charAt(0).toUpperCase() + cleanRole.slice(1).replace(/_/g, " "),
    description: rawDoc?.description || "",
    isSystemRole: ["admin", "manager", "cashier", "partner", "technician"].includes(cleanRole),
    permissions: mergedPermissions,
    subPermissions: {
      ...rawDoc?.subPermissions,
      settings: mergedSettingsSubs,
    },
    updatedAtMs: rawDoc?.updatedAtMs || 0,
    updatedBy: rawDoc?.updatedBy || "system",
    updatedByUsername: rawDoc?.updatedByUsername || "system",
  };
}

// ── 6. HIERARCHICAL PERMISSION EVALUATORS ────────────────────────────────────

/**
 * Evaluates whether a user with a given `RolePermissionDocument` can access a top-level module
 * (one of the 16 main menu modules or any future registered module).
 */
export function evaluateModuleAccess(
  user: ShopUser | null | undefined,
  roleDoc: RolePermissionDocument | null | undefined,
  moduleId: PosModuleId
): boolean {
  if (!user || user.status === "suspended") return false;

  const cleanRole = (user.role || "").trim().toLowerCase();

  // Highest-level administrator protection
  if (cleanRole === "admin" && moduleId === "role_access") {
    return true;
  }

  // Legacy alias mapping so calls like `canAccessModule("purchases")` or `canAccessModule("roles")`
  // evaluate against the canonical 16-module IDs seamlessly
  const canonicalId = mapLegacyModuleToPosModuleId(moduleId);

  const effectiveDoc =
    roleDoc || normalizeRolePermissionDocument(user.shopId || "DEFAULT", cleanRole, null);

  if (canonicalId === "settings") {
    if (!effectiveDoc.permissions.settings) return false;
    const settingsSubs = effectiveDoc.subPermissions?.settings || {};
    return Object.values(settingsSubs).some(Boolean);
  }

  return Boolean(effectiveDoc.permissions[canonicalId]);
}

/**
 * Evaluates whether a user has access to a specific submenu permission (e.g. `settings`, `hardware_printer`).
 */
export function evaluateSubPermissionAccess(
  user: ShopUser | null | undefined,
  roleDoc: RolePermissionDocument | null | undefined,
  parentModule: PosModuleId,
  subKey: SettingsSubPermissionId
): boolean {
  if (!user || user.status === "suspended") return false;

  const cleanRole = (user.role || "").trim().toLowerCase();
  const effectiveDoc =
    roleDoc || normalizeRolePermissionDocument(user.shopId || "DEFAULT", cleanRole, null);

  // Parent module must be enabled AND the specific submenu must be enabled
  if (!effectiveDoc.permissions[parentModule]) return false;

  const parentSubs = effectiveDoc.subPermissions?.[parentModule];
  if (!parentSubs) return false;

  return Boolean(parentSubs[subKey]);
}

/**
 * Resolves a Next.js pathname (and optional `?view=` query param) to the required
 * module permission ID and optional submenu permission ID.
 */
export function resolveRoutePermissionRequirement(
  pathname: string,
  viewParam?: string | null
): {
  moduleId: PosModuleId | null;
  subKey?: SettingsSubPermissionId;
  displayName?: string;
} {
  const cleanPath = (pathname || "").split("?")[0].replace(/\/+$/, "") || "/";

  // Public or base POS terminal routes
  if (
    cleanPath === "/shop" ||
    cleanPath === "/shop/login" ||
    cleanPath === "/shop/dashboard"
  ) {
    return { moduleId: null };
  }

  // Dedicated `/shop/settings/profile` route
  if (cleanPath === "/shop/settings/profile") {
    return {
      moduleId: "settings",
      subKey: "profile",
      displayName: "User Profile & Personal Notes",
    };
  }

  // `/shop/settings` with or without `?view=...`
  if (cleanPath === "/shop/settings" || cleanPath.startsWith("/shop/settings/")) {
    if (viewParam && viewParam !== "menu") {
      const matchedSub = SETTINGS_SUBMENU_REGISTRY.find((s) => s.viewParam === viewParam);
      if (matchedSub) {
        return {
          moduleId: "settings",
          subKey: matchedSub.subKey,
          displayName: matchedSub.displayName,
        };
      }
    }
    return {
      moduleId: "settings",
      displayName: "Settings",
    };
  }

  // `/shop/stock/analysis` MUST be checked before `/shop/stock`!
  if (cleanPath === "/shop/stock/analysis" || cleanPath.startsWith("/shop/stock/analysis/")) {
    return {
      moduleId: "stock_analysis",
      displayName: "Stock Analysis",
    };
  }

  // Check all registered modules (sorted by longest route prefix first so specific routes win)
  const sortedModules = [...MAIN_MENU_MODULE_REGISTRY].sort((a, b) => {
    const maxA = Math.max(...a.routePrefixes.map((r) => r.length));
    const maxB = Math.max(...b.routePrefixes.map((r) => r.length));
    return maxB - maxA;
  });

  for (const mod of sortedModules) {
    for (const prefix of mod.routePrefixes) {
      if (cleanPath === prefix || cleanPath.startsWith(`${prefix}/`)) {
        return {
          moduleId: mod.id,
          displayName: mod.displayName,
        };
      }
    }
  }

  return { moduleId: null };
}

export function mapLegacyModuleToPosModuleId(module: AppModule | PosModuleId): PosModuleId {
  switch (module) {
    case "purchases":
      return "purchase_history";
    case "stock":
      return "stock_management";
    case "roles":
      return "role_access";
    case "repairs":
      return "repair";
    case "returns":
    case "sales":
      return "sales_ledger";
    default:
      return module;
  }
}

// ── 7. LEGACY / GRANULAR PERMISSION CATALOG COMPATIBILITY ────────────────────

export interface ModuleMetadata {
  id: AppModule;
  name: string;
  badge: string;
  description: string;
  icon: string;
}

export const APP_MODULES: Record<string, ModuleMetadata> = {
  products: {
    id: "products",
    name: "Products & Catalog",
    badge: "Catalog",
    description: "Product inventory items, variants, brands, categories and pricing.",
    icon: "Package",
  },
  barcode: {
    id: "barcode",
    name: "Barcode",
    badge: "Barcode",
    description: "Barcode label generation, printing, scanner testing and scan logs.",
    icon: "ScanLine",
  },
  purchases: {
    id: "purchases",
    name: "Purchase History",
    badge: "Purchases",
    description: "Supplier invoices, purchase orders, receiving logs and returns.",
    icon: "ClipboardList",
  },
  sales: {
    id: "sales",
    name: "Sales & POS Checkout",
    badge: "Sales",
    description: "Terminal cashier register, bill generation, discount application, and order voiding.",
    icon: "Receipt",
  },
  stock: {
    id: "stock",
    name: "Stock Management",
    badge: "Stock",
    description: "Product inventory, batch tracking, manual count adjustments, and valuation reports.",
    icon: "Warehouse",
  },
  customers: {
    id: "customers",
    name: "Customers",
    badge: "Customers",
    description: "Customer directories, contact management, purchase history, and loyalty points.",
    icon: "Users",
  },
  returns: {
    id: "returns",
    name: "Returns & Refunds",
    badge: "Returns",
    description: "Merchandise return intake, restocking, cash refund disbursement, and credit notes.",
    icon: "RotateCcw",
  },
  roles: {
    id: "roles",
    name: "Role Access",
    badge: "Roles",
    description: "Assign store roles, fine-tune module permissions, and manage staff credentials.",
    icon: "ShieldCheck",
  },
  expenditures: {
    id: "expenditures",
    name: "Expenditures & Expenses",
    badge: "Expenses",
    description: "Expense recording, recurring schedules, approval workflows, and double-entry accounting posting.",
    icon: "Receipt",
  },
  repairs: {
    id: "repairs",
    name: "Phone Repair Management",
    badge: "Repairs",
    description: "Device intake, diagnostics, estimates, parts reservation, technician work logs, QC checks, and warranties.",
    icon: "Wrench",
  },
};

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: "products:view", module: "products", label: "View Products & Catalog", description: "Browse product list, category trees, variant options, and retail prices.", category: "Products", riskLevel: "low" },
  { key: "products:manage", module: "products", label: "Create & Edit Products", description: "Add new products, modify selling prices, manage categories and suppliers.", category: "Products", riskLevel: "medium" },
  { key: "barcode:view", module: "barcode", label: "View Barcode Scanner & Records", description: "Access barcode scanner view and review SKU barcode mappings.", category: "Barcode", riskLevel: "low" },
  { key: "barcode:print", module: "barcode", label: "Generate & Print Barcode Labels", description: "Print barcode shelf stickers and product label sheets.", category: "Barcode", riskLevel: "low" },
  { key: "purchases:view", module: "purchases", label: "View Purchase History", description: "Inspect supplier purchase orders, payment status, and delivery bills.", category: "Purchases", riskLevel: "low" },
  { key: "purchases:manage", module: "purchases", label: "Manage Purchases & Supplier Returns", description: "Create purchase bills, update supplier payments, and process supplier returns.", category: "Purchases", riskLevel: "high" },
  { key: "sales:view", module: "sales", label: "View POS & Sales Register", description: "Access POS checkout screen, browse catalog, and view daily sales overview.", category: "Sales", riskLevel: "low" },
  { key: "sales:create", module: "sales", label: "Process Sales & Checkout", description: "Ring up items, accept cash/card payments, and finalize customer orders.", category: "Sales", riskLevel: "medium" },
  { key: "sales:discount", module: "sales", label: "Apply Custom Discounts", description: "Authorize special percentage or fixed cart/line-item discounts at checkout.", category: "Sales", riskLevel: "medium" },
  { key: "sales:void", module: "sales", label: "Void Orders & Invoices", description: "Cancel completed or pending transactions and rollback checkout entries.", category: "Sales", riskLevel: "high" },
  { key: "stock:view", module: "stock", label: "View Inventory & Catalog", description: "Browse stock levels, warehouse batches, supplier tags, and SKU statuses.", category: "Stock", riskLevel: "low" },
  { key: "stock:adjust", module: "stock", label: "Stock In / Adjust Quantities", description: "Perform manual inventory adjustments, stock takes, and write-offs.", category: "Stock", riskLevel: "high" },
  { key: "stock:analysis", module: "stock", label: "View Stock Valuation & Reports", description: "Access dead stock forecasting, valuation analysis, and reorder warnings.", category: "Stock", riskLevel: "low" },
  { key: "customers:view", module: "customers", label: "View Customer Directory", description: "Look up registered customer profiles, purchase logs, and loyalty tier balances.", category: "Customers", riskLevel: "low" },
  { key: "customers:manage", module: "customers", label: "Create & Edit Customer Records", description: "Register new customers, edit profiles, and grant/deduct loyalty points.", category: "Customers", riskLevel: "medium" },
  { key: "returns:view", module: "returns", label: "View Return & Refund Logs", description: "Inspect returned item history, credit notes, and refund audit summaries.", category: "Returns", riskLevel: "low" },
  { key: "returns:process", module: "returns", label: "Process Returns & Authorize Refunds", description: "Accept items back into inventory and authorize cash or store credit refunds.", category: "Returns", riskLevel: "high" },
  { key: "roles:manage", module: "roles", label: "Manage Staff Roles & Access Control", description: "Create shop staff, assign roles, and fine-tune per-module permission toggles.", category: "Access Control", riskLevel: "high" },
  { key: "expenditures:view", module: "expenditures", label: "View Expenditures & Analytics", description: "Browse expense registers, view date/month/year summaries, and review payment status.", category: "Expenditures", riskLevel: "low" },
  { key: "expenditures:create", module: "expenditures", label: "Record Expenses & Vouchers", description: "Record daily expenses, attach payees, and submit for verification.", category: "Expenditures", riskLevel: "medium" },
  { key: "expenditures:edit", module: "expenditures", label: "Edit Expense Records", description: "Modify expense details, payment schedules, and payee information.", category: "Expenditures", riskLevel: "medium" },
  { key: "expenditures:delete", module: "expenditures", label: "Delete or Void Expenses", description: "Delete draft expenses or cancel submitted expenditure vouchers.", category: "Expenditures", riskLevel: "high" },
  { key: "expenditures:approve", module: "expenditures", label: "Approve & Post to General Ledger", description: "Authorize payment disbursements and post double-entry accounting transactions.", category: "Expenditures", riskLevel: "high" },
  { key: "expenditures:categories", module: "expenditures", label: "Manage Categories & Recurring Schedules", description: "Configure custom expense categories, chart of accounts codes, and recurring expense rules.", category: "Expenditures", riskLevel: "medium" },
  { key: "repairs:view", module: "repairs", label: "View Repair Tickets & Dashboard", description: "Browse repair tickets, inspect device history, and monitor workshop status.", category: "Repairs", riskLevel: "low" },
  { key: "repairs:create", module: "repairs", label: "Customer Device Intake", description: "Create new repair tickets, capture condition checklists, photos, and customer signature.", category: "Repairs", riskLevel: "low" },
  { key: "repairs:technician", module: "repairs", label: "Diagnostics, Tasks & Parts Usage", description: "Perform hardware diagnostics, log bench work, and consume inventory spare parts.", category: "Repairs", riskLevel: "medium" },
  { key: "repairs:approve", module: "repairs", label: "Estimate Creation & Approval", description: "Draft quotes, apply labor discounts, and record customer estimate approval.", category: "Repairs", riskLevel: "medium" },
  { key: "repairs:qc", module: "repairs", label: "Quality Control Gate Verification", description: "Execute mandatory post-repair QC checklists before release for collection.", category: "Repairs", riskLevel: "medium" },
  { key: "repairs:billing", module: "repairs", label: "Repair Deposits, Billing & POS Settlement", description: "Collect deposits, generate final invoices, process refunds, and settle balances.", category: "Repairs", riskLevel: "high" },
  { key: "repairs:manage", module: "repairs", label: "Repair Administration & Warranty Override", description: "Manage workshop settings, reassign jobs, issue warranty claims, and void tickets.", category: "Repairs", riskLevel: "high" },
];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionKey[]> = {
  admin: PERMISSION_CATALOG.map((p) => p.key),
  manager: [
    "products:view", "products:manage", "barcode:view", "barcode:print",
    "purchases:view", "purchases:manage", "sales:view", "sales:create",
    "sales:discount", "sales:void", "stock:view", "stock:adjust", "stock:analysis",
    "customers:view", "customers:manage", "returns:view", "returns:process",
    "expenditures:view", "expenditures:create", "expenditures:edit", "expenditures:approve", "expenditures:categories",
    "repairs:view", "repairs:create", "repairs:technician", "repairs:approve", "repairs:qc", "repairs:billing", "repairs:manage",
  ],
  partner: [
    "products:view", "products:manage", "barcode:view", "barcode:print",
    "purchases:view", "sales:view", "stock:view", "stock:analysis",
    "customers:view", "returns:view", "expenditures:view", "repairs:view",
  ],
  cashier: [
    "products:view", "barcode:view", "sales:view", "sales:create",
    "stock:view", "customers:view", "customers:manage", "returns:view",
    "expenditures:view", "expenditures:create", "repairs:view", "repairs:create", "repairs:billing",
  ],
  technician: [
    "products:view", "stock:view", "repairs:view", "repairs:technician", "repairs:qc",
  ],
  custom: [
    "products:view", "sales:view", "sales:create", "expenditures:view", "repairs:view",
  ],
};

/**
 * Derives granular `PermissionKey[]` from a dynamic `RolePermissionDocument` and `ShopUser`.
 */
export function deriveGranularPermissionsFromRoleDoc(
  user: ShopUser | null | undefined,
  roleDoc?: RolePermissionDocument | null
): PermissionKey[] {
  if (!user || user.status === "suspended") return [];
  const cleanRole = (user.role || "").trim().toLowerCase();
  if (cleanRole === "admin") {
    return [...ROLE_DEFAULT_PERMISSIONS.admin];
  }

  const effectiveDoc =
    roleDoc || normalizeRolePermissionDocument(user.shopId || "DEFAULT", cleanRole, null);
  const p = effectiveDoc.permissions;
  const result = new Set<PermissionKey>(["sales:view", "sales:create"]);

  if (p.products) {
    result.add("products:view");
    result.add("products:manage");
  }
  if (p.barcode) {
    result.add("barcode:view");
    result.add("barcode:print");
  }
  if (p.purchase_history) {
    result.add("purchases:view");
    result.add("purchases:manage");
  }
  if (p.repair) {
    result.add("repairs:view");
    result.add("repairs:create");
    result.add("repairs:technician");
    result.add("repairs:approve");
    result.add("repairs:qc");
    result.add("repairs:billing");
    if (cleanRole === "manager") result.add("repairs:manage");
  }
  if (p.stock_management) {
    result.add("stock:view");
    result.add("stock:adjust");
  }
  if (p.stock_analysis) {
    result.add("stock:view");
    result.add("stock:analysis");
  }
  if (p.role_access) {
    result.add("roles:manage");
  }
  if (p.sales_ledger) {
    result.add("returns:view");
    result.add("returns:process");
    result.add("sales:discount");
    if (cleanRole === "manager") result.add("sales:void");
  }
  if (p.expenditures) {
    result.add("expenditures:view");
    result.add("expenditures:create");
    result.add("expenditures:edit");
    result.add("expenditures:categories");
    if (cleanRole === "manager") {
      result.add("expenditures:approve");
      result.add("expenditures:delete");
    }
  }
  if (p.customers) {
    result.add("customers:view");
    result.add("customers:manage");
  }

  return Array.from(result);
}

export function getEffectivePermissions(
  user: ShopUser | null | undefined,
  roleDoc?: RolePermissionDocument | null
): PermissionKey[] {
  if (!user || user.status === "suspended") return [];
  if ((user.role || "").toLowerCase() === "admin") {
    return [...ROLE_DEFAULT_PERMISSIONS.admin];
  }
  if (roleDoc) {
    return deriveGranularPermissionsFromRoleDoc(user, roleDoc);
  }
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions as PermissionKey[];
  }
  return deriveGranularPermissionsFromRoleDoc(user, null);
}

export function hasPermission(
  user: ShopUser | null | undefined,
  permission: PermissionKey,
  roleDoc?: RolePermissionDocument | null
): boolean {
  if (!user || user.status === "suspended") return false;
  if ((user.role || "").toLowerCase() === "admin") return true;
  const effective = getEffectivePermissions(user, roleDoc);
  return effective.includes(permission);
}

export function hasAnyPermission(
  user: ShopUser | null | undefined,
  permissions: PermissionKey[],
  roleDoc?: RolePermissionDocument | null
): boolean {
  if (!user || user.status === "suspended") return false;
  if ((user.role || "").toLowerCase() === "admin") return true;
  const effective = getEffectivePermissions(user, roleDoc);
  return permissions.some((p) => effective.includes(p));
}

export function canAccessModule(
  user: ShopUser | null | undefined,
  module: AppModule | PosModuleId,
  roleDoc?: RolePermissionDocument | null
): boolean {
  return evaluateModuleAccess(user, roleDoc, module);
}

export function isShopAdmin(
  user: ShopUser | null | undefined,
  roleDoc?: RolePermissionDocument | null
): boolean {
  if (!user || user.status === "suspended") return false;
  const cleanRole = (user.role || "").trim().toLowerCase();
  if (cleanRole === "admin") return true;
  if (roleDoc?.permissions?.role_access) return true;
  return Array.isArray(user.permissions) && user.permissions.includes("roles:manage");
}

// ── 8. GRANULAR MULTI-BRANCH PERMISSION EVALUATORS ───────────────────────────

export const DEFAULT_BRANCH_PERMISSIONS_BY_ROLE: Record<string, BranchPermissionKey[]> = {
  admin: [
    "branches.view",
    "branches.create",
    "branches.update",
    "branches.delete",
    "sales.view",
    "sales.create",
    "sales.refund",
    "inventory.view",
    "inventory.update",
    "inventory.transfer",
    "employees.manage",
    "reports.view_branch",
    "reports.view_all_branches",
    "expenses.manage",
  ],
  manager: [
    "sales.view",
    "sales.create",
    "sales.refund",
    "inventory.view",
    "inventory.update",
    "inventory.transfer",
    "reports.view_branch",
    "expenses.manage",
  ],
  partner: [
    "sales.view",
    "inventory.view",
    "reports.view_branch",
    "reports.view_all_branches",
  ],
  cashier: [
    "sales.view",
    "sales.create",
    "inventory.view",
  ],
  technician: [
    "inventory.view",
    "reports.view_branch",
  ],
};

export function hasBranchPermission(
  user: ShopUser | null | undefined,
  permission: BranchPermissionKey,
  roleDoc?: RolePermissionDocument | null
): boolean {
  if (!user || user.status === "suspended") return false;
  const cleanRole = (user.role || "").trim().toLowerCase();
  if (cleanRole === "admin") return true;

  // Explicit user-level branch permission overrides take precedence if defined
  if (Array.isArray(user.branchPermissions) && user.branchPermissions.length > 0) {
    return user.branchPermissions.includes(permission);
  }

  // Check roleDoc module access for branch_management if checking branches.*
  if (permission.startsWith("branches.") && roleDoc?.permissions?.branch_management) {
    return true;
  }
  if (permission === "reports.view_all_branches" && user.allBranchesAccess) {
    return true;
  }

  const defaults = DEFAULT_BRANCH_PERMISSIONS_BY_ROLE[cleanRole] || [];
  return defaults.includes(permission);
}

export function canAccessAllBranches(
  user: ShopUser | null | undefined,
  roleDoc?: RolePermissionDocument | null
): boolean {
  if (!user || user.status === "suspended") return false;
  const cleanRole = (user.role || "").trim().toLowerCase();
  if (cleanRole === "admin") return true;
  if (user.allBranchesAccess) return true;
  return hasBranchPermission(user, "reports.view_all_branches", roleDoc);
}

export function getAuthorizedBranchIdsForUser(user: ShopUser | null | undefined): string[] {
  if (!user) return [];
  const ids = new Set<string>();
  if (Array.isArray(user.assignedBranchIds)) {
    for (const id of user.assignedBranchIds) {
      if (id && id.trim()) ids.add(id.trim());
    }
  }
  if (user.primaryBranchId && user.primaryBranchId.trim()) {
    ids.add(user.primaryBranchId.trim());
  }
  if (user.branchId && user.branchId.trim()) {
    ids.add(user.branchId.trim());
  }
  if (ids.size === 0) {
    ids.add("main");
  }
  return Array.from(ids);
}
