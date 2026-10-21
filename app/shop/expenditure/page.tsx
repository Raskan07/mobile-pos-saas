"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Receipt,
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Building2,
  CreditCard,
  Banknote,
  Smartphone,
  RefreshCw,
  FolderTree,
  Repeat,
  ChevronDown,
  X,
  Eye,
  Check,
  Ban,
  Pencil,
  Trash2,
  ShieldCheck,
  Send,
  PieChart,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  SlidersHorizontal,
  Users,
  UserCheck,
  Scissors,
  BadgePercent,
  Calculator,
  User,
  Briefcase,
  Info,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import {
  ExpenseRecord,
  ExpenseCategory,
  RecurringExpenseSchedule,
  ExpenseStatus,
  ExpensePaymentStatus,
  ExpensePaymentMethod,
  ExpenseType,
  CreateExpenseInput,
  RecordExpensePaymentInput,
  EmployeeSalaryDetails,
} from "@/lib/types/expense";
import {
  subscribeToExpenses,
  subscribeToCategories,
  subscribeToRecurringSchedules,
  createExpenseRecord,
  approveExpense,
  rejectExpense,
  postExpenseToAccounting,
  recordExpensePayment,
  deleteExpenseRecord,
  createExpenseCategory,
  updateExpenseCategory,
  createRecurringSchedule,
  updateRecurringSchedule,
  generateDueRecurringExpenses,
  computeExpenseAnalytics,
  ensureDefaultCategories,
} from "@/lib/services/expenseService";
import { subscribeToUsersByShop } from "@/lib/services/userService";
import { ShopUser } from "@/lib/types/user";

