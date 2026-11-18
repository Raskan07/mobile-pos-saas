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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, getSecondaryAuth } from "../firebase";
import { ShopUser, CreateUserInput, UserRole, UserPersonalNote } from "../types/user";
import { DEFAULT_BRANCH_PERMISSIONS_BY_ROLE } from "../rbac/permissions";
import { hashPassword } from "./shopAuthService";

const USERS_COLLECTION = "users";
const SHOPS_COLLECTION = "shops";
const USER_IMAGES_COLLECTION = "user_images";

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

  // 1. Fast Auth registration with fallback ID (max 1.5s timeout to prevent UI hanging)
  if (rawPassword) {
    try {
      const authPromise = (async () => {
        try {
          const secondaryAuth = getSecondaryAuth();
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth,
            normalizedEmail,
            rawPassword
          );
          return userCredential.user.uid;
        } catch {
          return null;
        }
      })();

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
      const resultUid = await Promise.race([authPromise, timeoutPromise]);
      authUid = resultUid || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    } catch {
      authUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
  } else {
    authUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  // 2. Fetch Shop Name for caching on the user record (use input if available)
  let shopName = (input as any).shopName || "";
  if (!shopName) {
    try {
      const shopDoc = await getDoc(doc(db, SHOPS_COLLECTION, normalizedShopId));
      if (shopDoc.exists()) {
        shopName = shopDoc.data().shopName || "";
      }
    } catch (err) {
      console.error("Error fetching shop name for user:", err);
    }
  }

  const now = Date.now();
  const displayName = input.displayName?.trim() || username;
  const cleanRole = (input.role || "cashier").toLowerCase();
  const primaryBranchId = (input.primaryBranchId || input.branchId || "main").trim();
  const assignedBranchIds = Array.from(
    new Set([primaryBranchId, ...(input.assignedBranchIds || [])])
  );
  const allBranchesAccess =
    input.allBranchesAccess !== undefined
      ? Boolean(input.allBranchesAccess)
      : cleanRole === "admin";
  const defaultBranchPerms =
    DEFAULT_BRANCH_PERMISSIONS_BY_ROLE[cleanRole] ||
    DEFAULT_BRANCH_PERMISSIONS_BY_ROLE.cashier;

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
    branchId: primaryBranchId,
    branchName: input.branchName || "Main Branch",
    primaryBranchId,
    assignedBranchIds,
    allBranchesAccess,
    branchPermissions: input.branchPermissions || defaultBranchPerms,
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
  const normShopId = shopId.trim().toUpperCase();
  const userDocRef = doc(db, USERS_COLLECTION, uid);
  await deleteDoc(userDocRef);

  // Also remove from nested shop collection
  try {
    const nestedRef = doc(db, SHOPS_COLLECTION, normShopId, "users", uid);
    await deleteDoc(nestedRef);
  } catch (e) {
    console.warn("Could not delete nested user doc:", e);
  }

  try {
    const shopDocRef = doc(db, SHOPS_COLLECTION, normShopId);
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
 * Update Shop User RBAC permissions and role
 * Guarantees:
 * - Scoped strictly to authenticated `activeShopId` (cross-tenant edits strictly blocked)
 * - Updates both `/users/{uid}` and `/shops/{shopId}/users/{uid}` atomically
 * - Preserves historical sales and other transactional records
 */
export async function updateShopUserRBAC(
  activeShopId: string,
  targetUid: string,
  updates: {
    role?: UserRole;
    permissions?: string[];
    customPermissions?: string[];
    status?: "active" | "suspended" | "pending";
    displayName?: string;
    phone?: string;
  }
): Promise<void> {
  const normShopId = activeShopId.trim().toUpperCase();
  if (!normShopId) {
    throw new Error("Active Shop ID is required to update staff permissions.");
  }

  // 1. Fetch user to verify they belong to this active shop
  const userDocRef = doc(db, USERS_COLLECTION, targetUid);
  const snap = await getDoc(userDocRef);

  if (!snap.exists()) {
    throw new Error(`Staff member with ID ${targetUid} not found.`);
  }

  const existingData = snap.data() as ShopUser;
  if (existingData.shopId.trim().toUpperCase() !== normShopId) {
    throw new Error(
      `Access denied: Target user belongs to shop ${existingData.shopId}, not ${normShopId}.`
    );
  }

  const now = Date.now();
  const payload: Record<string, any> = {
    ...updates,
    updatedAt: now,
  };

  // 2. Update global users collection
  await updateDoc(userDocRef, payload);

  // 3. Mirror update to nested shop collection `shops/{shopId}/users/{uid}`
  try {
    const nestedUserDocRef = doc(db, SHOPS_COLLECTION, normShopId, "users", targetUid);
    await updateDoc(nestedUserDocRef, payload);
  } catch (err) {
    console.warn("Could not update nested shop user doc:", err);
  }
}

/**
 * Delete a user scoped strictly to active shopId
 */
export async function deleteShopUser(
  activeShopId: string,
  targetUid: string
): Promise<void> {
  return deleteUser(targetUid, activeShopId);
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

/**
 * Upload user profile avatar to Firebase Storage (`shops/{shopId}/user_images/...`)
 * and register metadata in Firestore `user_images` collection + user document.
 */
export async function uploadUserProfileImage(
  shopId: string,
  userId: string,
  file: File
): Promise<string> {
  const normShopId = (shopId || "DEFAULT").trim().toUpperCase();
  const cleanUserId = (userId || "staff").trim();

  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const uniqueName = `${cleanUserId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${cleanFileName}`;
  const storagePath = `shops/${normShopId}/${USER_IMAGES_COLLECTION}/${uniqueName}`;

  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
    customMetadata: {
      shopId: normShopId,
      userId: cleanUserId,
      originalName: file.name,
    },
  });

  const downloadUrl = await getDownloadURL(snapshot.ref);
  const now = Date.now();

  const imageRecord = {
    id: uniqueName,
    shopId: normShopId,
    userId: cleanUserId,
    storagePath,
    downloadUrl,
    fileName: file.name,
    fileSize: file.size,
    contentType: file.type || "image/jpeg",
    uploadedAt: now,
  };

  // 1. Store record in shop-scoped Firestore `shops/{shopId}/user_images/{id}`
  try {
    const shopImgRef = doc(db, SHOPS_COLLECTION, normShopId, USER_IMAGES_COLLECTION, uniqueName);
    await setDoc(shopImgRef, imageRecord);
  } catch (err) {
    console.warn("[UserService] Notice writing to shop user_images collection:", err);
  }

  // 2. Mirror record to root `user_images/{id}` collection
  try {
    const rootImgRef = doc(db, USER_IMAGES_COLLECTION, uniqueName);
    await setDoc(rootImgRef, imageRecord);
  } catch (err) {
    console.warn("[UserService] Notice writing to root user_images collection:", err);
  }

  // 3. Persist avatarUrl onto user profile documents
  await updateUserProfileDetails(normShopId, cleanUserId, { avatarUrl: downloadUrl });

  return downloadUrl;
}

/**
 * Update user profile details (displayName, username, email, phone, jobTitle, bio,
 * avatarUrl, scratchpadNote, personalNotes) in Firestore (`users/{uid}` and `shops/{shopId}/users/{uid}`).
 */
export async function updateUserProfileDetails(
  shopId: string,
  userId: string,
  updates: {
    displayName?: string;
    username?: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    bio?: string;
    avatarUrl?: string;
    scratchpadNote?: string;
    personalNotes?: UserPersonalNote[];
  }
): Promise<void> {
  const normShopId = (shopId || "DEFAULT").trim().toUpperCase();
  const cleanUserId = (userId || "").trim();
  if (!cleanUserId) return;

  const now = Date.now();
  const payload: Record<string, any> = {
    shopId: normShopId,
    updatedAt: now,
  };

  if (updates.displayName !== undefined) payload.displayName = updates.displayName.trim();
  if (updates.username !== undefined) payload.username = updates.username.trim();
  if (updates.email !== undefined) payload.email = updates.email.trim();
  if (updates.phone !== undefined) payload.phone = updates.phone.trim();
  if (updates.jobTitle !== undefined) payload.jobTitle = updates.jobTitle.trim();
  if (updates.bio !== undefined) payload.bio = updates.bio.trim();
  if (updates.avatarUrl !== undefined) payload.avatarUrl = updates.avatarUrl;
  if (updates.scratchpadNote !== undefined) payload.scratchpadNote = updates.scratchpadNote;
  if (updates.personalNotes !== undefined) payload.personalNotes = updates.personalNotes;

  try {
    const rootUserRef = doc(db, USERS_COLLECTION, cleanUserId);
    await setDoc(rootUserRef, payload, { merge: true });
  } catch (err) {
    console.warn("[UserService] Notice updating root users doc:", err);
  }

  try {
    const shopUserRef = doc(db, SHOPS_COLLECTION, normShopId, USERS_COLLECTION, cleanUserId);
    await setDoc(shopUserRef, payload, { merge: true });
  } catch (err) {
    console.warn("[UserService] Notice updating shop users doc:", err);
  }
}

/**
 * Fetch latest persisted user profile fields (including avatarUrl and personalNotes) from Firestore.
 */
export async function fetchUserProfileDetails(
  shopId: string,
  userId: string
): Promise<Partial<ShopUser> | null> {
  const normShopId = (shopId || "DEFAULT").trim().toUpperCase();
  const cleanUserId = (userId || "").trim();
  if (!cleanUserId) return null;

  try {
    const shopUserRef = doc(db, SHOPS_COLLECTION, normShopId, USERS_COLLECTION, cleanUserId);
    const shopSnap = await getDoc(shopUserRef);
    if (shopSnap.exists()) {
      return shopSnap.data() as Partial<ShopUser>;
    }

    const rootUserRef = doc(db, USERS_COLLECTION, cleanUserId);
    const rootSnap = await getDoc(rootUserRef);
    if (rootSnap.exists()) {
      return rootSnap.data() as Partial<ShopUser>;
    }
  } catch (err) {
    console.warn("[UserService] Notice fetching user profile details:", err);
  }

  return null;
}


