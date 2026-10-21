"use client";

import { useCallback, useMemo } from "react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  hasPermission,
  hasAnyPermission,
  canAccessModule,
  getEffectivePermissions,
  isShopAdmin,
} from "./permissions";
import { PermissionKey, AppModule } from "../types/user";

/**
 * useRBAC
 *
 * Hook for consuming Role-Based Access Control checks anywhere in the POS UI.
 * Reactive to current shop session user and permissions.
 */
export function useRBAC() {
  const { user, shop, isAuthenticated, isLoading } = useShopAuth();

  const effectivePermissions = useMemo(() => {
    return getEffectivePermissions(user);
  }, [user]);

  const checkPermission = useCallback(
    (permission: PermissionKey) => {
      return hasPermission(user, permission);
    },
    [user]
  );

  const checkAnyPermission = useCallback(
    (permissions: PermissionKey[]) => {
      return hasAnyPermission(user, permissions);
    },
    [user]
  );

  const checkModuleAccess = useCallback(
    (module: AppModule) => {
      return canAccessModule(user, module);
    },
    [user]
  );

  const isAdmin = useMemo(() => {
    return isShopAdmin(user);
  }, [user]);

  return {
    user,
    shop,
    isAuthenticated,
    isLoading,
    role: user?.role,
    isShopAdmin: isAdmin,
    permissions: effectivePermissions,
    hasPermission: checkPermission,
    hasAnyPermission: checkAnyPermission,
    canAccessModule: checkModuleAccess,
  };
}
