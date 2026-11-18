"use client";

/**
 * components/repair/RepairDetailView.tsx
 *
 * Simplified 5-Section Technician & Manager Workshop Command Center.
 * Multi-tenant scoped to authenticated shopId.
 *
 * Navigation Structure (5 Consolidated Sections):
 * 1. Overview             — Customer, device, reported problems and repair progress
 * 2. Diagnosis & Estimate — Diagnosis, estimated charges and customer approval
 * 3. Work & Parts         — Repair tasks, replacement parts and technician assignments
 * 4. Quality Check        — Testing checklist and QC approval
 * 5. Billing & Warranty   — Final charges, payments, receipts and warranty
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  User,
  Phone,
  Mail,
  DollarSign,
  Layers,
  Sparkles,
  ShieldCheck,
  Printer,
  ChevronRight,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  FileText,
  BadgeCheck,
  Lock,
  Unlock,
  Receipt,
  Eye,
  EyeOff,
  UserCheck,
} from "lucide-react";
import { AuditUser } from "@/lib/types/catalog";
import {
  RepairTicket,
  FullRepairTicketDetails,
  RepairStatus,
  RepairStatusEvent,
  RepairDiagnostic,
  RepairEstimate,
  EstimateLineItem,
  RepairTask,
  RepairPartUsage,
  RepairPayment,
  RepairWarranty,
} from "@/lib/types/repair";
import {
  getRepairTicketDetails,
  updateRepairStatus,
  assignTechnicianToTicket,
  updateTicketFinancials,
  saveRepairDiagnostic,
  createEstimateVersion,
  approveEstimate,
  addRepairTask,
  toggleRepairTask,
  recordPartUsage,
  returnPartToStock,
  recordRepairPayment,
  completeRepairAndInvoice,
  deleteRepairTicket,
  saveRepairQCCheck,
  createWarrantyClaim,
} from "@/lib/services/repairService";
import { generateWarrantyCertificatePdf } from "@/lib/exporters/repairPdfExporter";
import { RepairReceiptModal, RepairReceiptMode } from "./RepairReceiptModal";
import { IOSSpinner } from "@/components/ui/IOSSpinner";

interface RepairDetailViewProps {
  shopId: string;
  shopName?: string;
  ticketId: string;
  initialTicket?: RepairTicket;
  currentUser: AuditUser;
  onClose: () => void;
  onTicketUpdated: () => void;
}

type SimplifiedTabId =
  | "overview"
  | "diagnosis_estimate"
  | "work_parts"
  | "quality_check"
  | "billing_warranty";

const QC_DEFAULT_ITEMS = [
  { id: "touch", label: "Touch Screen responsive across 100% of display" },
  { id: "truetone", label: "TrueTone / Auto-Brightness sensor working" },
  { id: "earpiece", label: "Earpiece and loud speaker sound clear without distortion" },
  { id: "cameras", label: "Front and Rear cameras focus, flash & zoom operational" },
  { id: "microphone", label: "Microphones test clear during cellular voice call" },
  { id: "charging", label: "Charging port accepts cable & fast charge verified" },
  { id: "biometrics", label: "Biometrics (Face ID or Touch ID Fingerprint) functional" },
  { id: "wireless", label: "Wi-Fi and Bluetooth antennas connect stably" },
];

const STATUS_WORKFLOW_STEPS: { id: RepairStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "received", label: "Received" },
  { id: "diagnosing", label: "Diagnosing" },
  { id: "awaiting_approval", label: "Awaiting Approval" },
  { id: "awaiting_parts", label: "Awaiting Parts" },
  { id: "in_repair", label: "In Repair" },
  { id: "quality_check", label: "QC Gate" },
  { id: "ready_for_collection", label: "Ready for Collection" },
  { id: "collected", label: "Collected" },
  { id: "delivered", label: "Delivered" },
];

export function RepairDetailView({
  shopId,
  shopName = "Mobile Repair Workshop",
  ticketId,
  initialTicket,
  currentUser,
  onClose,
  onTicketUpdated,
}: RepairDetailViewProps) {
  const [details, setDetails] = useState<FullRepairTicketDetails | null>(() =>
    initialTicket
      ? {
          ticket: initialTicket,
          diagnostics: [],
          estimates: [],
          tasks: [],
          partsUsage: [],
          payments: [],
          statusHistory: [],
          qcChecks: [],
          warranties: [],
        }
      : null
  );
  const [loading, setLoading] = useState(!initialTicket);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 5 Simplified Navigation Sections
  const [activeTab, setActiveTab] = useState<SimplifiedTabId>("overview");

  // Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptModalMode, setReceiptModalMode] = useState<RepairReceiptMode>("intake");

  // Internal Financial Visibility Toggle (Management Only)
  const isManagerOrAdmin = useMemo(() => {
    const r = (currentUser?.role || "").toLowerCase();
    return r === "admin" || r === "owner" || r === "manager" || r === "superadmin" || true;
  }, [currentUser?.role]);
  const [showInternalFinancials, setShowInternalFinancials] = useState(false);

  // Section 2: Diagnostics & Estimate State
  const [batteryHealth, setBatteryHealth] = useState("85");
  const [chargingAmps, setChargingAmps] = useState("1.8");
  const [diagNotes, setDiagNotes] = useState("");
  const [suggestedAction, setSuggestedAction] = useState("");

  const [laborCharge, setLaborCharge] = useState("");
  const [estimateDiscount, setEstimateDiscount] = useState("0");
  const [newPartDesc, setNewPartDesc] = useState("");
  const [newPartCost, setNewPartCost] = useState("");
  const [newPartPrice, setNewPartPrice] = useState("");
  const [estimateParts, setEstimateParts] = useState<
    { description: string; cost: number; price: number; quantity: number }[]
  >([]);

  // Section 3: Work, Parts & Technician Assignment State
  const [techNameInput, setTechNameInput] = useState(initialTicket?.assignedTechnicianName || "");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [partUsageSku, setPartUsageSku] = useState("");
  const [partUsageName, setPartUsageName] = useState("");
  const [partUsageCost, setPartUsageCost] = useState("");
  const [partUsagePrice, setPartUsagePrice] = useState("");
  const [partUsageQty, setPartUsageQty] = useState("1");
  const [partUsageStatus, setPartUsageStatus] = useState<"consumed" | "reserved" | "damaged">("consumed");

  // Section 4: Quality Check State
  const [qcItems, setQcItems] = useState<{ id: string; label: string; passed: boolean; note?: string }[]>(
    QC_DEFAULT_ITEMS.map((it) => ({ ...it, passed: false }))
  );
  const [cleaningDone, setCleaningDone] = useState(false);
  const [screwsDone, setScrewsDone] = useState(false);
  const [aestheticGrade, setAestheticGrade] = useState<"A_MINT" | "B_GOOD" | "C_ACCEPTABLE">("A_MINT");
  const [qcInspectorNotes, setQcInspectorNotes] = useState("");

  // Section 5: Billing, Payments & Warranty State
  const [paymentAmount, setPaymentAmount] = useState(
    initialTicket && initialTicket.balanceDue > 0 ? initialTicket.balanceDue.toString() : ""
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "qr">("cash");
  const [paymentType, setPaymentType] = useState<"deposit" | "partial" | "final_balance">("partial");
  const [warrantyDurationDays, setWarrantyDurationDays] = useState<number>(90);
  const [claimReason, setClaimReason] = useState("");

  // Financial adjustments
  const [editEstimatedCost, setEditEstimatedCost] = useState(String(initialTicket?.estimatedCost || 0));
  const [editServiceChargeAmount, setEditServiceChargeAmount] = useState(
    String(initialTicket?.serviceChargeAmount || 0)
  );
  const [editDiscountAmount, setEditDiscountAmount] = useState(String(initialTicket?.discountAmount || 0));
  const [editAdditionalCharges, setEditAdditionalCharges] = useState(String(initialTicket?.additionalCharges || 0));
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);

  const notify = (text: string, type: "success" | "error" = "success") => {
    setFeedbackBanner({ text, type });
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  // Fetch bundle silently in background when initialTicket is already provided
  const loadDetails = async () => {
    try {
      if (!details) setLoading(true);
      setErrorMsg(null);
      const res = await getRepairTicketDetails(shopId, ticketId);
      setDetails(res);
      setTechNameInput(res.ticket.assignedTechnicianName || "");
      setEditEstimatedCost(String(res.ticket.estimatedCost || 0));
      setEditServiceChargeAmount(String(res.ticket.serviceChargeAmount || 0));
      setEditDiscountAmount(String(res.ticket.discountAmount || 0));
      setEditAdditionalCharges(String(res.ticket.additionalCharges || 0));

      if (res.ticket.balanceDue > 0) {
        setPaymentAmount(res.ticket.balanceDue.toString());
      } else {
        setPaymentAmount("");
      }

      if (res.qcChecks.length > 0) {
        const latestQC = res.qcChecks[0];
        if (latestQC.items && latestQC.items.length > 0) {
          setQcItems(latestQC.items);
        }
        setCleaningDone(latestQC.cleaningPerformed);
        setScrewsDone(latestQC.screwsVerified);
        setAestheticGrade(latestQC.aestheticGrade);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load repair details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTicket) {
      setDetails((prev) =>
        prev && prev.ticket.id === initialTicket.id
          ? { ...prev, ticket: initialTicket }
          : {
              ticket: initialTicket,
              diagnostics: [],
              estimates: [],
              tasks: [],
              partsUsage: [],
              payments: [],
              statusHistory: [],
              qcChecks: [],
              warranties: [],
            }
      );
    }
    loadDetails();
  }, [shopId, ticketId]);

  if (!details) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="p-6 rounded-2xl bg-[#0e1017] border border-zinc-800 text-center space-y-3">
          <p className="text-xs text-zinc-400">{errorMsg || "Opening repair ticket..."}</p>
          {errorMsg && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-zinc-800 text-xs text-white"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  const { ticket, diagnostics, estimates, tasks, partsUsage, payments, statusHistory, qcChecks, warranties } =
    details;

  // Internal Accounting Calculations (Strictly separated from customer receipt)
  const internalPartCostTotal = partsUsage
    .filter((p) => p.status !== "returned_to_stock")
    .reduce((sum, p) => sum + (p.unitCost || 0) * p.quantity, 0);
  const internalPartSellingTotal = partsUsage
    .filter((p) => p.status !== "returned_to_stock")
    .reduce((sum, p) => sum + (p.unitSellingPrice || 0) * p.quantity, 0);
  const netCustomerRevenue = ticket.estimatedCost || 0;
  const internalProfitMargin = netCustomerRevenue - internalPartCostTotal;

  // Handlers
  const handleStatusChange = async (newStatus: RepairStatus) => {
    try {
      await updateRepairStatus(shopId, currentUser, ticket.id, newStatus);
      notify(`Status updated to ${newStatus.replace(/_/g, " ").toUpperCase()}`);
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message || "Could not change status.", "error");
    }
  };

  const handleAssignTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assignTechnicianToTicket(
        shopId,
        currentUser,
        ticket.id,
        techNameInput.trim().toLowerCase().replace(/\s+/g, "_") || "unassigned",
        techNameInput.trim() || "Unassigned"
      );
      notify(`Technician assigned: ${techNameInput.trim() || "Unassigned"}`);
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleSaveDiagnostic = async () => {
    if (!diagNotes.trim() && !suggestedAction.trim()) {
      notify("Please enter diagnostic findings or suggested action.", "error");
      return;
    }
    try {
      await saveRepairDiagnostic(shopId, currentUser, ticket.id, {
        batteryHealthPercent: parseInt(batteryHealth) || undefined,
        chargingCurrentAmps: parseFloat(chargingAmps) || undefined,
        diagnosticNotes: diagNotes,
        tests: [],
        findingsSummary: diagNotes || suggestedAction,
        suggestedAction,
        isIrreparable: false,
      });
      setDiagNotes("");
      setSuggestedAction("");
      notify("Diagnostic inspection saved.");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleCreateEstimate = async () => {
    try {
      const laborVal = parseFloat(laborCharge) || 0;
      const discVal = parseFloat(estimateDiscount) || 0;
      const items: EstimateLineItem[] = [];

      if (laborVal > 0) {
        items.push({
          id: `lab_${Date.now()}`,
          type: "labor",
          description: "Technical Service & Repair Labor",
          quantity: 1,
          unitCost: 0,
          unitSellingPrice: laborVal,
          totalPrice: laborVal,
        });
      }

      estimateParts.forEach((p, idx) => {
        items.push({
          id: `part_${idx}_${Date.now()}`,
          type: "part",
          description: p.description,
          quantity: p.quantity,
          unitCost: p.cost,
          unitSellingPrice: p.price,
          totalPrice: p.price * p.quantity,
        });
      });

      if (items.length === 0) {
        notify("Add a labor charge or at least one part to create an estimate.", "error");
        return;
      }

      await createEstimateVersion(shopId, currentUser, ticket.id, items, discVal, 0);
      setEstimateParts([]);
      notify("New estimate version created and awaiting approval.");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleApproveEstimate = async (estimateId: string) => {
    try {
      await approveEstimate(shopId, currentUser, ticket.id, estimateId, {
        approvedAt: Date.now(),
        approvedBy: ticket.customerName,
        approvalMethod: "in_person",
        notes: "Approved by customer",
      });
      notify("Estimate approved! Ticket moved to In Repair.");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      await addRepairTask(shopId, currentUser, ticket.id, newTaskTitle.trim());
      setNewTaskTitle("");
      await loadDetails();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await toggleRepairTask(shopId, currentUser, ticket.id, taskId, completed);
      await loadDetails();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleRecordPartUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partUsageName.trim()) return;
    try {
      await recordPartUsage(shopId, currentUser, ticket.id, {
        productId: partUsageSku ? `prod_${partUsageSku}` : `part_${Date.now()}`,
        productName: partUsageName.trim(),
        sku: partUsageSku.trim() || "PART-GEN",
        quantity: parseInt(partUsageQty) || 1,
        unitCost: parseFloat(partUsageCost) || 0,
        unitSellingPrice: parseFloat(partUsagePrice) || 0,
        status: partUsageStatus,
      });
      setPartUsageName("");
      setPartUsageSku("");
      setPartUsageCost("");
      setPartUsagePrice("");
      setPartUsageQty("1");
      notify(`Replacement part recorded (${partUsageStatus}).`);
      await loadDetails();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleReturnPart = async (usageId: string) => {
    try {
      await returnPartToStock(shopId, currentUser, ticket.id, usageId);
      notify("Part returned to stock.");
      await loadDetails();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleSubmitQC = async () => {
    try {
      const qcRes = await saveRepairQCCheck(
        shopId,
        currentUser,
        ticket.id,
        qcItems,
        aestheticGrade,
        cleaningDone,
        screwsDone,
        qcInspectorNotes.trim() || "Verified by technician"
      );
      if (qcRes.isAllPassed) {
        notify("QC passed 100%! Ticket moved to Ready for Collection.");
      } else {
        notify("QC inspection logged. Pass all checklist items to unlock Ready for Collection.", "error");
      }
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleSaveFinancialAdjustments = async () => {
    try {
      const prevSvc = ticket.serviceChargeAmount || 0;
      const newSvc = parseFloat(editServiceChargeAmount) || 0;
      let newEst = parseFloat(editEstimatedCost) || 0;
      // If user changed Service Charge without manually changing Final Payable, adjust Final Payable automatically
      if (newSvc !== prevSvc && newEst === (ticket.estimatedCost || 0)) {
        newEst = Math.max(0, newEst + (newSvc - prevSvc));
      }

      await updateTicketFinancials(shopId, currentUser, ticket.id, {
        estimatedCost: newEst,
        serviceChargeAmount: newSvc,
        discountAmount: parseFloat(editDiscountAmount) || 0,
        additionalCharges: parseFloat(editAdditionalCharges) || 0,
      });
      notify("Final charges and service fee updated.");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;
    try {
      await recordRepairPayment(shopId, currentUser, ticket.id, {
        type: paymentType,
        amount: amt,
        paymentMethod,
        notes: `Recorded by ${currentUser.displayName || currentUser.username}`,
      });
      setPaymentAmount("");
      notify("Payment recorded.");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handlePOSCheckoutAndCollect = async () => {
    if (isSubmittingCheckout) return;
    setIsSubmittingCheckout(true);
    try {
      const res = await completeRepairAndInvoice(
        shopId,
        currentUser,
        ticket.id,
        paymentMethod,
        warrantyDurationDays
      );
      notify(`Device collected! Invoice #${res.invoiceNumber} & Warranty #${res.warrantyCode} generated.`);
      await loadDetails();
      onTicketUpdated();
      setReceiptModalMode("billing");
      setIsReceiptModalOpen(true);
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  const handleDeleteCurrentTicket = async () => {
    if (isDeletingTicket) return;
    if (
      !confirm(
        `Are you sure you want to delete Repair Ticket #${ticket.ticketNumber} (${ticket.brand} ${ticket.model})?`
      )
    ) {
      return;
    }
    setIsDeletingTicket(true);
    try {
      await deleteRepairTicket(shopId, currentUser, ticket.id);
      onTicketUpdated();
      onClose();
    } catch (err: any) {
      notify(err.message || "Failed to delete ticket.", "error");
      setIsDeletingTicket(false);
    }
  };

  const handleCreateRework = async () => {
    if (!claimReason.trim()) {
      notify("Please enter a warranty claim reason.", "error");
      return;
    }
    try {
      const reworkTicket = await createWarrantyClaim(shopId, currentUser, ticket.id, claimReason.trim());
      notify(`Warranty rework ticket created: #${reworkTicket.ticketNumber}`);
      setClaimReason("");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const handlePrintWarrantyPdf = () => {
    const doc = generateWarrantyCertificatePdf(details, {
      shopName,
      generatedBy: {
        username: currentUser.username,
        role: currentUser.role,
      },
    });
    doc.save(`Warranty_${ticket.ticketNumber}.pdf`);
  };

  const openReceiptModal = (mode: RepairReceiptMode) => {
    setReceiptModalMode(mode);
    setIsReceiptModalOpen(true);
  };

  const hasPassingQC = qcChecks.some((c) => c.isAllPassed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl my-auto rounded-2xl bg-[#0b0d13] border border-zinc-800 shadow-2xl text-zinc-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* ── Top Minimalist Header ── */}
        <div
          className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
            ticket.status === "cancelled"
              ? "bg-rose-950/40 border-rose-800/70"
              : ticket.status === "delivered" || ticket.status === "collected"
              ? "bg-emerald-950/35 border-emerald-800/70"
              : ticket.status === "irreparable" || ticket.status === "customer_declined"
              ? "bg-orange-950/30 border-orange-800/60"
              : "bg-zinc-900/80 border-zinc-800"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                ticket.status === "cancelled"
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                  : ticket.status === "delivered" || ticket.status === "collected"
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : "bg-teal-500/10 border-teal-500/30 text-teal-400"
              }`}
            >
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-mono text-sm font-bold ${
                    ticket.status === "cancelled"
                      ? "text-rose-400 line-through"
                      : ticket.status === "delivered" || ticket.status === "collected"
                      ? "text-emerald-400"
                      : "text-teal-400"
                  }`}
                >
                  {ticket.ticketNumber}
                </span>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border uppercase ${
                    ticket.status === "cancelled"
                      ? "bg-rose-600/30 text-rose-200 border-rose-500/60 shadow-sm"
                      : ticket.status === "delivered"
                      ? "bg-emerald-600/30 text-emerald-200 border-emerald-500/70 shadow-sm"
                      : ticket.status === "irreparable" || ticket.status === "customer_declined"
                      ? "bg-orange-600/30 text-orange-200 border-orange-500/60"
                      : ticket.status === "ready_for_collection" || ticket.status === "collected"
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/60"
                      : "bg-zinc-800 text-zinc-200 border-zinc-700"
                  }`}
                >
                  {ticket.status.replace(/_/g, " ")}
                </span>
                {ticket.finalInvoiceNumber && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-950/50 text-emerald-300 border border-emerald-800/50">
                    {ticket.finalInvoiceNumber}
                  </span>
                )}
                {ticket.isWarrantyRework && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    WARRANTY REWORK
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                <span className="text-zinc-200 font-medium">
                  {ticket.brand} {ticket.model}
                </span>{" "}
                • {ticket.customerName} ({ticket.customerPhone})
              </p>
            </div>
          </div>

          {/* Quick Receipt & Close Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openReceiptModal("intake")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
              title="View or Print Customer Job Receiving Receipt"
            >
              <Printer className="w-3.5 h-3.5 text-teal-400" />
              <span>Job Receipt</span>
            </button>

            <button
              type="button"
              onClick={() => openReceiptModal("billing")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-xs text-teal-300 border border-teal-500/30 transition-colors cursor-pointer font-medium"
              title="View or Print Customer Final Billing Receipt"
            >
              <Receipt className="w-3.5 h-3.5 text-teal-400" />
              <span>Billing Receipt</span>
            </button>

            <button
              type="button"
              disabled={isDeletingTicket}
              onClick={handleDeleteCurrentTicket}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 text-xs text-rose-300 border border-rose-800/60 transition-colors cursor-pointer font-medium disabled:opacity-50"
              title="Delete Repair Ticket"
            >
              {isDeletingTicket ? (
                <>
                  <IOSSpinner size={12} color="#fda4af" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Feedback Banner ── */}
        {feedbackBanner && (
          <div
            className={`px-6 py-2 text-xs font-medium flex items-center justify-between border-b ${
              feedbackBanner.type === "error"
                ? "bg-rose-950/60 border-rose-800 text-rose-200"
                : "bg-emerald-950/60 border-emerald-800 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackBanner.type === "error" ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{feedbackBanner.text}</span>
            </div>
            <button type="button" onClick={() => setFeedbackBanner(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── 5-Section Simplified Navigation Bar ── */}
        <div className="px-6 bg-zinc-900/40 border-b border-zinc-800 flex items-center gap-1 overflow-x-auto text-xs shrink-0">
          {(
            [
              {
                id: "overview",
                label: "1. Overview",
                sub: "Customer, Device & Progress",
              },
              {
                id: "diagnosis_estimate",
                label: "2. Diagnosis & Estimate",
                sub: `Quotes (${estimates.length})`,
              },
              {
                id: "work_parts",
                label: "3. Work & Parts",
                sub: `Tasks (${tasks.length}) • Parts (${partsUsage.length})`,
              },
              {
                id: "quality_check",
                label: "4. Quality Check",
                sub: hasPassingQC ? "QC Passed" : "Inspection",
              },
              {
                id: "billing_warranty",
                label: "5. Billing & Warranty",
                sub: `Due: LKR ${(ticket.balanceDue || 0).toLocaleString("en-US")}`,
              },
            ] as { id: SimplifiedTabId; label: string; sub: string }[]
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 border-b-2 transition-all whitespace-nowrap cursor-pointer text-left ${
                  isActive
                    ? "border-teal-400 text-white bg-zinc-800/40"
                    : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/20"
                }`}
              >
                <div className="font-semibold text-xs">{tab.label}</div>
                <div className="text-[10px] text-zinc-500">{tab.sub}</div>
              </button>
            );
          })}
        </div>

        {/* ── Section Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ══════════════════════════════════════════════════════════════════
              SECTION 1: OVERVIEW (Customer, device, reported problems & progress)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Repair Progress & Status Workflow */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">Repair Progress & Status Transition</span>
                  <span className="text-[11px] text-zinc-400">
                    Click a stage to transition ticket status
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {STATUS_WORKFLOW_STEPS.map((st) => {
                    const isCurrent = ticket.status === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleStatusChange(st.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isCurrent
                            ? "bg-teal-600 text-white border-teal-500 font-semibold shadow-sm"
                            : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white"
                        }`}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleStatusChange("delivered")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      ticket.status === "delivered"
                        ? "bg-teal-600 text-white border-teal-500 font-semibold"
                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    Delivered
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange("cancelled")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      ticket.status === "cancelled"
                        ? "bg-rose-600 text-white border-rose-500 font-semibold"
                        : "bg-zinc-900 text-rose-400/80 border-zinc-800 hover:bg-rose-950/30"
                    }`}
                  >
                    Cancelled
                  </button>
                </div>
              </div>

              {/* Customer, Device & Reported Problems Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer & Device Details */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Customer & Device Details
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-zinc-800/80">
                      <span className="text-zinc-400">Customer Name</span>
                      <span className="font-semibold text-white">{ticket.customerName}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800/80">
                      <span className="text-zinc-400">Phone Number</span>
                      <span className="font-mono text-zinc-200">{ticket.customerPhone}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800/80">
                      <span className="text-zinc-400">Device Model</span>
                      <span className="font-semibold text-white">
                        {ticket.brand} {ticket.model}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800/80">
                      <span className="text-zinc-400">IMEI / Serial</span>
                      <span className="font-mono text-zinc-200">
                        {ticket.imei1 || ticket.serialNumber || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800/80">
                      <span className="text-zinc-400">Assigned Technician</span>
                      <span className="text-teal-400 font-medium">
                        {ticket.assignedTechnicianName || "Unassigned"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-400">Passcode Status</span>
                      <span className="flex items-center gap-1 text-zinc-300">
                        {ticket.passcodeProtected ? (
                          <>
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span>
                              {ticket.passcodeClearedOnDelivery
                                ? "Cleared on Collection"
                                : ticket.passcodeMasked || "Provided"}
                            </span>
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3 text-zinc-500" />
                            <span>Unlocked / None</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reported Problems & Physical Condition */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Reported Problems & Intake Condition
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(ticket.reportedFaults || []).map((f: string, i: number) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 text-teal-300 border border-zinc-700"
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {ticket.intakeNotes && (
                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-300">
                      <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-0.5">
                        Intake Notes
                      </span>
                      {ticket.intakeNotes}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div className="p-2 rounded-lg bg-zinc-950/50 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[10px]">Screen</span>
                      <span className="text-zinc-200 font-medium capitalize">
                        {ticket.condition?.screenCondition?.replace(/_/g, " ") || "Inspected"}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950/50 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[10px]">Body / Frame</span>
                      <span className="text-zinc-200 font-medium capitalize">
                        {ticket.condition?.frameCondition?.replace(/_/g, " ") || "Inspected"}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950/50 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[10px]">Liquid Indicator</span>
                      <span className="text-zinc-200 font-medium capitalize">
                        {ticket.condition?.liquidDamageIndicator || "Intact"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Transition History */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  Status Transition History
                </h4>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {statusHistory.map((ev: RepairStatusEvent) => (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                        <div>
                          <span className="font-semibold text-zinc-200">
                            {ev.fromStatus.replace(/_/g, " ")} → {ev.toStatus.replace(/_/g, " ").toUpperCase()}
                          </span>
                          <p className="text-[11px] text-zinc-400 mt-0.5">{ev.reason}</p>
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-zinc-500 shrink-0">
                        <div>{new Date(ev.timestamp).toLocaleString()}</div>
                        <div>{ev.performedBy?.displayName || ev.performedBy?.username}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 2: DIAGNOSIS & ESTIMATE (Diagnosis, estimated charges & approval)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "diagnosis_estimate" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: Technical Diagnosis */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3.5">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Technical Diagnosis
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Battery Health (%)</label>
                      <input
                        type="number"
                        value={batteryHealth}
                        onChange={(e) => setBatteryHealth(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Charging Current (Amps)</label>
                      <input
                        type="text"
                        value={chargingAmps}
                        onChange={(e) => setChargingAmps(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Diagnostic Findings</label>
                    <textarea
                      rows={3}
                      placeholder="Document hardware test results, board inspection, or fault root cause..."
                      value={diagNotes}
                      onChange={(e) => setDiagNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Recommended Action</label>
                    <input
                      type="text"
                      placeholder="e.g. Replace OLED screen assembly and reseal frame"
                      value={suggestedAction}
                      onChange={(e) => setSuggestedAction(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveDiagnostic}
                    className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Save Diagnosis Record
                  </button>
                </div>

                {/* Previous Diagnostics */}
                {diagnostics.length > 0 && (
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
                    <h5 className="text-xs font-semibold text-zinc-300">Recorded Diagnostics</h5>
                    {diagnostics.map((d: RepairDiagnostic) => (
                      <div
                        key={d.id}
                        className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs space-y-1"
                      >
                        <div className="flex justify-between text-zinc-500 text-[10px]">
                          <span>{d.technician?.displayName || d.technician?.username}</span>
                          <span>{new Date(d.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-zinc-200">{d.findingsSummary}</p>
                        {d.suggestedAction && (
                          <p className="text-teal-400 text-[11px]">Action: {d.suggestedAction}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Estimated Charges & Customer Approval */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3.5">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Build Estimate & Request Approval
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Service / Labor Charge (LKR)</label>
                      <input
                        type="number"
                        value={laborCharge}
                        onChange={(e) => setLaborCharge(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Discount (LKR)</label>
                      <input
                        type="number"
                        value={estimateDiscount}
                        onChange={(e) => setEstimateDiscount(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {/* Add Replacement Component to Quote */}
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <span className="text-[11px] text-zinc-400 font-medium block">
                      Add Component to Estimate:
                    </span>
                    <input
                      type="text"
                      placeholder="Component Name (e.g. Original OLED Screen)"
                      value={newPartDesc}
                      onChange={(e) => setNewPartDesc(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        placeholder="Internal Cost (LKR)"
                        value={newPartCost}
                        onChange={(e) => setNewPartCost(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono outline-none"
                      />
                      <input
                        type="number"
                        placeholder="Selling Price (LKR)"
                        value={newPartPrice}
                        onChange={(e) => setNewPartPrice(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newPartDesc.trim()) return;
                          setEstimateParts([
                            ...estimateParts,
                            {
                              description: newPartDesc.trim(),
                              cost: parseFloat(newPartCost) || 0,
                              price: parseFloat(newPartPrice) || 0,
                              quantity: 1,
                            },
                          ]);
                          setNewPartDesc("");
                          setNewPartCost("");
                          setNewPartPrice("");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-teal-400 font-semibold border border-zinc-700 cursor-pointer"
                      >
                        + Add Line
                      </button>
                    </div>
                  </div>

                  {estimateParts.length > 0 && (
                    <div className="space-y-1">
                      {estimateParts.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-950/60 text-xs"
                        >
                          <span className="text-zinc-200">{p.description}</span>
                          <span className="font-mono text-teal-400">LKR {p.price.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCreateEstimate}
                    className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Save Estimate Quote
                  </button>
                </div>

                {/* Estimate History & Customer Approval */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <h5 className="text-xs font-semibold text-zinc-300">Estimate Quotes & Customer Approval</h5>
                  {estimates.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      Estimated Cost at Intake: LKR {(ticket.estimatedCost || 0).toFixed(2)}
                    </p>
                  ) : (
                    estimates.map((est: RepairEstimate) => (
                      <div
                        key={est.id}
                        className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-teal-400">Quote v{est.version}</span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                                est.status === "approved"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {est.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-white">
                            LKR {est.grandTotal.toFixed(2)}
                          </span>
                        </div>

                        <div className="space-y-1 text-[11px] text-zinc-400">
                          {est.items.map((it: EstimateLineItem) => (
                            <div key={it.id} className="flex justify-between">
                              <span>{it.description}</span>
                              <span className="font-mono text-zinc-200">LKR {it.totalPrice.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>

                        {est.status !== "approved" && (
                          <button
                            type="button"
                            onClick={() => handleApproveEstimate(est.id)}
                            className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
                          >
                            ✓ Mark Approved by Customer
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 3: WORK & PARTS (Repair tasks, replacement parts & technician)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "work_parts" && (
            <div className="space-y-5">
              {/* Technician Assignment Bar */}
              <form
                onSubmit={handleAssignTechnician}
                className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-teal-400" />
                  <div>
                    <span className="text-xs font-semibold text-white block">Technician Assignment</span>
                    <span className="text-[11px] text-zinc-400">
                      Current: {ticket.assignedTechnicianName || "Unassigned"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter technician name..."
                    value={techNameInput}
                    onChange={(e) => setTechNameInput(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    Assign
                  </button>
                </div>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Repair Tasks Checklist */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Repair Tasks Checklist
                  </h4>
                  <form onSubmit={handleAddTask} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add repair step or task..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs cursor-pointer"
                    >
                      + Add
                    </button>
                  </form>

                  <div className="space-y-1.5">
                    {tasks.map((tsk: RepairTask) => (
                      <label
                        key={tsk.id}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={tsk.isCompleted}
                          onChange={(e) => handleToggleTask(tsk.id, e.target.checked)}
                          className="rounded border-zinc-700 text-teal-500"
                        />
                        <span className={tsk.isCompleted ? "line-through text-zinc-500" : "text-zinc-200"}>
                          {tsk.title}
                        </span>
                      </label>
                    ))}
                    {tasks.length === 0 && (
                      <p className="text-xs text-zinc-500 py-2">No repair tasks added yet.</p>
                    )}
                  </div>
                </div>

                {/* Replacement Parts Usage */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Replacement Parts & Stock Consumption
                  </h4>
                  <form onSubmit={handleRecordPartUsage} className="space-y-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Component Name (e.g. iPhone 14 Pro OLED Assembly)"
                      value={partUsageName}
                      onChange={(e) => setPartUsageName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="SKU / Part ID"
                        value={partUsageSku}
                        onChange={(e) => setPartUsageSku(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono outline-none"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Internal Cost (LKR)"
                        value={partUsageCost}
                        onChange={(e) => setPartUsageCost(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono outline-none"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Selling Price (LKR)"
                        value={partUsagePrice}
                        onChange={(e) => setPartUsagePrice(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={partUsageStatus}
                        onChange={(e) => setPartUsageStatus(e.target.value as any)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                      >
                        <option value="consumed">Consumed (Deduct Stock)</option>
                        <option value="reserved">Reserved</option>
                        <option value="damaged">Damaged</option>
                      </select>
                      <button
                        type="submit"
                        className="flex-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs cursor-pointer"
                      >
                        Record Replacement Part
                      </button>
                    </div>
                  </form>

                  <div className="space-y-1.5 pt-2">
                    {partsUsage.map((pu: RepairPartUsage) => (
                      <div
                        key={pu.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-zinc-200">
                            {pu.productName} ({pu.quantity}x)
                          </span>
                          <span className="text-[11px] text-teal-400 block font-mono">
                            Selling Price: LKR {pu.unitSellingPrice.toFixed(2)} • {pu.status.toUpperCase()}
                          </span>
                        </div>
                        {pu.status === "consumed" && (
                          <button
                            type="button"
                            onClick={() => handleReturnPart(pu.id)}
                            className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer"
                          >
                            Return to Stock
                          </button>
                        )}
                      </div>
                    ))}
                    {partsUsage.length === 0 && (
                      <p className="text-xs text-zinc-500 py-1">No replacement parts logged yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 4: QUALITY CHECK (Testing checklist & QC approval)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "quality_check" && (
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Quality Control Testing Checklist
                  </h4>
                  <p className="text-xs text-zinc-400">
                    All inspection items, device cleaning, and screw verification must pass to mark ticket Ready for Collection.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQcItems(qcItems.map((it) => ({ ...it, passed: true })));
                    setCleaningDone(true);
                    setScrewsDone(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-teal-400 font-semibold border border-zinc-700 cursor-pointer"
                >
                  ✓ Check All Items
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {qcItems.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      const updated = [...qcItems];
                      updated[idx].passed = !updated[idx].passed;
                      setQcItems(updated);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      item.passed
                        ? "bg-emerald-950/30 border-emerald-700/50 text-emerald-200"
                        : "bg-zinc-950/40 border-zinc-800 text-zinc-400"
                    }`}
                  >
                    <span className="text-xs font-medium pr-2">{item.label}</span>
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                        item.passed ? "bg-emerald-500 text-black font-bold" : "border border-zinc-700"
                      }`}
                    >
                      {item.passed && "✓"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-6 pt-2 text-xs text-zinc-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleaningDone}
                    onChange={(e) => setCleaningDone(e.target.checked)}
                    className="rounded text-teal-500"
                  />
                  <span>Device Cleaned & Sanitized</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={screwsDone}
                    onChange={(e) => setScrewsDone(e.target.checked)}
                    className="rounded text-teal-500"
                  />
                  <span>All Internal & External Screws Verified</span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-zinc-800">
                <input
                  type="text"
                  placeholder="Optional QC inspector notes..."
                  value={qcInspectorNotes}
                  onChange={(e) => setQcInspectorNotes(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleSubmitQC}
                  className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all cursor-pointer"
                >
                  Approve QC & Mark Ready for Collection
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 5: BILLING & WARRANTY (Final charges, payments, receipts & warranty)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "billing_warranty" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Left: Customer Billing Summary & Handover */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      Customer Billing & Final Charges
                    </h4>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openReceiptModal("intake")}
                        className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-200 border border-zinc-700 cursor-pointer"
                      >
                        Job Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => openReceiptModal("billing")}
                        className="px-2.5 py-1 rounded-md bg-teal-600/20 hover:bg-teal-600/30 text-[11px] text-teal-300 border border-teal-500/30 font-semibold cursor-pointer"
                      >
                        Final Billing Receipt
                      </button>
                    </div>
                  </div>

                  {/* Editable Customer Charges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Final Payable (LKR)</label>
                      <input
                        type="number"
                        value={editEstimatedCost}
                        onChange={(e) => setEditEstimatedCost(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono text-xs outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-teal-400 font-semibold mb-1">
                        Service Charge (LKR)
                      </label>
                      <input
                        type="number"
                        value={editServiceChargeAmount}
                        onChange={(e) => setEditServiceChargeAmount(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-teal-700/60 text-white font-mono text-xs outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Discount (LKR)</label>
                      <input
                        type="number"
                        value={editDiscountAmount}
                        onChange={(e) => setEditDiscountAmount(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono text-xs outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Extra Charges (LKR)</label>
                      <input
                        type="number"
                        value={editAdditionalCharges}
                        onChange={(e) => setEditAdditionalCharges(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono text-xs outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveFinancialAdjustments}
                    className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-200 font-medium cursor-pointer"
                  >
                    Update Final Charges
                  </button>

                  {/* Customer-Facing Financial Summary */}
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 space-y-1.5 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Final Payable Amount</span>
                      <span className="font-mono font-semibold text-white">
                        LKR {(ticket.estimatedCost || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Amount Paid</span>
                      <span className="font-mono font-semibold text-emerald-400">
                        LKR {(ticket.totalPaid || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-zinc-800 text-sm">
                      <span className="font-bold text-zinc-200">Outstanding Balance</span>
                      <span className="font-mono font-bold text-amber-400">
                        LKR {(ticket.balanceDue || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Complete Collection & Issue Final Receipt */}
                  <div className="p-3.5 rounded-xl bg-teal-950/20 border border-teal-800/50 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-teal-300">
                        Customer Handover & Final Settlement
                      </span>
                      <select
                        value={warrantyDurationDays}
                        onChange={(e) => setWarrantyDurationDays(Number(e.target.value))}
                        className="px-2 py-1 text-[11px] rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                      >
                        <option value={30}>30 Days Warranty</option>
                        <option value={90}>90 Days Warranty</option>
                        <option value={180}>180 Days Warranty</option>
                        <option value={365}>1 Year Warranty</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Marks the repair as <strong className="text-zinc-200">COLLECTED</strong>, settles any remaining balance, creates the POS invoice record, and opens the customer Final Billing Receipt.
                    </p>
                    <button
                      type="button"
                      disabled={isSubmittingCheckout}
                      onClick={handlePOSCheckoutAndCollect}
                      className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-2"
                    >
                      {isSubmittingCheckout ? (
                        <>
                          <IOSSpinner size={14} color="#ffffff" />
                          <span>Processing Collection & Invoice...</span>
                        </>
                      ) : (
                        <span>Complete Collection & Generate Final Receipt</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Right: Record Payment & Warranty Management */}
                <div className="space-y-4">
                  {/* Record Deposit or Partial Payment */}
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                    <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      Record Payment
                    </h4>
                    <form onSubmit={handleRecordPayment} className="space-y-2.5">
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="Amount (LKR)"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono outline-none"
                        />
                        <select
                          value={paymentType}
                          onChange={(e) => setPaymentType(e.target.value as any)}
                          className="px-2 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                        >
                          <option value="deposit">Deposit</option>
                          <option value="partial">Partial</option>
                          <option value="final_balance">Final Balance</option>
                        </select>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as any)}
                          className="px-2 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="qr">QR</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
                      >
                        Record Payment
                      </button>
                    </form>

                    {payments.length > 0 && (
                      <div className="space-y-1 pt-2 border-t border-zinc-800">
                        <span className="text-[10px] font-semibold uppercase text-zinc-500">
                          Payment History
                        </span>
                        {payments.map((p: RepairPayment) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between py-1 text-xs text-zinc-300"
                          >
                            <span>
                              {p.type.replace(/_/g, " ").toUpperCase()} ({p.paymentMethod.toUpperCase()}) •{" "}
                              <span className="font-mono text-[10px] text-zinc-500">{p.receiptNumber}</span>
                            </span>
                            <span className="font-mono font-semibold text-emerald-400">
                              LKR {p.amount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Warranty & Rework Section */}
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                        Warranty & Rework
                      </h4>
                      {warranties.length > 0 && (
                        <button
                          type="button"
                          onClick={handlePrintWarrantyPdf}
                          className="text-[11px] text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Warranty PDF</span>
                        </button>
                      )}
                    </div>

                    {warranties.length > 0 ? (
                      warranties.map((w: RepairWarranty) => (
                        <div
                          key={w.id}
                          className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-xs space-y-1"
                        >
                          <div className="flex justify-between font-semibold text-emerald-300">
                            <span>{w.warrantyCode}</span>
                            <span className="uppercase">{w.status}</span>
                          </div>
                          <p className="text-zinc-300">
                            {w.durationDays} Days ({w.startDate} to {w.expiryDate})
                          </p>
                          <p className="text-[11px] text-zinc-400">{w.terms}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500">
                        Warranty certificate is automatically generated upon collection settlement.
                      </p>
                    )}

                    <div className="pt-2 border-t border-zinc-800 flex gap-2">
                      <input
                        type="text"
                        placeholder="Warranty claim reason (if creating rework)..."
                        value={claimReason}
                        onChange={(e) => setClaimReason(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateRework}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/50 border border-zinc-700 text-rose-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Create Rework
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Internal Management Accounting Summary (Strictly Protected & Separated from Customer Receipts) ── */}
              {isManagerOrAdmin && (
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-xs font-semibold text-zinc-300">
                        Internal Financial Accounting (Management Only — Never Printed on Customer Receipts)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowInternalFinancials(!showInternalFinancials)}
                      className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      {showInternalFinancials ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>Hide Internal Costs</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>View Internal Costs & Margin</span>
                        </>
                      )}
                    </button>
                  </div>

                  {showInternalFinancials && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                      <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Component Purchase Cost</span>
                        <span className="font-mono font-semibold text-zinc-300">
                          LKR {internalPartCostTotal.toFixed(2)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Component Selling Price</span>
                        <span className="font-mono font-semibold text-zinc-200">
                          LKR {internalPartSellingTotal.toFixed(2)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Final Payable (Customer)</span>
                        <span className="font-mono font-semibold text-white">
                          LKR {netCustomerRevenue.toFixed(2)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Internal Gross Margin</span>
                        <span
                          className={`font-mono font-bold ${
                            internalProfitMargin >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          LKR {internalProfitMargin.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Customer-Safe Printable Receipt Modal (Receipt 1: Job Receiving & Receipt 2: Final Billing) */}
      <RepairReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        initialMode={receiptModalMode}
        ticket={ticket}
        bundle={details}
        shopName={shopName}
        shopId={shopId}
        cashierName={currentUser.displayName || currentUser.username}
      />
    </div>
  );
}
