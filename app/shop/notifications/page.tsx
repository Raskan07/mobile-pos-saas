"use client";

/**
 * app/shop/notifications/page.tsx
 *
 * Clean, minimalist Gmail-inspired Inbox UI for Shop Notifications & Admin Updates.
 * Features:
 * - Left Gmail-style navigation rail (Inbox, Unread, Starred, System Updates, Direct, Announcements, Billing, Archived)
 * - Multi-select checkboxes + Select All + Bulk Group Actions (Archive Selected, Delete Selected, Mark Read)
 * - Single-message hover & reading-pane actions (Archive / Unarchive, Delete)
 * - Top centered search bar + Split View / Full List toggle
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Inbox,
  Bell,
  Search,
  X,
  CheckCheck,
  CheckCircle2,
  Star,
  Sparkles,
  Megaphone,
  MessageSquare,
  CreditCard,
  Mail,
  MailOpen,
  ExternalLink,
  ChevronLeft,
  Columns,
  Rows,
  Loader2,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  ShopNotificationRecord,
  NOTIFICATION_CATEGORY_META,
} from "@/lib/types/notification";
import {
  subscribeToShopNotifications,
  markNotificationAsRead,
  markAllShopNotificationsAsRead,
  isNotificationReadByShop,
  isNotificationArchivedByShop,
  archiveNotificationsForShop,
  deleteNotificationsForShop,
  markNotificationsReadBatchForShop,
} from "@/lib/services/notificationService";

type FolderId =
  | "inbox"
  | "unread"
  | "starred"
  | "system_update"
  | "direct_message"
  | "announcement"
  | "billing_alert"
  | "archived";

export default function ShopNotificationsPage() {
  const { shop } = useShopAuth();
  const currentShopId = shop?.shopId || "SHOP-7294";
  const currentShopName = shop?.shopName || "Mobile POS Store";

  const [notifications, setNotifications] = useState<ShopNotificationRecord[]>(
    []
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeFolder, setActiveFolder] = useState<FolderId>("inbox");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<boolean>(true);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load local starred state per shop
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(
        `skyfox_starred_notifs_${currentShopId}`
      );
      if (saved) setStarredIds(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, [currentShopId]);

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
      try {
        window.localStorage.setItem(
          `skyfox_starred_notifs_${currentShopId}`,
          JSON.stringify(next)
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    if (!currentShopId) return;
    setIsLoading(true);
    const unsub = subscribeToShopNotifications(currentShopId, (items) => {
      setNotifications(items);
      setIsLoading(false);
    });
    return () => unsub();
  }, [currentShopId]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  };

  // Counts (active non-archived vs archived)
  const counts = useMemo(() => {
    const activeItems = notifications.filter(
      (n) => !isNotificationArchivedByShop(n, currentShopId)
    );
    const archivedItems = notifications.filter((n) =>
      isNotificationArchivedByShop(n, currentShopId)
    );

    const unread = activeItems.filter(
      (n) => !isNotificationReadByShop(n, currentShopId)
    ).length;
    const starred = activeItems.filter(
      (n) => n.pinned || starredIds.includes(n.id)
    ).length;
    const updates = activeItems.filter(
      (n) => n.category === "system_update"
    ).length;
    const direct = activeItems.filter(
      (n) => n.category === "direct_message"
    ).length;
    const announcements = activeItems.filter(
      (n) => n.category === "announcement"
    ).length;
    const billing = activeItems.filter(
      (n) => n.category === "billing_alert" || n.category === "maintenance"
    ).length;

    return {
      inbox: activeItems.length,
      unread,
      starred,
      updates,
      direct,
      announcements,
      billing,
      archived: archivedItems.length,
    };
  }, [notifications, currentShopId, starredIds]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const isArchived = isNotificationArchivedByShop(item, currentShopId);
      const isRead = isNotificationReadByShop(item, currentShopId);
      const isStarred = Boolean(item.pinned || starredIds.includes(item.id));

      if (activeFolder === "archived") {
        if (!isArchived) return false;
      } else {
        // Non-archived folders hide archived items
        if (isArchived) return false;
        if (activeFolder === "unread" && isRead) return false;
        if (activeFolder === "starred" && !isStarred) return false;
        if (
          activeFolder === "system_update" &&
          item.category !== "system_update"
        )
          return false;
        if (
          activeFolder === "direct_message" &&
          item.category !== "direct_message"
        )
          return false;
        if (activeFolder === "announcement" && item.category !== "announcement")
          return false;
        if (
          activeFolder === "billing_alert" &&
          item.category !== "billing_alert" &&
          item.category !== "maintenance"
        )
          return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.title.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q) ||
        (item.versionTag && item.versionTag.toLowerCase().includes(q)) ||
        (item.sentBy?.name && item.sentBy.name.toLowerCase().includes(q))
      );
    });
  }, [notifications, activeFolder, searchQuery, currentShopId, starredIds]);

  // Keep checkedIds in sync with visible notifications
  useEffect(() => {
    const visibleSet = new Set(filteredNotifications.map((n) => n.id));
    setCheckedIds((prev) => prev.filter((id) => visibleSet.has(id)));
  }, [filteredNotifications]);

  const selectedMessage = useMemo(
    () => notifications.find((n) => n.id === selectedId) || null,
    [notifications, selectedId]
  );

  const handleOpenMessage = async (item: ShopNotificationRecord) => {
    setSelectedId(item.id);
    if (!isNotificationReadByShop(item, currentShopId)) {
      await markNotificationAsRead(item.id, currentShopId);
    }
  };

  // Multi-select checkbox handlers
  const allVisibleChecked =
    filteredNotifications.length > 0 &&
    checkedIds.length === filteredNotifications.length;

  const handleToggleSelectAll = () => {
    if (allVisibleChecked) {
      setCheckedIds([]);
    } else {
      setCheckedIds(filteredNotifications.map((n) => n.id));
    }
  };

  const handleToggleRowCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Group / Single Archive & Unarchive
  const handleArchiveIds = async (
    ids: string[],
    archive = true,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    if (ids.length === 0) return;
    await archiveNotificationsForShop(ids, currentShopId, archive);
    setCheckedIds((prev) => prev.filter((id) => !ids.includes(id)));
    if (selectedId && ids.includes(selectedId)) {
      setSelectedId(null);
    }
    showToast(
      archive
        ? `${ids.length === 1 ? "Message" : `${ids.length} messages`} archived`
        : `${ids.length === 1 ? "Message" : `${ids.length} messages`} moved to Inbox`
    );
  };

  // Group / Single Delete
  const handleDeleteIds = async (ids: string[], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (ids.length === 0) return;
    await deleteNotificationsForShop(ids, currentShopId);
    setCheckedIds((prev) => prev.filter((id) => !ids.includes(id)));
    if (selectedId && ids.includes(selectedId)) {
      setSelectedId(null);
    }
    showToast(
      `${ids.length === 1 ? "Message" : `${ids.length} messages`} deleted`
    );
  };

  // Group Mark Read
  const handleMarkSelectedRead = async () => {
    if (checkedIds.length === 0) return;
    await markNotificationsReadBatchForShop(checkedIds, currentShopId);
    setCheckedIds([]);
    showToast("Selected messages marked as read");
  };

  const handleMarkAllRead = async () => {
    if (counts.unread === 0) return;
    await markAllShopNotificationsAsRead(currentShopId);
    showToast("All messages marked as read");
  };

  const formatRowDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const FOLDERS: {
    id: FolderId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    highlightCount?: boolean;
  }[] = [
    {
      id: "inbox",
      label: "All Inbox",
      icon: Inbox,
      count: counts.unread,
      highlightCount: true,
    },
    {
      id: "unread",
      label: "Unread",
      icon: Mail,
      count: counts.unread,
      highlightCount: true,
    },
    {
      id: "starred",
      label: "Starred & Pinned",
      icon: Star,
      count: counts.starred,
    },
    {
      id: "system_update",
      label: "System Updates",
      icon: Sparkles,
      count: counts.updates,
    },
    {
      id: "direct_message",
      label: "Admin Messages",
      icon: MessageSquare,
      count: counts.direct,
    },
    {
      id: "announcement",
      label: "Announcements",
      icon: Megaphone,
      count: counts.announcements,
    },
    {
      id: "billing_alert",
      label: "Billing & Alerts",
      icon: CreditCard,
      count: counts.billing,
    },
    {
      id: "archived",
      label: "Archived",
      icon: Archive,
      count: counts.archived,
    },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0b10] text-zinc-100 font-sans flex flex-col select-none">
      {/* Subtle Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Top Gmail-Style App Bar ── */}
      <header className="h-16 px-4 sm:px-6 bg-[#0d0f17] border-b border-white/[0.07] flex items-center justify-between gap-4 shrink-0">
        {/* Left: Back to POS & Mail Identity */}
        <div className="flex items-center gap-3 min-w-[200px]">
          <Link
            href="/shop/dashboard"
            className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Back to POS Terminal"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight leading-none">
                Messages
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-1">
                {currentShopName} &bull; {currentShopId}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Gmail Pill Search Bar */}
        <div className="flex-1 max-w-2xl">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in admin updates, release notes, messages..."
              className="w-full pl-11 pr-10 py-2.5 rounded-full bg-[#161925] hover:bg-[#1a1e2d] focus:bg-[#1d2233] border border-white/[0.07] focus:border-emerald-500/40 text-xs text-white placeholder-zinc-500 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: View Mode & Mark All Read */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSplitMode((prev) => !prev)}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-300 text-xs font-medium cursor-pointer"
            title="Toggle Split Reading Pane"
          >
            {splitMode ? (
              <>
                <Columns className="w-3.5 h-3.5 text-emerald-400" />
                <span>Split View</span>
              </>
            ) : (
              <>
                <Rows className="w-3.5 h-3.5 text-zinc-400" />
                <span>Full List</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={counts.unread === 0}
            onClick={handleMarkAllRead}
            className="px-3.5 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mark all read</span>
          </button>
        </div>
      </header>

      {/* ── Main Workspace: Left Sidebar + Inbox List / Reading Pane ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Gmail Folder Rail */}
        <aside className="w-56 bg-[#0b0d14] border-r border-white/[0.06] p-3 flex flex-col justify-between shrink-0 hidden md:flex">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Mailboxes
            </div>
            {FOLDERS.map((folder) => {
              const Icon = folder.icon;
              const active = activeFolder === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setActiveFolder(folder.id);
                    setCheckedIds([]);
                    if (!splitMode) setSelectedId(null);
                  }}
                  className={`w-full px-3.5 py-2 rounded-r-full rounded-l-lg text-xs flex items-center justify-between transition-all cursor-pointer ${
                    active
                      ? "bg-emerald-500/15 text-emerald-300 font-bold border-l-2 border-l-emerald-400"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] font-medium"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 ${
                        active ? "text-emerald-400" : "text-zinc-400"
                      }`}
                    />
                    <span>{folder.label}</span>
                  </div>
                  {folder.count !== undefined && folder.count > 0 && (
                    <span
                      className={`text-[11px] font-mono ${
                        folder.highlightCount
                          ? "px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold"
                          : "text-zinc-500"
                      }`}
                    >
                      {folder.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom Status Card */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Admin Sync</span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Updates and announcements from System Admin arrive automatically.
            </p>
          </div>
        </aside>

        {/* Center + Right: Message List & Reading Pane */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0b10]">
          {/* Mobile Horizontal Folder Pills */}
          <div className="flex md:hidden items-center gap-1.5 px-3 py-2 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
            {FOLDERS.map((folder) => {
              const active = activeFolder === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setActiveFolder(folder.id);
                    setCheckedIds([]);
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-white/[0.04] text-zinc-400"
                  }`}
                >
                  {folder.label}
                  {folder.count ? ` (${folder.count})` : ""}
                </button>
              );
            })}
          </div>

          {/* Gmail Action Sub-Toolbar (Select All + Group Archive & Group Delete) */}
          <div className="h-11 px-4 border-b border-white/[0.06] flex items-center justify-between text-xs text-zinc-400 bg-[#0d0f17]/80 shrink-0">
            <div className="flex items-center gap-3">
              {!splitMode && selectedMessage ? (
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white font-semibold cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back to Inbox</span>
                </button>
              ) : (
                <>
                  {/* Select All Checkbox */}
                  <label
                    className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white"
                    title="Select all messages in view"
                  >
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={handleToggleSelectAll}
                      className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {checkedIds.length > 0 ? (
                    <div className="flex items-center gap-1.5 pl-1">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
                        {checkedIds.length} selected
                      </span>

                      {activeFolder === "archived" ? (
                        <button
                          type="button"
                          onClick={() => handleArchiveIds(checkedIds, false)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-emerald-500/20 border border-white/[0.08] hover:border-emerald-500/30 text-zinc-200 hover:text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Move selected messages back to Inbox"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Move to Inbox</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleArchiveIds(checkedIds, true)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-200 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Archive selected messages"
                        >
                          <Archive className="w-3.5 h-3.5 text-amber-400" />
                          <span>Archive</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteIds(checkedIds)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Delete selected messages"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Selected</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleMarkSelectedRead}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-zinc-300 text-[11px] font-medium hidden sm:flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Mark selected as read"
                      >
                        <MailOpen className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Mark Read</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCheckedIds([])}
                        className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 cursor-pointer"
                        title="Clear selection"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold text-zinc-300">
                      {FOLDERS.find((f) => f.id === activeFolder)?.label ||
                        "Inbox"}
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="text-[11px] font-mono text-zinc-500">
              {filteredNotifications.length > 0
                ? `1–${filteredNotifications.length} of ${filteredNotifications.length}`
                : "0 messages"}
            </div>
          </div>

          {/* Content Area */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center gap-2.5 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Syncing inbox...</span>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2.5">
              <div className="w-11 h-11 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center justify-center text-zinc-500">
                {activeFolder === "archived" ? (
                  <Archive className="w-5 h-5" />
                ) : (
                  <Inbox className="w-5 h-5" />
                )}
              </div>
              <div className="text-sm font-semibold text-zinc-300">
                Your {FOLDERS.find((f) => f.id === activeFolder)?.label} is empty
              </div>
              <p className="text-xs text-zinc-500 max-w-sm">
                {activeFolder === "archived"
                  ? "Messages you archive will be stored safely here."
                  : `Messages and software updates sent by the System Administrator to ${currentShopId} will appear here.`}
              </p>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Gmail Single-Line Message Rows */}
              {(splitMode || !selectedMessage) && (
                <div
                  className={`${
                    splitMode && selectedMessage
                      ? "w-full lg:w-[48%] border-r border-white/[0.07]"
                      : "w-full"
                  } overflow-y-auto divide-y divide-white/[0.05]`}
                >
                  {filteredNotifications.map((item) => {
                    const isRead = isNotificationReadByShop(item, currentShopId);
                    const isArchived = isNotificationArchivedByShop(
                      item,
                      currentShopId
                    );
                    const isSelected = selectedMessage?.id === item.id;
                    const isChecked = checkedIds.includes(item.id);
                    const isStarred = Boolean(
                      item.pinned || starredIds.includes(item.id)
                    );
                    const meta =
                      NOTIFICATION_CATEGORY_META[item.category] ||
                      NOTIFICATION_CATEGORY_META.announcement;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleOpenMessage(item)}
                        className={`group px-4 py-3 flex items-center gap-3 text-xs transition-colors cursor-pointer ${
                          isChecked
                            ? "bg-emerald-500/[0.14]"
                            : isSelected
                            ? "bg-emerald-500/[0.09] border-l-2 border-l-emerald-400"
                            : !isRead
                            ? "bg-[#131722] hover:bg-[#171c29]"
                            : "bg-transparent hover:bg-white/[0.03]"
                        }`}
                      >
                        {/* Row Checkbox + Unread Dot + Star Button */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(e) => handleToggleRowCheck(item.id, e)}
                            onChange={() => {}}
                            className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
                          />
                          <span
                            className={`w-2 h-2 rounded-full ${
                              !isRead
                                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                                : "bg-transparent"
                            }`}
                          />
                          <button
                            type="button"
                            onClick={(e) => toggleStar(item.id, e)}
                            className="text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer"
                            title="Star message"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isStarred
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-zinc-600 group-hover:text-zinc-400"
                              }`}
                            />
                          </button>
                        </div>

                        {/* Sender Column */}
                        <div
                          className={`w-24 sm:w-28 truncate shrink-0 ${
                            !isRead
                              ? "font-bold text-white"
                              : "font-normal text-zinc-400"
                          }`}
                        >
                          {item.sentBy?.name || "System Admin"}
                        </div>

                        {/* Subject + Inline Snippet (Gmail Row Layout) */}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                          >
                            {meta.label}
                          </span>
                          {item.versionTag && (
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.07] text-zinc-200 font-mono text-[10px] font-bold shrink-0">
                              {item.versionTag}
                            </span>
                          )}
                          <div className="truncate">
                            <span
                              className={
                                !isRead
                                  ? "font-bold text-white"
                                  : "font-medium text-zinc-300"
                              }
                            >
                              {item.title}
                            </span>
                            <span className="text-zinc-500 mx-1.5">&mdash;</span>
                            <span className="text-zinc-500">{item.message}</span>
                          </div>
                        </div>

                        {/* Right Column: Hover Quick Actions (Archive & Delete) OR Date */}
                        <div className="shrink-0 pl-2 flex items-center justify-end min-w-[72px]">
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) =>
                                handleArchiveIds([item.id], !isArchived, e)
                              }
                              className="p-1.5 rounded-lg hover:bg-white/[0.1] text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer"
                              title={
                                isArchived ? "Move back to Inbox" : "Archive"
                              }
                            >
                              {isArchived ? (
                                <ArchiveRestore className="w-3.5 h-3.5" />
                              ) : (
                                <Archive className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteIds([item.id], e)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <span
                            className={`group-hover:hidden text-[11px] font-mono ${
                              !isRead
                                ? "font-bold text-emerald-400"
                                : "text-zinc-500"
                            }`}
                          >
                            {formatRowDate(item.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Gmail Thread Reading Pane */}
              {selectedMessage ? (
                <div
                  className={`${
                    splitMode ? "hidden lg:flex lg:w-[52%]" : "flex w-full"
                  } flex-col overflow-y-auto bg-[#0c0e15] p-6 sm:p-8`}
                >
                  {(() => {
                    const meta =
                      NOTIFICATION_CATEGORY_META[selectedMessage.category] ||
                      NOTIFICATION_CATEGORY_META.announcement;
                    const isStarred = Boolean(
                      selectedMessage.pinned ||
                        starredIds.includes(selectedMessage.id)
                    );
                    const isArchived = isNotificationArchivedByShop(
                      selectedMessage,
                      currentShopId
                    );

                    return (
                      <div className="max-w-3xl w-full mx-auto space-y-6">
                        {/* Subject Header & Action Bar */}
                        <div className="space-y-3 pb-5 border-b border-white/[0.07]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                              >
                                {meta.label}
                              </span>
                              {selectedMessage.versionTag && (
                                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
                                  Release {selectedMessage.versionTag}
                                </span>
                              )}
                              {selectedMessage.priority === "urgent" && (
                                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold uppercase">
                                  Urgent
                                </span>
                              )}
                            </div>

                            {/* Reading Pane Action Buttons: Star, Archive, Delete, Close */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => toggleStar(selectedMessage.id, e)}
                                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-amber-400 cursor-pointer"
                                title="Star message"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    isStarred
                                      ? "fill-amber-400 text-amber-400"
                                      : ""
                                  }`}
                                />
                              </button>

                              <button
                                type="button"
                                onClick={(e) =>
                                  handleArchiveIds(
                                    [selectedMessage.id],
                                    !isArchived,
                                    e
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-zinc-300 hover:text-amber-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                                title={
                                  isArchived
                                    ? "Move back to Inbox"
                                    : "Archive message"
                                }
                              >
                                {isArchived ? (
                                  <>
                                    <ArchiveRestore className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Unarchive</span>
                                  </>
                                ) : (
                                  <>
                                    <Archive className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Archive</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={(e) =>
                                  handleDeleteIds([selectedMessage.id], e)
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                                title="Delete message"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setSelectedId(null)}
                                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white cursor-pointer"
                                title="Close reading pane"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <h1 className="text-lg sm:text-xl font-bold text-white leading-snug select-text">
                            {selectedMessage.title}
                          </h1>
                        </div>

                        {/* Gmail Sender Row (Avatar + Name + 'to me' + Timestamp) */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                              {(
                                selectedMessage.sentBy?.name || "System Admin"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">
                                  {selectedMessage.sentBy?.name ||
                                    "System Administrator"}
                                </span>
                                <span className="text-[11px] text-zinc-500 font-mono">
                                  &lt;admin@skyfoxpos.cloud&gt;
                                </span>
                              </div>
                              <div className="text-xs text-zinc-400 mt-0.5">
                                to{" "}
                                <span className="text-zinc-200 font-medium">
                                  {currentShopName}
                                </span>{" "}
                                <span className="font-mono text-[11px] text-zinc-500">
                                  ({currentShopId})
                                </span>
                                {selectedMessage.targetType === "all_shops" && (
                                  <span className="ml-1.5 text-[10px] text-zinc-500">
                                    &bull; All Registered Shops
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right font-mono text-[11px] text-zinc-400 shrink-0">
                            <div>
                              {new Date(
                                selectedMessage.createdAt
                              ).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {new Date(
                                selectedMessage.createdAt
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Email Body Content */}
                        <div className="pt-2 text-sm text-zinc-200 whitespace-pre-line leading-relaxed select-text">
                          {selectedMessage.message}
                        </div>

                        {/* Optional Action Button */}
                        {selectedMessage.actionUrl && (
                          <div className="pt-4">
                            <Link
                              href={selectedMessage.actionUrl}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 cursor-pointer"
                            >
                              <span>
                                {selectedMessage.actionLabel ||
                                  "Open Feature in POS"}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        )}

                        {/* Footer Read Receipt Confirmation */}
                        <div className="pt-6 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
                          <span className="flex items-center gap-1.5 text-emerald-400/90">
                            <MailOpen className="w-3.5 h-3.5" />
                            <span>Read receipt recorded for {currentShopId}</span>
                          </span>
                          <span className="font-mono">{selectedMessage.id}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                splitMode && (
                  <div className="hidden lg:flex lg:w-[52%] flex-col items-center justify-center p-12 text-center bg-[#0c0e15] text-zinc-500 space-y-2">
                    <Mail className="w-8 h-8 text-zinc-600" />
                    <div className="text-xs font-semibold text-zinc-400">
                      Select a message to read
                    </div>
                    <p className="text-[11px] text-zinc-600 max-w-xs">
                      Click any update or admin message on the left to open it here.
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
