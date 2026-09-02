/**
 * lib/services/shopService.ts
 *
 * Firestore operations for the `shops` collection with geolocation support
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  updateDoc,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { Shop, CreateShopInput } from "../types/shop";

const SHOPS_COLLECTION = "shops";

/**
 * Generate a clean, unique alphanumeric Shop ID (e.g. SHP-7492)
 */
export function generateShopId(): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `SHP-${randomNum}`;
}

/**
 * Check if a Shop ID already exists in Firestore
 */
export async function isShopIdTaken(shopId: string): Promise<boolean> {
  try {
    const q = query(
      collection(db, SHOPS_COLLECTION),
      where("shopId", "==", shopId.trim().toUpperCase())
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking shop ID uniqueness:", error);
    return false;
  }
}

/**
 * Create a new shop in the `shops` collection with coordinates
 */
export async function createShop(input: CreateShopInput): Promise<Shop> {
  const normalizedShopId = input.shopId.trim().toUpperCase();

  // Verify uniqueness
  const taken = await isShopIdTaken(normalizedShopId);
  if (taken) {
    throw new Error(`Shop ID "${normalizedShopId}" is already taken. Please choose another.`);
  }

  const now = Date.now();
  const shopData: Omit<Shop, "id"> = {
    shopId: normalizedShopId,
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || "",
    address: input.address?.trim() || "",
    latitude: typeof input.latitude === "number" ? input.latitude : undefined,
    longitude: typeof input.longitude === "number" ? input.longitude : undefined,
    status: "active",
    createdAt: now,
    updatedAt: now,
    staffCount: 0,
  };

  const docRef = doc(db, SHOPS_COLLECTION, normalizedShopId);
  await setDoc(docRef, shopData);

  return {
    id: docRef.id,
    ...shopData,
  };
}

/**
 * Real-time listener for all shops
 */
export function subscribeToShops(
  onUpdate: (shops: Shop[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, SHOPS_COLLECTION), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const shops: Shop[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Shop, "id">),
      }));
      onUpdate(shops);
    },
    (err) => {
      console.error("Error subscribing to shops:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Fetch a single shop by its Shop ID
 */
export async function getShopByShopId(shopId: string): Promise<Shop | null> {
  try {
    const docRef = doc(db, SHOPS_COLLECTION, shopId.trim().toUpperCase());
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<Shop, "id">) };
    }
    return null;
  } catch (error) {
    console.error("Error fetching shop:", error);
    return null;
  }
}

/**
 * Delete a shop
 */
export async function deleteShop(shopId: string): Promise<void> {
  const docRef = doc(db, SHOPS_COLLECTION, shopId.trim().toUpperCase());
  await deleteDoc(docRef);
}

/**
 * Update shop details
 */
export async function updateShop(
  shopId: string,
  updates: Partial<Omit<Shop, "id" | "shopId" | "createdAt">>
): Promise<void> {
  const docRef = doc(db, SHOPS_COLLECTION, shopId.trim().toUpperCase());
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}
