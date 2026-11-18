/**
 * lib/types/installment.ts
 *
 * Data models for the Dedicated Installment Sales & Payment Management Module.
 * Designed for Sri Lankan mobile phone & electronics retail shops.
 */

export type DownPaymentMethodType = "percentage" | "fixed" | "custom";

export type InstallmentPlanStatus =
  | "active"
  | "overdue"
  | "completed"
  | "early_settled"
  | "cancelled";

export type InstallmentScheduleStatus =
  | "paid"
  | "partially_paid"
  | "pending"
  | "upcoming"
  | "overdue"
  | "waived";

export type InstallmentTenderMethod =
  | "cash"
  | "bank_transfer"
  | "card"
  | "mobile_qr";

export interface DurationFeeRule {
  months: number;
  label: string;
  markupType: "percentage" | "fixed";
  markupValue: number; // e.g. 10 means +10% over cash price, or fixed LKR amount
  defaultDownPaymentPct: number; // e.g. 25%
}

export interface InstallmentCustomerProfile {
  customerId?: string;
  fullName: string;
  nicNumber: string;
  mobileNumber: string;
  secondaryPhone?: string;
  address: string;
  email?: string;
  occupation?: string;
  employerName?: string;
  monthlyIncome?: number;
  customerPhotoUrl?: string;
  nicFrontUrl?: string;
  nicBackUrl?: string;
}

export interface InstallmentGuarantorProfile {
  fullName: string;
  nicNumber: string;
  mobileNumber: string;
  relationship: string;
  address: string;
  occupation?: string;
}

export interface InstallmentProductSnapshot {
  productId?: string;
  productName: string;
  brand?: string;
  model: string;
  sku: string;
  imeiNumber: string;
  serialNumber: string;
  colorOrVariant?: string;
  purchaseCostPrice: number; // Shop's original purchase/cost price (for COGS & profit calculation)
  originalCashPrice: number; // Standard cash selling price (kept separate per Requirement 2 & 4)
  deliveryDate: string; // YYYY-MM-DD
  warrantyDetails: string; // e.g. "1 Year Company Hardware Warranty"
}

export interface InstallmentScheduleItem {
  installmentNumber: number; // 1..N
  dueDate: string; // YYYY-MM-DD
  dueTimestamp: number;
  scheduledAmount: number;
  paidAmount: number;
  remainingAmount: number;
  lateFeeApplied: number;
  status: InstallmentScheduleStatus;
  paidAt?: number;
  lastPaymentId?: string;
  notes?: string;
}

export interface InstallmentPaymentRecord {
  paymentId: string;
  receiptNumber: string;
  planId: string;
  agreementNumber: string;
  shopId: string;
  paymentType: "down_payment" | "installment" | "early_settlement" | "late_fee";
  amount: number;
  paymentMethod: InstallmentTenderMethod;
  referenceNumber?: string; // Bank slip / card ref
  paidAt: number;
  paidDateStr: string; // YYYY-MM-DD
  appliedToInstallments: {
    installmentNumber: number;
    amountApplied: number;
  }[];
  balanceBefore: number;
  balanceAfter: number;
  collectedBy: {
    userId: string;
    username: string;
    displayName: string;
  };
  notes?: string;
}

export interface InstallmentReminderLog {
  id: string;
  sentAt: number;
  channel: "whatsapp" | "sms" | "email";
  installmentNumber?: number;
  recipient: string;
  messagePreview: string;
  sentBy: string;
}

export interface InstallmentPlanRecord {
  id: string;
  agreementNumber: string; // e.g. "AGR-2026-0001"
  shopId: string;
  shopName: string;
  branchId: string;
  branchName: string;

  // Customer & Guarantor
  customer: InstallmentCustomerProfile;
  guarantor?: InstallmentGuarantorProfile;

  // Device / Product Snapshot (with IMEI, Serial, Purchase Price, Cash Price)
  product: InstallmentProductSnapshot;

  // Transparent Financial Breakdown (Requirements 1-6)
  originalCashPrice: number; // e.g. LKR 120,000
  installmentMarkupType: "percentage" | "fixed" | "none";
  installmentMarkupValue: number; // e.g. 0% or 10%
  installmentFeeAmount: number; // Additional installment charge over cash price
  serviceChargeAmount: number; // Documentation / processing charge
  discountAmount: number; // Any promotional discount
  totalAgreedPayable: number; // Final installment selling price (originalCashPrice + installmentFeeAmount + serviceChargeAmount - discountAmount)

