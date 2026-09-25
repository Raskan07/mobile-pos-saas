"use client";

/**
 * app/shop/layout.tsx
 *
 * Provides ShopAuthProvider context for all shop-scoped routes (/shop, /shop/login, /shop/dashboard).
 */

import React from "react";
import { ShopAuthProvider } from "@/lib/context/ShopAuthContext";

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ShopAuthProvider>{children}</ShopAuthProvider>;
}
