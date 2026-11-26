"use client";

/**
 * app/sa-9x8f2k/promotions/page.tsx
 *
 * Super Admin Cross-Shop Discount Management Workspace.
 * Allows Super Admin to manage promotions across any registered shop while maintaining
 * strict per-shop (`shopId`) isolation in Firestore.
 */

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { subscribeToShops } from "@/lib/services/shopService";
import type { Shop } from "@/lib/types/shop";
import PromotionManagementWorkspace from "@/components/promotions/PromotionManagementWorkspace";

export default function SuperAdminPromotionsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");

  useEffect(() => {
    const unsub = subscribeToShops((list) => {
      setShops(list);
      if (list.length > 0 && !selectedShopId) {
        setSelectedShopId(list[0].shopId);
      }
    });
    return () => unsub();
  }, [selectedShopId]);

  const activeShop = shops.find((s) => s.shopId === selectedShopId) || shops[0];

  return (
    <AppShell defaultSectionId="shops">
      <div className="flex-1 overflow-y-auto">
        {activeShop ? (
          <PromotionManagementWorkspace
            shopId={activeShop.shopId}
            shopName={activeShop.shopName}
            canManage={true}
            superAdminShops={shops.map((s) => ({
              shopId: s.shopId,
              shopName: s.shopName,
            }))}
            onSelectSuperAdminShop={setSelectedShopId}
          />
        ) : (
          <div className="p-12 text-center text-xs text-zinc-400">
            No registered shops found. Create a shop first to manage promotions.
          </div>
        )}
      </div>
    </AppShell>
  );
}
