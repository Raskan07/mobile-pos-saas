/**
 * lib/services/barcodeService.ts
 *
 * Multi-tenant service for storing and retrieving barcode print traceability logs.
 * Path: shops/{shopId}/barcode_logs/{logId}
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeShopId } from "./shopAuthService";
import { AuditUser } from "../types/catalog";
import { BarcodePrintLog, PaperPresetId } from "../types/barcode";

const BARCODE_LOGS_COLLECTION = "barcode_logs";

export interface CreatePrintLogInput {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  barcode: string;
  sku: string;
  price: number;
  quantity: number;
  paperPreset: PaperPresetId;
  action: "PRINT_SINGLE" | "PRINT_BULK" | "REPRINT_SCAN";
}

export async function logBarcodePrints(
  shopId: string,
  user: AuditUser,
  items: CreatePrintLogInput[]
): Promise<BarcodePrintLog[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) throw new Error("Shop ID is required for barcode logging.");
  if (!user?.userId) throw new Error("Authenticated user identity is required.");
  if (!items || items.length === 0) return [];

  const now = Date.now();
  const createdLogs: BarcodePrintLog[] = [];

  const promises = items.map(async (item, idx) => {
    const logId = `bcl_${now}_${Math.random().toString(36).substring(2, 7)}_${idx}`;
    const logData: BarcodePrintLog = {
      id: logId,
      shopId: normShopId,
      productId: item.productId,
      productName: item.productName,
      variantId: item.variantId || "",
      variantName: item.variantName || "",
      barcode: item.barcode,
      sku: item.sku,
      price: item.price,
      quantity: item.quantity,
      paperPreset: item.paperPreset,
      action: item.action,
      printedBy: {
        userId: user.userId,
        username: user.username,
        role: user.role,
        displayName: user.displayName || user.username,
      },
      createdAt: now + idx,
    };

    const logDocRef = doc(db, "shops", normShopId, BARCODE_LOGS_COLLECTION, logId);
    await setDoc(logDocRef, logData);
    createdLogs.push(logData);
  });

  await Promise.all(promises);
  return createdLogs;
}

export async function getBarcodePrintLogs(
  shopId: string,
  maxResults = 50
): Promise<BarcodePrintLog[]> {
  const normShopId = normalizeShopId(shopId);
  if (!normShopId) return [];

  try {
    const logsCol = collection(db, "shops", normShopId, BARCODE_LOGS_COLLECTION);
    const q = query(logsCol, orderBy("createdAt", "desc"), limit(maxResults));
    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<BarcodePrintLog, "id">),
    }));
  } catch (error) {
    console.error("[BarcodeService] Error fetching barcode print logs:", error);
    return [];
  }
}
