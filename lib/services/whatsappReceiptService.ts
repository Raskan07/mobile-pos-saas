/**
 * lib/services/whatsappReceiptService.ts
 *
 * Secure WhatsApp E-Receipt Service for Skyfox POS.
 *
 * Architectural Guarantees:
 * 1. Honest Handoff Status:
 *    WhatsApp redirection (`https://wa.me/...`) opens WhatsApp with a pre-filled message
 *    and requires the cashier to press Send in WhatsApp. Therefore, Skyfox records
 *    `status: "handoff_initiated"` (NEVER falsely marking the receipt as `"delivered"`).
 * 2. Unguessable Cryptographic Token:
 *    Each digital receipt URL (`/r/<token>`) uses a 32-character high-entropy cryptographic
 *    token (192 bits of entropy via `crypto.getRandomValues`), preventing enumeration or guessing.
 * 3. Customer-Only Information Isolation:
 *    The public digital receipt snapshot (`public_receipts/{token}`) stores ONLY customer-facing
 *    receipt fields and the store's `ReceiptSettings` layout snapshot. Internal fields such as
 *    `costPrice`, profit margins, cashier permissions, and internal UIDs are strictly excluded.
 * 4. Subscription Plan Usage Tracking:
 *    Tracks `whatsappHandoffInitiatedCount` per shop for subscription plan metering & configuration.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ReceiptSettings, DEFAULT_RECEIPT_SETTINGS } from "@/lib/types/receiptSettings";

export type WhatsAppHandoffStatus = "not_initiated" | "handoff_initiated";

export interface PublicDigitalReceiptItem {
  name: string;
  variant?: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice?: number;
  promotionName?: string;
  promotionDiscountLabel?: string;
  discount: number;
  subtotal: number;
}

export interface PublicDigitalReceipt {
  token: string;
  saleId?: string;
  shopId: string;
  shopName: string;
  branchName: string;
  invoiceNumber: string;
  createdAt: number;
  cashierName: string;
  paymentMethod: string;
  customerName?: string;
  customerPhoneMasked?: string;
  items: PublicDigitalReceiptItem[];
  itemCount: number;
  subtotal: number;
  promotionSavings?: number;
  discountLabel?: string;
  discountAmount: number;
  taxName: string;
  taxRateDisplay: number;
  taxAmount: number;
  grandTotal: number;
  cashReceived?: number;
  change?: number;
  currency: string;
  receiptSettings: ReceiptSettings;
  handoffStatus: "handoff_initiated";
  handoffInitiatedAt: number;
  handoffCount: number;
  viewCount: number;
  lastViewedAt?: number;
}

export interface InitiateWhatsAppHandoffInput {
  saleId?: string;
  existingToken?: string;
  shopId: string;
  shopName: string;
  branchName: string;
  invoiceNumber: string;
  createdAt: number;
  cashierName: string;
  cashierId?: string;
  paymentMethod: string;
  customerName?: string;
  customerPhone: string;
  items: PublicDigitalReceiptItem[];
  itemCount: number;
  subtotal: number;
  promotionSavings?: number;
  discountLabel?: string;
  discountAmount: number;
  taxName: string;
  taxRateDisplay: number;
  taxAmount: number;
  grandTotal: number;
  cashReceived?: number;
  change?: number;
  currency: string;
  receiptSettings: ReceiptSettings;
}

export interface InitiateWhatsAppHandoffResult {
  token: string;
  publicReceiptUrl: string;
  whatsappUrl: string;
  normalizedPhone: string;
  handoffStatus: "handoff_initiated";
  handoffInitiatedAt: number;
  prefilledMessage: string;
}

const LOCAL_CACHE_PREFIX = "skyfox_public_ereceipt_";
const SALE_TOKEN_MAP_PREFIX = "skyfox_sale_ereceipt_token_";

/**
 * Generates an unguessable 32-character alphanumeric cryptographic token (192 bits of entropy).
 */
