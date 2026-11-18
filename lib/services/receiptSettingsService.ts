/**
 * lib/services/receiptSettingsService.ts
 *
 * Multi-tenant service to fetch, update, and persist POS Receipt Modifications.
 * Synchronizes with browser local cache for instant offline rendering,
 * and persists to Firestore for multi-device sync across POS terminals.
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ReceiptSettings, DEFAULT_RECEIPT_SETTINGS } from "@/lib/types/receiptSettings";

function getStorageKey(shopId: string): string {
  return `pos_receipt_settings_${shopId.toUpperCase()}`;
}

/**
 * Synchronous local retrieval for instant rendering without flashing or loading screens
 */
export function getStoredReceiptSettings(shopId: string, fallbackShopName?: string): ReceiptSettings {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(getStorageKey(shopId));
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_RECEIPT_SETTINGS,
          headerTitle: fallbackShopName || "",
          ...parsed,
          shopId,
        };
      }
    } catch (e) {
      console.warn("[ReceiptSettings] Error reading localStorage:", e);
    }
  }

  return {
    ...DEFAULT_RECEIPT_SETTINGS,
    headerTitle: fallbackShopName || "",
    shopId,
  };
}

/**
 * Async fetch from Firestore with fallback to local cache
 */
export async function fetchReceiptSettings(
  shopId: string,
  fallbackShopName?: string
): Promise<ReceiptSettings> {
  const local = getStoredReceiptSettings(shopId, fallbackShopName);

  if (!shopId) return local;

  try {
    const settingsDocRef = doc(db, "shops", shopId.toUpperCase(), "settings", "receipt");
    const snapshot = await getDoc(settingsDocRef);

    if (snapshot.exists()) {
      const remoteData = snapshot.data() as Partial<ReceiptSettings>;
      const merged: ReceiptSettings = {
        ...local,
        ...remoteData,
        shopId,
        updatedAt: remoteData.updatedAt || Date.now(),
      };

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(getStorageKey(shopId), JSON.stringify(merged));
        } catch {
          // ignore quota
        }
      }
      return merged;
    }
  } catch (error) {
    console.warn("[ReceiptSettings] Firestore fetch failed, using local settings:", error);
  }

  return local;
}

/**
 * Persist receipt modifications to both localStorage and Firestore
 */
export async function saveReceiptSettings(
  shopId: string,
  settings: Partial<ReceiptSettings>
): Promise<ReceiptSettings> {
  const normalizedShopId = shopId.toUpperCase();
  const current = getStoredReceiptSettings(normalizedShopId);

  const updated: ReceiptSettings = {
    ...current,
    ...settings,
    shopId: normalizedShopId,
    updatedAt: Date.now(),
  };

  // Immediate local save
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(getStorageKey(normalizedShopId), JSON.stringify(updated));
    } catch (e) {
      console.warn("[ReceiptSettings] localStorage write failed:", e);
    }
  }

  // Firestore save
  try {
    const settingsDocRef = doc(db, "shops", normalizedShopId, "settings", "receipt");
    await setDoc(settingsDocRef, updated, { merge: true });
  } catch (error) {
    console.warn("[ReceiptSettings] Firestore sync failed, cached locally:", error);
  }

  return updated;
}

/**
 * Reset receipt modifications back to factory defaults
 */
export async function resetReceiptSettings(
  shopId: string,
  fallbackShopName?: string
): Promise<ReceiptSettings> {
  const normalizedShopId = shopId.toUpperCase();
  const resetConfig: ReceiptSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    headerTitle: fallbackShopName || "",
    shopId: normalizedShopId,
    updatedAt: Date.now(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(getStorageKey(normalizedShopId), JSON.stringify(resetConfig));
    } catch {
      // ignore
    }
  }

  try {
    const settingsDocRef = doc(db, "shops", normalizedShopId, "settings", "receipt");
    await setDoc(settingsDocRef, resetConfig);
  } catch (err) {
    console.warn("[ReceiptSettings] Reset firestore sync error:", err);
  }

  return resetConfig;
}
