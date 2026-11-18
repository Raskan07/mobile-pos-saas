/**
 * lib/types/receiptSettings.ts
 *
 * Types for POS Receipt customization & thermal printer layouts.
 */

export interface ReceiptSettings {
  shopId: string;
  // Header Branding
  headerTitle: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  showLogo: boolean;
  logoUrl?: string;
  alignment?: "center" | "left";

  // Metadata Fields
  showShopName: boolean;
  showBranchName: boolean;
  showShopId: boolean;
  showInvoiceNumber: boolean;
  showDate: boolean;
  showCashierName: boolean;
  showCustomerInfo: boolean;

  // Line Item Details
  showItemSku: boolean;
  showItemVariant: boolean;

  // Financial Breakdown & Tax/Currency Configuration
  taxRate: number;             // Percentage (e.g. 0 for 0%, 8 for 8%), default 0
  taxName: string;             // e.g. "Tax / SST", "VAT"
  currency: string;            // e.g. "LKR", "USD"
  pricesIncludeTax: boolean;
  showTaxBreakdown: boolean;
  showDiscount: boolean;
  showPaymentMethod: boolean;
  showTenderedAndChange: boolean;

  // Footer & Policies
  footerNote: string;
  warrantyPolicy: string;
  showBarcode: boolean;

  // Thermal Hardware & Layout
  paperWidth: "80mm" | "58mm";
  fontSize: "compact" | "normal" | "large";

  updatedAt: number;
}

export const DEFAULT_RECEIPT_SETTINGS: Omit<ReceiptSettings, "shopId"> = {
  headerTitle: "",
  tagline: "Quality & Excellence Guaranteed",
  address: "",
  phone: "",
  email: "",
  taxNumber: "",
  showLogo: true,
  logoUrl: "",
  alignment: "center",

  showShopName: true,
  showBranchName: true,
  showShopId: true,
  showInvoiceNumber: true,
  showDate: true,
  showCashierName: true,
  showCustomerInfo: true,

  showItemSku: true,
  showItemVariant: true,

  taxRate: 0,
  taxName: "Tax / SST",
  currency: "LKR",
  pricesIncludeTax: false,
  showTaxBreakdown: false,
  showDiscount: true,
  showPaymentMethod: true,
  showTenderedAndChange: true,

  footerNote: "Thank you for your business! Please visit us again.",
  warrantyPolicy: "Warranty claim requires original receipt. Items exchangeable within 7 days.",
  showBarcode: true,

  paperWidth: "80mm",
  fontSize: "normal",

  updatedAt: Date.now(),
};
