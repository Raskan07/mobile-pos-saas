"use client";

/**
 * components/shops/SendShopNotificationModal.tsx
 *
 * Modal for Super Admin to send direct messages, software updates,
 * billing notices, or system-wide announcements to a specific shop,
 * selected shops, or all registered shops.
 * Also displays recent message history & read status for the target shop.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Bell,
  Send,
  X,
  Store,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Megaphone,
  Wrench,
  CreditCard,
  MessageSquare,
  Pin,
  Loader2,
  Clock,
  Trash2,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";
import {
  NotificationCategory,
  NotificationPriority,
  NotificationTargetType,
  ShopNotificationRecord,
  NOTIFICATION_CATEGORY_META,
} from "@/lib/types/notification";
import {
  sendShopNotification,
  subscribeToAllNotifications,
  deleteShopNotification,
  isNotificationReadByShop,
} from "@/lib/services/notificationService";

interface SendShopNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected shop when opened from a specific shop row or details modal */
  targetShop?: Shop | null;
  /** All registered shops for multi-shop or broadcast selection */
  allShops: Shop[];
  onSent?: (notification: ShopNotificationRecord) => void;
}

const QUICK_TEMPLATES: {
  label: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  versionTag?: string;
  title: string;
  message: string;
}[] = [
  {
    label: "POS Feature Update",
    category: "system_update",
    priority: "important",
    versionTag: "v2.5.0",
    title: "New POS Update: Installment Sales & Daily Thermal Statements",
    message:
      "We have deployed a major update to your POS terminal! You can now manage Customer Installment Plans, print 80mm Daily Sales Statements, and view real-time notifications directly from your dashboard.",
  },
  {
    label: "Scheduled Maintenance",
    category: "maintenance",
    priority: "normal",
    title: "Scheduled Cloud Sync Maintenance Tonight (11:30 PM – 12:00 AM)",
    message:
      "Our cloud database servers will undergo brief scheduled optimization tonight at 11:30 PM (Asia/Colombo). Your POS terminal will continue working offline without interruption.",
  },
  {
    label: "Subscription / Account Notice",
    category: "billing_alert",
    priority: "urgent",
    title: "Important: Monthly POS Subscription & Account Renewal",
    message:
      "Kindly review your shop's monthly SaaS subscription status. Please contact System Administration if you have already completed your bank transfer or need an invoice copy.",
  },
  {
    label: "General Admin Message",
    category: "direct_message",
    priority: "normal",
    title: "Message from System Administration",
    message:
      "Hello! We are checking in to ensure your shop's POS terminal, barcode scanner, and 80mm thermal printer are operating smoothly. Let us know if your team needs any assistance.",
  },
];

