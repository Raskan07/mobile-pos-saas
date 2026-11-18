/**
 * lib/types/notification.ts
 *
 * Data models for Admin-to-Shop Notifications, System Updates,
 * Announcements, and Direct Shop Messages.
 */

export type NotificationCategory =
  | "system_update"
  | "announcement"
  | "billing_alert"
  | "maintenance"
  | "direct_message";

export type NotificationPriority = "normal" | "important" | "urgent";

export type NotificationTargetType = "single_shop" | "multiple_shops" | "all_shops";

export interface ShopNotificationRecord {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  targetType: NotificationTargetType;
  /** Array of target shopIds (e.g. ["SHP-1024"]) or ["ALL"] for broadcast to all shops */
  targetShopIds: string[];
  /** Human-readable shop names for display in Admin history */
  targetShopNames: string[];
  /** Optional version badge for software/feature updates (e.g. "v2.5.0") */
  versionTag?: string;
  /** Optional CTA link inside the shop POS (e.g. "/shop/installments") */
  actionUrl?: string;
  actionLabel?: string;
  pinned?: boolean;
  sentBy: {
    name: string;
    role: string;
  };
  /** List of shopIds that have read/acknowledged this notification */
  readByShops: string[];
  /** Map of shopId -> timestamp (ms) when read */
  readTimestamps?: Record<string, number>;
  /** List of shopIds that have archived this notification */
  archivedByShops?: string[];
  /** List of shopIds that have deleted this notification from their shop inbox */
  deletedByShops?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateShopNotificationInput {
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  targetType: NotificationTargetType;
  targetShopIds: string[];
  targetShopNames: string[];
  versionTag?: string;
  actionUrl?: string;
  actionLabel?: string;
  pinned?: boolean;
  sentBy?: {
    name: string;
    role: string;
  };
}

export const NOTIFICATION_CATEGORY_META: Record<
  NotificationCategory,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  }
> = {
  system_update: {
    label: "System Update",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-300",
    badgeBorder: "border-emerald-500/30",
  },
  announcement: {
    label: "Announcement",
    badgeBg: "bg-sky-500/15",
    badgeText: "text-sky-300",
    badgeBorder: "border-sky-500/30",
  },
  direct_message: {
    label: "Admin Message",
    badgeBg: "bg-orange-500/15",
    badgeText: "text-orange-300",
    badgeBorder: "border-orange-500/30",
  },
  billing_alert: {
    label: "Account & Billing",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-300",
    badgeBorder: "border-amber-500/30",
  },
  maintenance: {
    label: "Maintenance",
    badgeBg: "bg-purple-500/15",
    badgeText: "text-purple-300",
    badgeBorder: "border-purple-500/30",
  },
};

