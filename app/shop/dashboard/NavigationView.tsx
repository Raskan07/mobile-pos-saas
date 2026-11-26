"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  ScanLine,
  ClipboardList,
  Warehouse,
  BarChart3,
  BookOpen,
  BarChart2,
  FileText,
  Receipt,
  LayoutDashboard,
  Users,
  Bell,
  Settings,
  CreditCard,
  ShieldCheck,
  Wrench,
  Lock,
  Building2,
  Percent,
  Tag,
} from "lucide-react";
import {
  subscribeToShopNotifications,
  isNotificationReadByShop,
  isNotificationArchivedByShop,
} from "@/lib/services/notificationService";
import { ShopNotificationRecord } from "@/lib/types/notification";
import { useRBAC } from "@/lib/rbac/useRBAC";
import { MAIN_MENU_MODULE_REGISTRY } from "@/lib/rbac/permissions";

interface NavigationViewProps {
  onClose: () => void;
  shopName?: string;
  shopId?: string;
  cashierName?: string;
  cashierRole?: string;
  activeBranchName?: string;
  cartCount?: number;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package,
  ScanLine,
  ClipboardList,
  Wrench,
  Warehouse,
  BarChart3,
  ShieldCheck,
  BookOpen,
  BarChart2,
  FileText,
  Receipt,
  LayoutDashboard,
  Users,
  Bell,
  Settings,
  CreditCard,
  Building2,
  Percent,
  Tag,
};

export default function NavigationView({ onClose, shopId }: NavigationViewProps) {
  const { canAccessModule } = useRBAC();
  const [notifications, setNotifications] = useState<ShopNotificationRecord[]>([]);
  const currentShopId = shopId || "SHOP-7294";

  useEffect(() => {
    const unsub = subscribeToShopNotifications(currentShopId, setNotifications);
    return () => unsub();
  }, [currentShopId]);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (n) =>
          !isNotificationArchivedByShop(n, currentShopId) &&
          !isNotificationReadByShop(n, currentShopId)
      ).length,
    [notifications, currentShopId]
  );

  // Filter modules dynamically using the centralized permission registry and active role permissions
  const authorizedModules = useMemo(() => {
    return MAIN_MENU_MODULE_REGISTRY.filter((mod) => canAccessModule(mod.id));
  }, [canAccessModule]);

  return (
    <div className="fixed inset-0 z-50 bg-[#07080d] flex flex-col overflow-y-auto">
      {/* Floating back arrow */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-5 left-5 z-10 w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
        title="Back"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Card Grid */}
      <div className="flex-1 flex items-center justify-center p-6 pt-20">
        {authorizedModules.length === 0 ? (
          <div className="max-w-sm text-center space-y-2 p-6 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
            <Lock className="w-6 h-6 text-zinc-500 mx-auto" />
            <p className="text-xs font-semibold text-zinc-300">No Modules Assigned</p>
            <p className="text-[11px] text-zinc-500">
              Your current role has POS checkout access only. Contact a shop administrator to enable additional modules.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-3xl grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {authorizedModules.map((item) => {
              const Icon = ICON_MAP[item.iconName] || Package;
              const showUnreadBadge = item.id === "messages" && unreadCount > 0;
              const cardClasses =
                "relative group flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.18] transition-all duration-150 cursor-pointer active:scale-95";

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={true}
                  className={cardClasses}
                >
                  {showUnreadBadge && (
                    <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-mono font-bold shadow-lg shadow-emerald-500/40">
                      {unreadCount}
                    </span>
                  )}
                  <Icon className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                  <span className="text-[11px] font-medium text-zinc-400 group-hover:text-zinc-100 text-center leading-tight transition-colors">
                    {item.displayName}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
