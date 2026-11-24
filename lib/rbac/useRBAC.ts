"use client";

import { useCallback, useMemo } from "react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  hasPermission,
  hasAnyPermission,
  canAccessModule,
  evaluateSubPermissionAccess,
  getEffectivePermissions,
  isShopAdmin,
  hasBranchPermission,
  canAccessAllBranches,
  getAuthorizedBranchIdsForUser,
} from "./permissions";
import {
  PermissionKey,
  AppModule,
  PosModuleId,
  SettingsSubPermissionId,
} from "../types/user";
import { BranchPermissionKey } from "../types/branch";
import { isFeatureEnabledForShop } from "../services/subscriptionService";
import { SubscriptionFeatureKey } from "../types/subscription";

/**
 * useRBAC
 *
 * Hook for consuming dynamic Role-Based Access Control checks anywhere in the POS UI.
 * Reactive in real time to the current shop's `shops/{shopId}/rolePermissions/{roleId}`
 * document and user session.
 */
export function useRBAC() {
  const {
    user,
    shop,
    rolePermissions,
    isPermissionsLoading,
    isAuthenticated,
    isLoading,
  } = useShopAuth();

  const effectivePermissions = useMemo(() => {
    return getEffectivePermissions(user, rolePermissions);
  }, [user, rolePermissions]);

  const checkPermission = useCallback(
    (permission: PermissionKey) => {
      return hasPermission(user, permission, rolePermissions);
    },
    [user, rolePermissions]
  );

  const checkAnyPermission = useCallback(
    (permissions: PermissionKey[]) => {
      return hasAnyPermission(user, permissions, rolePermissions);
    },
    [user, rolePermissions]
  );

  const checkModuleAccess = useCallback(
    (module: AppModule | PosModuleId) => {
      if (!isFeatureEnabledForShop(shop, module)) {
        return false;
      }
      return canAccessModule(user, module, rolePermissions);
    },
    [shop, user, rolePermissions]
  );

  const checkFeatureEnabled = useCallback(
    (featureKey: SubscriptionFeatureKey | string) => {
      return isFeatureEnabledForShop(shop, featureKey);
    },
    [shop]
  );

  const checkSubPermissionAccess = useCallback(
    (parentModule: PosModuleId, subKey: SettingsSubPermissionId) => {
      return evaluateSubPermissionAccess(user, rolePermissions, parentModule, subKey);
    },
    [user, rolePermissions]
  );

  const checkSettingsSubmenu = useCallback(
    (subKey: SettingsSubPermissionId) => {
      return evaluateSubPermissionAccess(user, rolePermissions, "settings", subKey);
    },
    [user, rolePermissions]
  );

  const isAdmin = useMemo(() => {
    return isShopAdmin(user, rolePermissions);
  }, [user, rolePermissions]);

  const checkBranchPermission = useCallback(
    (perm: BranchPermissionKey) => {
      return hasBranchPermission(user, perm, rolePermissions);
    },
    [user, rolePermissions]
  );

  const canViewAllBranches = useMemo(() => {
    return canAccessAllBranches(user, rolePermissions);
  }, [user, rolePermissions]);

  const authorizedBranchIds = useMemo(() => {
    return getAuthorizedBranchIdsForUser(user);
  }, [user]);

  return {
    user,
    shop,
    role: user?.role,
    rolePermissions,
    isPermissionsLoading: isLoading || isPermissionsLoading,
    isAuthenticated,
    isLoading: isLoading || isPermissionsLoading,
    isShopAdmin: isAdmin,
    canViewAllBranches,
    authorizedBranchIds,
    permissions: effectivePermissions,
    hasPermission: checkPermission,
    hasAnyPermission: checkAnyPermission,
    hasBranchPermission: checkBranchPermission,
    canAccessModule: checkModuleAccess,
    isFeatureEnabled: checkFeatureEnabled,
    subscription: shop?.subscription || null,
    canAccessSubPermission: checkSubPermissionAccess,
    canAccessSettingsSubmenu: checkSettingsSubmenu,
  };
}