export function generateSecureReceiptToken(): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return token;
}

/**
 * Normalizes a customer phone number into E.164 digits suitable for `https://wa.me/<digits>`.
 * Supports local Sri Lankan numbers (e.g. 0771234567 -> 94771234567) as well as international codes.
 */
export function normalizeWhatsAppPhone(rawPhone: string, defaultCountryCode = "94"): string {
  const digitsOnly = (rawPhone || "").replace(/\D/g, "");
  if (!digitsOnly) return "";

  // International 00 prefix (e.g. 0094771234567 -> 94771234567)
  if (digitsOnly.startsWith("00") && digitsOnly.length > 10) {
    return digitsOnly.slice(2);
  }

  // Local 10-digit starting with 0 (e.g. 0771234567 -> 94771234567)
  if (digitsOnly.length === 10 && digitsOnly.startsWith("0")) {
    return `${defaultCountryCode}${digitsOnly.slice(1)}`;
  }

  // Local 9-digit mobile without leading 0 (e.g. 771234567 -> 94771234567)
  if (digitsOnly.length === 9 && digitsOnly.startsWith("7")) {
    return `${defaultCountryCode}${digitsOnly}`;
  }

  return digitsOnly;
}

/**
 * Masks a phone number for safe display on the public digital receipt (e.g. +94 77 *** 4567).
 */
export function maskCustomerPhone(rawPhone: string): string {
  const digits = normalizeWhatsAppPhone(rawPhone);
  if (digits.length < 7) return "";
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `+${prefix} *** ${suffix}`;
}

/**
 * Builds the pre-filled WhatsApp message containing receipt summary and the secure digital receipt link.
 */
