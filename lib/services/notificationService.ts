/**
 * lib/services/notificationService.ts
 *
 * Real-time Admin-to-Shop Notification & Update Messaging Service.
 * Supports:
 * - Sending direct messages or system updates to a specific shop, multiple shops, or all shops
 * - Instant local cache + in-memory + cross-tab broadcasting + Firestore persistence
 * - Real-time subscriptions for both Super Admin (all sent notifications) and Individual Shops
 * - Read receipts per shop (mark single or all notifications as read)
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  ShopNotificationRecord,
  CreateShopNotificationInput,
} from "../types/notification";

const NOTIFICATIONS_COLLECTION = "shop_notifications";
const LOCAL_STORAGE_KEY = "skyfox_shop_notifications_v1";

type NotificationListener = (items: ShopNotificationRecord[]) => void;
const adminListeners = new Set<NotificationListener>();
const shopListeners = new Map<string, Set<NotificationListener>>();

function loadCachedNotifications(): ShopNotificationRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCachedNotifications(list: ShopNotificationRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    const sorted = [...list].sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) {
        return b.pinned ? 1 : -1;
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // ignore storage errors
  }
}

/**
 * Filter notifications relevant to a specific shopId (excluding items deleted by this shop)
 */
export function filterNotificationsForShop(
  all: ShopNotificationRecord[],
  shopId: string
): ShopNotificationRecord[] {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!normShopId) return [];
  return all
    .filter((item) => {
      const deletedBy = (item.deletedByShops || []).map((id) =>
        id.trim().toUpperCase()
      );
      if (deletedBy.includes(normShopId)) return false;

      if (item.targetType === "all_shops") return true;
      const targets = (item.targetShopIds || []).map((id) =>
        id.trim().toUpperCase()
      );
      return targets.includes("ALL") || targets.includes(normShopId);
    })
    .sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) {
        return b.pinned ? 1 : -1;
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

function broadcastNotifications(all: ShopNotificationRecord[]): void {
  const sorted = [...all].sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) {
      return b.pinned ? 1 : -1;
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  adminListeners.forEach((cb) => {
    try {
      cb(sorted);
    } catch {
      // ignore listener errors
    }
  });

  shopListeners.forEach((listeners, shopId) => {
    const filtered = filterNotificationsForShop(sorted, shopId);
    listeners.forEach((cb) => {
      try {
        cb(filtered);
      } catch {
        // ignore listener errors
      }
    });
  });
}

// Listen for cross-tab localStorage updates so Admin & Shop tabs update immediately
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LOCAL_STORAGE_KEY) {
      broadcastNotifications(loadCachedNotifications());
    }
  });
}

/**
 * Check if a notification has been read by a specific shop
 */
export function isNotificationReadByShop(
  notification: ShopNotificationRecord,
  shopId: string
): boolean {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!normShopId) return false;
  return (notification.readByShops || [])
    .map((s) => s.trim().toUpperCase())
    .includes(normShopId);
}

/**
 * Check if a notification has been archived by a specific shop
 */
export function isNotificationArchivedByShop(
  notification: ShopNotificationRecord,
  shopId: string
): boolean {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!normShopId) return false;
  return (notification.archivedByShops || [])
    .map((s) => s.trim().toUpperCase())
    .includes(normShopId);
}

/**
 * Archive or unarchive one or multiple notifications for a specific shop
 */
export async function archiveNotificationsForShop(
  notificationIds: string[],
  shopId: string,
  archive = true
): Promise<void> {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!normShopId || notificationIds.length === 0) return;

  const targetSet = new Set(notificationIds);
  const now = Date.now();
  const current = loadCachedNotifications();
  const updatedRecords: ShopNotificationRecord[] = [];

  const next = current.map((item) => {
    if (!targetSet.has(item.id)) return item;
    const archivedSet = new Set(
      (item.archivedByShops || []).map((s) => s.trim().toUpperCase())
    );
    if (archive) {
      archivedSet.add(normShopId);
    } else {
      archivedSet.delete(normShopId);
    }
    const updated: ShopNotificationRecord = {
      ...item,
      archivedByShops: Array.from(archivedSet),
      updatedAt: now,
    };
    updatedRecords.push(updated);
    return updated;
  });

  saveCachedNotifications(next);
  broadcastNotifications(next);

  Promise.allSettled(
    updatedRecords.flatMap((rec) => [
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, rec.id), {
        archivedByShops: rec.archivedByShops || [],
        updatedAt: now,
      }),
      updateDoc(doc(db, "shops", normShopId, "notifications", rec.id), {
        archivedByShops: rec.archivedByShops || [],
        updatedAt: now,
      }),
    ])
  ).catch(() => {});
}

/**
 * Delete one or multiple notifications from a specific shop's inbox (group or single delete)
 */