  // Down Payment Configuration (Requirements 1 & 5: percentage, fixed, or custom)
  downPaymentMethod: DownPaymentMethodType;
  downPaymentInputValue: number; // Raw % or fixed value entered
  initialDownPayment: number; // Actual initial deposit collected on day 1 (e.g. LKR 30,000)
  downPaymentTenderMethod: InstallmentTenderMethod;

  // Financed Balance & Schedule Parameters
  financedPrincipalBalance: number; // totalAgreedPayable - initialDownPayment (e.g. LKR 90,000)
  durationMonths: number; // e.g. 6, 12, 24 months
  monthlyInstallmentAmount: number; // e.g. LKR 7,500
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  paymentDueDayOfMonth: number; // 1..28
  lateFeePerMonthPct: number; // Disclosed late payment fee % or 0
  lateFeeGraceDays: number; // e.g. 5 days grace period

  // Live Tracking Totals
  totalCollectedAmount: number; // initialDownPayment + sum(installment payments)
  remainingBalance: number; // totalAgreedPayable - totalCollectedAmount + totalLateFees
  earlySettlementDiscount: number;
  paidInstallmentsCount: number;
  overdueInstallmentsCount: number;
  overdueAmount: number;
  nextDueDate: string | null;
  nextDueAmount: number;

  // Schedule, Payments & Reminders
  schedule: InstallmentScheduleItem[];
  payments: InstallmentPaymentRecord[];
  reminders?: InstallmentReminderLog[];

  // Status & Agreement Metadata
  status: InstallmentPlanStatus;
  agreementSigned: boolean;
  agreementSignedAt?: number;
  termsAndConditions: string;
  latePaymentConditions: string;
  notes?: string;
  cancellationReason?: string;
  cancelledAt?: number;
  completedAt?: number;

  // Audit
  createdBy: {
    userId: string;
    username: string;
    displayName: string;
  };
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_DURATION_FEE_RULES: DurationFeeRule[] = [
  { months: 3, label: "3 Months Plan", markupType: "percentage", markupValue: 0, defaultDownPaymentPct: 30 },
  { months: 6, label: "6 Months Plan", markupType: "percentage", markupValue: 5, defaultDownPaymentPct: 25 },
  { months: 9, label: "9 Months Plan", markupType: "percentage", markupValue: 8, defaultDownPaymentPct: 25 },
  { months: 12, label: "12 Months Plan", markupType: "percentage", markupValue: 10, defaultDownPaymentPct: 25 },
  { months: 18, label: "18 Months Plan", markupType: "percentage", markupValue: 15, defaultDownPaymentPct: 20 },
  { months: 24, label: "24 Months Plan", markupType: "percentage", markupValue: 20, defaultDownPaymentPct: 20 },
];

export const DEFAULT_SRI_LANKA_INSTALLMENT_TERMS = `1. OWNERSHIP & RETENTION OF TITLE: The mobile device identified by the IMEI and Serial Number above is delivered to the Customer under an Installment Purchase Agreement. Legal ownership of the device remains vested with the Shop until the Total Agreed Payable amount is settled in full.
2. MONTHLY PAYMENTS: The Customer agrees to pay the Monthly Installment on or before the specified Due Date of each month without prior demand.
3. DEVICE CARE & NON-TRANSFERABILITY: Until full settlement, the Customer shall not sell, pledge, pawn, modify the IMEI, or transfer possession of the device to any third party.
4. WARRANTY: Standard manufacturer or shop warranty applies strictly to manufacturing defects and excludes physical damage, liquid damage, or unauthorized repairs.
5. EARLY SETTLEMENT: The Customer may settle the remaining balance in full at any time prior to the agreement end date.`;

export const DEFAULT_LATE_PAYMENT_CONDITIONS = `Payments received after the grace period from the monthly due date may incur the disclosed late payment administration fee. If two (02) or more consecutive monthly installments remain unpaid past their due dates, the Shop reserves the right to demand immediate settlement of the remaining balance, contact the registered Guarantor, or recover the device in accordance with applicable laws of Sri Lanka.`;