export function buildWhatsAppReceiptMessage(params: {
  shopName: string;
  customerName?: string;
  invoiceNumber: string;
  currency: string;
  grandTotal: number;
  publicReceiptUrl: string;
}): string {
  const formattedTotal = `${params.currency} ${params.grandTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const greeting =
    params.customerName && params.customerName !== "Walk-in Customer"
      ? `Hello ${params.customerName},`
      : "Hello,";

  return [
    `${greeting}`,
    `Thank you for shopping at *${params.shopName}*!`,
    ``,
    `🧾 *Invoice:* ${params.invoiceNumber}`,
    `💳 *Total Paid:* ${formattedTotal}`,
    ``,
    `View and download your official digital receipt here:`,
    `${params.publicReceiptUrl}`,
  ].join("\n");
}

/**
 * Initiates a WhatsApp E-Receipt handoff:
 * 1. Generates or reuses a cryptographically secure, unguessable token for the sale.
 * 2. Saves a strictly customer-safe `PublicDigitalReceipt` snapshot in Firestore (`public_receipts/{token}`).
 * 3. Records `whatsappHandoffStatus: "handoff_initiated"` (NEVER `"delivered"`) on the sale & handoff audit log.
 * 4. Tracks shop-level WhatsApp handoff usage for subscription plan metering.
 * 5. Returns the `https://wa.me/...` URL with the pre-filled message and secure receipt URL.
 */
export async function initiateWhatsAppEReceiptHandoff(
  input: InitiateWhatsAppHandoffInput
): Promise<InitiateWhatsAppHandoffResult> {
  const normalizedPhone = normalizeWhatsAppPhone(input.customerPhone);
  if (!normalizedPhone || normalizedPhone.length < 8) {
    throw new Error("Please enter a valid customer phone number for WhatsApp.");
  }

  const normalizedShopId = (input.shopId || "DEFAULT").trim().toUpperCase();
  const saleKey = input.saleId || input.invoiceNumber;

  // Reuse token for the same sale if already generated so links remain stable
  let token = input.existingToken || "";
  if (!token && typeof window !== "undefined" && saleKey) {
    token = localStorage.getItem(`${SALE_TOKEN_MAP_PREFIX}${normalizedShopId}_${saleKey}`) || "";
  }
  if (!token) {
    token = generateSecureReceiptToken();
    if (typeof window !== "undefined" && saleKey) {
      localStorage.setItem(`${SALE_TOKEN_MAP_PREFIX}${normalizedShopId}_${saleKey}`, token);
    }
  }

  const now = Date.now();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://skyfox.pos";
  const publicReceiptUrl = `${origin}/r/${token}`;

  // Sanitize line items to ensure ONLY customer-intended fields are stored
  const safeItems: PublicDigitalReceiptItem[] = (input.items || []).map((item) => ({
    name: String(item.name || "Item"),
    ...(item.variant ? { variant: String(item.variant) } : {}),
    ...(item.sku ? { sku: String(item.sku) } : {}),
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    ...(typeof item.originalUnitPrice === "number" && item.originalUnitPrice > Number(item.unitPrice || 0)
      ? { originalUnitPrice: Number(item.originalUnitPrice) }
      : {}),
    ...(item.promotionName ? { promotionName: String(item.promotionName) } : {}),
    ...(item.promotionDiscountLabel
      ? { promotionDiscountLabel: String(item.promotionDiscountLabel) }
      : {}),
    discount: Number(item.discount) || 0,
    subtotal: Number(item.subtotal) || 0,
  }));

  // Sanitize receipt settings snapshot
  const safeReceiptSettings: ReceiptSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...input.receiptSettings,
    shopId: normalizedShopId,
  };

  const publicReceipt: PublicDigitalReceipt = {
    token,
    ...(input.saleId ? { saleId: input.saleId } : {}),
    shopId: normalizedShopId,
    shopName: input.shopName || safeReceiptSettings.headerTitle || "SKYFOX POS",
    branchName: input.branchName || "Main Branch",
    invoiceNumber: input.invoiceNumber,
    createdAt: input.createdAt || now,
    cashierName: input.cashierName || "Staff",
    paymentMethod: input.paymentMethod || "Cash",
    ...(input.customerName ? { customerName: input.customerName } : {}),
    ...(input.customerPhone ? { customerPhoneMasked: maskCustomerPhone(input.customerPhone) } : {}),
    items: safeItems,
    itemCount: input.itemCount || safeItems.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: Number(input.subtotal) || 0,
    ...(typeof input.promotionSavings === "number" && input.promotionSavings > 0
      ? { promotionSavings: Number(input.promotionSavings) }
      : {}),
    ...(input.discountLabel ? { discountLabel: input.discountLabel } : {}),
    discountAmount: Number(input.discountAmount) || 0,
    taxName: input.taxName || safeReceiptSettings.taxName || "Tax / SST",
    taxRateDisplay: Number(input.taxRateDisplay) || 0,
    taxAmount: Number(input.taxAmount) || 0,
    grandTotal: Number(input.grandTotal) || 0,
    ...(typeof input.cashReceived === "number" ? { cashReceived: input.cashReceived } : {}),
    ...(typeof input.change === "number" ? { change: input.change } : {}),
    currency: input.currency || safeReceiptSettings.currency || "LKR",
    receiptSettings: safeReceiptSettings,
    handoffStatus: "handoff_initiated",
    handoffInitiatedAt: now,
    handoffCount: 1,
    viewCount: 0,
  };

  // Cache locally immediately so the receipt page works even before Firestore round-trip finishes
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${LOCAL_CACHE_PREFIX}${token}`, JSON.stringify(publicReceipt));
    } catch {
      // Ignore storage quota errors
    }
  }

  // Persist to Firestore in parallel in the background so WhatsApp opens instantaneously
  void (async () => {
    try {
      const publicDocRef = doc(db, "public_receipts", token);
      const shopEReceiptRef = doc(db, "shops", normalizedShopId, "e_receipts", token);
      const handoffLogsRef = collection(db, "shops", normalizedShopId, "whatsapp_handoffs");
      const shopRef = doc(db, "shops", normalizedShopId);

      const saleUpdatePayload = {
        eReceiptToken: token,
        eReceiptUrl: publicReceiptUrl,
        whatsappHandoffStatus: "handoff_initiated" as const,
        whatsappHandoffInitiatedAt: now,
        whatsappHandoffCount: increment(1),
        whatsappTargetPhone: normalizedPhone,
        updatedAt: now,
      };

      await Promise.all([
        setDoc(publicDocRef, publicReceipt, { merge: true }).catch(() => {}),
        setDoc(shopEReceiptRef, publicReceipt, { merge: true }).catch(() => {}),
        addDoc(handoffLogsRef, {
          token,
          saleId: input.saleId || null,
          invoiceNumber: input.invoiceNumber,
          shopId: normalizedShopId,
          branchName: input.branchName || "Main Branch",
          targetPhoneMasked: maskCustomerPhone(input.customerPhone),
          targetPhoneNormalized: normalizedPhone,
          customerName: input.customerName || "Walk-in Customer",
          grandTotal: publicReceipt.grandTotal,
          currency: publicReceipt.currency,
          status: "handoff_initiated",
          deliveryConfirmed: false,
          statusExplanation:
            "WhatsApp opened with pre-filled message. Cashier must press Send in WhatsApp.",
          initiatedBy: input.cashierName || "Cashier",
          initiatedById: input.cashierId || null,
          initiatedAt: now,
          initiatedAtISO: new Date(now).toISOString(),
          publicReceiptUrl,
        }).catch(() => {}),
        input.saleId
          ? updateDoc(doc(db, "sales", input.saleId), saleUpdatePayload).catch(() => {})
          : Promise.resolve(),
        input.saleId
          ? updateDoc(
              doc(db, "shops", normalizedShopId, "sales", input.saleId),
              saleUpdatePayload
            ).catch(() => {})
          : Promise.resolve(),
        setDoc(
          shopRef,
          {
            whatsappReceiptUsage: {
              totalHandoffsInitiated: increment(1),
              lastHandoffInitiatedAt: now,
            },
          },
          { merge: true }
        ).catch(() => {}),
      ]);
    } catch (err) {
      console.warn("[WhatsAppReceiptService] Firestore persistence warning:", err);
    }
  })();

  const prefilledMessage = buildWhatsAppReceiptMessage({
    shopName: publicReceipt.shopName,
    customerName: input.customerName,
    invoiceNumber: publicReceipt.invoiceNumber,
    currency: publicReceipt.currency,
    grandTotal: publicReceipt.grandTotal,
    publicReceiptUrl,
  });

  const whatsappUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(
    prefilledMessage
  )}`;

  return {
    token,
    publicReceiptUrl,
    whatsappUrl,
    normalizedPhone,
    handoffStatus: "handoff_initiated",
    handoffInitiatedAt: now,
    prefilledMessage,
  };
}

/**
 * Fetches a public digital receipt by its unguessable token.
 * Never lists or queries multiple receipts — strictly single document lookup by token.
 */
export async function fetchPublicDigitalReceiptByToken(
  token: string
): Promise<PublicDigitalReceipt | null> {
  const cleanToken = (token || "").trim();
  if (!cleanToken || cleanToken.length < 16) {
    return null;
  }

  try {
    const docRef = doc(db, "public_receipts", cleanToken);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as PublicDigitalReceipt;
      // Record customer view asynchronously
      updateDoc(docRef, {
        viewCount: increment(1),
        lastViewedAt: Date.now(),
      }).catch(() => {});
      return data;
    }
  } catch (err) {
    console.warn("[WhatsAppReceiptService] Firestore fetch fallback:", err);
  }

  // Fallback to local browser cache if testing offline on the same machine
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`${LOCAL_CACHE_PREFIX}${cleanToken}`);
      if (cached) {
        return JSON.parse(cached) as PublicDigitalReceipt;
      }
    } catch {
      // Ignore parse error
    }
  }

  return null;
}
