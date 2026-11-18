"use client";

/**
 * app/shop/layout.tsx
 *
 * Provides ShopAuthProvider context and real-time RBAC ShopRouteGuard
 * for all shop-scoped routes (/shop, /shop/login, /shop/dashboard, etc.).
 */

import React from "react";
import { ShopAuthProvider } from "@/lib/context/ShopAuthContext";
import ShopRouteGuard from "@/components/rbac/ShopRouteGuard";

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShopAuthProvider>
      <ShopRouteGuard>{children}</ShopRouteGuard>
    </ShopAuthProvider>
  );
}
