"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  PlusCircle,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  FileText,
  BarChart3,
  Search,
  Smartphone,
  Printer,
  Download,
  Send,
  MessageSquare,
  Mail,
  Phone,
  ShieldCheck,
  Calendar,
  CreditCard,
  Banknote,
  Building2,
  QrCode,
  Sliders,
  X,
  Eye,
  Ban,
  Sparkles,
  UserCheck,
  Receipt,
  Clock,
  ArrowUpRight,
  Upload,
  Loader2,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { getProducts } from "@/lib/services/catalogService";
import { subscribeToCustomers } from "@/lib/services/customerService";
import { ProductItem } from "@/lib/types/catalog";
import { CustomerRecord } from "@/lib/types/customer";
import {
  getStoredReceiptSettings,
  fetchReceiptSettings,
} from "@/lib/services/receiptSettingsService";
import {
  InstallmentPlanRecord,
  InstallmentPaymentRecord,
  DownPaymentMethodType,
  InstallmentTenderMethod,
  DurationFeeRule,
  DEFAULT_SRI_LANKA_INSTALLMENT_TERMS,
  DEFAULT_LATE_PAYMENT_CONDITIONS,
} from "@/lib/types/installment";
import {
  subscribeToInstallmentPlans,
  createInstallmentPlan,
  recordInstallmentPayment,
  waiveInstallmentItem,
  cancelInstallmentAgreement,
  logInstallmentReminder,
  generateInstallmentSchedule,
  getShopDurationFeeRules,
  saveShopDurationFeeRules,
  exportInstallmentAgreementToPdf,
} from "@/lib/services/installmentService";
import {
  InstallmentAgreementModal,
  InstallmentPaymentReceiptModal,
} from "@/components/installments/InstallmentAgreementModal";

type InstallmentSection =
  | "overview"
  | "active"
  | "create"
  | "collection"
  | "overdue"
  | "completed"
  | "agreements"
  | "reports";

const SECTION_TABS: {
  id: InstallmentSection;
  label: string;
  purpose: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "active",
    label: "Active Plans",
    purpose: "All customers currently paying installments",
    icon: Users,
  },
  {
    id: "create",
    label: "Create Plan",
    purpose: "Register a new installment sale",
    icon: PlusCircle,
  },
  {
    id: "collection",
    label: "Payment Collection",
    purpose: "Record monthly, partial or early settlement payments",
    icon: Wallet,
  },
  {
    id: "overdue",
    label: "Overdue Payments",
    purpose: "Identify missed and late payments & send reminders",
    icon: AlertTriangle,
  },
  {
    id: "completed",
    label: "Completed Plans",
    purpose: "Fully paid installment agreements",
    icon: CheckCircle2,
  },
  {
    id: "agreements",
    label: "Agreements",
    purpose: "View and print customer agreements & term fee rules",
    icon: FileText,
  },
  {
    id: "reports",
    label: "Reports",
    purpose: "Collections, outstanding amounts and profitability",
    icon: BarChart3,
  },
  {
    id: "overview",
    label: "Overview",
    purpose: "Total installment sales, collections and outstanding balances",
    icon: LayoutDashboard,
  },
];

