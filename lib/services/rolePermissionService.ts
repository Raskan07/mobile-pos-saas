/**
 * lib/services/rolePermissionService.ts
 *
 * Firebase Firestore service for Multi-Shop Dynamic Role Permissions & Audit Logging.
 *
 * Firestore Paths:
 *   shops/{shopId}/rolePermissions/{roleId}
 *   shops/{shopId}/permissionAuditLogs/{logId}
 *   permissionAuditLogs/{logId} (mirror for super-admin / compliance auditing)
 *
 * Security & Integrity Guarantees:
 * 1. Multi-Tenant Isolation: Every document is strictly scoped under `shops/{shopId}`.
 * 2. Administrator Protection: The `admin` role cannot have `role_access` disabled.
 * 3. Audit Trail: Every role permission update records previous vs. new permissions,
 *    admin user ID, role ID, shop ID, and server timestamp.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import {
  RolePermissionDocument,
  RolePermissionsMap,
  RoleSubPermissionsMap,
  PermissionAuditLogRecord,
  ShopUser,
} from "../types/user";
import {
  MAIN_MENU_MODULE_REGISTRY,
  SETTINGS_SUBMENU_REGISTRY,
  normalizeRolePermissionDocument,
} from "../rbac/permissions";

export const ROLE_PERMISSIONS_SUBCOLLECTION = "rolePermissions";
export const PERMISSION_AUDIT_LOGS_SUBCOLLECTION = "permissionAuditLogs";

export const DEFAULT_SYSTEM_ROLES = [
  "admin",
  "manager",
  "cashier",
  "partner",
  "technician",
] as const;

/**
 * Subscribe in real time to a single role's permission document (`shops/{shopId}/rolePermissions/{roleId}`).
 * Used by `ShopAuthContext` so active user sessions update immediately when an admin edits permissions.
 */
export function subscribeToRolePermissionDoc(
  shopId: string,
  roleId: string,
  onUpdate: (doc: RolePermissionDocument) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  const cleanRole = (roleId || "cashier").trim().toLowerCase();

  if (!normShopId) {
    onUpdate(normalizeRolePermissionDocument("DEFAULT", cleanRole, null));
    return () => {};
  }

  const docRef = doc(
    db,
    "shops",
    normShopId,
    ROLE_PERMISSIONS_SUBCOLLECTION,
    cleanRole
  );

  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<RolePermissionDocument>;
        onUpdate(normalizeRolePermissionDocument(normShopId, cleanRole, data));
      } else {
        // Document not yet customized in Firestore — return safe normalized defaults for this role
        onUpdate(normalizeRolePermissionDocument(normShopId, cleanRole, null));
      }
    },
    (err) => {
      console.warn(
        `[RolePermissionService] Listener fallback for ${normShopId}/${cleanRole}:`,
        err
      );
      onUpdate(normalizeRolePermissionDocument(normShopId, cleanRole, null));
      onError?.(err);
    }
  );
}

/**
 * Subscribe in real time to all role permission documents for a shop (`shops/{shopId}/rolePermissions`).
 * Merges stored role documents with standard system roles and any additional role IDs passed in.
 */
export function subscribeToAllShopRolePermissions(
  shopId: string,
  onUpdate: (docsMap: Record<string, RolePermissionDocument>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) {
    onUpdate({});
    return () => {};
  }

  const colRef = collection(
    db,
    "shops",
    normShopId,
    ROLE_PERMISSIONS_SUBCOLLECTION
  );

  return onSnapshot(
    colRef,
    (snap) => {
      const result: Record<string, RolePermissionDocument> = {};

      // 1. Seed system roles with their normalized defaults first
      for (const sysRole of DEFAULT_SYSTEM_ROLES) {
        result[sysRole] = normalizeRolePermissionDocument(normShopId, sysRole, null);
      }

      // 2. Overlay persisted Firestore role permission documents
      snap.forEach((docSnap) => {
        const raw = docSnap.data() as Partial<RolePermissionDocument>;
        const rId = (raw.roleId || docSnap.id || "").trim().toLowerCase();
        if (rId) {
          result[rId] = normalizeRolePermissionDocument(normShopId, rId, raw);
        }
      });

      onUpdate(result);
    },
    (err) => {
      console.error("[RolePermissionService] Error subscribing to shop rolePermissions:", err);
      onError?.(err);
    }
  );
}