export async function deleteNotificationsForShop(
  notificationIds: string[],
  shopId: string
): Promise<void> {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!normShopId || notificationIds.length === 0) return;

  const targetSet = new Set(notificationIds);
  const now = Date.now();
  const current = loadCachedNotifications();
  const updatedRecords: ShopNotificationRecord[] = [];

  const next = current.map((item) => {
    if (!targetSet.has(item.id)) return item;
    const deletedSet = new Set(
      (item.deletedByShops || []).map((s) => s.trim().toUpperCase())
    );
    deletedSet.add(normShopId);
    const updated: ShopNotificationRecord = {
      ...item,
      deletedByShops: Array.from(deletedSet),
      updatedAt: now,
    };
    updatedRecords.push(updated);
    return updated;
  });

  saveCachedNotifications(next);
  broadcastNotifications(next);

  Promise.allSettled(
    updatedRecords.flatMap((rec) => [
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, rec.id), {
        deletedByShops: rec.deletedByShops || [],
        updatedAt: now,
      }),
      deleteDoc(doc(db, "shops", normShopId, "notifications", rec.id)),
    ])
  ).catch(() => {});
}

/**
 * Mark a group of selected notifications as read for a specific shop
 */
export async function markNotificationsReadBatchForShop(
  notificationIds: string[],
  shopId: string
): Promise<void> {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!normShopId || notificationIds.length === 0) return;

  const targetSet = new Set(notificationIds);
  const now = Date.now();
  const current = loadCachedNotifications();
  const updatedRecords: ShopNotificationRecord[] = [];

  const next = current.map((item) => {
    if (!targetSet.has(item.id)) return item;
    const readSet = new Set(
      (item.readByShops || []).map((s) => s.trim().toUpperCase())
    );
    readSet.add(normShopId);
    const updated: ShopNotificationRecord = {
      ...item,
      readByShops: Array.from(readSet),
      readTimestamps: {
        ...(item.readTimestamps || {}),
        [normShopId]: now,
      },
      updatedAt: now,
    };
    updatedRecords.push(updated);
    return updated;
  });

  saveCachedNotifications(next);
  broadcastNotifications(next);

  Promise.allSettled(
    updatedRecords.map((rec) =>
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, rec.id), {
        readByShops: rec.readByShops,
        readTimestamps: rec.readTimestamps,
        updatedAt: now,
      })
    )
  ).catch(() => {});
}

/**
 * Send a new notification / update message from Super Admin to one, multiple, or all shops
 */
export async function sendShopNotification(
  input: CreateShopNotificationInput
): Promise<ShopNotificationRecord> {
  const now = Date.now();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const id = `NTF-${now}-${rand}`;

  const normalizedIds =
    input.targetType === "all_shops"
      ? ["ALL"]
      : Array.from(
          new Set(
            (input.targetShopIds || [])
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean)
          )
        );

  const record: ShopNotificationRecord = {
    id,
    title: input.title.trim(),
    message: input.message.trim(),
    category: input.category,
    priority: input.priority || "normal",
    targetType: input.targetType,
    targetShopIds: normalizedIds,
    targetShopNames:
      input.targetType === "all_shops"
        ? ["All Registered Shops"]
        : input.targetShopNames || normalizedIds,
    ...(input.versionTag?.trim() ? { versionTag: input.versionTag.trim() } : {}),
    ...(input.actionUrl?.trim() ? { actionUrl: input.actionUrl.trim() } : {}),
    ...(input.actionLabel?.trim() ? { actionLabel: input.actionLabel.trim() } : {}),
    pinned: Boolean(input.pinned),
    sentBy: input.sentBy || {
      name: "System Administrator",
      role: "Super Admin",
    },
    readByShops: [],
    readTimestamps: {},
    createdAt: now,
    updatedAt: now,
  };

  // 1. Optimistic local update & broadcast
  const current = loadCachedNotifications();
  const next = [record, ...current.filter((item) => item.id !== record.id)];
  saveCachedNotifications(next);
  broadcastNotifications(next);

  // 2. Persist to Firestore in background without blocking UI
  const writes: Promise<unknown>[] = [
    setDoc(doc(db, NOTIFICATIONS_COLLECTION, record.id), record),
  ];

  if (record.targetType !== "all_shops") {
    normalizedIds.forEach((shopId) => {
      if (shopId && shopId !== "ALL") {
        writes.push(
          setDoc(doc(db, "shops", shopId, "notifications", record.id), record)
        );
      }
    });
  }

  Promise.allSettled(writes).catch((err) => {
    console.warn("Firestore notification write warning:", err);
  });

  return record;
}

/**
 * Mark a notification as read by a specific shop
 */
export async function markNotificationAsRead(
  notificationId: string,
  shopId: string
): Promise<void> {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!notificationId || !normShopId) return;

  const now = Date.now();
  const current = loadCachedNotifications();
  let updatedRecord: ShopNotificationRecord | null = null;

  const next = current.map((item) => {
    if (item.id !== notificationId) return item;
    const existingReads = new Set(
      (item.readByShops || []).map((s) => s.trim().toUpperCase())
    );
    existingReads.add(normShopId);
    const readByShops = Array.from(existingReads);
    const readTimestamps = {
      ...(item.readTimestamps || {}),
      [normShopId]: now,
    };
    updatedRecord = {
      ...item,
      readByShops,
      readTimestamps,
      updatedAt: now,
    };
    return updatedRecord;
  });

  saveCachedNotifications(next);
  broadcastNotifications(next);

  if (updatedRecord) {
    const rec = updatedRecord as ShopNotificationRecord;
    Promise.allSettled([
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
        readByShops: rec.readByShops,
        readTimestamps: rec.readTimestamps,
        updatedAt: now,
      }),
      updateDoc(doc(db, "shops", normShopId, "notifications", notificationId), {
        readByShops: rec.readByShops,
        readTimestamps: rec.readTimestamps,
        updatedAt: now,
      }),
    ]).catch(() => {});
  }
}

