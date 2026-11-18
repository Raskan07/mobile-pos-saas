"use client";

/**
 * lib/context/ShopAuthContext.tsx
 *
 * Context provider and hook for Shop-scoped session authentication.
 * Stores the authenticated Shop and User context, guaranteeing multi-tenant scoping.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Shop } from "../types/shop";
import { ShopUser, ShopSession, RolePermissionDocument } from "../types/user";
import { Branch, DEFAULT_BRANCH_ID, ALL_BRANCHES_ID } from "../types/branch";
import { verifyShopExists, getShopScopedCollection, normalizeShopId } from "../services/shopAuthService";
import { subscribeToRolePermissionDoc } from "../services/rolePermissionService";
import { subscribeToBranches, ensureDefaultBranch } from "../services/branchService";
import {
  normalizeRolePermissionDocument,
  canAccessAllBranches as checkAllBranchesAccess,
  getAuthorizedBranchIdsForUser,
} from "../rbac/permissions";
import { doc, onSnapshot, CollectionReference, DocumentData } from "firebase/firestore";
import { db } from "../firebase";

interface ShopAuthContextType {
  shop: Shop | null;
  user: ShopUser | null;
  session: ShopSession | null;
  originalAdminUser: ShopUser | null;
  rolePermissions: RolePermissionDocument | null;
  isPermissionsLoading: boolean;
  isAdmin: boolean;
  branches: Branch[];
  authorizedBranches: Branch[];
  canSwitchBranches: boolean;
  canViewAllBranches: boolean;
  activeBranchId: string;
  activeBranchName: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    session: ShopSession,
    shop: Shop,
    user: ShopUser,
    selectedBranchId?: string,
    selectedBranchName?: string
  ) => void;
  logout: () => void;
  switchUser: (targetUser: ShopUser) => void;
  switchBranch: (branchId: string, branchName?: string) => void;
  updateCurrentUser: (updates: Partial<ShopUser>) => void;
  getScopedCollection: <T = DocumentData>(collectionName: string) => CollectionReference<T> | null;
}

const STORAGE_KEY = "pos_authenticated_shop_session";
const SHOP_CACHE_PREFIX = "pos_cached_shop_";
const PERM_CACHE_PREFIX = "pos_cached_role_perms_";
const BRANCH_CACHE_PREFIX = "pos_active_branch_";

const ShopAuthContext = createContext<ShopAuthContextType | undefined>(undefined);

export function ShopAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [user, setUser] = useState<ShopUser | null>(null);
  const [originalAdminUser, setOriginalAdminUser] = useState<ShopUser | null>(null);
  const [session, setSession] = useState<ShopSession | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>(DEFAULT_BRANCH_ID);
  const [activeBranchName, setActiveBranchName] = useState<string>("Main Branch");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionDocument | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState<boolean>(false);

  // Rehydrate session from sessionStorage on mount (instantaneous optimistic hydration + background verification)
  useEffect(() => {
    let isCancelled = false;

    async function restoreSession() {
      try {
        if (typeof window === "undefined") return;

        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setIsLoading(false);
          setIsPermissionsLoading(false);
          return;
        }

        const parsedSession: ShopSession = JSON.parse(stored);
        if (!parsedSession.shopId || !parsedSession.user) {
          sessionStorage.removeItem(STORAGE_KEY);
          setIsLoading(false);
          setIsPermissionsLoading(false);
          return;
        }

        const normShopId = normalizeShopId(parsedSession.shopId);
        const cleanRole = (parsedSession.user.role || "cashier").trim().toLowerCase();

        // 1. Immediately hydrate Shop from sessionStorage cache or session metadata (0ms latency)
        let initialShop: Shop = {
          id: normShopId,
          shopId: normShopId,
          shopName: parsedSession.shopName || normShopId,
          ownerName: parsedSession.user.displayName || parsedSession.user.username || "Owner",
          phone: parsedSession.user.phone || "",
          address: "",
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        try {
          const cachedShopRaw = sessionStorage.getItem(`${SHOP_CACHE_PREFIX}${normShopId}`);
          if (cachedShopRaw) {
            initialShop = JSON.parse(cachedShopRaw);
          }
        } catch {
          // ignore cache parse errors
        }

        // 2. Immediately hydrate RolePermissions from sessionStorage cache or role defaults (0ms latency)
        let initialPerms: RolePermissionDocument = normalizeRolePermissionDocument(
          normShopId,
          cleanRole,
          null
        );
        try {
          const cachedPermsRaw = sessionStorage.getItem(
            `${PERM_CACHE_PREFIX}${normShopId}_${cleanRole}`
          );
          if (cachedPermsRaw) {
            initialPerms = normalizeRolePermissionDocument(
              normShopId,
              cleanRole,
              JSON.parse(cachedPermsRaw)
            );
          }
        } catch {
          // ignore cache parse errors
        }

        setShop(initialShop);
        setUser(parsedSession.user);
        setRolePermissions(initialPerms);
        if (parsedSession.originalAdminUser) {
          setOriginalAdminUser(parsedSession.originalAdminUser);
        }
        setSession(parsedSession);
        const restoredDefaultBranchId = parsedSession.user.primaryBranchId || parsedSession.user.branchId || DEFAULT_BRANCH_ID;
        const restoredDefaultBranchName = parsedSession.user.branchName || "Main Branch";
        let initialBranchId = restoredDefaultBranchId;
        let initialBranchName = restoredDefaultBranchName;
        try {
          const savedBranchRaw = sessionStorage.getItem(
            `${BRANCH_CACHE_PREFIX}${normShopId}_${parsedSession.user.uid}`
          );
          if (savedBranchRaw) {
            const savedBranch = JSON.parse(savedBranchRaw) as { branchId?: string; branchName?: string };
            if (savedBranch.branchId) {
              const allowed = getAuthorizedBranchIdsForUser(parsedSession.user);
              const allowAll = checkAllBranchesAccess(parsedSession.user, initialPerms);
              if (
                (savedBranch.branchId === ALL_BRANCHES_ID && allowAll) ||
                allowAll ||
                allowed.includes(savedBranch.branchId)
              ) {
                initialBranchId = savedBranch.branchId;
                initialBranchName = savedBranch.branchName || restoredDefaultBranchName;
              }
            }
          }
        } catch {
          // ignore branch cache parse error
        }
        setActiveBranchId(initialBranchId);
        setActiveBranchName(initialBranchName);
        // Unblock UI immediately!
        setIsLoading(false);
        setIsPermissionsLoading(false);

        // 3. Background verification of Shop document in Firestore
        verifyShopExists(normShopId)
          .then((validShop) => {
            if (isCancelled) return;
            if (!validShop) {
              console.warn("[ShopAuth] Shop no longer exists, clearing session");
              sessionStorage.removeItem(STORAGE_KEY);
              setShop(null);
              setUser(null);
              setSession(null);
              return;
            }
            setShop(validShop);
            try {
              sessionStorage.setItem(
                `${SHOP_CACHE_PREFIX}${normShopId}`,
                JSON.stringify(validShop)
              );
            } catch {
              // ignore storage quota
            }
          })
          .catch((err) => {
            console.warn("[ShopAuth] Background shop verification notice:", err);
          });
      } catch (err) {
        console.error("[ShopAuth] Error restoring session:", err);
        sessionStorage.removeItem(STORAGE_KEY);
        setIsLoading(false);
        setIsPermissionsLoading(false);
      }
    }

    restoreSession();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Real-time listener on the current user's Firestore document so role or status changes propagate immediately
  useEffect(() => {
    if (!shop?.shopId || !user?.uid) return;

    const userRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) return;
        const remoteUser = snap.data() as Partial<ShopUser>;
        // Verify same shop
        if (
          remoteUser.shopId &&
          remoteUser.shopId.trim().toUpperCase() !== shop.shopId.trim().toUpperCase()
        ) {
          return;
        }
        setUser((prev) => {
          if (!prev) return prev;
          const nextRole = remoteUser.role || prev.role;
          const nextStatus = remoteUser.status || prev.status;
          if (nextRole === prev.role && nextStatus === prev.status) {
            return prev;
          }
          const updated: ShopUser = {
            ...prev,
            role: nextRole,
            status: nextStatus,
          };
          if (typeof window !== "undefined") {
            try {
              const raw = sessionStorage.getItem(STORAGE_KEY);
              if (raw) {
                const parsed = JSON.parse(raw);
                parsed.user = updated;
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
              }
            } catch {
              // ignore storage error
            }
          }
          return updated;
        });
      },
      () => {
        // non-blocking fallback if user doc doesn't exist
      }
    );

    return () => unsubUser();
  }, [shop?.shopId, user?.uid]);

  // Real-time listener on `shops/{shopId}/rolePermissions/{roleId}` so role permission updates apply immediately
  useEffect(() => {
    if (!shop?.shopId || !user?.role) {
      setRolePermissions(null);
      setIsPermissionsLoading(false);
      return;
    }

    const normShopId = normalizeShopId(shop.shopId);
    const cleanRole = (user.role || "cashier").trim().toLowerCase();

    // Ensure rolePermissions is seeded immediately from cache or role defaults so UI never blocks
    setRolePermissions((prev) => {
      if (prev && prev.shopId === normShopId && prev.roleId === cleanRole) {
        return prev;
      }
      if (typeof window !== "undefined") {
        try {
          const cachedRaw = sessionStorage.getItem(
            `${PERM_CACHE_PREFIX}${normShopId}_${cleanRole}`
          );
          if (cachedRaw) {
            return normalizeRolePermissionDocument(normShopId, cleanRole, JSON.parse(cachedRaw));
          }
        } catch {
          // ignore
        }
      }
      return normalizeRolePermissionDocument(normShopId, cleanRole, null);
    });
    setIsPermissionsLoading(false);

    const unsubPerms = subscribeToRolePermissionDoc(
      normShopId,
      cleanRole,
      (docData) => {
        setRolePermissions(docData);
        setIsPermissionsLoading(false);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              `${PERM_CACHE_PREFIX}${normShopId}_${cleanRole}`,
              JSON.stringify(docData)
            );
          } catch {
            // ignore
          }
        }
      },
      () => {
        setIsPermissionsLoading(false);
      }
    );

    return () => unsubPerms();
  }, [shop?.shopId, user?.role]);

  // Subscribe to shop branches and ensure a default branch exists
  useEffect(() => {
    if (!shop?.shopId) {
      setBranches([]);
      return;
    }

    let isCancelled = false;
    const unsubBranches = subscribeToBranches(shop.shopId, (fetchedBranches) => {
      if (isCancelled) return;
      if (fetchedBranches.length === 0) {
        ensureDefaultBranch(shop.shopId, shop.shopName, shop.address, shop.phone).catch((err) => {
          console.warn("[ShopAuth] Failed to ensure default branch:", err);
        });
        return;
      }
      setBranches(fetchedBranches);
    });

    return () => {
      isCancelled = true;
      unsubBranches();
    };
  }, [shop?.shopId, shop?.shopName, shop?.address, shop?.phone]);

  const isAdmin = Boolean(
    user?.role?.toLowerCase() === "admin" ||
    originalAdminUser?.role?.toLowerCase() === "admin"
  );

  const canViewAllBranches = useMemo(
    () => isAdmin && checkAllBranchesAccess(user, rolePermissions),
    [isAdmin, user, rolePermissions]
  );

  const authorizedBranches = useMemo(() => {
    const activeOnly = branches.filter((b) => b.status === "active");
    if (!user) return [];
    if (isAdmin) {
      return activeOnly;
    }
    const allowedIds = getAuthorizedBranchIdsForUser(user);
    return activeOnly.filter((b) => allowedIds.includes(b.branchId));
  }, [branches, user, isAdmin]);

  // Strictly restrict branch switching in the terminal to Admin users only
  const canSwitchBranches = useMemo(
    () => isAdmin && (authorizedBranches.length > 1 || canViewAllBranches),
    [isAdmin, authorizedBranches.length, canViewAllBranches]
  );

  // Enforce authorized activeBranchId whenever branches, user, or permissions update
  useEffect(() => {
    if (!shop?.shopId || !user || branches.length === 0) return;

    if (activeBranchId === ALL_BRANCHES_ID) {
      if (canViewAllBranches) {
        if (activeBranchName !== "All Branches") {
          setActiveBranchName("All Branches");
        }
        return;
      }
    } else {
      const matched = authorizedBranches.find((b) => b.branchId === activeBranchId);
      if (matched) {
        if (activeBranchName !== matched.name) {
          setActiveBranchName(matched.name);
        }
        return;
      }
    }

    // Current selection is invalid or unauthorized -> auto-select primary or first authorized branch
    const preferredId = user.primaryBranchId || user.branchId || DEFAULT_BRANCH_ID;
    const fallback =
      authorizedBranches.find((b) => b.branchId === preferredId) ||
      authorizedBranches.find((b) => b.isDefault) ||
      authorizedBranches[0];

    if (fallback) {
      setActiveBranchId(fallback.branchId);
      setActiveBranchName(fallback.name);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            `${BRANCH_CACHE_PREFIX}${shop.shopId}_${user.uid}`,
            JSON.stringify({ branchId: fallback.branchId, branchName: fallback.name })
          );
        } catch {
          // ignore
        }
      }
    }
  }, [shop?.shopId, user, branches, authorizedBranches, canViewAllBranches, activeBranchId, activeBranchName]);

  const login = useCallback(
    (
      newSession: ShopSession,
      newShop: Shop,
      newUser: ShopUser,
      selectedBranchId?: string,
      selectedBranchName?: string
    ) => {
      setSession(newSession);
      setShop(newShop);
      setUser(newUser);
      setOriginalAdminUser(null);
      const nextBranchId =
        selectedBranchId || newUser.branchId || newUser.primaryBranchId || DEFAULT_BRANCH_ID;
      const nextBranchName = selectedBranchName || newUser.branchName || "Main Branch";
      setActiveBranchId(nextBranchId);
      setActiveBranchName(nextBranchName);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
          sessionStorage.setItem(
            `${BRANCH_CACHE_PREFIX}${newShop.shopId}_${newUser.uid}`,
            JSON.stringify({ branchId: nextBranchId, branchName: nextBranchName })
          );
        } catch (e) {
          console.error("Failed to persist shop session to sessionStorage", e);
        }
      }
    },
    []
  );

  const logout = useCallback(() => {
    setSession(null);
    setShop(null);
    setUser(null);
    setBranches([]);
    setOriginalAdminUser(null);
    setActiveBranchId(DEFAULT_BRANCH_ID);
    setActiveBranchName("Main Branch");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    router.push("/shop");
  }, [router]);

  const switchUser = useCallback((targetUser: ShopUser) => {
    if (!shop) return;

    // Check if the current user or already preserved user is an admin
    const currentIsAdmin = user?.role?.toLowerCase().trim() === "admin";
    const effectiveAdmin = originalAdminUser || (currentIsAdmin ? user : null);

    // Strict Access Control: Only admin users can switch between profiles
    if (!effectiveAdmin || effectiveAdmin.role?.toLowerCase().trim() !== "admin") {
      console.warn("[ShopAuth] Access Denied: Only shop administrators can switch between profiles.");
      return;
    }

    // If switching back to the original admin, clear originalAdminUser
    const isReturningToAdmin = effectiveAdmin && targetUser.uid === effectiveAdmin.uid;
    const nextAdminUser = isReturningToAdmin ? undefined : (effectiveAdmin || undefined);

    const updatedSession: ShopSession = {
      shopId: shop.shopId,
      shopName: shop.shopName,
      user: targetUser,
      originalAdminUser: nextAdminUser,
      loginTime: session?.loginTime || Date.now(),
      token: session?.token,
    };

    setUser(targetUser);
    setSession(updatedSession);
    setOriginalAdminUser(nextAdminUser || null);

    const targetBranchId = targetUser.primaryBranchId || targetUser.branchId || DEFAULT_BRANCH_ID;
    const matchedBranch = branches.find((b) => b.branchId === targetBranchId);
    const targetBranchName = matchedBranch?.name || targetUser.branchName || "Main Branch";
    setActiveBranchId(targetBranchId);
    setActiveBranchName(targetBranchName);

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
        sessionStorage.setItem(
          `${BRANCH_CACHE_PREFIX}${shop.shopId}_${targetUser.uid}`,
          JSON.stringify({ branchId: targetBranchId, branchName: targetBranchName })
        );
      } catch (e) {
        console.error("Failed to update user in shop session", e);
      }
    }
  }, [shop, session, user, originalAdminUser, branches]);

  const switchBranch = useCallback(
    (branchId: string, branchName?: string) => {
      if (!shop?.shopId || !user) return;

      if (!isAdmin) {
        console.warn("[ShopAuth] Access Denied: Only shop administrators can switch between branches.");
        return;
      }

      if (branchId === ALL_BRANCHES_ID) {
        if (!canViewAllBranches) {
          console.warn("[ShopAuth] Access Denied: User is not authorized for All Branches view.");
          return;
        }
        setActiveBranchId(ALL_BRANCHES_ID);
        setActiveBranchName("All Branches");
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              `${BRANCH_CACHE_PREFIX}${shop.shopId}_${user.uid}`,
              JSON.stringify({ branchId: ALL_BRANCHES_ID, branchName: "All Branches" })
            );
          } catch {
            // ignore
          }
        }
        return;
      }

      const allowedIds = getAuthorizedBranchIdsForUser(user);
      const targetBranch = branches.find((b) => b.branchId === branchId);
      const isAuthorized = canViewAllBranches || allowedIds.includes(branchId);

      if (!isAuthorized) {
        console.warn(`[ShopAuth] Access Denied: User is not assigned to branch ${branchId}.`);
        return;
      }

      if (targetBranch && targetBranch.status !== "active") {
        console.warn(`[ShopAuth] Branch ${branchId} is inactive.`);
        return;
      }

      const resolvedName = targetBranch?.name || branchName || branchId;
      setActiveBranchId(branchId);
      setActiveBranchName(resolvedName);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            `${BRANCH_CACHE_PREFIX}${shop.shopId}_${user.uid}`,
            JSON.stringify({ branchId, branchName: resolvedName })
          );
        } catch {
          // ignore
        }
      }
    },
    [shop?.shopId, user, branches, canViewAllBranches]
  );

  const updateCurrentUser = useCallback((updates: Partial<ShopUser>) => {
    setUser((prevUser) => {
      if (!prevUser) return prevUser;
      const mergedUser: ShopUser = {
        ...prevUser,
        ...updates,
        updatedAt: Date.now(),
      };

      setSession((prevSession) => {
        if (!prevSession) return prevSession;
        const nextSession: ShopSession = {
          ...prevSession,
          user: mergedUser,
        };
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
          } catch (e) {
            console.warn("Failed to persist updated user session to sessionStorage", e);
          }
        }
        return nextSession;
      });

      return mergedUser;
    });
  }, []);

  // Multi-tenant scoped collection helper
  const getScopedCollection = useCallback(
    <T = DocumentData>(collectionName: string): CollectionReference<T> | null => {
      if (!shop?.shopId) {
        console.warn("[ShopAuth] Cannot get scoped collection without active shop session.");
        return null;
      }
      return getShopScopedCollection<T>(shop.shopId, collectionName);
    },
    [shop]
  );

  const value: ShopAuthContextType = {
    shop,
    user,
    session,
    originalAdminUser,
    rolePermissions,
    isPermissionsLoading,
    isAdmin,
    branches,
    authorizedBranches,
    canSwitchBranches,
    canViewAllBranches,
    activeBranchId,
    activeBranchName,
    isAuthenticated: Boolean(shop && user),
    isLoading,
    login,
    logout,
    switchUser,
    switchBranch,
    updateCurrentUser,
    getScopedCollection,
  };

  return <ShopAuthContext.Provider value={value}>{children}</ShopAuthContext.Provider>;
}

export function useShopAuth() {
  const ctx = useContext(ShopAuthContext);
  if (!ctx) {
    throw new Error("useShopAuth must be used within a <ShopAuthProvider>");
  }
  return ctx;
}
