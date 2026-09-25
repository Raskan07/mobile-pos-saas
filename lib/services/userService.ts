/**
 * lib/services/userService.ts
 *
 * User account creation via Firebase Authentication & Firestore `users` collection
 * Enforces one-shop assignment per user and provides multi-tenant query helpers
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
  increment,
  Unsubscribe,
  DocumentData,
  Query,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db, getSecondaryAuth } from "../firebase";
import { ShopUser, CreateUserInput } from "../types/user";

import { hashPassword } from "./shopAuthService";

const USERS_COLLECTION = "users";
const SHOPS_COLLECTION = "shops";

/**
 * Create a staff user with password & assign strictly to one shop
 */
export async function createUserAndAssignToShop(
  input: CreateUserInput,
  password?: string
): Promise<ShopUser> {
  const normalizedShopId = input.shopId.trim().toUpperCase();
  const username = input.username?.trim().toLowerCase() || "user";
  const normalizedEmail = input.email?.trim().toLowerCase() || `${username}@${normalizedShopId.toLowerCase().replace(/[^a-z0-9]/g, "")}.pos`;
  const rawPassword = (password || input.password || "shop123456").trim();
  const pwdHash = await hashPassword(rawPassword);

  let authUid = "";

  // 1. Try Firebase Auth (if enabled), else use stable ID
  if (rawPassword) {
    try {
      const secondaryAuth = getSecondaryAuth();
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        normalizedEmail,
        rawPassword
      );
      authUid = userCredential.user.uid;
    } catch (authError: any) {
      // Ignored if auth/operation-not-allowed or email already in use
      authUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
  } else {
    authUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  // 2. Fetch Shop Name for caching on the user record
  let shopName = "";
  try {
    const shopDoc = await getDoc(doc(db, SHOPS_COLLECTION, normalizedShopId));
    if (shopDoc.exists()) {
      shopName = shopDoc.data().shopName || "";
    }
  } catch (err) {
    console.error("Error fetching shop name for user:", err);
  }

  const now = Date.now();
  const displayName = input.displayName?.trim() || username;
  const userData: ShopUser = {
    uid: authUid,
    username,
    displayName,
    email: normalizedEmail,
    password: rawPassword,
    passwordHash: pwdHash,
    phone: input.phone?.trim() || "",
    role: input.role,
    shopId: normalizedShopId,
    shopName,
    branchId: input.branchId || "main",
    branchName: input.branchName || "Main Branch",
    permissions: input.permissions || [input.role],
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  // 3a. Save to Firestore `users` collection (for global / superadmin lookup)
  const userDocRef = doc(db, USERS_COLLECTION, authUid);
  await setDoc(userDocRef, userData);

  // 3b. Save nested under `shops/{shopId}/users/{authUid}` (for shop-scoped multi-tenancy)
  try {
    const nestedUserDocRef = doc(db, SHOPS_COLLECTION, normalizedShopId, "users", authUid);
    await setDoc(nestedUserDocRef, userData);
  } catch (err) {
    console.warn("Could not write to nested shop users collection:", err);
  }

  // 4. Increment staff count on the shop
  try {
    const shopDocRef = doc(db, SHOPS_COLLECTION, normalizedShopId);
    await updateDoc(shopDocRef, {
      staffCount: increment(1),
      updatedAt: now,
    });
  } catch (err) {
    console.warn("Could not increment shop staff count:", err);
  }

  return userData;
}

/**
 * Real-time listener for users assigned to a specific shop (isolated by shopId)
 */
export function subscribeToUsersByShop(
  shopId: string,
  onUpdate: (users: ShopUser[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const normalizedShopId = shopId.trim().toUpperCase();
  const q = query(
    collection(db, USERS_COLLECTION),
    where("shopId", "==", normalizedShopId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const users: ShopUser[] = snapshot.docs.map(
        (d) => d.data() as ShopUser
      );
      // Sort by creation date desc
      users.sort((a, b) => b.createdAt - a.createdAt);
      onUpdate(users);
    },
    (err) => {
      console.error(`Error subscribing to users for shop ${normalizedShopId}:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time listener for all users across all shops (for superadmin overview)
 */
export function subscribeToAllUsers(
  onUpdate: (users: ShopUser[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, USERS_COLLECTION), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const users: ShopUser[] = snapshot.docs.map(
        (d) => d.data() as ShopUser
      );
      onUpdate(users);
    },
    (err) => {
      console.error("Error subscribing to all users:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Delete a user and decrement shop staff count
 */
export async function deleteUser(uid: string, shopId: string): Promise<void> {
  const userDocRef = doc(db, USERS_COLLECTION, uid);
  await deleteDoc(userDocRef);

  try {
    const shopDocRef = doc(db, SHOPS_COLLECTION, shopId.trim().toUpperCase());
    await updateDoc(shopDocRef, {
      staffCount: increment(-1),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("Could not decrement shop staff count:", err);
  }
}

/**
 * Update user role or details
 */
export async function updateUser(
  uid: string,
  updates: Partial<Omit<ShopUser, "uid" | "createdAt">>
): Promise<void> {
  const userDocRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userDocRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Multi-Tenant Data Query Helper:
 * Generates an isolated Firestore Query filtered strictly by `shopId`.
 * Use this helper for all future collections (products, sales, customers, repairs, etc.)
 */
export function filterDataByShop<T = DocumentData>(
  collectionName: string,
  shopId: string
): Query<T> {
  const normalizedShopId = shopId.trim().toUpperCase();
  return query(
    collection(db, collectionName),
    where("shopId", "==", normalizedShopId)
  ) as Query<T>;
}