/**
 * Computes a human-readable list of changed permission keys between previous and new states.
 */
function computeChangedSummary(
  prevDoc: RolePermissionDocument | null,
  nextDoc: RolePermissionDocument
): string[] {
  const changes: string[] = [];

  for (const mod of MAIN_MENU_MODULE_REGISTRY) {
    const before = prevDoc ? Boolean(prevDoc.permissions[mod.id]) : undefined;
    const after = Boolean(nextDoc.permissions[mod.id]);
    if (before !== after) {
      changes.push(`${after ? "+" : "-"} ${mod.id} (${after ? "ON" : "OFF"})`);
    }
  }

  for (const sub of SETTINGS_SUBMENU_REGISTRY) {
    const before = prevDoc
      ? Boolean(prevDoc.subPermissions?.settings?.[sub.subKey])
      : undefined;
    const after = Boolean(nextDoc.subPermissions?.settings?.[sub.subKey]);
    if (before !== after) {
      changes.push(
        `${after ? "+" : "-"} settings.${sub.subKey} (${after ? "ON" : "OFF"})`
      );
    }
  }

  return changes;
}

/**
 * Saves a role's permission configuration to `shops/{shopId}/rolePermissions/{roleId}`
 * and writes an immutable audit log entry to `shops/{shopId}/permissionAuditLogs/{logId}`.
 */
export async function saveRolePermissionConfiguration(params: {
  shopId: string;
  roleId: string;
  roleLabel?: string;
  description?: string;
  permissions: RolePermissionsMap;
  subPermissions: RoleSubPermissionsMap;
  adminUser: ShopUser | null;
}): Promise<RolePermissionDocument> {
  const normShopId = normalizeShopId(params.shopId);
  if (!normShopId) {
    throw new Error("Active Shop ID is required to save role permissions.");
  }

  if (!params.adminUser || !params.adminUser.uid) {
    throw new Error("Authenticated administrator session is required.");
  }

  const adminUserShopId = normalizeShopId(params.adminUser.shopId || "");
  if (adminUserShopId && adminUserShopId !== normShopId) {
    throw new Error(
      `Security violation: Cannot modify permissions for shop ${normShopId} while authenticated in ${adminUserShopId}.`
    );
  }

  const cleanRole = (params.roleId || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!cleanRole) {
    throw new Error("Valid role identifier is required.");
  }

  // Normalize and enforce Administrator Protection (`admin` always keeps `role_access: true`)
  const normalizedNext = normalizeRolePermissionDocument(normShopId, cleanRole, {
    roleId: cleanRole,
    shopId: normShopId,
    roleLabel: params.roleLabel,
    description: params.description,
    permissions: params.permissions,
    subPermissions: params.subPermissions,
    updatedAtMs: Date.now(),
    updatedBy: params.adminUser.uid,
    updatedByUsername: params.adminUser.displayName || params.adminUser.username || "admin",
  });

  const docRef = doc(
    db,
    "shops",
    normShopId,
    ROLE_PERMISSIONS_SUBCOLLECTION,
    cleanRole
  );

  // Fetch previous state for audit logging
  let previousDoc: RolePermissionDocument | null = null;
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      previousDoc = normalizeRolePermissionDocument(
        normShopId,
        cleanRole,
        existingSnap.data() as Partial<RolePermissionDocument>
      );
    }
  } catch (err) {
    console.warn("[RolePermissionService] Could not read previous role permission doc:", err);
  }

  const now = Date.now();
  const firestorePayload = {
    roleId: normalizedNext.roleId,
    shopId: normShopId,
    roleLabel: normalizedNext.roleLabel,
    description: normalizedNext.description || "",
    isSystemRole: Boolean(normalizedNext.isSystemRole),
    permissions: normalizedNext.permissions,
    subPermissions: normalizedNext.subPermissions,
    updatedAt: serverTimestamp(),
    updatedAtMs: now,
    updatedBy: params.adminUser.uid,
    updatedByUsername:
      params.adminUser.displayName || params.adminUser.username || "admin",
  };

  // 1. Write role permission document to `shops/{shopId}/rolePermissions/{roleId}`
  await setDoc(docRef, firestorePayload);

  // 2. Write immutable audit record to `shops/{shopId}/permissionAuditLogs/{logId}`
  const changedSummary = computeChangedSummary(previousDoc, normalizedNext);
  const logId = `audit_${now}_${Math.random().toString(36).substring(2, 7)}`;

  const auditPayload: PermissionAuditLogRecord = {
    id: logId,
    shopId: normShopId,
    updatedRole: cleanRole,
    adminUserId: params.adminUser.uid,
    adminUsername:
      params.adminUser.displayName || params.adminUser.username || "admin",
    previousPermissions: previousDoc
      ? {
          permissions: previousDoc.permissions,
          subPermissions: previousDoc.subPermissions,
        }
      : null,
    newPermissions: {
      permissions: normalizedNext.permissions,
      subPermissions: normalizedNext.subPermissions,
    },
    changedSummary,
    timestamp: serverTimestamp(),
    timestampMs: now,
  };

  try {
    const shopAuditRef = doc(
      db,
      "shops",
      normShopId,
      PERMISSION_AUDIT_LOGS_SUBCOLLECTION,
      logId
    );
    await setDoc(shopAuditRef, auditPayload);

    const rootAuditRef = doc(db, PERMISSION_AUDIT_LOGS_SUBCOLLECTION, logId);
    await setDoc(rootAuditRef, auditPayload);
  } catch (auditErr) {
    console.warn("[RolePermissionService] Notice writing audit log:", auditErr);
  }

  return {
    ...normalizedNext,
    updatedAtMs: now,
  };
}