export default function InstallmentManagementPage() {
  const { shop, user, activeBranchId: ctxBranchId, activeBranchName } = useShopAuth();
  const activeBranchId = ctxBranchId || user?.primaryBranchId || "main";
  const currentShopId = shop?.shopId || "SHOP-7294";
  const currentShopName = shop?.shopName || "Skyfox Mobile Hub";
  const currentBranch = activeBranchName || "Main Branch";

  // Currency & Shop Receipt Info
  const [receiptSettings, setReceiptSettings] = useState(() =>
    getStoredReceiptSettings(currentShopId, currentShopName)
  );
  const currency = receiptSettings.currency || "LKR";

  useEffect(() => {
    if (!currentShopId) return;
    const local = getStoredReceiptSettings(currentShopId, currentShopName);
    setReceiptSettings(local);
    fetchReceiptSettings(currentShopId, currentShopName).then(setReceiptSettings);
  }, [currentShopId, currentShopName]);

  const fmt = (val: number) =>
    `${currency} ${(val || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Navigation & Active Section (Active Plans shown first by default)
  const [activeSection, setActiveSection] = useState<InstallmentSection>("active");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live Installment Plans, Catalog Products, Customers & Duration Fee Rules
  const [plans, setPlans] = useState<InstallmentPlanRecord[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState<boolean>(true);
  const [processingActionKey, setProcessingActionKey] = useState<string | null>(null);
  const [isSavingRules, setIsSavingRules] = useState<boolean>(false);
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);
  const [existingCustomers, setExistingCustomers] = useState<CustomerRecord[]>([]);
  const [durationRules, setDurationRules] = useState<DurationFeeRule[]>(() =>
    getShopDurationFeeRules(currentShopId)
  );

  useEffect(() => {
    if (!currentShopId) return;
    setIsLoadingPlans(true);
    setDurationRules(getShopDurationFeeRules(currentShopId));
    const unsub = subscribeToInstallmentPlans(currentShopId, (livePlans) => {
      setPlans(livePlans);
      setIsLoadingPlans(false);
    });
    getProducts(currentShopId, undefined, undefined, activeBranchId)
      .then(setCatalogProducts)
      .catch(() => {});
    const unsubCust = subscribeToCustomers(
      currentShopId,
      (custs) => setExistingCustomers(custs),
      () => {}
    );
    return () => {
      unsub();
      unsubCust();
    };
  }, [currentShopId, activeBranchId]);

  // Modals & Selected Profile Drawer
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [agreementModalPlan, setAgreementModalPlan] =
    useState<InstallmentPlanRecord | null>(null);
  const [receiptModalData, setReceiptModalData] = useState<{
    plan: InstallmentPlanRecord;
    payment: InstallmentPaymentRecord;
  } | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE PLAN FORM STATE (Requirements 1-6 + Customer + Product + Guarantor)
  // ─────────────────────────────────────────────────────────────────────────
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [productName, setProductName] = useState<string>("");
  const [productModel, setProductModel] = useState<string>("");
  const [productSku, setProductSku] = useState<string>("");
  const [imeiNumber, setImeiNumber] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState<string>("");
  const [purchaseCostPrice, setPurchaseCostPrice] = useState<number>(0);
  const [originalCashPrice, setOriginalCashPrice] = useState<number>(0);
  const [deliveryDate, setDeliveryDate] = useState<string>(todayStr);
  const [warrantyDetails, setWarrantyDetails] = useState<string>("");

  // Duration & Adjustable Installment Fee Rules (Requirements 2, 4, 6)
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [markupType, setMarkupType] = useState<"percentage" | "fixed" | "none">("none");
  const [markupValue, setMarkupValue] = useState<number>(0);
  const [serviceChargeAmount, setServiceChargeAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Down Payment Configuration (Requirements 1 & 5: percentage, fixed, or custom)
  const [downPaymentMethod, setDownPaymentMethod] =
    useState<DownPaymentMethodType>("fixed");
  const [downPaymentInput, setDownPaymentInput] = useState<number>(0);
  const [downPaymentTender, setDownPaymentTender] =
    useState<InstallmentTenderMethod>("cash");

  // Schedule Dates & Late Fee
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [paymentDueDay, setPaymentDueDay] = useState<number>(5);
  const [lateFeePct, setLateFeePct] = useState<number>(0);
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState<number>(5);

  // Customer Profile State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [custFullName, setCustFullName] = useState<string>("");
  const [custNic, setCustNic] = useState<string>("");
  const [custMobile, setCustMobile] = useState<string>("");
  const [custAddress, setCustAddress] = useState<string>("");
  const [custEmail, setCustEmail] = useState<string>("");
  const [custPhotoUrl, setCustPhotoUrl] = useState<string>("");
  const [nicFrontUrl, setNicFrontUrl] = useState<string>("");
  const [nicBackUrl, setNicBackUrl] = useState<string>("");

  // Guarantor State (Optional)
  const [includeGuarantor, setIncludeGuarantor] = useState<boolean>(false);
  const [guarantorName, setGuarantorName] = useState<string>("");
  const [guarantorNic, setGuarantorNic] = useState<string>("");
  const [guarantorMobile, setGuarantorMobile] = useState<string>("");
  const [guarantorRelation, setGuarantorRelation] = useState<string>("");
  const [guarantorAddress, setGuarantorAddress] = useState<string>("");

  const [termsText, setTermsText] = useState<string>(
    DEFAULT_SRI_LANKA_INSTALLMENT_TERMS
  );
  const [lateConditionsText, setLateConditionsText] = useState<string>(
    DEFAULT_LATE_PAYMENT_CONDITIONS
  );
  const [planNotes, setPlanNotes] = useState<string>("");
  const [isCreatingPlan, setIsCreatingPlan] = useState<boolean>(false);

  // Full reset of all Create Plan fields so form is completely empty for the next plan
  const resetCreatePlanForm = () => {
    setSelectedProductId("");
    setProductName("");
    setProductModel("");
    setProductSku("");
    setImeiNumber("");
    setSerialNumber("");
    setPurchaseCostPrice(0);
    setOriginalCashPrice(0);
    setDeliveryDate(todayStr);
    setWarrantyDetails("");
    setDurationMonths(12);
    setMarkupType("none");
    setMarkupValue(0);
    setServiceChargeAmount(0);
    setDiscountAmount(0);
    setDownPaymentMethod("fixed");
    setDownPaymentInput(0);
    setDownPaymentTender("cash");
    setStartDate(todayStr);
    setPaymentDueDay(5);
    setLateFeePct(0);
    setLateFeeGraceDays(5);
    setSelectedCustomerId("");
    setCustFullName("");
    setCustNic("");
    setCustMobile("");
    setCustAddress("");
    setCustEmail("");
    setCustPhotoUrl("");
    setNicFrontUrl("");
    setNicBackUrl("");
    setIncludeGuarantor(false);
    setGuarantorName("");
    setGuarantorNic("");
    setGuarantorMobile("");
    setGuarantorRelation("");
    setGuarantorAddress("");
    setPlanNotes("");
  };

  // Handle selecting a product from Catalog
  const handleSelectCatalogProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    const found = catalogProducts.find((p) => p.id === prodId);
    if (found) {
      setProductName(found.name);
      setProductModel(found.subcategoryName || found.categoryName || found.name);
      setProductSku(found.sku || "");
      setPurchaseCostPrice(Number(found.costPrice) || 0);
      setOriginalCashPrice(Number(found.sellingPrice) || 0);
    }
  };

  // Handle selecting an existing customer
  const handleSelectExistingCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    const found = existingCustomers.find((c) => c.id === custId);
    if (found) {
      setCustFullName(found.name || "");
      setCustMobile(found.phone || "");
      setCustEmail(found.email || "");
      setCustAddress((found as any).address || "");
      setCustNic((found as any).nic || "");
    }
  };

  // Apply Duration Preset Rule (Requirement 6)
  const handleSelectDurationPreset = (months: number, applyRuleMarkup = false) => {
    setDurationMonths(months);
    const rule = durationRules.find((r) => r.months === months);
    if (rule && applyRuleMarkup) {
      if (rule.markupValue > 0) {
        setMarkupType(rule.markupType);
        setMarkupValue(rule.markupValue);
      } else {
        setMarkupType("none");
        setMarkupValue(0);
      }
    }
  };

  // Live Financial Math for Create Plan (Requirements 1-6)
  const createPlanPreview = useMemo(() => {
    const cashPrice = Math.max(0, Number(originalCashPrice) || 0);
    const instFee =
      markupType === "percentage"
        ? Math.round(cashPrice * (Math.max(0, Number(markupValue) || 0) / 100) * 100) / 100
        : markupType === "fixed"
        ? Math.max(0, Number(markupValue) || 0)
        : 0;
    const svcCharge = Math.max(0, Number(serviceChargeAmount) || 0);
    const disc = Math.max(0, Number(discountAmount) || 0);
    const totalPayable = Math.max(
      0,
      Math.round((cashPrice + instFee + svcCharge - disc) * 100) / 100
    );

    let downPayment = 0;
    if (downPaymentMethod === "percentage") {
      const pct = Math.min(100, Math.max(0, Number(downPaymentInput) || 0));
      downPayment = Math.round(totalPayable * (pct / 100) * 100) / 100;
    } else {
      downPayment = Math.min(totalPayable, Math.max(0, Number(downPaymentInput) || 0));
    }

    const financedBalance = Math.max(
      0,
      Math.round((totalPayable - downPayment) * 100) / 100
    );

    const { schedule, monthlyAmount, endDate } = generateInstallmentSchedule({
      financedBalance,
      durationMonths: Math.max(1, durationMonths),
      startDate,
      dueDayOfMonth: paymentDueDay,
    });

    const expectedGrossProfit = totalPayable - (Number(purchaseCostPrice) || 0);

    return {
      cashPrice,
      instFee,
      svcCharge,
      disc,
      totalPayable,
      downPayment,
      financedBalance,
      monthlyAmount,
      endDate,
      schedule,
      expectedGrossProfit,
    };
  }, [
    originalCashPrice,
    markupType,
    markupValue,
    serviceChargeAmount,
    discountAmount,
    downPaymentMethod,
    downPaymentInput,
    durationMonths,
    startDate,
    paymentDueDay,
    purchaseCostPrice,
  ]);

  // Image file reader helper for Customer Photo / NIC Front & Back
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Create Installment Plan
  const handleCreatePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custFullName.trim() || !custNic.trim() || !custMobile.trim()) {
      alert("Please enter Customer Full Name, NIC Number, and Mobile Number.");
      return;
    }
    if (!productName.trim()) {
      alert("Please enter the Product Name.");
      return;
    }

    setIsCreatingPlan(true);
    try {
      const created = await createInstallmentPlan({
        shopId: currentShopId,
        shopName: currentShopName,
        branchId: "main",
        branchName: currentBranch,
        customer: {
          ...(selectedCustomerId ? { customerId: selectedCustomerId } : {}),
          fullName: custFullName.trim(),
          nicNumber: custNic.trim().toUpperCase(),
          mobileNumber: custMobile.trim(),
          address: custAddress.trim() || "Sri Lanka",
          ...(custEmail.trim() ? { email: custEmail.trim() } : {}),
          ...(custPhotoUrl ? { customerPhotoUrl: custPhotoUrl } : {}),
          ...(nicFrontUrl ? { nicFrontUrl } : {}),
          ...(nicBackUrl ? { nicBackUrl } : {}),
        },
        ...(includeGuarantor && guarantorName.trim()
          ? {
              guarantor: {
                fullName: guarantorName.trim(),
                nicNumber: guarantorNic.trim().toUpperCase(),
                mobileNumber: guarantorMobile.trim(),
                relationship: guarantorRelation.trim() || "Guarantor",
                address: guarantorAddress.trim(),
              },
            }
          : {}),
        product: {
          ...(selectedProductId ? { productId: selectedProductId } : {}),
          productName: productName.trim(),
          model: productModel.trim() || productName.trim(),
          sku: productSku.trim() || "INST-DEV",
          imeiNumber: imeiNumber.trim() || "N/A",
          serialNumber: serialNumber.trim() || "N/A",
          purchaseCostPrice: Number(purchaseCostPrice) || 0,
          originalCashPrice: createPlanPreview.cashPrice,
          deliveryDate,
          warrantyDetails: warrantyDetails.trim() || "1 Year Warranty",
        },
        originalCashPrice: createPlanPreview.cashPrice,
        installmentMarkupType: markupType,
        installmentMarkupValue: Number(markupValue) || 0,
        installmentFeeAmount: createPlanPreview.instFee,
        serviceChargeAmount: createPlanPreview.svcCharge,
        discountAmount: createPlanPreview.disc,
        totalAgreedPayable: createPlanPreview.totalPayable,
        downPaymentMethod,
        downPaymentInputValue: Number(downPaymentInput) || 0,
        initialDownPayment: createPlanPreview.downPayment,
        downPaymentTenderMethod: downPaymentTender,
        durationMonths,
        startDate,
        paymentDueDayOfMonth: paymentDueDay,
        lateFeePerMonthPct: lateFeePct,
        lateFeeGraceDays,
        termsAndConditions: termsText,
        latePaymentConditions: lateConditionsText,
        notes: planNotes,
        operator: {
          userId: user?.uid || "staff",
          username: user?.username || "Staff",
          displayName: user?.displayName || user?.username || "Shop Admin",
        },
      });

      // Reset all fields immediately so form is empty and ready for next plan
      resetCreatePlanForm();

      showToast(`Created Agreement ${created.agreementNumber}!`);
      setSelectedPlanId(created.id);
      setAgreementModalPlan(created);
      setActiveSection("active");
    } catch (err: any) {
      alert(err?.message || "Failed to create installment plan.");
    } finally {
      setIsCreatingPlan(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENT COLLECTION STATE (Section 4)
  // ─────────────────────────────────────────────────────────────────────────
  const [collectionPlanId, setCollectionPlanId] = useState<string>("");
  const [collectionType, setCollectionType] = useState<
    "installment" | "early_settlement"
  >("installment");
  const [collectionAmount, setCollectionAmount] = useState<string>("");
  const [collectionTender, setCollectionTender] =
    useState<InstallmentTenderMethod>("cash");
  const [collectionRef, setCollectionRef] = useState<string>("");
  const [earlyDiscount, setEarlyDiscount] = useState<string>("0");
  const [collectionNotes, setCollectionNotes] = useState<string>("");
  const [isCollecting, setIsCollecting] = useState<boolean>(false);

  const activeCollectionPlan = useMemo(
    () =>
      plans.find((p) => p.id === collectionPlanId) ||
      plans.find((p) => p.status === "active" || p.status === "overdue") ||
      null,
    [plans, collectionPlanId]
  );

  useEffect(() => {
    if (activeCollectionPlan) {
      if (collectionType === "early_settlement") {
        const disc = Math.max(0, Number(earlyDiscount) || 0);
        setCollectionAmount(
          Math.max(0, activeCollectionPlan.remainingBalance - disc).toFixed(2)
        );
      } else {
        const nextDue =
          activeCollectionPlan.overdueAmount > 0
            ? activeCollectionPlan.overdueAmount
            : activeCollectionPlan.nextDueAmount ||
              activeCollectionPlan.monthlyInstallmentAmount;
        setCollectionAmount(nextDue.toFixed(2));
      }
    }
  }, [activeCollectionPlan?.id, collectionType, earlyDiscount]);

  const handleRecordCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCollectionPlan) return;
    const amt = parseFloat(collectionAmount) || 0;
    if (amt <= 0) {
      alert("Enter a valid payment amount greater than zero.");
      return;
    }

    setIsCollecting(true);
    try {
      const { updatedPlan, paymentRecord } = await recordInstallmentPayment({
        shopId: currentShopId,
        planId: activeCollectionPlan.id,
        amount: amt,
        paymentMethod: collectionTender,
        paymentType: collectionType,
        earlySettlementDiscount:
          collectionType === "early_settlement" ? Number(earlyDiscount) || 0 : 0,
        referenceNumber: collectionRef.trim() || undefined,
        notes: collectionNotes.trim() || undefined,
        operator: {
          userId: user?.uid || "staff",
          username: user?.username || "Staff",
          displayName: user?.displayName || user?.username || "Cashier",
        },
      });

      showToast(
        `Recorded ${fmt(amt)} payment (${paymentRecord.receiptNumber})!`
      );
      setCollectionRef("");
      setCollectionNotes("");
      setReceiptModalData({ plan: updatedPlan, payment: paymentRecord });
    } catch (err: any) {
      alert(err?.message || "Failed to record installment payment.");
    } finally {
      setIsCollecting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // REMINDER DISPATCHERS (WhatsApp, SMS, Email - Section 7A)
  // ─────────────────────────────────────────────────────────────────────────
  const handleSendReminder = async (
    plan: InstallmentPlanRecord,
    channel: "whatsapp" | "sms" | "email"
  ) => {
    const dueAmt =
      plan.overdueAmount > 0 ? plan.overdueAmount : plan.nextDueAmount;
    const dueDate = plan.nextDueDate || "Upcoming";
    const msg = `Dear ${plan.customer.fullName}, this is a friendly reminder from ${currentShopName} regarding your Installment Agreement ${plan.agreementNumber} (${plan.product.productName}). Amount Due: ${fmt(dueAmt)} (Due Date: ${dueDate}). Remaining Balance: ${fmt(plan.remainingBalance)}. Thank you!`;

    const cleanPhone = plan.customer.mobileNumber.replace(/[^0-9]/g, "");
    const intlPhone = cleanPhone.startsWith("0")
      ? `94${cleanPhone.slice(1)}`
      : cleanPhone;

    if (channel === "whatsapp") {
      window.open(
        `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`,
        "_blank"
      );
    } else if (channel === "sms") {
      window.open(
        `sms:${plan.customer.mobileNumber}?body=${encodeURIComponent(msg)}`,
        "_self"
      );
    } else if (channel === "email") {
      const emailTo = plan.customer.email || "";
      window.open(
        `mailto:${emailTo}?subject=${encodeURIComponent(
          `Installment Payment Reminder - ${plan.agreementNumber}`
        )}&body=${encodeURIComponent(msg)}`,
        "_self"
      );
    }

    await logInstallmentReminder({
      shopId: currentShopId,
      planId: plan.id,
      channel,
      recipient:
        channel === "email"
          ? plan.customer.email || plan.customer.mobileNumber
          : plan.customer.mobileNumber,
      messagePreview: msg,
      sentBy: user?.displayName || user?.username || "Staff",
    });
    showToast(`Sent ${channel.toUpperCase()} reminder to ${plan.customer.fullName}`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD & ANALYTICS METRICS (Sections 1, 5 & 8)
  // ─────────────────────────────────────────────────────────────────────────
  const dashboardStats = useMemo(() => {
    const validPlans = plans.filter((p) => p.status !== "cancelled");
    const activePlans = plans.filter(
      (p) => p.status === "active" || p.status === "overdue"
    );
    const overduePlans = plans.filter(
      (p) => p.status === "overdue" || p.overdueAmount > 0
    );
    const completedPlans = plans.filter(
      (p) => p.status === "completed" || p.status === "early_settled"
    );

    const totalInstallmentSales = validPlans.reduce(
      (s, p) => s + (Number(p.totalAgreedPayable) || 0),
      0
    );
    const totalCollected = validPlans.reduce(
      (s, p) => s + (Number(p.totalCollectedAmount) || 0),
      0
    );
    const outstandingBalance = activePlans.reduce(
      (s, p) => s + (Number(p.remainingBalance) || 0),
      0
    );
    const overdueAmount = activePlans.reduce(
      (s, p) => s + (Number(p.overdueAmount) || 0),
      0
    );

    // Payments collected this month & today
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    const todayDateStr = now.toISOString().split("T")[0];

    let collectedThisMonth = 0;
    let collectedToday = 0;
    const allPayments: (InstallmentPaymentRecord & {
      customerName: string;
      productName: string;
    })[] = [];

    validPlans.forEach((plan) => {
      (plan.payments || []).forEach((pay) => {
        const dStr =
          pay.paidDateStr || new Date(pay.paidAt).toISOString().split("T")[0];
        if (dStr.startsWith(currentYearMonth)) {
          collectedThisMonth += Number(pay.amount) || 0;
        }
        if (dStr === todayDateStr) {
          collectedToday += Number(pay.amount) || 0;
        }
        allPayments.push({
          ...pay,
          customerName: plan.customer.fullName,
          productName: plan.product.productName,
        });
      });
    });

    allPayments.sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0));

    // Today's expected collections & Upcoming payments (next 14 days)
    const todaysExpected: {
      plan: InstallmentPlanRecord;
      installmentNumber: number;
      dueDate: string;
      amount: number;
    }[] = [];
    const upcomingDeliverables: {
      plan: InstallmentPlanRecord;
      installmentNumber: number;
      dueDate: string;
      amount: number;
    }[] = [];

    activePlans.forEach((plan) => {
      plan.schedule.forEach((item) => {
        if (item.remainingAmount <= 0 || item.status === "paid" || item.status === "waived")
          return;
        if (item.dueDate === todayDateStr) {
          todaysExpected.push({
            plan,
            installmentNumber: item.installmentNumber,
            dueDate: item.dueDate,
            amount: item.remainingAmount,
          });
        } else if (item.dueDate > todayDateStr) {
          upcomingDeliverables.push({
            plan,
            installmentNumber: item.installmentNumber,
            dueDate: item.dueDate,
            amount: item.remainingAmount,
          });
        }
      });
    });

    upcomingDeliverables.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // Profitability metrics
    const totalOriginalCashValue = validPlans.reduce(
      (s, p) => s + (Number(p.originalCashPrice) || 0),
      0
    );
    const totalPurchaseCost = validPlans.reduce(
      (s, p) => s + (Number(p.product?.purchaseCostPrice) || 0),
      0
    );
    const totalInstallmentMarkupEarned = validPlans.reduce(
      (s, p) =>
        s +
        (Number(p.installmentFeeAmount) || 0) +
        (Number(p.serviceChargeAmount) || 0),
      0
    );
    const totalExpectedGrossProfit = totalInstallmentSales - totalPurchaseCost;

    return {
      activePlans,
      overduePlans,
      completedPlans,
      validPlans,
      totalInstallmentSales,
      totalCollected,
      outstandingBalance,
      overdueAmount,
      collectedThisMonth,
      collectedToday,
      todaysExpected,
      upcomingDeliverables: upcomingDeliverables.slice(0, 8),
      allPayments,
      totalOriginalCashValue,
      totalPurchaseCost,
      totalInstallmentMarkupEarned,
      totalExpectedGrossProfit,
    };
  }, [plans]);

  // Filtered plans for search
  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter(
      (p) =>
        p.agreementNumber.toLowerCase().includes(q) ||
        p.customer.fullName.toLowerCase().includes(q) ||
        p.customer.nicNumber.toLowerCase().includes(q) ||
        p.customer.mobileNumber.toLowerCase().includes(q) ||
        p.product.productName.toLowerCase().includes(q) ||
        p.product.imeiNumber.toLowerCase().includes(q)
    );
  }, [plans, searchQuery]);

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 font-sans flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Top Full-Width Module Header ── */}
      <header className="sticky top-0 z-30 bg-[#0a0c14]/90 backdrop-blur-2xl border-b border-white/[0.08] px-4 sm:px-8 py-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
          {/* Left: Back to POS & Title */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <Link
                href="/shop/dashboard"
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
                title="Back to POS Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Installment Sales &amp; Payment Management
                  </h1>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {dashboardStats.activePlans.length} Active
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  {currentShopName} &bull; IMEI Ownership, Schedules, Collections, Agreements &amp; Receivables
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveSection("create")}
              className="lg:hidden px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Plan</span>
            </button>
          </div>

          {/* Right: Quick Search & Primary Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Agreement, NIC, IMEI, Name..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <button
              type="button"
              onClick={() => setActiveSection("collection")}
              className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Collect Payment</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("create")}
              className="hidden lg:flex px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold items-center gap-1.5 shadow-lg shadow-emerald-600/25 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Installment Plan</span>
            </button>
          </div>
        </div>

        {/* 8-Section Navigation Bar */}
        <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          {SECTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            const badgeCount =
              tab.id === "active"
                ? dashboardStats.activePlans.length
                : tab.id === "overdue"
                ? dashboardStats.overduePlans.length
                : tab.id === "completed"
                ? dashboardStats.completedPlans.length
                : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                title={tab.purpose}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer border ${
                  active
                    ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300 shadow-sm"
                    : "bg-white/[0.025] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {badgeCount !== null && badgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      tab.id === "overdue"
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-white/10 text-zinc-200"
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── MAIN WORKSPACE CONTENT ── */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Global Loading / Sync Indicator */}
        {(isLoadingPlans || isCreatingPlan || isCollecting || processingActionKey || isSavingRules) && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
            <span>
              {isCreatingPlan
                ? "Registering installment plan & generating agreement..."
                : isCollecting
                ? "Recording payment & generating thermal receipt..."
                : processingActionKey
                ? "Updating installment agreement..."
                : isSavingRules
                ? "Saving duration fee rules..."
                : "Loading installment agreements..."}
            </span>
          </div>
        )}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 1. OVERVIEW SECTION (Installment Dashboard)                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "overview" && (
          <div className="space-y-6">
            {/* 6 Key Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
                <div className="text-[11px] text-zinc-400 font-medium">
                  Active Installment Plans
                </div>
                <div className="text-2xl font-black font-mono text-white mt-1.5">
                  {dashboardStats.activePlans.length}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  {dashboardStats.completedPlans.length} completed agreements
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
                <div className="text-[11px] text-zinc-400 font-medium">
                  Total Installment Sales
                </div>
                <div className="text-lg font-black font-mono text-white mt-1.5 truncate">
                  {fmt(dashboardStats.totalInstallmentSales)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  Full agreed payable value
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/25">
                <div className="text-[11px] text-emerald-300 font-medium">
                  Total Collected
                </div>
                <div className="text-lg font-black font-mono text-emerald-400 mt-1.5 truncate">
                  {fmt(dashboardStats.totalCollected)}
                </div>
                <div className="text-[10px] text-emerald-300/70 mt-1">
                  Deposits + monthly installments
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/[0.07] border border-amber-500/25">
                <div className="text-[11px] text-amber-300 font-medium">
                  Outstanding Balance
                </div>
                <div className="text-lg font-black font-mono text-amber-300 mt-1.5 truncate">
                  {fmt(dashboardStats.outstandingBalance)}
                </div>
                <div className="text-[10px] text-amber-300/70 mt-1">
                  Active receivable exposure
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-500/[0.07] border border-rose-500/25">
                <div className="text-[11px] text-rose-300 font-medium">
                  Overdue Amount
                </div>
                <div className="text-lg font-black font-mono text-rose-400 mt-1.5 truncate">
                  {fmt(dashboardStats.overdueAmount)}
                </div>
                <div className="text-[10px] text-rose-300/70 mt-1">
                  {dashboardStats.overduePlans.length} customers past due date
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-sky-500/[0.07] border border-sky-500/25">
                <div className="text-[11px] text-sky-300 font-medium">
                  Collected This Month
                </div>
                <div className="text-lg font-black font-mono text-sky-300 mt-1.5 truncate">
                  {fmt(dashboardStats.collectedThisMonth)}
                </div>
                <div className="text-[10px] text-sky-300/70 mt-1">
                  Today: {fmt(dashboardStats.collectedToday)}
                </div>
              </div>
            </div>

            {/* Middle Row: Today's Expected Collections, Overdue Customers & Upcoming Payments */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Today's Expected Collections */}
              <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <span>Today&apos;s Expected Collections</span>
                  </h3>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">
                    {dashboardStats.todaysExpected.length} due
                  </span>
                </div>

                {dashboardStats.todaysExpected.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    No installment payments scheduled specifically for today.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboardStats.todaysExpected.map((item) => (
                      <div
                        key={`${item.plan.id}_${item.installmentNumber}`}
                        className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {item.plan.customer.fullName}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            {item.plan.agreementNumber} &bull; Inst #
                            {String(item.installmentNumber).padStart(2, "0")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-emerald-400">
                            {fmt(item.amount)}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCollectionPlanId(item.plan.id);
                              setActiveSection("collection");
                            }}
                            className="text-[10px] text-emerald-300 underline cursor-pointer"
                          >
                            Collect Now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Overdue Customers */}
              <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Overdue Customers</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveSection("overdue")}
                    className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                  >
                    View All ({dashboardStats.overduePlans.length})
                  </button>
                </div>

                {dashboardStats.overduePlans.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    Zero overdue accounts! All active customers are up to date.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboardStats.overduePlans.slice(0, 5).map((plan) => (
                      <div
                        key={plan.id}
                        className="p-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {plan.customer.fullName}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            {plan.agreementNumber} &bull; {plan.customer.mobileNumber}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-rose-400">
                            {fmt(plan.overdueAmount)}
                          </div>
                          <div className="flex items-center gap-2 justify-end mt-0.5">
                            <button
                              type="button"
                              onClick={() => handleSendReminder(plan, "whatsapp")}
                              className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                            >
                              WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCollectionPlanId(plan.id);
                                setActiveSection("collection");
                              }}
                              className="text-[10px] text-white underline cursor-pointer"
                            >
                              Collect
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Payments */}
              <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span>Upcoming Schedule</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400">Next installments</span>
                </div>

                {dashboardStats.upcomingDeliverables.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    No upcoming installments scheduled yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboardStats.upcomingDeliverables.slice(0, 5).map((u) => (
                      <div
                        key={`${u.plan.id}_${u.installmentNumber}`}
                        className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">
                            {u.plan.customer.fullName}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            Due: {u.dueDate} (Inst #
                            {String(u.installmentNumber).padStart(2, "0")})
                          </div>
                        </div>
                        <div className="font-mono font-bold text-zinc-200">
                          {fmt(u.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Recent Installment Agreements & Recently Completed Agreements */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Recent Installment Agreements (2 cols) */}
              <div className="lg:col-span-2 p-5 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Recent Installment Agreements
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveSection("active")}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer"
                  >
                    View All Plans &rarr;
                  </button>
                </div>

                {plans.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <Smartphone className="w-8 h-8 text-zinc-600 mx-auto" />
                    <div className="text-sm font-semibold text-zinc-300">
                      No Installment Plans Registered Yet
                    </div>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Create your first smartphone installment plan to automatically generate a monthly payment schedule, track IMEI ownership, and print a customer agreement.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveSection("create")}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                    >
                      + Create First Installment Sale
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-[10px] uppercase text-zinc-400">
                          <th className="py-2.5 px-2">Agreement</th>
                          <th className="py-2.5 px-2">Customer &amp; NIC</th>
                          <th className="py-2.5 px-2">Device &amp; IMEI</th>
                          <th className="py-2.5 px-2 text-right">Total Payable</th>
                          <th className="py-2.5 px-2 text-right">Collected</th>
                          <th className="py-2.5 px-2 text-right">Remaining</th>
                          <th className="py-2.5 px-2 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {plans.slice(0, 6).map((plan) => (
                          <tr key={plan.id} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-2 font-mono font-bold text-emerald-400">
                              {plan.agreementNumber}
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="font-semibold text-white">
                                {plan.customer.fullName}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono">
                                {plan.customer.nicNumber} &bull; {plan.customer.mobileNumber}
                              </div>
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="text-zinc-200">{plan.product.productName}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">
                                IMEI: {plan.product.imeiNumber}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-zinc-200">
                              {fmt(plan.totalAgreedPayable)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-emerald-400">
                              {fmt(plan.totalCollectedAmount)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-300">
                              {fmt(plan.remainingBalance)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPlanId(plan.id);
                                    setActiveSection("active");
                                  }}
                                  className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-200 cursor-pointer"
                                >
                                  Profile
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAgreementModalPlan(plan)}
                                  className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-[11px] text-emerald-300 cursor-pointer"
                                >
                                  Agreement
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recently Completed Agreements */}
              <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Recently Completed</span>
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {dashboardStats.completedPlans.length} settled
                  </span>
                </div>

                {dashboardStats.completedPlans.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    Completed agreements will appear here once all installments are settled.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboardStats.completedPlans.slice(0, 5).map((plan) => (
                      <div
                        key={plan.id}
                        className="p-3 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {plan.customer.fullName}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            {plan.agreementNumber} &bull; {plan.product.productName}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-emerald-400">
                            {fmt(plan.totalCollectedAmount)}
                          </div>
                          <span className="text-[9px] uppercase font-bold text-emerald-300">
                            {plan.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 2. CREATE PLAN SECTION (Interactive Installment Sale Builder)       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "create" && (
          <form
            onSubmit={handleCreatePlanSubmit}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            {/* Left 7 Columns: Customer, Guarantor, Device IMEI & Pricing Controls */}
            <div className="lg:col-span-7 space-y-5">
              {/* Step 1: Device & IMEI Details */}
              <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-bold text-white">
                      1. Smartphone / Product &amp; IMEI Ownership Details
                    </h2>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    Deducts stock on delivery
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Select from Shop Catalog (Optional — auto-fills prices &amp; deducts stock)
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => handleSelectCatalogProduct(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/[0.1] text-white focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="">-- Custom / Manual Smartphone Entry --</option>
                      {catalogProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku || "SKU"}) — Cash: {currency}{" "}
                          {(p.sellingPrice || 0).toLocaleString()} | Stock:{" "}
                          {p.stockQuantity ?? 0}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="e.g. Samsung Galaxy S24 Ultra 256GB"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Model / Variant
                    </label>
                    <input
                      type="text"
                      value={productModel}
                      onChange={(e) => setProductModel(e.target.value)}
                      placeholder="e.g. SM-S928B / Titanium Gray"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-amber-300 text-[11px] font-semibold mb-1">
                      IMEI Number (Optional)
                    </label>
                    <input
                      type="text"
                      value={imeiNumber}
                      onChange={(e) => setImeiNumber(e.target.value)}
                      placeholder="e.g. 358901234567890 (Optional)"
                      className="w-full px-3 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/30 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Serial Number &amp; SKU
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        placeholder="Serial No."
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:outline-none"
                      />
                      <input
                        type="text"
                        value={productSku}
                        onChange={(e) => setProductSku(e.target.value)}
                        placeholder="SKU"
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Shop Purchase Cost Price ({currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={purchaseCostPrice}
                      onChange={(e) => setPurchaseCostPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-emerald-300 text-[11px] font-semibold mb-1">
                      Original Cash Selling Price ({currency}) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={originalCashPrice}
                      onChange={(e) => setOriginalCashPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/35 text-white font-mono font-bold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Delivery Date
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Warranty Details
                    </label>
                    <input
                      type="text"
                      value={warrantyDetails}
                      onChange={(e) => setWarrantyDetails(e.target.value)}
                      placeholder="1 Year Hardware Warranty"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Adjustable Pricing by Duration & Flexible Down Payment (Requirements 1-6) */}
              <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-bold text-white">
                      2. Installment Pricing, Duration &amp; Flexible Down Payment
                    </h2>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    Cash Price Kept Separate
                  </span>
                </div>

                {/* Duration Selection with Term Fee Rules (Requirement 6) */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <label className="text-zinc-300 font-semibold">
                      Installment Duration (Months)
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      Click a term or apply shop fee rule
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {durationRules.map((rule) => {
                      const active = durationMonths === rule.months;
                      return (
                        <button
                          key={rule.months}
                          type="button"
                          onClick={() => handleSelectDurationPreset(rule.months, false)}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            active
                              ? "bg-emerald-600/20 border-emerald-500 text-white font-bold"
                              : "bg-black/40 border-white/[0.08] text-zinc-400 hover:text-white"
                          }`}
                        >
                          <div className="font-mono text-xs font-bold">
                            {rule.months} Mo
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            {rule.markupValue > 0
                              ? rule.markupType === "percentage"
                                ? `+${rule.markupValue}% rule`
                                : `+${currency} ${rule.markupValue}`
                              : "0% fee"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400">Custom Months:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={durationMonths}
                        onChange={(e) =>
                          setDurationMonths(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-20 px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.1] text-white font-mono text-xs text-center"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectDurationPreset(durationMonths, true)}
                      className="text-[11px] text-amber-300 hover:underline cursor-pointer"
                    >
                      Apply {durationMonths}-Month Term Fee Rule
                    </button>
                  </div>
                </div>

                {/* Separate Installment Fee / Markup & Service Charges (Requirements 2 & 4) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/[0.06] text-xs">
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Installment Markup Mode
                    </label>
                    <select
                      value={markupType}
                      onChange={(e) => setMarkupType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white focus:outline-none"
                    >
                      <option value="none">0% (Same as Cash Price)</option>
                      <option value="percentage">Percentage Markup (%)</option>
                      <option value="fixed">Fixed Installment Fee ({currency})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Markup Value ({markupType === "percentage" ? "%" : currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={markupType === "none"}
                      value={markupType === "none" ? 0 : markupValue}
                      onChange={(e) => setMarkupValue(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono disabled:opacity-40 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Service / Doc Fee ({currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={serviceChargeAmount}
                      onChange={(e) => setServiceChargeAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                {/* 3 Down Payment Methods: Percentage, Fixed Amount, or Custom (Requirements 1 & 5) */}
                <div className="pt-3 border-t border-white/[0.06] space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-zinc-200 font-semibold">
                      Initial Down Payment Method (3 Options)
                    </label>
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/[0.08]">
                      {(
                        [
                          { id: "percentage", label: "1. Percentage (%)" },
                          { id: "fixed", label: "2. Fixed Preset" },
                          { id: "custom", label: "3. Custom Amount" },
                        ] as { id: DownPaymentMethodType; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setDownPaymentMethod(m.id);
                            if (m.id === "percentage") setDownPaymentInput(25);
                            else if (m.id === "fixed") setDownPaymentInput(30000);
                          }}
                          className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            downPaymentMethod === m.id
                              ? "bg-emerald-600 text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Presets based on selected Down Payment Method */}
                  {downPaymentMethod === "percentage" && (
                    <div className="flex flex-wrap items-center gap-2">
                      {[10, 20, 25, 30, 40, 50].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDownPaymentInput(pct)}
                          className={`px-3 py-1.5 rounded-lg font-mono text-xs border cursor-pointer ${
                            Number(downPaymentInput) === pct
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                              : "bg-white/[0.04] border-white/[0.08] text-zinc-300"
                          }`}
                        >
                          {pct}% ({fmt((createPlanPreview.totalPayable * pct) / 100)})
                        </button>
                      ))}
                    </div>
                  )}

                  {downPaymentMethod === "fixed" && (
                    <div className="flex flex-wrap items-center gap-2">
                      {[15000, 20000, 30000, 40000, 50000, 75000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setDownPaymentInput(amt)}
                          className={`px-3 py-1.5 rounded-lg font-mono text-xs border cursor-pointer ${
                            Number(downPaymentInput) === amt
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                              : "bg-white/[0.04] border-white/[0.08] text-zinc-300"
                          }`}
                        >
                          {currency} {amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1">
                        {downPaymentMethod === "percentage"
                          ? "Down Payment (%)"
                          : `Down Payment Amount (${currency})`}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={downPaymentInput}
                        onChange={(e) => setDownPaymentInput(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.12] text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1">
                        Initial Payment Tender
                      </label>
                      <select
                        value={downPaymentTender}
                        onChange={(e) =>
                          setDownPaymentTender(e.target.value as InstallmentTenderMethod)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.12] text-white focus:outline-none"
                      >
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="card">Card</option>
                        <option value="mobile_qr">Mobile / QR</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1">
                        Monthly Due Day (1–28)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={paymentDueDay}
                        onChange={(e) =>
                          setPaymentDueDay(
                            Math.min(28, Math.max(1, Number(e.target.value) || 5))
                          )
                        }
                        className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.12] text-white font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Customer & Guarantor Profile (Section 3 & 7E) */}
              <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-bold text-white">
                      3. Customer &amp; NIC Profile + Guarantor
                    </h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  {existingCustomers.length > 0 && (
                    <div className="sm:col-span-2">
                      <label className="block text-zinc-400 text-[11px] mb-1">
                        Quick Fill from Registered Customers (Optional)
                      </label>
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-white focus:outline-none"
                      >
                        <option value="">-- New Customer Entry --</option>
                        {existingCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Customer Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={custFullName}
                      onChange={(e) => setCustFullName(e.target.value)}
                      placeholder="e.g. Kasun Perera"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      NIC Number (Sri Lanka National ID) *
                    </label>
                    <input
                      type="text"
                      required
                      value={custNic}
                      onChange={(e) => setCustNic(e.target.value)}
                      placeholder="e.g. 199512345678 or 951234567V"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Mobile Number (WhatsApp / SMS) *
                    </label>
                    <input
                      type="text"
                      required
                      value={custMobile}
                      onChange={(e) => setCustMobile(e.target.value)}
                      placeholder="e.g. 0771234567"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      placeholder="customer@email.com"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Residential Address *
                    </label>
                    <input
                      type="text"
                      required
                      value={custAddress}
                      onChange={(e) => setCustAddress(e.target.value)}
                      placeholder="No. 45, Galle Road, Colombo / Kalutara"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white focus:outline-none"
                    />
                  </div>

                  {/* Optional Customer Photo & NIC Document Images */}
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <label className="p-2.5 rounded-xl bg-black/30 border border-dashed border-white/[0.12] hover:border-emerald-500/40 flex items-center justify-between cursor-pointer">
                      <span className="text-[11px] text-zinc-300 truncate">
                        {custPhotoUrl ? "✓ Customer Photo Attached" : "Upload Customer Photo"}
                      </span>
                      <Upload className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, setCustPhotoUrl)}
                      />
                    </label>

                    <label className="p-2.5 rounded-xl bg-black/30 border border-dashed border-white/[0.12] hover:border-emerald-500/40 flex items-center justify-between cursor-pointer">
                      <span className="text-[11px] text-zinc-300 truncate">
                        {nicFrontUrl ? "✓ NIC Front Attached" : "Upload NIC (Front)"}
                      </span>
                      <Upload className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, setNicFrontUrl)}
                      />
                    </label>

                    <label className="p-2.5 rounded-xl bg-black/30 border border-dashed border-white/[0.12] hover:border-emerald-500/40 flex items-center justify-between cursor-pointer">
                      <span className="text-[11px] text-zinc-300 truncate">
                        {nicBackUrl ? "✓ NIC Back Attached" : "Upload NIC (Back)"}
                      </span>
                      <Upload className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, setNicBackUrl)}
                      />
                    </label>
                  </div>
                </div>

                {/* Guarantor Toggle & Fields */}
                <div className="pt-3 border-t border-white/[0.07]">
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeGuarantor}
                      onChange={(e) => setIncludeGuarantor(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    <span>Add Guarantor / Emergency Contact Details</span>
                  </label>

                  {includeGuarantor && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                      <input
                        type="text"
                        value={guarantorName}
                        onChange={(e) => setGuarantorName(e.target.value)}
                        placeholder="Guarantor Full Name"
                        className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white"
                      />
                      <input
                        type="text"
                        value={guarantorNic}
                        onChange={(e) => setGuarantorNic(e.target.value)}
                        placeholder="Guarantor NIC Number"
                        className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono"
                      />
                      <input
                        type="text"
                        value={guarantorMobile}
                        onChange={(e) => setGuarantorMobile(e.target.value)}
                        placeholder="Guarantor Mobile No."
                        className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono"
                      />
                      <input
                        type="text"
                        value={guarantorRelation}
                        onChange={(e) => setGuarantorRelation(e.target.value)}
                        placeholder="Relationship (e.g. Brother / Spouse)"
                        className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Plain Customer Financial Summary & Live Schedule Preview (Requirement 3) */}
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-28">
              <div className="p-5 rounded-2xl bg-gradient-to-b from-[#131726] to-[#0c0e17] border border-emerald-500/30 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Plain Customer Financial Breakdown
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Clear, transparent figures — zero hidden math
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold">
                    {durationMonths} Months
                  </span>
                </div>

                {/* Exact Breakdown Table matching user's example */}
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-zinc-300">
                    <span className="font-sans text-zinc-400">
                      Original Cash Selling Price:
                    </span>
                    <span className="font-bold">{fmt(createPlanPreview.cashPrice)}</span>
                  </div>

                  {createPlanPreview.instFee > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span className="font-sans">
                        Installment Fee (
                        {markupType === "percentage" ? `${markupValue}%` : "Fixed"}):
                      </span>
                      <span>+{fmt(createPlanPreview.instFee)}</span>
                    </div>
                  )}

                  {createPlanPreview.svcCharge > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span className="font-sans">Service / Documentation Charge:</span>
                      <span>+{fmt(createPlanPreview.svcCharge)}</span>
                    </div>
                  )}

                  {createPlanPreview.disc > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span className="font-sans">Promotional Discount:</span>
                      <span>-{fmt(createPlanPreview.disc)}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/[0.08] flex justify-between text-sm font-bold text-white">
                    <span className="font-sans">Total Agreed Payable:</span>
                    <span>{fmt(createPlanPreview.totalPayable)}</span>
                  </div>

                  <div className="flex justify-between text-emerald-400 font-bold">
                    <span className="font-sans">
                      Initial Down Payment ({downPaymentMethod}):
                    </span>
                    <span>-{fmt(createPlanPreview.downPayment)}</span>
                  </div>

                  <div className="pt-2 border-t border-white/[0.08] flex justify-between text-amber-300 font-bold">
                    <span className="font-sans">Remaining Financed Balance:</span>
                    <span>{fmt(createPlanPreview.financedBalance)}</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-between mt-2">
                    <div>
                      <div className="font-sans text-[11px] uppercase font-bold text-emerald-300">
                        Monthly Installment ({durationMonths}x)
                      </div>
                      <div className="font-sans text-[10px] text-zinc-300">
                        Due on the {paymentDueDay}th of every month
                      </div>
                    </div>
                    <div className="text-lg font-black text-white font-mono">
                      {fmt(createPlanPreview.monthlyAmount)}
                    </div>
                  </div>
                </div>

                {/* Live Schedule Preview */}
                <div className="space-y-2 pt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex justify-between">
                    <span>Auto-Generated Schedule Preview</span>
                    <span>Ends: {createPlanPreview.endDate}</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/40 divide-y divide-white/[0.05] text-xs font-mono">
                    {createPlanPreview.schedule.map((item) => (
                      <div
                        key={item.installmentNumber}
                        className="px-3 py-2 flex items-center justify-between"
                      >
                        <span className="text-zinc-400">
                          Month {String(item.installmentNumber).padStart(2, "0")}
                        </span>
                        <span className="text-zinc-200">{item.dueDate}</span>
                        <span className="font-bold text-white">
                          {fmt(item.scheduledAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="submit"
                    disabled={isCreatingPlan}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isCreatingPlan && (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    )}
                    <span>
                      {isCreatingPlan
                        ? "Registering Agreement..."
                        : "Register Installment Sale & Generate Agreement"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={resetCreatePlanForm}
                    disabled={isCreatingPlan}
                    className="w-full py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-400 hover:text-zinc-200 text-[11px] font-semibold transition-all cursor-pointer"
                  >
                    Clear All Fields
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 3. ACTIVE PLANS & CUSTOMER INSTALLMENT PROFILE (Section 2 & 3)      */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "active" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 Cols: Active Plans List */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">
                  Active Installment Plans ({dashboardStats.activePlans.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveSection("create")}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  + New Plan
                </button>
              </div>

              {filteredPlans.filter(
                (p) => p.status === "active" || p.status === "overdue"
              ).length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-center text-xs text-zinc-500">
                  No active installment plans match your filter.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredPlans
                    .filter((p) => p.status === "active" || p.status === "overdue")
                    .map((plan) => {
                      const isSelected = selectedPlan?.id === plan.id;
                      const pctPaid =
                        plan.totalAgreedPayable > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (plan.totalCollectedAmount / plan.totalAgreedPayable) * 100
                              )
                            )
                          : 0;
                      return (
                        <div
                          key={plan.id}
                          onClick={() => setSelectedPlanId(plan.id)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                            isSelected
                              ? "bg-emerald-500/[0.08] border-emerald-500/50 shadow-lg"
                              : "bg-white/[0.025] hover:bg-white/[0.05] border-white/[0.07]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-emerald-400">
                                  {plan.agreementNumber}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                    plan.status === "overdue"
                                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                      : "bg-emerald-500/15 text-emerald-300"
                                  }`}
                                >
                                  {plan.status}
                                </span>
                              </div>
                              <div className="text-sm font-bold text-white mt-0.5">
                                {plan.customer.fullName}
                              </div>
                              <div className="text-[11px] text-zinc-400 font-mono">
                                NIC: {plan.customer.nicNumber} &bull;{" "}
                                {plan.customer.mobileNumber}
                              </div>
                            </div>

                            <div className="text-right font-mono">
                              <div className="text-[10px] text-zinc-400">Remaining</div>
                              <div className="text-sm font-black text-amber-300">
                                {fmt(plan.remainingBalance)}
                              </div>
                              <div className="text-[10px] text-zinc-500">
                                {plan.paidInstallmentsCount}/{plan.durationMonths} paid
                              </div>
                            </div>
                          </div>

                          <div className="text-[11px] text-zinc-300 flex items-center justify-between">
                            <span className="truncate">
                              {plan.product.productName} (IMEI: {plan.product.imeiNumber})
                            </span>
                            <span className="font-mono text-emerald-400 shrink-0">
                              {pctPaid}%
                            </span>
                          </div>

                          <div className="w-full h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${pctPaid}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Right 7 Cols: Detailed Customer Installment Profile & Schedule */}
            <div className="lg:col-span-7">
              {(() => {
                const detailPlan =
                  selectedPlan ||
                  filteredPlans.find(
                    (p) => p.status === "active" || p.status === "overdue"
                  ) ||
                  null;
                if (!detailPlan) {
                  return (
                    <div className="p-12 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-center text-xs text-zinc-500">
                      Select an installment plan on the left to inspect its Customer Profile, IMEI Ownership, Payment Schedule, and Receipts.
                    </div>
                  );
                }

                return (
                  <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-6">
                    {/* Profile Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-white/[0.08]">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-emerald-400">
                            {detailPlan.agreementNumber}
                          </span>
                          <span className="text-xs text-zinc-500">&bull;</span>
                          <span className="text-xs text-zinc-400">
                            {detailPlan.startDate} to {detailPlan.endDate}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-white mt-0.5">
                          {detailPlan.customer.fullName}
                        </h3>
                        <p className="text-xs text-zinc-400 font-mono">
                          NIC: {detailPlan.customer.nicNumber} &bull; Tel:{" "}
                          {detailPlan.customer.mobileNumber} &bull;{" "}
                          {detailPlan.customer.address}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCollectionPlanId(detailPlan.id);
                            setCollectionType("installment");
                            setActiveSection("collection");
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Collect Payment</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCollectionPlanId(detailPlan.id);
                            setCollectionType("early_settlement");
                            setActiveSection("collection");
                          }}
                          className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold cursor-pointer"
                        >
                          Early Settlement
                        </button>
                        <button
                          type="button"
                          onClick={() => setAgreementModalPlan(detailPlan)}
                          className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Agreement</span>
                        </button>
                      </div>
                    </div>

                    {/* Product & Financial Snapshot Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.06] space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Device &amp; IMEI Ownership
                        </div>
                        <div className="font-bold text-white">
                          {detailPlan.product.productName} ({detailPlan.product.model})
                        </div>
                        <div className="font-mono text-amber-300">
                          IMEI: {detailPlan.product.imeiNumber}
                        </div>
                        <div className="font-mono text-zinc-400 text-[11px]">
                          Serial: {detailPlan.product.serialNumber} &bull; SKU:{" "}
                          {detailPlan.product.sku}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Delivered: {detailPlan.product.deliveryDate} &bull;{" "}
                          {detailPlan.product.warrantyDetails}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.06] space-y-1.5 font-mono">
                        <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-400">
                          Financial Position
                        </div>
                        <div className="flex justify-between">
                          <span className="font-sans text-zinc-400">Cash Price:</span>
                          <span>{fmt(detailPlan.originalCashPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-sans text-zinc-400">
                            Total Agreed Payable:
                          </span>
                          <span className="font-bold text-white">
                            {fmt(detailPlan.totalAgreedPayable)}
                          </span>
                        </div>
                        <div className="flex justify-between text-emerald-400">
                          <span className="font-sans">Total Collected:</span>
                          <span className="font-bold">
                            {fmt(detailPlan.totalCollectedAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between text-amber-300 font-bold pt-1 border-t border-white/[0.06]">
                          <span className="font-sans">Remaining Balance:</span>
                          <span>{fmt(detailPlan.remainingBalance)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Month-by-Month Payment Schedule Table */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                          Installment Payment Schedule ({detailPlan.durationMonths} Months)
                        </h4>
                        <span className="text-[11px] font-mono text-zinc-400">
                          Monthly: {fmt(detailPlan.monthlyInstallmentAmount)}
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-white/[0.04] border-b border-white/[0.08] text-[10px] uppercase text-zinc-400">
                              <th className="py-2 px-3">Month</th>
                              <th className="py-2 px-3">Due Date</th>
                              <th className="py-2 px-3 text-right">Amount</th>
                              <th className="py-2 px-3 text-right">Paid</th>
                              <th className="py-2 px-3 text-right">Remaining</th>
                              <th className="py-2 px-3 text-center">Status</th>
                              <th className="py-2 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.05] font-mono text-[11px]">
                            {detailPlan.schedule.map((item) => {
                              const isPaid = item.status === "paid";
                              return (
                              <tr
                                key={item.installmentNumber}
                                className={
                                  isPaid
                                    ? "bg-emerald-500/15 border-l-2 border-l-emerald-400"
                                    : "hover:bg-white/[0.02]"
                                }
                              >
                                <td className="py-2 px-3 font-bold text-white">
                                  {String(item.installmentNumber).padStart(2, "0")}
                                </td>
                                <td className="py-2 px-3 text-zinc-300">{item.dueDate}</td>
                                <td className="py-2 px-3 text-right text-zinc-200">
                                  {fmt(item.scheduledAmount)}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-400">
                                  {fmt(item.paidAmount)}
                                </td>
                                <td className="py-2 px-3 text-right text-amber-300">
                                  {fmt(item.remainingAmount)}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-sans font-bold uppercase ${
                                      isPaid
                                        ? "bg-emerald-500 text-white"
                                        : item.status === "partially_paid"
                                        ? "bg-amber-500/20 text-amber-300"
                                        : item.status === "overdue"
                                        ? "bg-rose-500/20 text-rose-300"
                                        : item.status === "waived"
                                        ? "bg-purple-500/20 text-purple-300"
                                        : "bg-white/[0.06] text-zinc-400"
                                    }`}
                                  >
                                    {isPaid ? "✓ PAID" : item.status.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {item.remainingAmount > 0 &&
                                    detailPlan.status !== "cancelled" && (
                                      <button
                                        type="button"
                                        disabled={
                                          processingActionKey ===
                                          `waive-${detailPlan.id}-${item.installmentNumber}`
                                        }
                                        onClick={async () => {
                                          const reason = window.prompt(
                                            `Authorize waiver for Installment #${item.installmentNumber} (${fmt(
                                              item.remainingAmount
                                            )})? Enter reason:`
                                          );
                                          if (!reason) return;
                                          const actionKey = `waive-${detailPlan.id}-${item.installmentNumber}`;
                                          setProcessingActionKey(actionKey);
                                          try {
                                            await waiveInstallmentItem({
                                              shopId: currentShopId,
                                              planId: detailPlan.id,
                                              installmentNumber: item.installmentNumber,
                                              reason,
                                            });
                                            showToast(
                                              `Installment #${item.installmentNumber} waived.`
                                            );
                                          } finally {
                                            setProcessingActionKey(null);
                                          }
                                        }}
                                        className="text-[10px] font-sans text-zinc-400 hover:text-amber-300 underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      >
                                        {processingActionKey ===
                                          `waive-${detailPlan.id}-${item.installmentNumber}` && (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        )}
                                        <span>Waive</span>
                                      </button>
                                    )}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Permanent Payment History & Receipts (Section 7B) */}
                    <div className="space-y-2.5 pt-2 border-t border-white/[0.08]">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                        Permanent Payment History &amp; Receipts (
                        {detailPlan.payments?.length || 0})
                      </h4>
                      <div className="space-y-2">
                        {(detailPlan.payments || []).map((pay) => (
                          <div
                            key={pay.paymentId}
                            className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-mono font-bold text-emerald-400">
                                {pay.receiptNumber}{" "}
                                <span className="text-[10px] font-sans uppercase text-zinc-400">
                                  ({pay.paymentType.replace("_", " ")} •{" "}
                                  {pay.paymentMethod.replace("_", " ")})
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                {new Date(pay.paidAt).toLocaleString()} &bull; Balance After:{" "}
                                {fmt(pay.balanceAfter)}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-white">
                                {fmt(pay.amount)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setReceiptModalData({ plan: detailPlan, payment: pay })
                                }
                                className="px-2.5 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] text-[11px] text-zinc-200 flex items-center gap-1 cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Receipt</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Agreement Cancellation Action (Section 7D) */}
                    {detailPlan.status !== "cancelled" &&
                      detailPlan.status !== "completed" && (
                        <div className="pt-3 border-t border-white/[0.07] flex justify-end">
                          <button
                            type="button"
                            disabled={processingActionKey === `cancel-${detailPlan.id}`}
                            onClick={async () => {
                              const reason = window.prompt(
                                `Cancel Agreement ${detailPlan.agreementNumber}? Full financial history will be preserved. Enter cancellation reason:`
                              );
                              if (!reason) return;
                              const restock = window.confirm(
                                "Was the phone returned to shop inventory? Click OK to restock +1 unit."
                              );
                              setProcessingActionKey(`cancel-${detailPlan.id}`);
                              try {
                                await cancelInstallmentAgreement({
                                  shopId: currentShopId,
                                  planId: detailPlan.id,
                                  reason,
                                  restockDevice: restock,
                                });
                                showToast(
                                  `Agreement ${detailPlan.agreementNumber} cancelled.`
                                );
                              } finally {
                                setProcessingActionKey(null);
                              }
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {processingActionKey === `cancel-${detailPlan.id}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                            <span>Cancel Agreement (Preserve Audit History)</span>
                          </button>
                        </div>
                      )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 4. PAYMENT COLLECTION SECTION (Monthly, Partial, Advance & Early)   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "collection" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Installment Payment Collection Desk
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Record monthly, partial, advance, or early-settlement payments &amp; print 80mm thermal receipts
                  </p>
                </div>
                <Wallet className="w-6 h-6 text-emerald-400" />
              </div>

              {dashboardStats.activePlans.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-500">
                  No active installment plans with outstanding balances.
                </div>
              ) : (
                <form onSubmit={handleRecordCollection} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">
                      Select Customer Installment Agreement
                    </label>
                    <select
                      value={activeCollectionPlan?.id || ""}
                      onChange={(e) => setCollectionPlanId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.12] text-white font-mono focus:outline-none"
                    >
                      {dashboardStats.activePlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.agreementNumber} — {p.customer.fullName} ({p.product.productName})
                          | Rem: {fmt(p.remainingBalance)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeCollectionPlan && (
                    <>
                      {/* Agreement Live Summary Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-black/40 border border-white/[0.07] font-mono">
                        <div>
                          <div className="text-[10px] font-sans text-zinc-400">
                            Monthly Amount
                          </div>
                          <div className="text-sm font-bold text-white mt-0.5">
                            {fmt(activeCollectionPlan.monthlyInstallmentAmount)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-sans text-zinc-400">
                            Next Due ({activeCollectionPlan.nextDueDate || "-"})
                          </div>
                          <div className="text-sm font-bold text-emerald-400 mt-0.5">
                            {fmt(activeCollectionPlan.nextDueAmount)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-sans text-zinc-400">
                            Overdue Balance
                          </div>
                          <div className="text-sm font-bold text-rose-400 mt-0.5">
                            {fmt(activeCollectionPlan.overdueAmount)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-sans text-zinc-400">
                            Total Remaining
                          </div>
                          <div className="text-sm font-bold text-amber-300 mt-0.5">
                            {fmt(activeCollectionPlan.remainingBalance)}
                          </div>
                        </div>
                      </div>

                      {/* Payment Mode Toggle: Standard/Partial/Advance vs Early Full Settlement */}
                      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/40 border border-white/[0.08]">
                        <button
                          type="button"
                          onClick={() => setCollectionType("installment")}
                          className={`py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                            collectionType === "installment"
                              ? "bg-emerald-600 text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          Monthly / Partial / Extra Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollectionType("early_settlement")}
                          className={`py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                            collectionType === "early_settlement"
                              ? "bg-amber-600 text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          Early Full Settlement
                        </button>
                      </div>

                      {/* Quick Amount Presets */}
                      {collectionType === "installment" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-zinc-400">Quick Amount:</span>
                          <button
                            type="button"
                            onClick={() =>
                              setCollectionAmount(
                                activeCollectionPlan.nextDueAmount.toFixed(2)
                              )
                            }
                            className="px-3 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-zinc-200 cursor-pointer"
                          >
                            Next Due ({fmt(activeCollectionPlan.nextDueAmount)})
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCollectionAmount(
                                (
                                  activeCollectionPlan.monthlyInstallmentAmount * 2
                                ).toFixed(2)
                              )
                            }
                            className="px-3 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-zinc-200 cursor-pointer"
                          >
                            2 Months (
                            {fmt(activeCollectionPlan.monthlyInstallmentAmount * 2)})
                          </button>
                          {activeCollectionPlan.overdueAmount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setCollectionAmount(
                                  activeCollectionPlan.overdueAmount.toFixed(2)
                                )
                              }
                              className="px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 font-mono text-rose-300 cursor-pointer"
                            >
                              Clear Overdue ({fmt(activeCollectionPlan.overdueAmount)})
                            </button>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-zinc-300 font-semibold text-[11px] mb-1">
                            Amount Received ({currency}) *
                          </label>
                          <input
                            type="number"
                            step="any"
                            required
                            value={collectionAmount}
                            onChange={(e) => setCollectionAmount(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-emerald-500/40 text-white font-mono text-base font-bold focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-zinc-300 font-semibold text-[11px] mb-1">
                            Payment Method
                          </label>
                          <select
                            value={collectionTender}
                            onChange={(e) =>
                              setCollectionTender(
                                e.target.value as InstallmentTenderMethod
                              )
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.12] text-white focus:outline-none"
                          >
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="card">Card</option>
                            <option value="mobile_qr">Mobile / QR</option>
                          </select>
                        </div>

                        {collectionType === "early_settlement" && (
                          <div>
                            <label className="block text-amber-300 text-[11px] mb-1">
                              Early Settlement Rebate / Discount ({currency})
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={earlyDiscount}
                              onChange={(e) => setEarlyDiscount(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-black/50 border border-amber-500/30 text-white font-mono"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-zinc-400 text-[11px] mb-1">
                            Bank / Card Reference (Optional)
                          </label>
                          <input
                            type="text"
                            value={collectionRef}
                            onChange={(e) => setCollectionRef(e.target.value)}
                            placeholder="Slip / Txn ID"
                            className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isCollecting}
                        className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isCollecting && (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        )}
                        <span>
                          {isCollecting
                            ? "Recording & Generating Receipt..."
                            : `Confirm ${fmt(
                                parseFloat(collectionAmount) || 0
                              )} Collection & Print Receipt`}
                        </span>
                      </button>
                    </>
                  )}
                </form>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 5. OVERDUE PAYMENTS & REMINDERS SECTION                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "overdue" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  Overdue &amp; Missed Installment Payments
                </h2>
                <p className="text-xs text-zinc-400">
                  Send automated WhatsApp, SMS, or Email payment reminders and collect overdue balances
                </p>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-xs font-bold">
                Total Overdue: {fmt(dashboardStats.overdueAmount)}
              </div>
            </div>

            {dashboardStats.overduePlans.length === 0 ? (
              <div className="p-12 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white">
                  No Overdue Installment Accounts
                </div>
                <p className="text-xs text-zinc-400">
                  All active installment customers are currently within their scheduled due dates.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardStats.overduePlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="p-5 rounded-2xl bg-rose-500/[0.05] border border-rose-500/25 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-rose-400">
                          {plan.agreementNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold uppercase">
                          {plan.overdueInstallmentsCount} Installment(s) Overdue
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white">
                        {plan.customer.fullName} (NIC: {plan.customer.nicNumber})
                      </div>
                      <div className="text-xs text-zinc-300">
                        Tel: {plan.customer.mobileNumber} &bull; Device:{" "}
                        {plan.product.productName} (IMEI: {plan.product.imeiNumber})
                      </div>
                      {plan.guarantor && (
                        <div className="text-[11px] text-amber-300">
                          Guarantor: {plan.guarantor.fullName} (
                          {plan.guarantor.mobileNumber})
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="text-right font-mono mr-2">
                        <div className="text-[10px] text-rose-300 uppercase">
                          Overdue Amount
                        </div>
                        <div className="text-base font-black text-rose-400">
                          {fmt(plan.overdueAmount)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSendReminder(plan, "whatsapp")}
                        className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendReminder(plan, "sms")}
                        className="px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>SMS</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendReminder(plan, "email")}
                        className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCollectionPlanId(plan.id);
                          setActiveSection("collection");
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Collect Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 6. COMPLETED PLANS SECTION                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "completed" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  Completed &amp; Early-Settled Agreements (
                  {dashboardStats.completedPlans.length})
                </h2>
                <p className="text-xs text-zinc-400">
                  Fully paid installment agreements where device ownership title has transferred to the customer
                </p>
              </div>
            </div>

            {dashboardStats.completedPlans.length === 0 ? (
              <div className="p-12 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-center text-xs text-zinc-500">
                No completed installment agreements yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboardStats.completedPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="p-5 rounded-2xl bg-white/[0.025] border border-emerald-500/25 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-emerald-400">
                          {plan.agreementNumber}
                        </span>
                        <h3 className="text-sm font-bold text-white mt-0.5">
                          {plan.customer.fullName}
                        </h3>
                        <p className="text-[11px] text-zinc-400 font-mono">
                          NIC: {plan.customer.nicNumber} &bull;{" "}
                          {plan.product.productName} (IMEI: {plan.product.imeiNumber})
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase">
                        {plan.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.06] text-xs font-mono">
                      <div>
                        <div className="text-[10px] font-sans text-zinc-400">
                          Cash Price
                        </div>
                        <div className="text-zinc-200">
                          {fmt(plan.originalCashPrice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-zinc-400">
                          Total Collected
                        </div>
                        <div className="font-bold text-emerald-400">
                          {fmt(plan.totalCollectedAmount)}
                        </div>
                      </div>
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => setAgreementModalPlan(plan)}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] text-white font-sans text-xs cursor-pointer"
                        >
                          View Agreement
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 7. AGREEMENTS & DURATION FEE RULES SECTION                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "agreements" && (
          <div className="space-y-6">
            {/* Configurable Duration Fee Rules (Requirement 6) */}
            <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Shop Duration Pricing &amp; Fee Rules (By Installment Term)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Configure default markup percentages or fixed fees for 3, 6, 9, 12, 18, and 24 month plans
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSavingRules}
                  onClick={async () => {
                    setIsSavingRules(true);
                    try {
                      await saveShopDurationFeeRules(currentShopId, durationRules);
                      showToast("Duration fee rules saved for this shop!");
                    } finally {
                      setIsSavingRules(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingRules && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Term Fee Rules</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {durationRules.map((rule, idx) => (
                  <div
                    key={rule.months}
                    className="p-3.5 rounded-xl bg-black/40 border border-white/[0.07] space-y-2"
                  >
                    <div className="flex items-center justify-between font-bold text-white">
                      <span>{rule.months} Months Term</span>
                      <span className="font-mono text-emerald-400 text-[11px]">
                        {rule.markupValue > 0
                          ? rule.markupType === "percentage"
                            ? `+${rule.markupValue}%`
                            : `+${currency} ${rule.markupValue}`
                          : "0% Fee"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={rule.markupType}
                        onChange={(e) => {
                          const next = [...durationRules];
                          next[idx] = {
                            ...rule,
                            markupType: e.target.value as "percentage" | "fixed",
                          };
                          setDurationRules(next);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-black/60 border border-white/[0.1] text-white text-[11px]"
                      >
                        <option value="percentage">Percent (%)</option>
                        <option value="fixed">Fixed ({currency})</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={rule.markupValue}
                        onChange={(e) => {
                          const next = [...durationRules];
                          next[idx] = {
                            ...rule,
                            markupValue: Math.max(0, Number(e.target.value) || 0),
                          };
                          setDurationRules(next);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/[0.1] text-white font-mono text-[11px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Printable Customer Agreements Directory */}
            <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-4">
              <h3 className="text-sm font-bold text-white">
                Customer Installment Agreements ({filteredPlans.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="p-4 rounded-xl bg-black/40 border border-white/[0.07] flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-emerald-400">
                        {plan.agreementNumber}
                      </div>
                      <div className="font-bold text-white mt-0.5">
                        {plan.customer.fullName} ({plan.customer.nicNumber})
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {plan.product.productName} &bull; IMEI: {plan.product.imeiNumber}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAgreementModalPlan(plan)}
                        className="px-3 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-400" />
                        <span>View / Print</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          exportInstallmentAgreementToPdf(plan, currency, {
                            address: receiptSettings.address,
                            phone: receiptSettings.phone,
                          })
                        }
                        className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 cursor-pointer"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 8. REPORTS & PROFITABILITY ANALYTICS SECTION (Pure White Report)    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === "reports" && (
          <div className="p-6 sm:p-8 rounded-2xl bg-white text-zinc-900 border border-zinc-200 shadow-2xl space-y-6">
            {/* Report Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 bg-white">
              <div>
                <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-zinc-950">
                  {currentShopName} — Installment Collections &amp; Financial Report
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  White-paper financial statement &bull; Completed &amp; paid installments highlighted in green
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report</span>
              </button>
            </div>

            {/* Profitability & Exposure Cards on White Background */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white">
              <div className="p-4 rounded-xl bg-white border border-zinc-200">
                <div className="text-[11px] text-zinc-500 font-semibold">
                  Original Cash Selling Value
                </div>
                <div className="text-lg font-black font-mono text-zinc-950 mt-1">
                  {fmt(dashboardStats.totalOriginalCashValue)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  Purchase Cost: {fmt(dashboardStats.totalPurchaseCost)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-zinc-200">
                <div className="text-[11px] text-zinc-600 font-semibold">
                  Additional Installment Charges Earned
                </div>
                <div className="text-lg font-black font-mono text-zinc-950 mt-1">
                  {fmt(dashboardStats.totalInstallmentMarkupEarned)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  Markup + service charges above cash price
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  dashboardStats.totalCollected > 0
                    ? "bg-emerald-50 border-emerald-300"
                    : "bg-white border-zinc-200"
                }`}
              >
                <div className="text-[11px] text-emerald-800 font-bold">
                  Total Collected (Payments Done)
                </div>
                <div className="text-lg font-black font-mono text-emerald-700 mt-1">
                  {fmt(dashboardStats.totalCollected)}
                </div>
                <div className="text-[10px] text-emerald-700 mt-1">
                  Expected Gross Profit: {fmt(dashboardStats.totalExpectedGrossProfit)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-zinc-200">
                <div className="text-[11px] text-zinc-600 font-semibold">
                  Collection Recovery Rate
                </div>
                <div className="text-lg font-black font-mono text-zinc-950 mt-1">
                  {dashboardStats.totalInstallmentSales > 0
                    ? `${(
                        (dashboardStats.totalCollected /
                          dashboardStats.totalInstallmentSales) *
                        100
                      ).toFixed(1)}%`
                    : "0.0%"}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                  Collected Today: {fmt(dashboardStats.collectedToday)}
                </div>
              </div>
            </div>

            {/* Collection Ledger & Customer Payment Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white">
              {/* All Recorded Collections (Green Highlighted for Completed Payments) */}
              <div className="p-5 rounded-xl bg-white border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                    Installment Collection Ledger (
                    {dashboardStats.allPayments.length} Payments Done)
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    ✓ PAID IN GREEN
                  </span>
                </div>
                {dashboardStats.allPayments.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500 bg-white">
                    No collections recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1 bg-white">
                    {dashboardStats.allPayments.map((pay) => (
                      <div
                        key={pay.paymentId}
                        className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-emerald-950">
                            ✓ {pay.customerName}{" "}
                            <span className="font-mono text-[10px] text-emerald-700 font-semibold">
                              ({pay.receiptNumber})
                            </span>
                          </div>
                          <div className="text-[10px] text-emerald-800 font-mono">
                            {pay.paidDateStr} &bull; {pay.agreementNumber} &bull;{" "}
                            {pay.paymentMethod.toUpperCase()}
                          </div>
                        </div>
                        <div className="font-mono font-black text-emerald-700">
                          {fmt(pay.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Payment Performance & Schedule Progress */}
              <div className="p-5 rounded-xl bg-white border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                    Customer Payment Performance &amp; Exposure
                  </h3>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1 bg-white">
                  {dashboardStats.validPlans.map((plan) => {
                    const isFullyPaid =
                      plan.status === "completed" ||
                      plan.status === "early_settled" ||
                      plan.remainingBalance <= 0;
                    const hasPaymentsDone = plan.totalCollectedAmount > 0;
                    const performance = isFullyPaid
                      ? "PAID / SETTLED"
                      : plan.overdueInstallmentsCount === 0
                      ? "ON TIME"
                      : plan.overdueInstallmentsCount === 1
                      ? "LATE (1 INST)"
                      : "HIGH RISK";
                    return (
                      <div
                        key={plan.id}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                          isFullyPaid
                            ? "bg-emerald-100 border-emerald-400 text-emerald-950"
                            : hasPaymentsDone && plan.overdueInstallmentsCount === 0
                            ? "bg-emerald-50/70 border-emerald-200 text-zinc-900"
                            : "bg-white border-zinc-200 text-zinc-900"
                        }`}
                      >
                        <div>
                          <div className="font-bold text-zinc-950">
                            {plan.customer.fullName}{" "}
                            <span className="font-mono text-[10px] text-zinc-500">
                              ({plan.agreementNumber})
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-600 font-mono">
                            Paid:{" "}
                            <strong className="text-emerald-700">
                              {fmt(plan.totalCollectedAmount)}
                            </strong>{" "}
                            / {fmt(plan.totalAgreedPayable)} &bull;{" "}
                            {plan.paidInstallmentsCount}/{plan.durationMonths} Months Done
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                            isFullyPaid
                              ? "bg-emerald-600 text-white"
                              : performance === "ON TIME"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : performance.includes("LATE")
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {isFullyPaid ? "✓ PAID" : performance}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Printable Agreement Modal */}
      <InstallmentAgreementModal
        plan={agreementModalPlan}
        onClose={() => setAgreementModalPlan(null)}
        currency={currency}
        shopAddress={receiptSettings.address}
        shopPhone={receiptSettings.phone}
      />

      {/* Printable 80mm Thermal Payment Receipt Modal */}
      <InstallmentPaymentReceiptModal
        plan={receiptModalData?.plan || null}
        payment={receiptModalData?.payment || null}
        onClose={() => setReceiptModalData(null)}
        currency={currency}
        shopAddress={receiptSettings.address}
        shopPhone={receiptSettings.phone}
      />
    </div>
  );
}
