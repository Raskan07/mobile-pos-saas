"use client";

/**
 * lib/context/ShopAuthContext.tsx
 *
 * Context provider and hook for Shop-scoped session authentication.
 * Stores the authenticated Shop and User context, guaranteeing multi-tenant scoping.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shop } from "../types/shop";
import { ShopUser, ShopSession } from "../types/user";
import { verifyShopExists, getShopScopedCollection } from "../services/shopAuthService";
import { CollectionReference, DocumentData } from "firebase/firestore";

interface ShopAuthContextType {
  shop: Shop | null;
  user: ShopUser | null;
  session: ShopSession | null;
  activeBranchId: string;
  activeBranchName: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (session: ShopSession, shop: Shop, user: ShopUser) => void;
  logout: () => void;
  switchBranch: (branchId: string, branchName: string) => void;
  getScopedCollection: <T = DocumentData>(collectionName: string) => CollectionReference<T> | null;
}

const STORAGE_KEY = "pos_authenticated_shop_session";

const ShopAuthContext = createContext<ShopAuthContextType | undefined>(undefined);

export function ShopAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [user, setUser] = useState<ShopUser | null>(null);
  const [session, setSession] = useState<ShopSession | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string>("main");
  const [activeBranchName, setActiveBranchName] = useState<string>("Main Branch");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Rehydrate session from sessionStorage on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        if (typeof window === "undefined") return;

        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setIsLoading(false);
          return;
        }

        const parsedSession: ShopSession = JSON.parse(stored);
        if (!parsedSession.shopId || !parsedSession.user) {
          sessionStorage.removeItem(STORAGE_KEY);
          setIsLoading(false);
          return;
        }

        // Validate shop still exists in Firebase
        const validShop = await verifyShopExists(parsedSession.shopId);
        if (!validShop) {
          console.warn("[ShopAuth] Shop no longer exists, clearing session");
          sessionStorage.removeItem(STORAGE_KEY);
          setIsLoading(false);
          return;
        }

        setShop(validShop);
        setUser(parsedSession.user);
        setSession(parsedSession);
        if (parsedSession.user.branchId) {
          setActiveBranchId(parsedSession.user.branchId);
          setActiveBranchName(parsedSession.user.branchName || "Main Branch");
        }
      } catch (err) {
        console.error("[ShopAuth] Error restoring session:", err);
        sessionStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  const login = useCallback((newSession: ShopSession, newShop: Shop, newUser: ShopUser) => {
    setSession(newSession);
    setShop(newShop);
    setUser(newUser);
    if (newUser.branchId) {
      setActiveBranchId(newUser.branchId);
      setActiveBranchName(newUser.branchName || "Main Branch");
    }

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      } catch (e) {
        console.error("Failed to persist shop session to sessionStorage", e);
      }
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setShop(null);
    setUser(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    router.push("/shop");
  }, [router]);

  const switchBranch = useCallback((branchId: string, branchName: string) => {
    setActiveBranchId(branchId);
    setActiveBranchName(branchName);
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
    activeBranchId,
    activeBranchName,
    isAuthenticated: Boolean(shop && user),
    isLoading,
    login,
    logout,
    switchBranch,
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
