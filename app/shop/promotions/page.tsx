"use client";

/**
 * app/shop/promotions/page.tsx
 *
 * Shop Discount Management module (/shop/promotions & /v1-shop/promotions).
 */

import React from "react";
import { useRouter } from "next/navigation";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import PromotionManagementWorkspace from "@/components/promotions/PromotionManagementWorkspace";

export default function ShopPromotionsPage() {
  const router = useRouter();
  const { shop } = useShopAuth();
  const { canAccessModule, isShopAdmin } = useRBAC();

  if (!shop?.shopId) return null;

  const canManage = isShopAdmin || canAccessModule("promotions");

  return (
    <PromotionManagementWorkspace
      shopId={shop.shopId}
      shopName={shop.shopName}
      canManage={canManage}
      onBack={() => router.push("/shop/dashboard")}
    />
  );
}
