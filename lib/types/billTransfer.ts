/**
 * lib/types/billTransfer.ts
 *
 * Types for Skyfox POS Device Management, Inter-Machine Bill Transfer,
 * and USB Print Agent Safe Print Queue (strictly shop-isolated via `shopId`).
 */

import { CartItem, DiscountSetting } from "@/app/shop/dashboard/posData";

export type DeviceRoleType =
  | "front_counter"
  | "main_billing"
  | "express_kiosk"
  | "repair_desk"
  | "warehouse_terminal"
  | "print_station";

export type UsbPrintAgentStatus = "connected" | "idle" | "offline" | "error";

/**
 * Registered POS Device under `shops/{shopId}/devices/{deviceId}`
 * Note: Never stores or displays IP addresses; uses friendly station names.
 */
export interface PosDeviceRecord {
  id: string;
  shopId: string;
  branchId: string;
  branchName: string;
  /** Friendly human-readable name (e.g. "Front Counter", "Main Billing", "Cashier Desk 2") */
  friendlyName: string;
  deviceRole: DeviceRoleType;
  locationLabel?: string;
  /** Online presence heartbeat */
  status: "online" | "idle" | "offline";
  lastHeartbeatAt: number;
  /** Current signed-in operator on this machine */
  activeOperatorId?: string;
  activeOperatorName?: string;
  activeOperatorRole?: string;
  /** Local USB Print Agent configuration for this machine */
  usbPrintAgentEnabled: boolean;
  usbPrinterFriendlyName?: string;
  usbAgentPort?: number;
  usbPaperWidth?: "80mm" | "58mm";
  autoPrintIncomingTransfers?: boolean;
  autoAcceptIncomingTransfers?: boolean;
  usbAgentStatus?: UsbPrintAgentStatus;
  createdAt: number;
  updatedAt: number;
}

export type BillTransferMode =
  | "load_to_cart"
  | "load_and_checkout"
  | "direct_usb_print";

export type BillTransferPriority = "normal" | "urgent";

export type BillTransferStatus =
  | "pending"
  | "delivered"
  | "accepted"
  | "printed"
  | "completed"
  | "rejected"
  | "cancelled";

export interface TransferredBillCustomer {
  customerId: string;
  name: string;
  phone: string;
  email?: string;
  pointsBalance?: number;
}

/**
 * Inter-machine Bill Transfer record under `shops/{shopId}/bill_transfers/{transferId}`
 */
export interface BillTransferRecord {
  id: string;
  transferCode: string; // e.g. "TRF-8421"
  shopId: string;
  branchId: string;
  branchName: string;

  // Source machine & operator
  sourceDeviceId: string;
  sourceDeviceName: string;
  senderUserId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderRole: string;

  // Destination machine & operator
  targetDeviceId: string;
  targetDeviceName: string;
  receivedByUserId?: string;
  receivedByDisplayName?: string;

  // Transfer configuration & settings
  transferMode: BillTransferMode;
  priority: BillTransferPriority;
  clearSenderCartOnTransfer: boolean;
  autoTriggerUsbPrint: boolean;
  notes?: string;

  // Bill payload snapshot
  cartItems: CartItem[];
  itemCount: number;
  subtotal: number;
  discountSetting: DiscountSetting;
  discountAmount: number;
  taxLabel: string;
  taxRatePct: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  preferredPaymentMethod: "cash" | "card" | "bank" | "mobile";
  customer?: TransferredBillCustomer | null;

  // Status & Safe Print Queue tracking
  status: BillTransferStatus;
  printJobId?: string;
  printStatus?: "not_queued" | "queued" | "printing" | "printed" | "failed";
  printedAt?: number;
  createdAt: number;
  deliveredAt?: number;
  acceptedAt?: number;
  completedAt?: number;
  updatedAt: number;
}

/**
 * Safe Print Queue job under `shops/{shopId}/print_queue/{jobId}`
 * Prevents duplicate USB prints via deterministic `idempotencyKey` and atomic lock.
 */
export interface SafePrintJobRecord {
  id: string;
  /** Deterministic key (`${shopId}_${transferId}_usb_print`) to guarantee zero duplicate prints */
  idempotencyKey: string;
  shopId: string;
  branchId: string;
  transferId: string;
  transferCode: string;
  targetDeviceId: string;
  targetDeviceName: string;
  printerFriendlyName: string;
  paperWidth: "80mm" | "58mm";
  status: "queued" | "printing" | "printed" | "failed";
  lockedByDeviceId?: string;
  lockedAt?: number;
  attemptCount: number;
  printedAt?: number;
  errorMessage?: string;
  payloadSummary: {
    itemCount: number;
    grandTotal: number;
    currency: string;
    customerName?: string;
    senderDisplayName: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface CreateBillTransferInput {
  shopId: string;
  branchId: string;
  branchName: string;
  sourceDeviceId: string;
  sourceDeviceName: string;
  sender: {
    userId: string;
    username: string;
    displayName: string;
    role: string;
  };
  targetDeviceId: string;
  targetDeviceName: string;
  transferMode: BillTransferMode;
  priority: BillTransferPriority;
  clearSenderCartOnTransfer: boolean;
  autoTriggerUsbPrint: boolean;
  notes?: string;
  cartItems: CartItem[];
  subtotal: number;
  discountSetting: DiscountSetting;
  discountAmount: number;
  taxLabel: string;
  taxRatePct: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  preferredPaymentMethod: "cash" | "card" | "bank" | "mobile";
  customer?: TransferredBillCustomer | null;
}
