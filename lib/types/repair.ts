/**
 * lib/types/repair.ts
 *
 * Domain types and data models for Mobile Phone Repair Management System.
 * Multi-tenant isolated under `shops/{shopId}/repairs/{repairId}` with subcollections:
 * - diagnostics
 * - estimates
 * - tasks
 * - parts_usage
 * - payments
 * - status_history
 * - qc_checks
 * - warranties
 */

import { AuditUser } from "./catalog";

// ── Repair Status State-Machine ──────────────────────────────────────────────

export type RepairStatus =
  | "received"
  | "diagnosing"
  | "awaiting_approval"
  | "awaiting_parts"
  | "in_repair"
  | "quality_check"
  | "ready_for_collection"
  | "collected"
  | "cancelled"
  | "irreparable"
  | "customer_declined"
  | "warranty_rework";

export type RepairPriority = "low" | "normal" | "high" | "urgent";

export type DeviceType = "phone" | "tablet" | "laptop" | "watch" | "console" | "other";

// ── Condition Checklist & Accessories ────────────────────────────────────────

export interface PhysicalConditionAssessment {
  screenCondition: "mint" | "scratched" | "cracked" | "shattered" | "bleeding_oled";
  frameCondition: "mint" | "minor_scratches" | "dented" | "bent";
  backGlassCondition: "mint" | "scratched" | "cracked" | "missing";
  liquidDamageIndicator: "intact" | "triggered" | "unknown";
  cameraLenses: "clean" | "scratched" | "cracked";
  buttonsFeel: "responsive" | "stiff" | "non_functional";
  chargePortCondition: "clean" | "loose" | "corroded" | "broken";
  notes?: string;
}

export interface DeviceAccessories {
  simTray: boolean;
  simCard: boolean;
  sdCard: boolean;
  protectiveCase: boolean;
  chargerAdapter: boolean;
  chargingCable: boolean;
  originalBox: boolean;
  otherItems?: string;
}

// ── Main Repair Ticket Document ──────────────────────────────────────────────

export interface RepairTicket {
  id: string; // Document ID (e.g. rep_...)
  ticketNumber: string; // Human-readable unique ID: REP-YYYYMMDD-XXXX
  shopId: string;
  shopName?: string;
  branchId?: string;
  branchName?: string;

  // Customer reference
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;

  // Device specifics
  deviceType: DeviceType;
  brand: string;
  model: string;
  color?: string;
  serialNumber?: string;
  imei1?: string;
  imei2?: string;

  // Passcode security (Encrypted or masked, minimized collection)
  passcodeProtected: boolean;
  passcodeMasked?: string;
  patternMatrix?: string; // e.g. "1-2-3-5"
  passcodeClearedOnDelivery: boolean;

  // Intake specifics
  reportedFaults: string[];
  intakeNotes: string;
  condition: PhysicalConditionAssessment;
  accessories: DeviceAccessories;
  intakePhotoUrls: string[];
  customerSignatureUrl?: string; // Base64 data URL or Storage download URL

  // Status & Priority
  status: RepairStatus;
  priority: RepairPriority;
  isWarrantyRework: boolean;
  originalTicketId?: string; // If this is a rework ticket

  // Assignment
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;

  // Financial summary (Denormalized snapshot from subcollections)
  estimatedCost: number; // In base currency units
  depositPaid: number;
  totalPaid: number;
  finalInvoiceNumber?: string;
  finalSaleId?: string;
  balanceDue: number; // estimatedCost - totalPaid

  // Dates & Timestamps
  estimatedCompletionDate?: string;
  createdAt: number;
  createdAtISO: string;
  updatedAt: number;
  closedAt?: number;

  // Intake Operator Audit
  intakeOperator: AuditUser;
}

// ── Subcollection 1: Diagnostics (`diagnostics`) ─────────────────────────────

export interface DiagnosticTestItem {
  id: string;
  label: string;
  category: "display" | "battery" | "audio" | "camera" | "network" | "sensors" | "board";
  status: "pass" | "fail" | "untested" | "not_applicable";
  metricValue?: string; // e.g. "82%", "1.8A", "0.2A short"
  notes?: string;
}

export interface RepairDiagnostic {
  id: string;
  ticketId: string;
  shopId: string;
  technician: AuditUser;
  batteryHealthPercent?: number;
  chargingCurrentAmps?: number;
  diagnosticNotes: string;
  tests: DiagnosticTestItem[];
  findingsSummary: string;
  suggestedAction: string;
  isIrreparable: boolean;
  createdAt: number;
}

// ── Subcollection 2: Versioned Estimates (`estimates`) ───────────────────────

export interface EstimateLineItem {
  id: string;
  type: "labor" | "part" | "service_fee" | "express_surcharge";
  productId?: string; // If mapped from catalog
  description: string;
  sku?: string;
  quantity: number;
  unitCost: number;
  unitSellingPrice: number;
  totalPrice: number;
}