// Helper for formatting LKR currency
function formatLKR(amount: number): string {
  return "LKR " + (amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ShopExpenditurePage() {
  const router = useRouter();
  const { shop, user, isAuthenticated, isLoading: authLoading } = useShopAuth();
  const { hasPermission, isShopAdmin } = useRBAC();

  const currentShopId = shop?.shopId || "";
  const currentShopName = shop?.shopName || "My Store";

  const auditUser = useMemo(
    () => ({
      userId: user?.uid || "usr-cashier",
      username: user?.username || "staff",
      displayName: user?.displayName || user?.username || "Store Staff",
      role: user?.role || "cashier",
    }),
    [user]
  );

  // RBAC Permission Gates
  const canView = hasPermission("expenditures:view") || isShopAdmin;
  const canCreate = hasPermission("expenditures:create") || isShopAdmin;
  const canApprove = hasPermission("expenditures:approve") || isShopAdmin;
  const canManageCategories = hasPermission("expenditures:categories") || isShopAdmin;
  const canDelete = hasPermission("expenditures:delete") || isShopAdmin;

  // Active View Tab: "list" | "payroll" | "analytics" | "recurring" | "categories"
  const [activeTab, setActiveTab] = useState<"list" | "payroll" | "analytics" | "recurring" | "categories">("list");

  // State
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [schedules, setSchedules] = useState<RecurringExpenseSchedule[]>([]);
  const [staffMembers, setStaffMembers] = useState<ShopUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [payrollSearch, setPayrollSearch] = useState("");
  const [datePreset, setDatePreset] = useState<string>("this_month");
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(() => String(new Date().getFullYear()));
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Modals
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [paymentTargetExpense, setPaymentTargetExpense] = useState<ExpenseRecord | null>(null);

  // Form States for New Expense
  const [formExpenseType, setFormExpenseType] = useState<ExpenseType>("OPERATING_EXPENSE");
  const [formCategory, setFormCategory] = useState<string>("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formDate, setFormDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [formPaymentMethod, setFormPaymentMethod] = useState<ExpensePaymentMethod>("cash");
  const [formPayee, setFormPayee] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formReference, setFormReference] = useState<string>("");
  const [formPaymentOption, setFormPaymentOption] = useState<"paid" | "partial" | "unpaid">("paid");
  const [formPartialAmount, setFormPartialAmount] = useState<string>("");
  const [formTaxDeductible, setFormTaxDeductible] = useState<boolean>(true);
  const [formAutoPost, setFormAutoPost] = useState<boolean>(false);

  // Specialized Employee Salary Form Fields
  const [salaryEmployeeName, setSalaryEmployeeName] = useState<string>("");
  const [salaryEmployeeId, setSalaryEmployeeId] = useState<string>("");
  const [salaryPayPeriod, setSalaryPayPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;
  });
  const [salaryBaseAmount, setSalaryBaseAmount] = useState<string>("");
  const [salaryOvertimeHours, setSalaryOvertimeHours] = useState<string>("");
  const [salaryOvertimeRate, setSalaryOvertimeRate] = useState<string>("");
  const [salaryOvertimeAmount, setSalaryOvertimeAmount] = useState<string>("");
  const [salaryOvertimeNotes, setSalaryOvertimeNotes] = useState<string>("");
  const [salaryCutsAmount, setSalaryCutsAmount] = useState<string>("");
  const [salaryCutReason, setSalaryCutReason] = useState<string>("");
  const [salaryAllowances, setSalaryAllowances] = useState<string>("");
  const [salaryNotes, setSalaryNotes] = useState<string>("");

  // Form States for Payment Settlement
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentNotes, setPaymentNotes] = useState<string>("");

  // Form States for Category
  const [newCatName, setNewCatName] = useState("");
  const [newCatCode, setNewCatCode] = useState("");
  const [newCatType, setNewCatType] = useState<ExpenseType>("OPERATING_EXPENSE");
  const [newCatGlCode, setNewCatGlCode] = useState("6090");
  const [newCatTaxDeductible, setNewCatTaxDeductible] = useState(true);

  // Form States for Recurring Schedule
  const [schedTitle, setSchedTitle] = useState("");
  const [schedCatId, setSchedCatId] = useState("");
  const [schedAmount, setSchedAmount] = useState("");
  const [schedFreq, setSchedFreq] = useState<"monthly" | "weekly" | "daily" | "quarterly" | "yearly">("monthly");
  const [schedPayee, setSchedPayee] = useState("");
  const [schedMethod, setSchedMethod] = useState<ExpensePaymentMethod>("bank_transfer");
  const [schedStartDate, setSchedStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [schedAutoApprove, setSchedAutoApprove] = useState(true);

  // Initialize and subscribe to Firestore
  useEffect(() => {
    if (!currentShopId) return;
    setIsLoading(true);

    ensureDefaultCategories(currentShopId, auditUser);

    const unsubExpenses = subscribeToExpenses(currentShopId, (items) => {
      setExpenses(items);
      setIsLoading(false);
      setSelectedExpense((prev) => (prev ? items.find((x) => x.id === prev.id) || prev : null));
    });

    const unsubCategories = subscribeToCategories(currentShopId, (cats) => {
      setCategories(cats);
      if (cats.length > 0 && !formCategory) {
        setFormCategory(cats[0].id);
      }
    });

    const unsubSchedules = subscribeToRecurringSchedules(currentShopId, (scheds) => {
      setSchedules(scheds);
    });

    const unsubUsers = subscribeToUsersByShop(currentShopId, (users) => {
      setStaffMembers(users);
    });

    return () => {
      unsubExpenses();
      unsubCategories();
      unsubSchedules();
      unsubUsers();
    };
  }, [currentShopId]);

  // Flash message timers
  useEffect(() => {
    if (actionSuccessMsg) {
      const t = setTimeout(() => setActionSuccessMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [actionSuccessMsg]);

  useEffect(() => {
    if (actionErrorMsg) {
      const t = setTimeout(() => setActionErrorMsg(null), 5000);
      return () => clearTimeout(t);
    }
  }, [actionErrorMsg]);

  // Automatic Calculation for Employee Net Salary
  useEffect(() => {
    if (formExpenseType === "EMPLOYEE_SALARY") {
      const base = Number(salaryBaseAmount) || 0;
      const otHours = Number(salaryOvertimeHours) || 0;
      const otRate = Number(salaryOvertimeRate) || 0;
      const otCalculated = otHours > 0 && otRate > 0 ? otHours * otRate : 0;
      const otTotal = Number(salaryOvertimeAmount) || otCalculated;
      const allow = Number(salaryAllowances) || 0;
      const cuts = Number(salaryCutsAmount) || 0;

      const computedNet = Math.max(0, base + otTotal + allow - cuts);
      if (computedNet > 0 || base > 0) {
        setFormAmount(computedNet.toString());
      }
      if (salaryEmployeeName.trim()) {
        setFormPayee(salaryEmployeeName.trim());
      }
    }
  }, [
    formExpenseType,
    salaryBaseAmount,
    salaryOvertimeHours,
    salaryOvertimeRate,
    salaryOvertimeAmount,
    salaryAllowances,
    salaryCutsAmount,
    salaryEmployeeName,
  ]);

  // Date Boundary Calculation
  const activeDateBounds = useMemo(() => {
    const now = new Date();
    const formatYMD = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (datePreset === "month_select") {
      const y = Number(selectedYear) || now.getFullYear();
      const m = Number(selectedMonth) || now.getMonth() + 1;
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { start: formatYMD(first), end: formatYMD(last), label: `${first.toLocaleString("default", { month: "long" })} ${y}` };
    }

    switch (datePreset) {
      case "today": {
        const str = formatYMD(now);
        return { start: str, end: str, label: "Today" };
      }
      case "yesterday": {
        const yest = new Date(now.getTime() - 86400000);
        const str = formatYMD(yest);
        return { start: str, end: str, label: "Yesterday" };
      }
      case "this_week": {
        const day = now.getDay() || 7;
        const mon = new Date(now);
        mon.setDate(now.getDate() - day + 1);
        return { start: formatYMD(mon), end: formatYMD(now), label: "This Week" };
      }
      case "this_month": {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: formatYMD(first), end: formatYMD(now), label: "This Month" };
      }
      case "last_month": {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        return { start: formatYMD(first), end: formatYMD(last), label: "Last Month" };
      }
      case "this_quarter": {
        const q = Math.floor(now.getMonth() / 3);
        const first = new Date(now.getFullYear(), q * 3, 1);
        return { start: formatYMD(first), end: formatYMD(now), label: `Q${q + 1} ${now.getFullYear()}` };
      }
      case "this_year": {
        const first = new Date(now.getFullYear(), 0, 1);
        return { start: formatYMD(first), end: formatYMD(now), label: `Year ${now.getFullYear()}` };
      }
      case "custom": {
        return { start: customStart, end: customEnd, label: `${customStart} to ${customEnd}` };
      }
      case "all":
      default:
        return { start: "2020-01-01", end: "2099-12-31", label: "All Time" };
    }
  }, [datePreset, selectedMonth, selectedYear, customStart, customEnd]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // Date filter
      if (activeDateBounds.start && e.date < activeDateBounds.start) return false;
      if (activeDateBounds.end && e.date > activeDateBounds.end) return false;

      // Category filter
      if (categoryFilter !== "ALL" && e.categoryId !== categoryFilter) return false;

      // Type filter
      if (typeFilter !== "ALL" && e.expenseType !== typeFilter) return false;

      // Payment status
      if (paymentStatusFilter !== "ALL" && e.paymentStatus !== paymentStatusFilter) return false;

      // Accounting status
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;

      // Payment method
      if (paymentMethodFilter !== "ALL" && e.paymentMethod !== paymentMethodFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          e.description.toLowerCase().includes(q) ||
          e.vendor.toLowerCase().includes(q) ||
          e.categoryName.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          (e.referenceNumber && e.referenceNumber.toLowerCase().includes(q)) ||
          (e.salaryDetails?.employeeName && e.salaryDetails.employeeName.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [
    expenses,
    activeDateBounds,
    categoryFilter,
    typeFilter,
    paymentStatusFilter,
    statusFilter,
    paymentMethodFilter,
    searchQuery,
  ]);

  // Analytics Computation
  const analytics = useMemo(() => {
    return computeExpenseAnalytics(filteredExpenses);
  }, [filteredExpenses]);

  // Dedicated Employee Payroll Dataset & Metrics
  const payrollExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const isSalary =
        e.expenseType === "EMPLOYEE_SALARY" ||
        e.categoryCode === "SALARY" ||
        !!e.salaryDetails ||
        e.categoryName.toLowerCase().includes("salaries") ||
        e.categoryName.toLowerCase().includes("wages");

      if (!isSalary) return false;

      if (payrollSearch.trim()) {
        const q = payrollSearch.toLowerCase();
        const empName = (e.salaryDetails?.employeeName || e.vendor || "").toLowerCase();
        const period = (e.salaryDetails?.payPeriod || "").toLowerCase();
        const ref = (e.referenceNumber || e.id || "").toLowerCase();
        if (!empName.includes(q) && !period.includes(q) && !ref.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, payrollSearch]);

  const payrollMetrics = useMemo(() => {
    let totalNet = 0;
    let totalBase = 0;
    let totalOvertime = 0;
    let totalCuts = 0;

    payrollExpenses.forEach((exp) => {
      totalNet += exp.amount;
      if (exp.salaryDetails) {
        totalBase += exp.salaryDetails.baseSalary || 0;
        totalOvertime += exp.salaryDetails.overtimeAmount || 0;
        totalCuts += exp.salaryDetails.salaryCuts || 0;
      } else {
        totalBase += exp.amount;
      }
    });

    return {
      totalNet,
      totalBase,
      totalOvertime,
      totalCuts,
      totalVouchers: payrollExpenses.length,
    };
  }, [payrollExpenses]);

  // Due Recurring count
  const dueRecurringCount = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return schedules.filter((s) => s.isActive && s.nextDueDate <= today).length;
  }, [schedules]);

  // Pending Approvals count
  const pendingApprovalsCount = useMemo(() => {
    return expenses.filter((e) => e.status === "pending_approval").length;
  }, [expenses]);

  // Quick Open Salary Creation
  const handleOpenSalaryVoucher = (presetStaff?: ShopUser) => {
    setFormExpenseType("EMPLOYEE_SALARY");
    const salaryCat = categories.find((c) => c.code === "SALARY") || categories[0];
    if (salaryCat) setFormCategory(salaryCat.id);

    if (presetStaff) {
      setSalaryEmployeeName(presetStaff.displayName || presetStaff.username);
      setSalaryEmployeeId(presetStaff.uid);
      setFormPayee(presetStaff.displayName || presetStaff.username);
    } else {
      setSalaryEmployeeName("");
      setSalaryEmployeeId("");
    }

    setSalaryBaseAmount("");
    setSalaryOvertimeHours("");
    setSalaryOvertimeRate("");
    setSalaryOvertimeAmount("");
    setSalaryOvertimeNotes("");
    setSalaryCutsAmount("");
    setSalaryCutReason("");
    setSalaryAllowances("");
    setSalaryNotes("");
    setFormAmount("");
    setIsRecordModalOpen(true);
  };

  // Handlers
  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShopId) return;

    const isSalary = formExpenseType === "EMPLOYEE_SALARY";
    const payee = isSalary ? salaryEmployeeName.trim() || formPayee.trim() : formPayee.trim();

    if (!payee) {
      setActionErrorMsg(isSalary ? "Please enter or select employee name." : "Please enter payee or vendor name.");
      return;
    }

    const numAmt = Number(formAmount);
    if (!numAmt || numAmt <= 0) {
      setActionErrorMsg("Please enter a valid expense amount in LKR.");
      return;
    }

    setIsActionLoading(true);
    try {
      let initialPaid = 0;
      if (formPaymentOption === "paid") {
        initialPaid = numAmt;
      } else if (formPaymentOption === "partial") {
        initialPaid = Math.min(numAmt, Math.max(0, Number(formPartialAmount) || 0));
      }

      let salaryDetails: EmployeeSalaryDetails | undefined = undefined;
      if (isSalary) {
        const base = Number(salaryBaseAmount) || numAmt;
        const otHours = Number(salaryOvertimeHours) || 0;
        const otRate = Number(salaryOvertimeRate) || 0;
        const otAmt = Number(salaryOvertimeAmount) || (otHours > 0 && otRate > 0 ? otHours * otRate : 0);
        const cuts = Number(salaryCutsAmount) || 0;
        const allow = Number(salaryAllowances) || 0;

        const cleanSalaryDetails: EmployeeSalaryDetails = {
          employeeName: payee,
          baseSalary: base,
          netSalary: numAmt,
        };
        if (salaryEmployeeId) cleanSalaryDetails.employeeId = salaryEmployeeId;
        if (otHours > 0) cleanSalaryDetails.overtimeHours = otHours;
        if (otRate > 0) cleanSalaryDetails.overtimeRate = otRate;
        if (otAmt > 0) cleanSalaryDetails.overtimeAmount = otAmt;
        if (salaryOvertimeNotes.trim()) cleanSalaryDetails.overtimeNotes = salaryOvertimeNotes.trim();
        if (cuts > 0) cleanSalaryDetails.salaryCuts = cuts;
        if (salaryCutReason.trim()) cleanSalaryDetails.salaryCutReason = salaryCutReason.trim();
        if (allow > 0) cleanSalaryDetails.allowances = allow;
        if (salaryPayPeriod.trim()) cleanSalaryDetails.payPeriod = salaryPayPeriod.trim();
        if (salaryNotes.trim()) cleanSalaryDetails.notes = salaryNotes.trim();

        salaryDetails = cleanSalaryDetails;
      }

      const input: CreateExpenseInput = {
        categoryId: formCategory,
        expenseType: formExpenseType,
        amount: numAmt,
        date: formDate,
        paymentMethod: formPaymentMethod,
        vendor: payee,
        description: isSalary
          ? `Staff Salary: ${payee} (${salaryPayPeriod}) ${formDescription ? "— " + formDescription : ""}`.trim()
          : formDescription.trim(),
        referenceNumber: formReference.trim(),
        initialAmountPaid: initialPaid,
        isTaxDeductible: formTaxDeductible,
        autoPost: formAutoPost && canApprove,
        salaryDetails,
      };

      const created = await createExpenseRecord(currentShopId, input, auditUser);
      setActionSuccessMsg(`Voucher ${created.id} recorded successfully!`);
      setIsRecordModalOpen(false);

      // Reset form
      setFormAmount("");
      setFormPayee("");
      setFormDescription("");
      setFormReference("");
      setFormPartialAmount("");
      setSalaryEmployeeName("");
      setSalaryEmployeeId("");
      setSalaryBaseAmount("");
      setSalaryOvertimeHours("");
      setSalaryOvertimeRate("");
      setSalaryOvertimeAmount("");
      setSalaryOvertimeNotes("");
      setSalaryCutsAmount("");
      setSalaryCutReason("");
      setSalaryAllowances("");
      setSalaryNotes("");
    } catch (err: any) {
      console.error(err);
      setActionErrorMsg(err.message || "Failed to record expense");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleApprove = async (exp: ExpenseRecord) => {
    if (!currentShopId || !canApprove) return;
    setIsActionLoading(true);
    try {
      await approveExpense(currentShopId, exp.id, auditUser);
      setActionSuccessMsg(`Expense ${exp.id} approved!`);
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to approve expense");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePostToAccounting = async (exp: ExpenseRecord) => {
    if (!currentShopId || !canApprove) return;
    setIsActionLoading(true);
    try {
      const je = await postExpenseToAccounting(currentShopId, exp.id, auditUser);
      setActionSuccessMsg(`Expense posted to General Ledger via ${je.id}!`);
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to post expense to ledger");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async (exp: ExpenseRecord) => {
    if (!currentShopId || !canApprove) return;
    const reason = prompt("Enter reason for rejection (optional):") || "Rejected by management";
    setIsActionLoading(true);
    try {
      await rejectExpense(currentShopId, exp.id, auditUser, reason);
      setActionSuccessMsg(`Expense ${exp.id} marked as rejected.`);
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to reject expense");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async (exp: ExpenseRecord) => {
    if (!currentShopId || !canDelete) return;
    if (!confirm(`Are you sure you want to delete expense ${exp.id}?`)) return;
    setIsActionLoading(true);
    try {
      await deleteExpenseRecord(currentShopId, exp.id, auditUser);
      setActionSuccessMsg(`Expense ${exp.id} deleted.`);
      if (selectedExpense?.id === exp.id) setSelectedExpense(null);
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to delete expense");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShopId || !paymentTargetExpense) return;
    const pAmt = Number(paymentAmount);
    if (!pAmt || pAmt <= 0) {
      setActionErrorMsg("Please enter a valid payment amount.");
      return;
    }

    setIsActionLoading(true);
    try {
      const input: RecordExpensePaymentInput = {
        amount: pAmt,
        date: paymentDate,
        paymentMethod,
        reference: paymentReference.trim(),
        notes: paymentNotes.trim(),
      };

      await recordExpensePayment(currentShopId, paymentTargetExpense.id, input, auditUser);
      setActionSuccessMsg(`Payment of LKR ${pAmt.toLocaleString()} applied to ${paymentTargetExpense.id}!`);
      setIsPaymentModalOpen(false);
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentNotes("");
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to record payment");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleProcessDueRecurring = async () => {
    if (!currentShopId) return;
    setIsActionLoading(true);
    try {
      const res = await generateDueRecurringExpenses(currentShopId, auditUser);
      setActionSuccessMsg(
        `Generated ${res.generated.length} recurring expense vouchers! (${res.skipped} skipped as already generated).`
      );
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to generate recurring expenses");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShopId) return;
    if (!newCatName.trim()) {
      setActionErrorMsg("Category name is required.");
      return;
    }

    setIsActionLoading(true);
    try {
      await createExpenseCategory(
        currentShopId,
        {
          name: newCatName.trim(),
          code: (newCatCode.trim() || newCatName.trim()).toUpperCase().slice(0, 8),
          type: newCatType,
          defaultGlAccount: newCatGlCode.trim() || "6090",
          isTaxDeductible: newCatTaxDeductible,
          isActive: true,
        },
        auditUser
      );
      setActionSuccessMsg(`Category "${newCatName}" created successfully!`);
      setIsCategoryModalOpen(false);
      setNewCatName("");
      setNewCatCode("");
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to create category");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShopId) return;
    const amt = Number(schedAmount);
    if (!amt || amt <= 0 || !schedTitle.trim() || !schedPayee.trim()) {
      setActionErrorMsg("Please enter valid title, payee, and amount.");
      return;
    }

    const cat = categories.find((c) => c.id === schedCatId) || categories[0];

    setIsActionLoading(true);
    try {
      await createRecurringSchedule(
        currentShopId,
        {
          title: schedTitle.trim(),
          categoryId: cat?.id || "default",
          categoryName: cat?.name || "General",
          amount: amt,
          frequency: schedFreq,
          paymentMethod: schedMethod,
          payee: schedPayee.trim(),
          startDate: schedStartDate,
          nextDueDate: schedStartDate,
          autoApprove: schedAutoApprove,
          isActive: true,
        },
        auditUser
      );
      setActionSuccessMsg(`Recurring schedule "${schedTitle}" activated!`);
      setIsRecurringModalOpen(false);
      setSchedTitle("");
      setSchedAmount("");
      setSchedPayee("");
    } catch (err: any) {
      setActionErrorMsg(err.message || "Failed to create recurring schedule");
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col font-sans selection:bg-zinc-700/50">
      {/* ── Top Header (Clean: No Subtitle Description Clutter) ───── */}
      <header className="sticky top-0 z-40 bg-[#090a0f]/95 backdrop-blur-xl border-b border-zinc-800/80 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/shop/dashboard")}
              className="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm"
              title="Back to POS"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shadow-sm">
                <Receipt className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-bold text-white tracking-tight">
                  Expenditures & Expenses
                </h1>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-300 border border-zinc-700/80">
                  {currentShopId}
                </span>
              </div>
            </div>
          </div>

          {/* Top Quick Actions (Gray & Mix Palette) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/shop/reports?report=expense_statement")}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 text-xs font-medium text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm"
              title="View Financial Reports"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              <span>Accounting Reports</span>
            </button>

            {canCreate && (
              <button
                onClick={() => {
                  setFormExpenseType("OPERATING_EXPENSE");
                  setIsRecordModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Expense</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Banner Alerts ────────────────────────────────────────── */}
      <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-3 space-y-2">
        {actionSuccessMsg && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/90 border border-emerald-500/30 text-emerald-300 text-xs shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{actionSuccessMsg}</span>
            </div>
            <button onClick={() => setActionSuccessMsg(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {actionErrorMsg && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/90 border border-rose-500/30 text-rose-300 text-xs shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{actionErrorMsg}</span>
            </div>
            <button onClick={() => setActionErrorMsg(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pending Approval Alert Strip */}
        {pendingApprovalsCount > 0 && canApprove && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-zinc-700/80 text-xs shadow-sm">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold text-zinc-200">
                  {pendingApprovalsCount} Expense Voucher{pendingApprovalsCount !== 1 ? "s" : ""}
                </span>{" "}
                <span className="text-zinc-400">awaiting management review & posting to General Ledger.</span>
              </div>
            </div>
            <button
              onClick={() => {
                setStatusFilter("pending_approval");
                setActiveTab("list");
              }}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-[11px] border border-zinc-700 transition-colors cursor-pointer"
            >
              Review Queue
            </button>
          </div>
        )}

        {/* Due Recurring Expenses Banner */}
        {dueRecurringCount > 0 && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-blue-500/30 text-xs shadow-sm">
            <div className="flex items-center gap-2.5">
              <Repeat className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="font-semibold text-blue-300">
                  {dueRecurringCount} Recurring Expense{dueRecurringCount !== 1 ? "s" : ""}
                </span>{" "}
                <span className="text-zinc-400">scheduled for payment are due today.</span>
              </div>
            </div>
            <button
              onClick={handleProcessDueRecurring}
              disabled={isActionLoading}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-blue-300 border border-zinc-700 font-medium text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${isActionLoading ? "animate-spin" : ""}`} />
              <span>Generate Vouchers</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Main Workspace ────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-4 space-y-4">
        {/* Metric Cards Row (Gray & Mix Palette) */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Total Period Expenses */}
          <div className="p-3.5 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 relative overflow-hidden group shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span>Total Expenses</span>
              <DollarSign className="w-3.5 h-3.5 text-zinc-300" />
            </div>
            <div className="text-lg md:text-xl font-bold font-mono text-white tracking-tight">
              {formatLKR(analytics.totalExpenses)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1 font-mono">
              <span>{filteredExpenses.length} vouchers</span>
              <span>•</span>
              <span className="text-zinc-300">{activeDateBounds.label}</span>
            </div>
          </div>

          {/* Card 2: Operating Expenses (OpEx & Salary) */}
          <div className="p-3.5 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 relative overflow-hidden group shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span>Operating (OpEx)</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg md:text-xl font-bold font-mono text-emerald-300 tracking-tight">
              {formatLKR(analytics.totalOperatingExpenses)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Hits P&L Income Statement
            </div>
          </div>

          {/* Card 3: Paid vs Balance Due */}
          <div className="p-3.5 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 relative overflow-hidden group shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span>Settled / Paid</span>
              <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-lg md:text-xl font-bold font-mono text-cyan-300 tracking-tight">
              {formatLKR(analytics.totalPaid)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              {analytics.totalBalanceDue > 0 ? (
                <span className="text-amber-400 font-medium">
                  Due: {formatLKR(analytics.totalBalanceDue)}
                </span>
              ) : (
                <span className="text-emerald-400">100% Settled</span>
              )}
            </div>
          </div>

          {/* Card 4: Capital Assets & Non-OpEx */}
          <div className="p-3.5 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 relative overflow-hidden group shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span>Assets & BS Items</span>
              <Layers className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="text-lg md:text-xl font-bold font-mono text-violet-300 tracking-tight">
              {formatLKR(analytics.totalCapitalAssets + analytics.totalLiabilitiesPaid + analytics.totalOwnerWithdrawals)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Fixed Assets & Balance Sheet
            </div>
          </div>
        </section>

        {/* ── Navigation Tabs (Gray & Mix Styling) ──────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-800/80 pb-1">
          <div className="flex items-center gap-1.5">
            {/* Tab 1: Expense Vouchers */}
            <button
              onClick={() => setActiveTab("list")}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                activeTab === "list"
                  ? "bg-zinc-800 border-zinc-600 text-white shadow-sm"
                  : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Expense Vouchers</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-700/60">
                {filteredExpenses.length}
              </span>
            </button>

            {/* Tab 2: Employee Payroll & Salaries */}
            <button
              onClick={() => setActiveTab("payroll")}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                activeTab === "payroll"
                  ? "bg-zinc-800 border-zinc-600 text-white shadow-sm"
                  : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Employee Salaries</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-700/60">
                {payrollExpenses.length}
              </span>
            </button>

            {/* Tab 3: Breakdown & Trends */}
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                activeTab === "analytics"
                  ? "bg-zinc-800 border-zinc-600 text-white shadow-sm"
                  : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <PieChart className="w-3.5 h-3.5 text-amber-400" />
              <span>Breakdown & Trends</span>
            </button>

            {/* Tab 4: Recurring Schedules */}
            <button
              onClick={() => setActiveTab("recurring")}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                activeTab === "recurring"
                  ? "bg-zinc-800 border-zinc-600 text-white shadow-sm"
                  : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <Repeat className="w-3.5 h-3.5 text-cyan-400" />
              <span>Recurring Schedules</span>
              {dueRecurringCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              )}
            </button>

            {/* Tab 5: Categories */}
            {canManageCategories && (
              <button
                onClick={() => setActiveTab("categories")}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                  activeTab === "categories"
                    ? "bg-zinc-800 border-zinc-600 text-white shadow-sm"
                    : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`}
              >
                <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
                <span>Categories ({categories.length})</span>
              </button>
            )}
          </div>

          {/* Quick Right Action */}
          <div className="flex items-center gap-2 text-xs">
            {activeTab === "payroll" && canCreate && (
              <button
                onClick={() => handleOpenSalaryVoucher()}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-blue-400" />
                <span>Add Employee Salary</span>
              </button>
            )}
            {activeTab === "recurring" && (
              <button
                onClick={() => setIsRecurringModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-zinc-400" />
                <span>Add Schedule</span>
              </button>
            )}
            {activeTab === "categories" && (
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-zinc-400" />
                <span>Add Category</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Filter Bar (Active in "list" and "analytics") ──────────── */}
        {(activeTab === "list" || activeTab === "analytics") && (
          <section className="p-3.5 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 space-y-3 shadow-sm">
            {/* Top row: Search and Date Presets */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by payee, description, category, voucher ID, reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Date Presets Dropdown */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-1 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400 ml-1.5" />
                  <select
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value)}
                    className="bg-transparent text-xs text-zinc-200 focus:outline-none pr-2 cursor-pointer font-medium"
                  >
                    <option value="today" className="bg-zinc-900">Today</option>
                    <option value="yesterday" className="bg-zinc-900">Yesterday</option>
                    <option value="this_week" className="bg-zinc-900">This Week</option>
                    <option value="this_month" className="bg-zinc-900">This Month</option>
                    <option value="last_month" className="bg-zinc-900">Last Month</option>
                    <option value="this_quarter" className="bg-zinc-900">This Quarter</option>
                    <option value="this_year" className="bg-zinc-900">This Year</option>
                    <option value="month_select" className="bg-zinc-900">Select Month/Year</option>
                    <option value="custom" className="bg-zinc-900">Custom Date Range</option>
                    <option value="all" className="bg-zinc-900">All Time</option>
                  </select>
                </div>

                {/* If month_select */}
                {datePreset === "month_select" && (
                  <div className="flex items-center gap-1 bg-zinc-950/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                        <option key={m} value={m} className="bg-zinc-900">
                          {new Date(2026, m - 1, 1).toLocaleString("default", { month: "short" })}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y} className="bg-zinc-900">
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* If custom range */}
                {datePreset === "custom" && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 focus:outline-none text-xs"
                    />
                    <span className="text-zinc-500">to</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 focus:outline-none text-xs"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Attribute Filters */}
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-zinc-800/60 text-[11px]">
              {/* Category Filter */}
              <div className="flex items-center gap-1 text-zinc-400">
                <span>Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-zinc-900">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-zinc-900">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div className="flex items-center gap-1 text-zinc-400">
                <span>Type:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-zinc-900">All Types</option>
                  <option value="OPERATING_EXPENSE" className="bg-zinc-900">Operating (OpEx)</option>
                  <option value="EMPLOYEE_SALARY" className="bg-zinc-900">Employee Salary & Payroll</option>
                  <option value="CAPITAL_ASSET" className="bg-zinc-900">Capital Asset</option>
                  <option value="LIABILITY_PAYMENT" className="bg-zinc-900">Liability Repayment</option>
                  <option value="OWNER_WITHDRAWAL" className="bg-zinc-900">Owner Drawings</option>
                </select>
              </div>

              {/* Payment Status Filter */}
              <div className="flex items-center gap-1 text-zinc-400">
                <span>Payment:</span>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-zinc-900">All Payment Statuses</option>
                  <option value="paid" className="bg-zinc-900">Paid in Full</option>
                  <option value="partial" className="bg-zinc-900">Partially Paid</option>
                  <option value="unpaid" className="bg-zinc-900">Unpaid (Accrued)</option>
                </select>
              </div>

              {/* Accounting Status Filter */}
              <div className="flex items-center gap-1 text-zinc-400">
                <span>Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-zinc-900">All Statuses</option>
                  <option value="pending_approval" className="bg-zinc-900">Pending Approval</option>
                  <option value="approved" className="bg-zinc-900">Approved (Unposted)</option>
                  <option value="posted" className="bg-zinc-900">Posted to GL</option>
                  <option value="draft" className="bg-zinc-900">Draft</option>
                  <option value="rejected" className="bg-zinc-900">Rejected</option>
                </select>
              </div>

              {/* Payment Method Filter */}
              <div className="flex items-center gap-1 text-zinc-400">
                <span>Method:</span>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-zinc-900">All Methods</option>
                  <option value="cash" className="bg-zinc-900">Cash Drawer</option>
                  <option value="bank_transfer" className="bg-zinc-900">Bank Transfer</option>
                  <option value="card" className="bg-zinc-900">Card</option>
                  <option value="cheque" className="bg-zinc-900">Cheque</option>
                  <option value="mobile_money" className="bg-zinc-900">Mobile Money</option>
                </select>
              </div>

              {/* Reset Filters */}
              {(categoryFilter !== "ALL" ||
                typeFilter !== "ALL" ||
                paymentStatusFilter !== "ALL" ||
                statusFilter !== "ALL" ||
                paymentMethodFilter !== "ALL" ||
                searchQuery !== "") && (
                <button
                  onClick={() => {
                    setCategoryFilter("ALL");
                    setTypeFilter("ALL");
                    setPaymentStatusFilter("ALL");
                    setStatusFilter("ALL");
                    setPaymentMethodFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="text-zinc-400 hover:text-white underline ml-auto cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── TAB 1: LIST VIEW (WITH CLICKABLE REFERENCE BUTTON) ───── */}
        {activeTab === "list" && (
          <section className="rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-zinc-500 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
                <span className="text-xs">Loading expenditures for {currentShopId}...</span>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="py-16 text-center text-zinc-500 space-y-2">
                <Receipt className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs font-medium text-zinc-400">No expense vouchers match the selected criteria.</p>
                {canCreate && (
                  <button
                    onClick={() => {
                      setFormExpenseType("OPERATING_EXPENSE");
                      setIsRecordModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record New Expense</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 text-[11px] font-mono">
                      <th className="py-3 px-4">Reference / Voucher</th>
                      <th className="py-3 px-4">Category & Payee</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Amount (LKR)</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredExpenses.map((exp) => {
                      const isPosted = exp.status === "posted";
                      const isPending = exp.status === "pending_approval";
                      const isApproved = exp.status === "approved";
                      const isPaid = exp.paymentStatus === "paid";
                      const isPartial = exp.paymentStatus === "partial";
                      const isSalary = exp.expenseType === "EMPLOYEE_SALARY" || !!exp.salaryDetails;

                      return (
                        <tr
                          key={exp.id}
                          className="hover:bg-zinc-800/30 transition-colors group"
                        >
                          {/* Col 1: Clickable Reference Button */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setSelectedExpense(exp)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/80 hover:border-zinc-500 font-mono text-xs font-semibold shadow-sm transition-all cursor-pointer"
                              title="Click reference to view related details & cards"
                            >
                              <FileText className="w-3 h-3 text-zinc-400" />
                              <span>{exp.referenceNumber || exp.id}</span>
                            </button>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              {exp.id} • {exp.date}
                            </div>
                          </td>

                          {/* Col 2: Category & Payee */}
                          <td className="py-3 px-4 max-w-[220px]">
                            <div className="font-medium text-white truncate flex items-center gap-1.5">
                              <span>{exp.categoryName}</span>
                              {isSalary && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                                  Salary
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              To: <span className="text-zinc-200 font-medium">{exp.vendor}</span>
                            </div>
                            {exp.description && (
                              <div className="text-[10px] text-zinc-500 truncate">{exp.description}</div>
                            )}
                          </td>

                          {/* Col 3: Type */}
                          <td className="py-3 px-4">
                            {exp.expenseType === "EMPLOYEE_SALARY" ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
                                Employee Salary
                              </span>
                            ) : exp.expenseType === "CAPITAL_ASSET" ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/20 font-medium">
                                Fixed Asset
                              </span>
                            ) : exp.expenseType === "LIABILITY_PAYMENT" ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                                Liability
                              </span>
                            ) : exp.expenseType === "OWNER_WITHDRAWAL" ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-pink-500/10 text-pink-300 border border-pink-500/20 font-medium">
                                Drawings
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                                OpEx
                              </span>
                            )}
                          </td>

                          {/* Col 4: Amount */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-white">
                            {formatLKR(exp.amount)}
                          </td>

                          {/* Col 5: Payment Progress */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              {isPaid ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/20">
                                  Paid
                                </span>
                              ) : isPartial ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium border border-amber-500/20">
                                  Partial (Due {formatLKR(exp.balanceDue)})
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-medium border border-rose-500/20">
                                  Unpaid
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-500 uppercase mt-0.5 font-mono">
                              {exp.paymentMethod.replace("_", " ")}
                            </div>
                          </td>

                          {/* Col 6: Accounting Status */}
                          <td className="py-3 px-4">
                            {isPosted ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-medium border border-cyan-500/20">
                                <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                                <span>GL Posted</span>
                              </span>
                            ) : isApproved ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/20">
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Approved</span>
                              </span>
                            ) : isPending ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium border border-amber-500/20">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>Pending</span>
                              </span>
                            ) : exp.status === "rejected" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-medium border border-rose-500/20">
                                <Ban className="w-3 h-3 text-rose-400" />
                                <span>Rejected</span>
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                                Draft
                              </span>
                            )}
                          </td>

                          {/* Col 7: Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Pay */}
                              {exp.balanceDue > 0 && (
                                <button
                                  onClick={() => {
                                    setPaymentTargetExpense(exp);
                                    setPaymentAmount(String(exp.balanceDue));
                                    setIsPaymentModalOpen(true);
                                  }}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] font-medium transition-colors cursor-pointer"
                                  title="Record Payment"
                                >
                                  Pay
                                </button>
                              )}

                              {/* Quick Approve */}
                              {isPending && canApprove && (
                                <button
                                  onClick={() => handleApprove(exp)}
                                  className="p-1 rounded bg-zinc-800 hover:bg-emerald-500/20 text-emerald-400 border border-zinc-700 transition-colors"
                                  title="Approve Voucher"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Quick Post */}
                              {isApproved && canApprove && (
                                <button
                                  onClick={() => handlePostToAccounting(exp)}
                                  className="p-1 rounded bg-zinc-800 hover:bg-cyan-500/20 text-cyan-400 border border-zinc-700 transition-colors"
                                  title="Post to General Ledger"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Reference / Details button */}
                              <button
                                onClick={() => setSelectedExpense(exp)}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                                title="View details & cards modal"
                              >
                                <Eye className="w-3 h-3 text-zinc-400" />
                                <span>Details</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── TAB 2: EMPLOYEE PAYROLL & SALARIES (ALL IN ONE PLACE) ── */}
        {activeTab === "payroll" && (
          <section className="space-y-4">
            {/* Payroll Summary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Total Salaries Paid</span>
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-lg md:text-xl font-bold font-mono text-white">
                  {formatLKR(payrollMetrics.totalNet)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1 font-mono">
                  {payrollMetrics.totalVouchers} salary disbursements
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Base Salaries</span>
                  <DollarSign className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                <div className="text-lg md:text-xl font-bold font-mono text-zinc-200">
                  {formatLKR(payrollMetrics.totalBase)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  Fixed base payroll commitments
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Overtime Management</span>
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg md:text-xl font-bold font-mono text-amber-300">
                  {formatLKR(payrollMetrics.totalOvertime)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  Extra hours compensation
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 shadow-sm">
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Salary Cuts & Deductions</span>
                  <Scissors className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-lg md:text-xl font-bold font-mono text-rose-300">
                  {formatLKR(payrollMetrics.totalCuts)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  Penalties, unpaid leaves & advances
                </div>
              </div>
            </div>

            {/* Payroll Control Bar */}
            <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by employee name, pay period, or reference..."
                  value={payrollSearch}
                  onChange={(e) => setPayrollSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                {payrollSearch && (
                  <button
                    onClick={() => setPayrollSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {canCreate && (
                  <button
                    onClick={() => handleOpenSalaryVoucher()}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record Salary Voucher</span>
                  </button>
                )}
              </div>
            </div>

            {/* Payroll Table */}
            <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 overflow-hidden shadow-sm">
              {payrollExpenses.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 space-y-2">
                  <Users className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs font-medium text-zinc-400">No employee salary vouchers recorded yet.</p>
                  {canCreate && (
                    <button
                      onClick={() => handleOpenSalaryVoucher()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold cursor-pointer shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Record Employee Salary</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 text-[11px] font-mono">
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Pay Period & Date</th>
                        <th className="py-3 px-4 text-right">Base Salary</th>
                        <th className="py-3 px-4 text-right">Overtime</th>
                        <th className="py-3 px-4 text-right">Salary Cuts</th>
                        <th className="py-3 px-4 text-right">Net Payout</th>
                        <th className="py-3 px-4">Payment</th>
                        <th className="py-3 px-4 text-right">Reference & Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {payrollExpenses.map((exp) => {
                        const s = exp.salaryDetails;
                        const empName = s?.employeeName || exp.vendor;
                        const baseAmt = s?.baseSalary || exp.amount;
                        const otAmt = s?.overtimeAmount || 0;
                        const cutsAmt = s?.salaryCuts || 0;
                        const isPaid = exp.paymentStatus === "paid";

                        return (
                          <tr key={exp.id} className="hover:bg-zinc-800/30 transition-colors">
                            {/* Employee Name */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-[11px]">
                                  {empName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-white">{empName}</div>
                                  <div className="text-[10px] text-zinc-500 font-mono">
                                    {s?.employeeId ? `ID: ${s.employeeId}` : "Store Staff"}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Pay Period & Date */}
                            <td className="py-3 px-4">
                              <div className="font-medium text-zinc-200">
                                {s?.payPeriod || "Monthly Salary"}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono">{exp.date}</div>
                            </td>

                            {/* Base Salary */}
                            <td className="py-3 px-4 text-right font-mono text-zinc-300">
                              {formatLKR(baseAmt)}
                            </td>

                            {/* Overtime */}
                            <td className="py-3 px-4 text-right font-mono">
                              {otAmt > 0 ? (
                                <div>
                                  <span className="text-amber-300 font-medium">+{formatLKR(otAmt)}</span>
                                  {s?.overtimeHours && (
                                    <div className="text-[10px] text-zinc-500">
                                      ({s.overtimeHours} hrs)
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>

                            {/* Salary Cuts */}
                            <td className="py-3 px-4 text-right font-mono">
                              {cutsAmt > 0 ? (
                                <div>
                                  <span className="text-rose-400 font-medium">-{formatLKR(cutsAmt)}</span>
                                  {s?.salaryCutReason && (
                                    <div className="text-[10px] text-zinc-500 truncate max-w-[120px] ml-auto">
                                      {s.salaryCutReason}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>

                            {/* Net Payout */}
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">
                              {formatLKR(exp.amount)}
                            </td>

                            {/* Payment Status */}
                            <td className="py-3 px-4">
                              {isPaid ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/20">
                                  Paid
                                </span>
                              ) : exp.paymentStatus === "partial" ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium border border-amber-500/20">
                                  Partial (Due {formatLKR(exp.balanceDue)})
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-medium border border-rose-500/20">
                                  Unpaid
                                </span>
                              )}
                            </td>

                            {/* Reference Button & Modal Launcher */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setSelectedExpense(exp)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 text-xs font-mono font-semibold shadow-sm transition-all cursor-pointer"
                                  title="View employee salary modal card"
                                >
                                  <FileText className="w-3 h-3 text-zinc-400" />
                                  <span>{exp.referenceNumber || exp.id}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── TAB 3: ANALYTICS & BREAKDOWN ─────────────────────────── */}
        {activeTab === "analytics" && (
          <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category Breakdown Table / Chart */}
              <div className="p-4 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-zinc-300" />
                    <span>Expenditure by Category</span>
                  </h3>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {analytics.byCategory.length} categories
                  </span>
                </div>

                <div className="space-y-2.5">
                  {analytics.byCategory.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500">No expenses recorded for this period.</div>
                  ) : (
                    analytics.byCategory.map((cat) => (
                      <div key={cat.categoryId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-200 font-medium">{cat.categoryName}</span>
                          <span className="font-mono text-zinc-100 font-semibold">{formatLKR(cat.totalAmount)}</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-zinc-300 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, cat.percentage)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500">
                          <span>{cat.count} voucher{cat.count !== 1 ? "s" : ""}</span>
                          <span>{cat.percentage}% of total</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Payment Method Breakdown & Accounting Summary */}
              <div className="space-y-4">
                {/* Method Breakdown */}
                <div className="p-4 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800 space-y-3 shadow-sm">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-zinc-300" />
                    <span>Disbursement by Payment Tender</span>
                  </h3>
                  <div className="space-y-2">
                    {analytics.byPaymentMethod.map((pm) => (
                      <div
                        key={pm.method}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="uppercase text-[11px] font-mono text-zinc-300">
                            {pm.method.replace("_", " ")}
                          </span>
                          <span className="text-[10px] text-zinc-500">({pm.count} bills)</span>
                        </div>
                        <div className="font-mono font-bold text-white">{formatLKR(pm.totalAmount)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Accounting Integrity Rules Card */}
                <div className="p-4 rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800 space-y-2 text-xs shadow-sm">
                  <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                    <ShieldCheck className="w-4 h-4 text-zinc-400" />
                    <span>Strict Double-Entry Accounting Safeguards</span>
                  </div>
                  <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc list-inside">
                    <li>Expenses never hit P&L or reduce cash till until officially approved & posted.</li>
                    <li>Employee salaries, wages and overtime are registered under GL Account 6020.</li>
                    <li>Capital assets debit fixed asset accounts (1510) and do NOT falsely dilute operating profit.</li>
                    <li>Shop data is partitioned strictly by shop ID preventing cross-tenant leakage.</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── TAB 4: RECURRING EXPENSES ────────────────────────────── */}
        {activeTab === "recurring" && (
          <section className="rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-cyan-400" />
                <span>Automated Recurring Expense Schedules</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleProcessDueRecurring}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading ? "animate-spin" : ""}`} />
                  <span>Check & Process Due</span>
                </button>
                <button
                  onClick={() => setIsRecurringModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Schedule</span>
                </button>
              </div>
            </div>

            {schedules.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 space-y-2">
                <Repeat className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs">No recurring expense templates configured yet.</p>
                <button
                  onClick={() => setIsRecurringModalOpen(true)}
                  className="text-xs text-zinc-300 hover:underline cursor-pointer"
                >
                  Configure monthly rent or staff salaries
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {schedules.map((sch) => {
                  const today = new Date().toISOString().split("T")[0];
                  const isDue = sch.isActive && sch.nextDueDate <= today;

                  return (
                    <div
                      key={sch.id}
                      className={`p-3.5 rounded-xl bg-zinc-950/60 border transition-all ${
                        isDue ? "border-blue-500/50 shadow-md" : "border-zinc-800"
                      } space-y-2.5`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-white">{sch.title}</div>
                          <div className="text-[10px] text-zinc-400">{sch.categoryName} • Payee: {sch.payee}</div>
                        </div>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {sch.frequency}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between font-mono">
                        <span className="text-xs text-zinc-400">Scheduled:</span>
                        <span className="text-sm font-bold text-white">{formatLKR(sch.amount)}</span>
                      </div>

                      <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="text-zinc-500">Next Due: </span>
                          <span className={isDue ? "text-blue-400 font-semibold" : "text-zinc-300"}>
                            {sch.nextDueDate}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              updateRecurringSchedule(currentShopId, sch.id, { isActive: !sch.isActive })
                            }
                            className={`text-[10px] px-2 py-0.5 rounded font-medium border ${
                              sch.isActive
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
                            }`}
                          >
                            {sch.isActive ? "Active" : "Paused"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── TAB 5: CATEGORY MANAGER ──────────────────────────────── */}
        {activeTab === "categories" && (
          <section className="rounded-xl bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <span>Configurable Expense Categories</span>
              </h3>

              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Category</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2 flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{cat.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {cat.code}
                      </span>
                    </div>
                    {cat.description && (
                      <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2">{cat.description}</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                    <span>GL: {cat.defaultGlAccount}</span>
                    <span className="uppercase text-zinc-300 font-medium">{cat.type.replace("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── EXPENSE DETAIL MODAL (CENTERED DIALOG WITH RELATED CARDS) ── */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-3xl bg-[#0e1017] border border-zinc-700/80 rounded-2xl shadow-2xl h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-white">
                      {selectedExpense.referenceNumber || selectedExpense.id}
                    </h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {selectedExpense.id}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    Recorded Date: {selectedExpense.date}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedExpense(null)}
                className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Organized Cards Grid */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Card 1: Top Financial Overview Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-950 border border-zinc-800 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 font-medium">Total Voucher Value</span>
                  <div className="flex items-center gap-2">
                    {selectedExpense.status === "posted" ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-cyan-400" /> GL Posted
                      </span>
                    ) : selectedExpense.status === "approved" ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" /> Approved
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" /> Pending Review
                      </span>
                    )}

                    {selectedExpense.isTaxDeductible && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                        Tax Deductible
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-2xl md:text-3xl font-bold font-mono text-white">
                  {formatLKR(selectedExpense.amount)}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-[11px]">
                  <div>
                    <span className="text-zinc-500">Amount Settled:</span>
                    <div className="font-mono font-semibold text-emerald-400">
                      {formatLKR(selectedExpense.amountPaid)}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Remaining Balance Due:</span>
                    <div className={`font-mono font-semibold ${selectedExpense.balanceDue > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                      {formatLKR(selectedExpense.balanceDue)}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Payment Status:</span>
                    <div className="uppercase font-semibold text-zinc-200">
                      {selectedExpense.paymentStatus}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Specialized Employee Salary & Overtime Card (if applicable) */}
              {(selectedExpense.salaryDetails || selectedExpense.expenseType === "EMPLOYEE_SALARY") && (
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-blue-500/30 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <div className="flex items-center gap-2 text-blue-300 font-semibold">
                      <Users className="w-4 h-4 text-blue-400" />
                      <span>Employee Salary & Compensation Breakdown</span>
                    </div>
                    {selectedExpense.salaryDetails?.payPeriod && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                        {selectedExpense.salaryDetails.payPeriod}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase">Employee</span>
                      <div className="font-bold text-white text-xs mt-0.5">
                        {selectedExpense.salaryDetails?.employeeName || selectedExpense.vendor}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase">Base Salary</span>
                      <div className="font-mono font-bold text-zinc-200 text-xs mt-0.5">
                        {formatLKR(selectedExpense.salaryDetails?.baseSalary || selectedExpense.amount)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-amber-400 uppercase flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Overtime Pay
                      </span>
                      <div className="font-mono font-bold text-amber-300 text-xs mt-0.5">
                        {selectedExpense.salaryDetails?.overtimeAmount ? `+${formatLKR(selectedExpense.salaryDetails.overtimeAmount)}` : "LKR 0.00"}
                      </div>
                      {selectedExpense.salaryDetails?.overtimeHours && (
                        <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                          {selectedExpense.salaryDetails.overtimeHours} hrs @ LKR {selectedExpense.salaryDetails.overtimeRate || 0}/hr
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-rose-400 uppercase flex items-center gap-1">
                        <Scissors className="w-3 h-3" /> Salary Cuts
                      </span>
                      <div className="font-mono font-bold text-rose-300 text-xs mt-0.5">
                        {selectedExpense.salaryDetails?.salaryCuts ? `-${formatLKR(selectedExpense.salaryDetails.salaryCuts)}` : "LKR 0.00"}
                      </div>
                      {selectedExpense.salaryDetails?.salaryCutReason && (
                        <div className="text-[9px] text-zinc-500 truncate mt-0.5">
                          {selectedExpense.salaryDetails.salaryCutReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedExpense.salaryDetails?.overtimeNotes && (
                    <div className="text-[11px] text-zinc-400 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800">
                      <strong className="text-zinc-300">Overtime Details:</strong> {selectedExpense.salaryDetails.overtimeNotes}
                    </div>
                  )}

                  {selectedExpense.salaryDetails?.notes && (
                    <div className="text-[11px] text-zinc-400 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800">
                      <strong className="text-zinc-300">Salary Notes:</strong> {selectedExpense.salaryDetails.notes}
                    </div>
                  )}
                </div>
              )}

              {/* Card 3: Payee & Categorization Card */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3 shadow-sm">
                <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Payee & Classification</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase">Vendor / Payee</span>
                    <div className="font-semibold text-white mt-0.5">{selectedExpense.vendor}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase">Expense Category</span>
                    <div className="font-semibold text-white mt-0.5">{selectedExpense.categoryName}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase">Expense Type</span>
                    <div className="font-mono font-medium text-zinc-300 mt-0.5">{selectedExpense.expenseType}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase">Payment Method</span>
                    <div className="font-semibold uppercase text-zinc-300 mt-0.5">{selectedExpense.paymentMethod.replace("_", " ")}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase">GL Debit Account</span>
                    <div className="font-mono text-zinc-300 mt-0.5">{selectedExpense.glAccountCode}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase">Credit Account</span>
                    <div className="font-mono text-zinc-300 mt-0.5">{selectedExpense.creditAccountCode}</div>
                  </div>
                </div>

                {selectedExpense.description && (
                  <div className="pt-2 border-t border-zinc-800/80">
                    <span className="text-[10px] text-zinc-500 uppercase">Memo / Description:</span>
                    <p className="text-zinc-300 mt-0.5">{selectedExpense.description}</p>
                  </div>
                )}
              </div>

              {/* Card 4: General Ledger Double-Entry Card (if posted) */}
              {selectedExpense.journalEntryId && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-cyan-500/30 space-y-1.5 text-xs shadow-sm">
                  <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Posted Double-Entry General Ledger Reference</span>
                  </div>
                  <div className="font-mono text-[11px] text-zinc-300">
                    JE Reference: {selectedExpense.journalEntryId}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    Debit: GL {selectedExpense.glAccountCode} • Credit: GL {selectedExpense.creditAccountCode}
                  </div>
                </div>
              )}

              {/* Card 5: Payment Records Card */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Payment Disbursements ({selectedExpense.payments?.length || 0})</span>
                  </span>
                  {selectedExpense.balanceDue > 0 && (
                    <button
                      onClick={() => {
                        setPaymentTargetExpense(selectedExpense);
                        setPaymentAmount(String(selectedExpense.balanceDue));
                        setIsPaymentModalOpen(true);
                      }}
                      className="text-xs font-medium text-zinc-200 hover:text-white px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors cursor-pointer"
                    >
                      + Record Payment
                    </button>
                  )}
                </div>

                {(!selectedExpense.payments || selectedExpense.payments.length === 0) ? (
                  <div className="p-3 rounded-lg bg-zinc-950/40 text-zinc-500 text-center text-xs">
                    No payments disbursed yet.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedExpense.payments.map((pmt) => (
                      <div
                        key={pmt.id}
                        className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <div className="text-zinc-200 font-bold">{formatLKR(pmt.amount)}</div>
                          <div className="text-[10px] text-zinc-500">{pmt.date} via {pmt.paymentMethod.replace("_", " ")}</div>
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          Recorded by: {pmt.recordedBy?.displayName || "Staff"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Card 6: Audit & Governance History */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-zinc-300">Audit History & Approvals</span>
                <div className="space-y-1.5 border-l-2 border-zinc-800 pl-3">
                  {selectedExpense.auditTrail?.map((aud) => (
                    <div key={aud.id} className="text-[11px] space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-300">{aud.action}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(aud.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-zinc-400 text-[10px]">
                        By: <span className="text-zinc-300">{aud.performedBy?.displayName || aud.performedBy?.username}</span>
                        {aud.notes && ` — ${aud.notes}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-2">
              {canDelete && selectedExpense.status !== "posted" && (
                <button
                  onClick={() => handleDelete(selectedExpense)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium cursor-pointer"
                >
                  Delete Voucher
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                {selectedExpense.status === "pending_approval" && canApprove && (
                  <>
                    <button
                      onClick={() => handleReject(selectedExpense)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs font-medium cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(selectedExpense)}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold cursor-pointer"
                    >
                      Approve Voucher
                    </button>
                  </>
                )}

                {selectedExpense.status === "approved" && canApprove && (
                  <button
                    onClick={() => handlePostToAccounting(selectedExpense)}
                    className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold cursor-pointer shadow-md"
                  >
                    Post to General Ledger
                  </button>
                )}

                <button
                  onClick={() => setSelectedExpense(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs font-medium cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD EXPENSE (WITH NEW EMPLOYEE SALARY TYPE) ──── */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-[#0e1017] border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-bold text-white">Record Expenditure Voucher</h3>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordExpense} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Row 1: Expense Type & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-semibold">Expense Type *</label>
                  <select
                    value={formExpenseType}
                    onChange={(e) => {
                      const newType = e.target.value as ExpenseType;
                      setFormExpenseType(newType);
                      if (newType === "EMPLOYEE_SALARY") {
                        const salaryCat = categories.find((c) => c.code === "SALARY") || categories[0];
                        if (salaryCat) setFormCategory(salaryCat.id);
                      }
                    }}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-500"
                    required
                  >
                    <option value="OPERATING_EXPENSE" className="bg-zinc-900">Operating Expense (Rent, Utilities, Supplies)</option>
                    <option value="EMPLOYEE_SALARY" className="bg-zinc-900">Employee Salary & Payroll (Salary, Overtime, Cuts)</option>
                    <option value="CAPITAL_ASSET" className="bg-zinc-900">Capital Asset (Hardware, Equipment, Fixtures)</option>
                    <option value="LIABILITY_PAYMENT" className="bg-zinc-900">Liability Repayment (Loan Principal, SST)</option>
                    <option value="OWNER_WITHDRAWAL" className="bg-zinc-900">Owner Withdrawal (Drawings)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-semibold">Expense Category *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      setFormCategory(e.target.value);
                      const cat = categories.find((c) => c.id === e.target.value);
                      if (cat?.type === "EMPLOYEE_SALARY" || cat?.code === "SALARY") {
                        setFormExpenseType("EMPLOYEE_SALARY");
                      }
                    }}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-500"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-zinc-900">
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SPECIALIZED SECTION: EMPLOYEE SALARY & OVERTIME MANAGEMENT */}
              {formExpenseType === "EMPLOYEE_SALARY" && (
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-blue-500/30 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                      <span>Employee Salary, Overtime & Deduction Details</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">Hits GL 6020</span>
                  </div>

                  {/* Employee Name & Staff Picker */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-300 font-medium">Select Shop Staff or Enter Name *</label>
                      {staffMembers.length > 0 ? (
                        <div className="space-y-1.5">
                          <select
                            value={salaryEmployeeId}
                            onChange={(e) => {
                              const empId = e.target.value;
                              setSalaryEmployeeId(empId);
                              const selected = staffMembers.find((m) => m.uid === empId);
                              if (selected) {
                                const name = selected.displayName || selected.username;
                                setSalaryEmployeeName(name);
                                setFormPayee(name);
                              }
                            }}
                            className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none"
                          >
                            <option value="">-- Choose Existing Shop Staff --</option>
                            {staffMembers.map((m) => (
                              <option key={m.uid} value={m.uid} className="bg-zinc-900">
                                {m.displayName || m.username} ({m.role})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Or type full employee name..."
                            value={salaryEmployeeName}
                            onChange={(e) => {
                              setSalaryEmployeeName(e.target.value);
                              setFormPayee(e.target.value);
                            }}
                            className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                            required
                          />
                        </div>
                      ) : (
                        <input
                          type="text"
                          placeholder="e.g. Kamal Perera"
                          value={salaryEmployeeName}
                          onChange={(e) => {
                            setSalaryEmployeeName(e.target.value);
                            setFormPayee(e.target.value);
                          }}
                          className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                          required
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-300 font-medium">Salary Period *</label>
                      <input
                        type="text"
                        placeholder="e.g. October 2026"
                        value={salaryPayPeriod}
                        onChange={(e) => setSalaryPayPeriod(e.target.value)}
                        className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Base Salary */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-medium">Basic / Base Salary (LKR) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 50000.00"
                      value={salaryBaseAmount}
                      onChange={(e) => setSalaryBaseAmount(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white text-sm focus:outline-none focus:border-zinc-500"
                      required
                    />
                  </div>

                  {/* Overtime Management Box */}
                  <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800 space-y-2">
                    <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Overtime Management
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-400">Overtime Hours</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="e.g. 12"
                          value={salaryOvertimeHours}
                          onChange={(e) => setSalaryOvertimeHours(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-400">Rate / Hour (LKR)</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="e.g. 450"
                          value={salaryOvertimeRate}
                          onChange={(e) => setSalaryOvertimeRate(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-400">Total Overtime Pay (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Auto or override"
                          value={salaryOvertimeAmount}
                          onChange={(e) => setSalaryOvertimeAmount(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-amber-300 font-mono text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Notes on overtime duties (e.g. Weekend stock audit shifts)..."
                      value={salaryOvertimeNotes}
                      onChange={(e) => setSalaryOvertimeNotes(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-xs focus:outline-none"
                    />
                  </div>

                  {/* Salary Cuts & Deductions Box */}
                  <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800 space-y-2">
                    <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5" /> Salary Cuts & Deductions
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-400">Deduction Amount (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g. 2500.00"
                          value={salaryCutsAmount}
                          onChange={(e) => setSalaryCutsAmount(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-rose-300 font-mono text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-400">Reason for Cut / Deduction</label>
                        <input
                          type="text"
                          placeholder="e.g. 2 days unpaid leave, late penalty, cash advance recovery"
                          value={salaryCutReason}
                          onChange={(e) => setSalaryCutReason(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Allowances & Bonuses */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400 font-medium">Other Allowances / Bonus (LKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 3000.00"
                      value={salaryAllowances}
                      onChange={(e) => setSalaryAllowances(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-1.5 font-mono text-zinc-200 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Row 2: Date & Payee (if not salary) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-semibold">Expense Date *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-500"
                    required
                  />
                </div>

                {formExpenseType !== "EMPLOYEE_SALARY" ? (
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-semibold">Vendor / Payee *</label>
                    <input
                      type="text"
                      placeholder="e.g. Landlord, CEB, Dialog, Supplier"
                      value={formPayee}
                      onChange={(e) => setFormPayee(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-semibold">Reference / Slip ID</label>
                    <input
                      type="text"
                      placeholder="e.g. SAL-OCT-01"
                      value={formReference}
                      onChange={(e) => setFormReference(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Amount in LKR */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-300 font-semibold">
                  {formExpenseType === "EMPLOYEE_SALARY" ? "Calculated Net Salary Payable (LKR) *" : "Total Amount (LKR) *"}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-zinc-400">LKR</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full pl-12 pr-3 py-2 bg-zinc-950/60 border border-zinc-700 rounded-lg text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                    required
                  />
                </div>
              </div>

              {/* Reference (for non-salary) */}
              {formExpenseType !== "EMPLOYEE_SALARY" && (
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">Invoice / Receipt Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. BILL-2026-99"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Payment Settlement Options */}
              <div className="space-y-2 p-3 rounded-xl bg-zinc-950/50 border border-zinc-800">
                <label className="text-[11px] text-zinc-300 font-semibold">Payment Disbursement</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormPaymentOption("paid")}
                    className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      formPaymentOption === "paid"
                        ? "bg-zinc-800 border-zinc-500 text-white shadow-sm"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Paid in Full
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormPaymentOption("partial")}
                    className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      formPaymentOption === "partial"
                        ? "bg-zinc-800 border-zinc-500 text-white shadow-sm"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Partial Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormPaymentOption("unpaid")}
                    className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      formPaymentOption === "unpaid"
                        ? "bg-zinc-800 border-zinc-500 text-white shadow-sm"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Unpaid (Credit)
                  </button>
                </div>

                {formPaymentOption === "partial" && (
                  <div className="pt-2">
                    <label className="text-[10px] text-zinc-400">Immediate Amount Paid (LKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formPartialAmount}
                      onChange={(e) => setFormPartialAmount(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none"
                    />
                  </div>
                )}

                {/* Tender Method */}
                <div className="pt-2">
                  <label className="text-[10px] text-zinc-400">Payment Tender</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as ExpensePaymentMethod)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none"
                  >
                    <option value="cash" className="bg-zinc-900">Cash (Till Drawer)</option>
                    <option value="bank_transfer" className="bg-zinc-900">Bank Transfer / Online Wire</option>
                    <option value="card" className="bg-zinc-900">Corporate Card</option>
                    <option value="cheque" className="bg-zinc-900">Bank Cheque</option>
                    <option value="mobile_money" className="bg-zinc-900">Mobile Money / QR</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Description / Details</label>
                <textarea
                  rows={2}
                  placeholder="Notes on what was purchased or service rendered..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Checkboxes */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={formTaxDeductible}
                    onChange={(e) => setFormTaxDeductible(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700 text-zinc-300 focus:ring-0"
                  />
                  <span>Tax-deductible expenditure</span>
                </label>

                {canApprove && (
                  <label className="flex items-center gap-2 cursor-pointer text-cyan-300">
                    <input
                      type="checkbox"
                      checked={formAutoPost}
                      onChange={(e) => setFormAutoPost(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-cyan-400 focus:ring-0"
                    />
                    <span>Post directly to GL</span>
                  </label>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isActionLoading ? "Recording..." : "Save Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD PAYMENT SETTLEMENT ───────────────────────── */}
      {isPaymentModalOpen && paymentTargetExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0e1017] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Record Bill Payment</h3>
                <p className="text-[10px] text-zinc-400 font-mono">
                  {paymentTargetExpense.id} • Balance: {formatLKR(paymentTargetExpense.balanceDue)}
                </p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">Payment Amount (LKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentTargetExpense.balanceDue}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white text-sm focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                  >
                    <option value="cash" className="bg-zinc-900">Cash Drawer</option>
                    <option value="bank_transfer" className="bg-zinc-900">Bank Transfer</option>
                    <option value="card" className="bg-zinc-900">Card</option>
                    <option value="cheque" className="bg-zinc-900">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">Payment Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Receipt #, Cheque #, Wire Ref"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold"
                >
                  Apply Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE CATEGORY ─────────────────────────────────── */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0e1017] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <span>New Expense Category</span>
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategorySubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Category Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Generator Fuel & Lubricants"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">Category Code</label>
                  <input
                    type="text"
                    placeholder="e.g. FUEL"
                    value={newCatCode}
                    onChange={(e) => setNewCatCode(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">GL Account Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 6060"
                    value={newCatGlCode}
                    onChange={(e) => setNewCatGlCode(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Accounting Type</label>
                <select
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value as ExpenseType)}
                  className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                >
                  <option value="OPERATING_EXPENSE" className="bg-zinc-900">Operating Expense (P&L deduction)</option>
                  <option value="EMPLOYEE_SALARY" className="bg-zinc-900">Employee Salary (Payroll OpEx)</option>
                  <option value="CAPITAL_ASSET" className="bg-zinc-900">Capital Asset (Balance Sheet Fixed Asset)</option>
                  <option value="LIABILITY_PAYMENT" className="bg-zinc-900">Liability Payment (Loan Principal)</option>
                  <option value="OWNER_WITHDRAWAL" className="bg-zinc-900">Owner Withdrawal (Equity Drawing)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE RECURRING SCHEDULE ──────────────────────── */}
      {isRecurringModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0e1017] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-cyan-400" />
                <span>New Recurring Schedule</span>
              </h3>
              <button
                onClick={() => setIsRecurringModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateScheduleSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Schedule Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Shop Rental"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">Category</label>
                  <select
                    value={schedCatId}
                    onChange={(e) => setSchedCatId(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-zinc-900">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">Frequency</label>
                  <select
                    value={schedFreq}
                    onChange={(e) => setSchedFreq(e.target.value as any)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                  >
                    <option value="monthly" className="bg-zinc-900">Monthly</option>
                    <option value="weekly" className="bg-zinc-900">Weekly</option>
                    <option value="daily" className="bg-zinc-900">Daily</option>
                    <option value="quarterly" className="bg-zinc-900">Quarterly</option>
                    <option value="yearly" className="bg-zinc-900">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">Amount (LKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={schedAmount}
                    onChange={(e) => setSchedAmount(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">Payee / Vendor *</label>
                  <input
                    type="text"
                    placeholder="e.g. Landlord"
                    value={schedPayee}
                    onChange={(e) => setSchedPayee(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">First Due Date</label>
                  <input
                    type="date"
                    value={schedStartDate}
                    onChange={(e) => setSchedStartDate(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">Tender Method</label>
                  <select
                    value={schedMethod}
                    onChange={(e) => setSchedMethod(e.target.value as any)}
                    className="w-full bg-zinc-950/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                  >
                    <option value="bank_transfer" className="bg-zinc-900">Bank Transfer</option>
                    <option value="cash" className="bg-zinc-900">Cash</option>
                    <option value="card" className="bg-zinc-900">Card</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecurringModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold"
                >
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