/**
 * Mark all notifications for a specific shop as read
 */
export async function markAllShopNotificationsAsRead(
  shopId: string
): Promise<void> {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!normShopId) return;

  const now = Date.now();
  const current = loadCachedNotifications();
  const toUpdate: ShopNotificationRecord[] = [];

  const next = current.map((item) => {
    const isTarget =
      item.targetType === "all_shops" ||
      (item.targetShopIds || [])
        .map((id) => id.trim().toUpperCase())
        .some((id) => id === "ALL" || id === normShopId);

    if (!isTarget) return item;
    if (isNotificationReadByShop(item, normShopId)) return item;

    const existingReads = new Set(
      (item.readByShops || []).map((s) => s.trim().toUpperCase())
    );
    existingReads.add(normShopId);
    const updated: ShopNotificationRecord = {
      ...item,
      readByShops: Array.from(existingReads),
      readTimestamps: {
        ...(item.readTimestamps || {}),
        [normShopId]: now,
      },
      updatedAt: now,
    };
    toUpdate.push(updated);
    return updated;
  });

  saveCachedNotifications(next);
  broadcastNotifications(next);

  Promise.allSettled(
    toUpdate.map((rec) =>
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, rec.id), {
        readByShops: rec.readByShops,
        readTimestamps: rec.readTimestamps,
        updatedAt: now,
      })
    )
  ).catch(() => {});
}

/**
 * Delete a notification (Super Admin action)
 */
export async function deleteShopNotification(
  notificationId: string
): Promise<void> {
  const current = loadCachedNotifications();
  const target = current.find((item) => item.id === notificationId);
  const next = current.filter((item) => item.id !== notificationId);
  saveCachedNotifications(next);
  broadcastNotifications(next);

  const deletes: Promise<unknown>[] = [
    deleteDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId)),
  ];
  if (target && target.targetShopIds) {
    target.targetShopIds.forEach((shopId) => {
      if (shopId && shopId !== "ALL") {
        deletes.push(
          deleteDoc(doc(db, "shops", shopId, "notifications", notificationId))
        );
      }
    });
  }
  Promise.allSettled(deletes).catch(() => {});
}

/**
 * Subscribe to all notifications (Super Admin view)
 */
export function subscribeToAllNotifications(
  onUpdate: (notifications: ShopNotificationRecord[]) => void
): Unsubscribe {
  adminListeners.add(onUpdate);

  // Immediately emit cached items
  const cached = loadCachedNotifications();
  onUpdate(cached);

  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    orderBy("createdAt", "desc")
  );

  const unsubFirestore = onSnapshot(
    q,
    (snapshot) => {
      const map = new Map<string, ShopNotificationRecord>();
      loadCachedNotifications().forEach((c) => map.set(c.id, c));
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as Omit<ShopNotificationRecord, "id">;
        map.set(docSnap.id, { id: docSnap.id, ...data });
      });
      const merged = Array.from(map.values());
      saveCachedNotifications(merged);
      broadcastNotifications(merged);
    },
    () => {
      onUpdate(loadCachedNotifications());
    }
  );

  return () => {
    adminListeners.delete(onUpdate);
    unsubFirestore();
  };
}

/**
 * Subscribe to notifications for a specific shop (Shop POS view)
 */
export function subscribeToShopNotifications(
  shopId: string,
  onUpdate: (notifications: ShopNotificationRecord[]) => void
): Unsubscribe {
  const normShopId = (shopId || "").trim().toUpperCase();
  if (!shopListeners.has(normShopId)) {
    shopListeners.set(normShopId, new Set());
  }
  shopListeners.get(normShopId)!.add(onUpdate);

  // Immediately emit cached notifications for this shop
  const cached = loadCachedNotifications();
  onUpdate(filterNotificationsForShop(cached, normShopId));

  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    orderBy("createdAt", "desc")
  );

  const unsubFirestore = onSnapshot(
    q,
    (snapshot) => {
      const map = new Map<string, ShopNotificationRecord>();
      loadCachedNotifications().forEach((c) => map.set(c.id, c));
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as Omit<ShopNotificationRecord, "id">;
        map.set(docSnap.id, { id: docSnap.id, ...data });
      });
      const merged = Array.from(map.values());
      saveCachedNotifications(merged);
      broadcastNotifications(merged);
    },
    () => {
      onUpdate(filterNotificationsForShop(loadCachedNotifications(), normShopId));
    }
  );

  return () => {
    shopListeners.get(normShopId)?.delete(onUpdate);
    unsubFirestore();
  };
}