export interface RepairEstimate {
  id: string;
  ticketId: string;
  shopId: string;
  version: number; // 1, 2, 3...
  items: EstimateLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  status: "draft" | "awaiting_approval" | "approved" | "declined";
  rejectionReason?: string;
  customerApproval?: {
    approvedAt: number;
    approvedBy: string; // Customer name
    approvalMethod: "in_person" | "phone_call" | "sms_whatsapp" | "online_signature";
    signatureUrl?: string;
    notes?: string;
  };
  createdBy: AuditUser;
  createdAt: number;
  updatedAt: number;
}

// ── Subcollection 3: Tasks & Work Logs (`tasks`) ─────────────────────────────

export interface RepairTask {
  id: string;
  ticketId: string;
  shopId: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  completedAt?: number;
  completedBy?: AuditUser;
  timeSpentMinutes?: number;
  createdAt: number;
}

// ── Subcollection 4: Parts Usage & Stock (`parts_usage`) ─────────────────────

export interface RepairPartUsage {
  id: string;
  ticketId: string;
  shopId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  unitSellingPrice: number;
  status: "reserved" | "consumed" | "damaged" | "returned_to_stock";
  stockTransactionId?: string; // Link to shops/{shopId}/stock_transactions
  notes?: string;
  recordedBy: AuditUser;
  recordedAt: number;
}

// ── Subcollection 5: Payments & Deposits (`payments`) ────────────────────────

export type RepairPaymentType = "deposit" | "partial" | "final_balance" | "refund";

export interface RepairPayment {
  id: string;
  ticketId: string;
  shopId: string;
  type: RepairPaymentType;
  amount: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "qr" | "store_credit";
  paymentReference?: string;
  receiptNumber: string; // REC-REP-...
  invoiceNumber?: string; // Linked POS invoice if final settlement
  saleId?: string;
  notes?: string;
  cashier: AuditUser;
  recordedAt: number;
}

// ── Subcollection 6: Status Transition Audit History (`status_history`) ──────

export interface RepairStatusEvent {
  id: string;
  ticketId: string;
  shopId: string;
  fromStatus: RepairStatus | "NONE";
  toStatus: RepairStatus;
  reason?: string;
  notes?: string;
  performedBy: AuditUser;
  timestamp: number;
}

// ── Subcollection 7: Quality Control Checklist (`qc_checks`) ─────────────────

export interface QCInspectionItem {
  id: string;
  label: string;
  passed: boolean;
  notes?: string;
}

export interface RepairQCCheck {
  id: string;
  ticketId: string;
  shopId: string;
  inspector: AuditUser;
  items: QCInspectionItem[];
  isAllPassed: boolean;
  aestheticGrade: "A_MINT" | "B_GOOD" | "C_ACCEPTABLE";
  cleaningPerformed: boolean;
  screwsVerified: boolean;
  inspectorNotes?: string;
  createdAt: number;
}

// ── Subcollection 8: Warranties & Rework Claims (`warranties`) ───────────────

export interface RepairWarranty {
  id: string;
  ticketId: string;
  ticketNumber: string;
  shopId: string;
  warrantyCode: string; // WAR-YYYYMM-XXXX
  customerName: string;
  customerPhone: string;
  deviceModel: string;
  serialOrImei?: string;
  durationDays: number; // e.g. 30, 90, 180
  startDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  terms: string;
  status: "active" | "expired" | "claimed" | "voided";
  voidReason?: string;
  reworkTicketId?: string;
  issuedBy: AuditUser;
  issuedAt: number;
}

// ── Inputs for Service Operations ───────────────────────────────────────────

export interface CreateRepairTicketInput {
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deviceType: DeviceType;
  brand: string;
  model: string;
  color?: string;
  serialNumber?: string;
  imei1?: string;
  imei2?: string;
  passcodeProtected: boolean;
  passcodeMasked?: string;
  patternMatrix?: string;
  reportedFaults: string[];
  intakeNotes?: string;
  condition: PhysicalConditionAssessment;
  accessories: DeviceAccessories;
  intakePhotoUrls?: string[];
  customerSignatureUrl?: string;
  priority: RepairPriority;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  estimatedCost?: number;
  initialDepositAmount?: number;
  depositPaymentMethod?: "cash" | "card" | "bank_transfer" | "qr";
  estimatedCompletionDate?: string;
  branchId?: string;
  branchName?: string;
}

export interface RepairFilterOptions {
  status?: string;
  priority?: string;
  technicianId?: string;
  searchQuery?: string;
  datePreset?: string;
}

export interface FullRepairTicketDetails {
  ticket: RepairTicket;
  diagnostics: RepairDiagnostic[];
  estimates: RepairEstimate[];
  tasks: RepairTask[];
  partsUsage: RepairPartUsage[];
  payments: RepairPayment[];
  statusHistory: RepairStatusEvent[];
  qcChecks: RepairQCCheck[];
  warranties: RepairWarranty[];
}
