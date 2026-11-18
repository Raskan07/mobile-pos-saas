"use client";

/**
 * app/sa-9x8f2k/notifications/page.tsx
 *
 * Super Admin Notifications & Shop Updates Hub.
 * Allows Admin to:
 * - Send updates, announcements, billing alerts, or direct messages to individual shops or all shops
 * - View all sent notifications with per-shop read status
 * - Filter by shop or notification category
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Bell,
  Send,
  Store,
  Search,
  Trash2,
  CheckCircle2,
  Sparkles,
  Pin,
  Megaphone,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Shop } from "@/lib/types/shop";
import { subscribeToShops } from "@/lib/services/shopService";
import {
  ShopNotificationRecord,
  NotificationCategory,
  NOTIFICATION_CATEGORY_META,
} from "@/lib/types/notification";
import {
  subscribeToAllNotifications,
  deleteShopNotification,
} from "@/lib/services/notificationService";
import { SendShopNotificationModal } from "@/components/shops/SendShopNotificationModal";

export default function SuperAdminNotificationsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [notifications, setNotifications] = useState<ShopNotificationRecord[]>(
    []
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | NotificationCategory
  >("all");
  const [selectedShopFilter, setSelectedShopFilter] = useState<string>("all");

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTargetShop, setComposeTargetShop] = useState<Shop | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  useEffect(() => {
    const unsubShops = subscribeToShops(setShops);
    const unsubNotifs = subscribeToAllNotifications(setNotifications);
    return () => {
      unsubShops();
      unsubNotifs();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastText(msg);
    setTimeout(() => setToastText(null), 3200);
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }
      if (selectedShopFilter !== "all") {
        const norm = selectedShopFilter.toUpperCase();
        const matchesShop =
          item.targetType === "all_shops" ||
          (item.targetShopIds || [])
            .map((s) => s.toUpperCase())
            .some((s) => s === "ALL" || s === norm);
        if (!matchesShop) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q) ||
        (item.versionTag && item.versionTag.toLowerCase().includes(q)) ||
        (item.targetShopNames || []).some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [notifications, selectedCategory, selectedShopFilter, searchQuery]);

  return (
    <AppShell defaultSectionId="shops">
      {toastText && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-2xl flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>{toastText}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full overflow-hidden p-5 sm:p-6 max-w-7xl mx-auto w-full space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white">
                Shop Updates &amp; Notification Center
              </h1>
              <p className="text-xs text-zinc-400">
                Broadcast system updates, feature releases, or direct messages to individual shops
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setComposeTargetShop(null);
                setIsComposeOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-orange-600/25 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Message / Update</span>
            </button>
          </div>
        </div>

        {/* Quick Send to Specific Shop Bar */}
        {shops.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <span className="text-[11px] text-zinc-400 font-semibold shrink-0">
              Quick Message Shop:
            </span>
            {shops.map((shop) => (
              <button
                key={shop.shopId}
                type="button"
                onClick={() => {
                  setComposeTargetShop(shop);
                  setIsComposeOpen(true);
                }}
                className="px-3 py-1 rounded-full bg-white/[0.04] hover:bg-orange-500/15 border border-white/[0.08] hover:border-orange-500/35 text-[11px] text-zinc-300 hover:text-orange-200 flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer"
              >
                <Store className="w-3 h-3 text-orange-400" />
                <span className="font-mono font-semibold">{shop.shopId}</span>
                <span>({shop.shopName})</span>
              </button>
            ))}
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sent updates, titles, version tags, or shops..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-xs text-white focus:outline-none focus:border-orange-500/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={selectedShopFilter}
              onChange={(e) => setSelectedShopFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-zinc-200 text-xs focus:outline-none"
            >
              <option value="all">All Target Shops</option>
              {shops.map((s) => (
                <option key={s.shopId} value={s.shopId}>
                  {s.shopName} ({s.shopId})
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-zinc-200 text-xs focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="system_update">System Updates</option>
              <option value="direct_message">Direct Messages</option>
              <option value="announcement">Announcements</option>
              <option value="billing_alert">Account &amp; Billing</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        {/* Sent Notifications List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {filteredNotifications.length === 0 ? (
            <div className="p-12 rounded-2xl bg-black/30 border border-white/[0.07] text-center space-y-3">
              <Megaphone className="w-8 h-8 text-zinc-600 mx-auto" />
              <div className="text-sm font-semibold text-zinc-300">
                No notifications or shop updates sent yet
              </div>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Send release notes, feature updates, maintenance alerts, or direct messages to individual shops or broadcast to all shops.
              </p>
              <button
                type="button"
                onClick={() => {
                  setComposeTargetShop(null);
                  setIsComposeOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-[#ea4815] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Send First Notification</span>
              </button>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const meta =
                NOTIFICATION_CATEGORY_META[item.category] ||
                NOTIFICATION_CATEGORY_META.announcement;

              return (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl bg-black/35 border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.pinned && (
                        <span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-bold flex items-center gap-1">
                          <Pin className="w-2.5 h-2.5" /> Pinned
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                      >
                        {meta.label}
                      </span>
                      {item.versionTag && (
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.08] text-white font-mono text-[10px] font-bold">
                          {item.versionTag}
                        </span>
                      )}
                      {item.priority === "urgent" && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold uppercase">
                          Urgent
                        </span>
                      )}
                      {item.priority === "important" && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase">
                          Important
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Read by {item.readByShops?.length || 0} shop(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteShopNotification(item.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="Delete Notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">{item.title}</h3>
                    <p className="text-xs text-zinc-300 mt-1 whitespace-pre-line leading-relaxed">
                      {item.message}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                    <div>
                      <span className="text-zinc-500">Recipients: </span>
                      <span className="font-mono text-zinc-200">
                        {(item.targetShopNames || item.targetShopIds).join(", ")}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      Sent {new Date(item.createdAt).toLocaleString()} by{" "}
                      {item.sentBy?.name || "Super Admin"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <SendShopNotificationModal
        isOpen={isComposeOpen}
        targetShop={composeTargetShop}
        allShops={shops}
        onClose={() => {
          setIsComposeOpen(false);
          setComposeTargetShop(null);
        }}
        onSent={(notif) => {
          showToast(`Notification "${notif.title}" sent!`);
        }}
      />
    </AppShell>
  );
}