export function SendShopNotificationModal({
  isOpen,
  onClose,
  targetShop,
  allShops,
  onSent,
}: SendShopNotificationModalProps) {
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");

  // Form state
  const [targetType, setTargetType] = useState<NotificationTargetType>(
    targetShop ? "single_shop" : "all_shops"
  );
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>(
    targetShop ? [targetShop.shopId] : []
  );
  const [category, setCategory] = useState<NotificationCategory>("system_update");
  const [priority, setPriority] = useState<NotificationPriority>("normal");
  const [versionTag, setVersionTag] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [actionUrl, setActionUrl] = useState<string>("");
  const [actionLabel, setActionLabel] = useState<string>("");
  const [pinned, setPinned] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);

  // Sent notifications history
  const [allNotifications, setAllNotifications] = useState<
    ShopNotificationRecord[]
  >([]);

  useEffect(() => {
    if (!isOpen) return;
    if (targetShop) {
      setTargetType("single_shop");
      setSelectedShopIds([targetShop.shopId]);
    } else {
      setTargetType("all_shops");
      setSelectedShopIds([]);
    }
    setActiveTab("compose");
  }, [isOpen, targetShop]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToAllNotifications(setAllNotifications);
    return () => unsub();
  }, [isOpen]);

  // Filter history for this shop (if opened for a specific shop) or all
  const relevantHistory = useMemo(() => {
    if (!targetShop) return allNotifications;
    const norm = targetShop.shopId.trim().toUpperCase();
    return allNotifications.filter(
      (n) =>
        n.targetType === "all_shops" ||
        (n.targetShopIds || [])
          .map((s) => s.trim().toUpperCase())
          .some((s) => s === "ALL" || s === norm)
    );
  }, [allNotifications, targetShop]);

  if (!isOpen) return null;

  const handleToggleShopSelection = (shopId: string) => {
    setSelectedShopIds((prev) =>
      prev.includes(shopId)
        ? prev.filter((id) => id !== shopId)
        : [...prev, shopId]
    );
  };

  const handleApplyTemplate = (tpl: (typeof QUICK_TEMPLATES)[number]) => {
    setCategory(tpl.category);
    setPriority(tpl.priority);
    setVersionTag(tpl.versionTag || "");
    setTitle(tpl.title);
    setMessage(tpl.message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      alert("Please enter both a Notification Title and Message.");
      return;
    }

    const finalTargetIds =
      targetType === "all_shops"
        ? ["ALL"]
        : targetType === "single_shop" && targetShop
        ? [targetShop.shopId]
        : selectedShopIds;

    if (targetType !== "all_shops" && finalTargetIds.length === 0) {
      alert("Please select at least one shop to receive this message.");
      return;
    }

    const finalTargetNames =
      targetType === "all_shops"
        ? ["All Registered Shops"]
        : finalTargetIds.map((id) => {
            const found = allShops.find((s) => s.shopId === id);
            return found ? `${found.shopName} (${found.shopId})` : id;
          });

    setIsSending(true);
    try {
      const created = await sendShopNotification({
        title,
        message,
        category,
        priority,
        targetType,
        targetShopIds: finalTargetIds,
        targetShopNames: finalTargetNames,
        versionTag: versionTag.trim() || undefined,
        actionUrl: actionUrl.trim() || undefined,
        actionLabel: actionLabel.trim() || undefined,
        pinned,
        sentBy: {
          name: "System Administrator",
          role: "Super Admin",
        },
      });

      // Clear form fields ready for next message
      setTitle("");
      setMessage("");
      setVersionTag("");
      setActionUrl("");
      setActionLabel("");
      setPinned(false);

      if (onSent) onSent(created);
      onClose();
    } catch (err: any) {
      alert(err?.message || "Failed to send notification.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-[#111019] border border-white/[0.12] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Line */}
        <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500" />

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {targetShop
                  ? `Message & Update Center — ${targetShop.shopName}`
                  : "Broadcast Updates & Shop Notifications"}
              </h2>
              <p className="text-xs text-zinc-400">
                {targetShop
                  ? `Send direct updates or announcements to ${targetShop.shopId}`
                  : "Send real-time updates, release notes, or alerts to shops"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 rounded-xl bg-black/50 border border-white/[0.08] text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("compose")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  activeTab === "compose"
                    ? "bg-orange-500 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Compose
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  activeTab === "history"
                    ? "bg-orange-500 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Sent ({relevantHistory.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {activeTab === "compose" ? (
          <form
            onSubmit={handleSubmit}
            className="p-6 overflow-y-auto space-y-4 text-xs flex-1"
          >
            {/* Quick Templates Strip */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Quick Message Templates
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-orange-500/15 border border-white/[0.08] hover:border-orange-500/30 text-zinc-300 hover:text-orange-200 text-[11px] font-medium transition-all cursor-pointer"
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Selection */}
            <div className="space-y-2 pt-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Recipient Target
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {targetShop && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetType("single_shop");
                      setSelectedShopIds([targetShop.shopId]);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      targetType === "single_shop"
                        ? "bg-orange-500/15 border-orange-500 text-white font-semibold"
                        : "bg-black/40 border-white/[0.08] text-zinc-400 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-orange-400" />
                      <span className="truncate">{targetShop.shopName}</span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                      Only {targetShop.shopId}
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setTargetType("multiple_shops")}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    targetType === "multiple_shops"
                      ? "bg-orange-500/15 border-orange-500 text-white font-semibold"
                      : "bg-black/40 border-white/[0.08] text-zinc-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-sky-400" />
                    <span>Select Specific Shops</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {selectedShopIds.length} shop(s) selected
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType("all_shops")}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    targetType === "all_shops"
                      ? "bg-emerald-500/15 border-emerald-500 text-white font-semibold"
                      : "bg-black/40 border-white/[0.08] text-zinc-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Megaphone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>All Shops (Broadcast)</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Every registered shop ({allShops.length})
                  </div>
                </button>
              </div>

              {/* Multi-shop picker list when "multiple_shops" is selected */}
              {targetType === "multiple_shops" && (
                <div className="p-3 rounded-xl bg-black/50 border border-white/[0.08] max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {allShops.map((s) => {
                    const checked = selectedShopIds.includes(s.shopId);
                    return (
                      <label
                        key={s.shopId}
                        className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-all ${
                          checked
                            ? "bg-orange-500/15 border-orange-500/40 text-white"
                            : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleShopSelection(s.shopId)}
                          className="accent-orange-500"
                        />
                        <span className="font-mono text-[10px] text-orange-300">
                          {s.shopId}
                        </span>
                        <span className="truncate text-[11px]">{s.shopName}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Category, Priority & Optional Version Tag */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">
                  Notification Category
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as NotificationCategory)
                  }
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="system_update">System / Feature Update</option>
                  <option value="direct_message">Direct Admin Message</option>
                  <option value="announcement">General Announcement</option>
                  <option value="billing_alert">Account &amp; Billing Notice</option>
                  <option value="maintenance">Maintenance Alert</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as NotificationPriority)
                  }
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent / Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">
                  Version / Release Tag (Optional)
                </label>
                <input
                  type="text"
                  value={versionTag}
                  onChange={(e) => setVersionTag(e.target.value)}
                  placeholder="e.g. v2.5.0"
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-zinc-300 font-semibold text-[11px] mb-1">
                Subject / Update Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. New Installment Management Feature & Thermal Printing Update"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.12] text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Message Content */}
            <div>
              <label className="block text-zinc-300 font-semibold text-[11px] mb-1">
                Message / Update Details *
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the message, update release notes, or instructions for the shop owner and cashiers..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.12] text-white focus:outline-none focus:border-orange-500 resize-none leading-relaxed"
              />
            </div>

            {/* Optional Pin & Action Link */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="accent-orange-500 w-4 h-4"
                />
                <Pin className="w-3.5 h-3.5 text-orange-400" />
                <span>Pin this message to the top of shop notifications</span>
              </label>
            </div>

            {/* Submit Footer */}
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] hover:from-[#f95721] hover:to-[#ff6a38] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-600/25 cursor-pointer"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSending
                    ? "Sending to Shop..."
                    : targetType === "all_shops"
                    ? "Broadcast to All Shops"
                    : "Send Notification to Shop"}
                </span>
              </button>
            </div>
          </form>
        ) : (
          /* Sent History Tab */
          <div className="p-6 overflow-y-auto space-y-3 flex-1 text-xs">
            {relevantHistory.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">
                No notifications or updates sent yet.
              </div>
            ) : (
              relevantHistory.map((item) => {
                const meta =
                  NOTIFICATION_CATEGORY_META[item.category] ||
                  NOTIFICATION_CATEGORY_META.announcement;
                const isReadByTarget = targetShop
                  ? isNotificationReadByShop(item, targetShop.shopId)
                  : item.readByShops.length > 0;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-black/40 border border-white/[0.08] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                        >
                          {meta.label}
                        </span>
                        {item.versionTag && (
                          <span className="px-2 py-0.5 rounded-md bg-white/[0.07] text-zinc-200 font-mono text-[10px] font-bold">
                            {item.versionTag}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isReadByTarget
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {targetShop
                            ? isReadByTarget
                              ? "✓ Read by Shop"
                              : "Unread by Shop"
                            : `Read by ${item.readByShops?.length || 0} shop(s)`}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteShopNotification(item.id)}
                        className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="font-bold text-white text-sm">
                      {item.title}
                    </div>
                    <p className="text-zinc-300 leading-relaxed whitespace-pre-line">
                      {item.message}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-white/[0.05]">
                      <span>
                        To: {(item.targetShopNames || item.targetShopIds).join(", ")}
                      </span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