/**
 * Subscribe in real time to a shop's permission audit logs (`shops/{shopId}/permissionAuditLogs`).
 */
export function subscribeToPermissionAuditLogs(
  shopId: string,
  onUpdate: (logs: PermissionAuditLogRecord[]) => void
): Unsubscribe {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) {
    onUpdate([]);
    return () => {};
  }

  const colRef = collection(
    db,
    "shops",
    normShopId,
    PERMISSION_AUDIT_LOGS_SUBCOLLECTION
  );

  return onSnapshot(
    colRef,
    (snap) => {
      const logs: PermissionAuditLogRecord[] = [];
      snap.forEach((d) => {
        logs.push(d.data() as PermissionAuditLogRecord);
      });
      logs.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      onUpdate(logs);
    },
    (err) => {
      console.warn("[RolePermissionService] Audit log listener error:", err);
      onUpdate([]);
    }
  );
}

/**
 * Ensures initial default role permission documents exist in Firestore for a shop.
 */
export async function ensureDefaultShopRolePermissions(
  shopId: string,
  adminUser?: ShopUser | null
): Promise<void> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return;

  try {
    const colRef = collection(
      db,
      "shops",
      normShopId,
      ROLE_PERMISSIONS_SUBCOLLECTION
    );
    const snap = await getDocs(colRef);
    const existingIds = new Set<string>();
    snap.forEach((d) => existingIds.add(d.id.toLowerCase()));

    const now = Date.now();
    for (const sysRole of DEFAULT_SYSTEM_ROLES) {
      if (!existingIds.has(sysRole)) {
        const normalized = normalizeRolePermissionDocument(normShopId, sysRole, null);
        const docRef = doc(
          db,
          "shops",
          normShopId,
          ROLE_PERMISSIONS_SUBCOLLECTION,
          sysRole
        );
        await setDoc(docRef, {
          roleId: normalized.roleId,
          shopId: normShopId,
          roleLabel: normalized.roleLabel,
          description: normalized.description || "",
          isSystemRole: true,
          permissions: normalized.permissions,
          subPermissions: normalized.subPermissions,
          updatedAt: serverTimestamp(),
          updatedAtMs: now,
          updatedBy: adminUser?.uid || "system_init",
          updatedByUsername: adminUser?.username || "system",
        });
      }
    }
  } catch (err) {
    console.warn("[RolePermissionService] Notice seeding default roles:", err);
  }
}

