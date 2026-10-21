"use client";

/**
 * components/repair/RepairDetailView.tsx
 *
 * Comprehensive Multi-Tab Technician & Manager Workshop Command Center.
 * Multi-tenant scoped to authenticated shopId.
 *
 * Tabs:
 * 1. Overview & Status Timeline
 * 2. Diagnostics
 * 3. Versioned Estimates & Customer Approval
 * 4. Technician Tasks & Parts Inventory Consumption
 * 5. Quality Control (QC Gate Verification)
 * 6. Deposits, POS Settlement & Billing
 * 7. Warranty Certificate & Rework Claims
 */

import React, { useState, useEffect } from "react";
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
  Camera,
  Check,
  FileText,
  BadgeCheck,
  Lock,
  Unlock,
} from "lucide-react";
import { AuditUser } from "@/lib/types/catalog";
import {
  FullRepairTicketDetails,
  RepairStatus,
  RepairPriority,
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
  saveRepairDiagnostic,
  createEstimateVersion,
  approveEstimate,
  addRepairTask,
  toggleRepairTask,
  recordPartUsage,
  returnPartToStock,
  recordRepairPayment,
  completeRepairAndInvoice,
  saveRepairQCCheck,
  createWarrantyClaim,
} from "@/lib/services/repairService";
import { generateJobCardPdf, generateWarrantyCertificatePdf } from "@/lib/exporters/repairPdfExporter";
import { IOSSpinner } from "@/components/ui/IOSSpinner";

interface RepairDetailViewProps {
  shopId: string;
  ticketId: string;
  currentUser: AuditUser;
  onClose: () => void;
  onTicketUpdated: () => void;
}

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

export function RepairDetailView({
  shopId,
  ticketId,
  currentUser,
  onClose,
  onTicketUpdated,
}: RepairDetailViewProps) {
  const [details, setDetails] = useState<FullRepairTicketDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "diagnostics" | "estimates" | "tasks_parts" | "qc" | "billing" | "warranty"
  >("overview");

  // Diagnostics State
  const [batteryHealth, setBatteryHealth] = useState("85");
  const [chargingAmps, setChargingAmps] = useState("1.8");
  const [diagNotes, setDiagNotes] = useState("");
  const [suggestedAction, setSuggestedAction] = useState("");

  // Estimate Builder State
  const [laborCharge, setLaborCharge] = useState("65");
  const [newPartDesc, setNewPartDesc] = useState("");
  const [newPartCost, setNewPartCost] = useState("");
  const [newPartPrice, setNewPartPrice] = useState("");
  const [estimateParts, setEstimateParts] = useState<
    { description: string; cost: number; price: number; quantity: number }[]
  >([]);

  // Task & Part Usage State
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [partUsageSku, setPartUsageSku] = useState("");
  const [partUsageName, setPartUsageName] = useState("");
  const [partUsageCost, setPartUsageCost] = useState("");
  const [partUsagePrice, setPartUsagePrice] = useState("");
  const [partUsageQty, setPartUsageQty] = useState("1");
  const [partUsageStatus, setPartUsageStatus] = useState<"consumed" | "reserved" | "damaged">("consumed");

  // QC State
  const [qcItems, setQcItems] = useState<{ id: string; label: string; passed: boolean; note?: string }[]>(
    QC_DEFAULT_ITEMS.map((it) => ({ ...it, passed: false }))
  );
  const [cleaningDone, setCleaningDone] = useState(false);
  const [screwsDone, setScrewsDone] = useState(false);
  const [aestheticGrade, setAestheticGrade] = useState<"A_MINT" | "B_GOOD" | "C_ACCEPTABLE">("A_MINT");

  // Payment collection State
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "qr">("cash");
  const [paymentType, setPaymentType] = useState<"deposit" | "partial" | "final_balance">("partial");

  // Warranty claim state
  const [claimReason, setClaimReason] = useState("");

  // Fetch bundle
  const loadDetails = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await getRepairTicketDetails(shopId, ticketId);
      setDetails(res);
      if (res.ticket.estimatedCost && res.ticket.balanceDue) {
        setPaymentAmount(res.ticket.balanceDue.toString());
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load repair details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [shopId, ticketId]);

  if (loading || !details) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="p-8 rounded-3xl bg-[#0e1017] border border-white/10 text-center space-y-3">
          <IOSSpinner size={32} color="#71717a" className="mx-auto" />
          <p className="text-xs text-zinc-400">Loading complete repair workshop data...</p>
        </div>
      </div>
    );
  }

  const { ticket, diagnostics, estimates, tasks, partsUsage, payments, statusHistory, qcChecks, warranties } = details;

  // Handlers
  const handleStatusChange = async (newStatus: RepairStatus) => {
    try {
      await updateRepairStatus(shopId, currentUser, ticket.id, newStatus);
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message || "Could not change status.");
    }
  };

  const handleSaveDiagnostic = async () => {
    try {
      await saveRepairDiagnostic(shopId, currentUser, ticket.id, {
        batteryHealthPercent: parseInt(batteryHealth) || undefined,
        chargingCurrentAmps: parseFloat(chargingAmps) || undefined,
        diagnosticNotes: diagNotes,
        tests: [],
        findingsSummary: diagNotes,
        suggestedAction,
        isIrreparable: false,
      });
      alert("Diagnostics saved and status updated to Diagnosing!");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateEstimate = async () => {
    try {
      const items = [
        {
          id: `lab_${Date.now()}`,
          type: "labor" as const,
          description: "Technical Labor & Disassembly / Assembly",
          quantity: 1,
          unitCost: 0,
          unitSellingPrice: parseFloat(laborCharge) || 0,
          totalPrice: parseFloat(laborCharge) || 0,
        },
        ...estimateParts.map((p, idx) => ({
          id: `part_${idx}_${Date.now()}`,
          type: "part" as const,
          description: p.description,
          quantity: p.quantity,
          unitCost: p.cost,
          unitSellingPrice: p.price,
          totalPrice: p.price * p.quantity,
        })),
      ];

      await createEstimateVersion(shopId, currentUser, ticket.id, items);
      setEstimateParts([]);
      alert("New estimate quote created and sent for customer approval!");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApproveEstimate = async (estimateId: string) => {
    try {
      await approveEstimate(shopId, currentUser, ticket.id, estimateId, {
        approvedAt: Date.now(),
        approvedBy: ticket.customerName,
        approvalMethod: "in_person",
        notes: "Approved by customer at workshop counter",
      });
      alert("Estimate approved! Ticket transitioned to 'In Repair'.");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message);
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
      alert(err.message);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await toggleRepairTask(shopId, currentUser, ticket.id, taskId, completed);
      await loadDetails();
    } catch (err: any) {
      alert(err.message);
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
      alert(`Part recorded as ${partUsageStatus.toUpperCase()}! Stock adjusted accordingly.`);
      await loadDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReturnPart = async (usageId: string) => {
    try {
      await returnPartToStock(shopId, currentUser, ticket.id, usageId);
      alert("Part returned to stock inventory!");
      await loadDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSubmitQC = async () => {
    try {
      await saveRepairQCCheck(
        shopId,
        currentUser,
        ticket.id,
        qcItems,
        aestheticGrade,
        cleaningDone,
        screwsDone,
        "Checked by service tech"
      );
      alert("Quality Control submitted! Device is marked 'Ready for Collection'.");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message);
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
        notes: `Recorded by cashier ${currentUser.displayName || currentUser.username}`,
      });
      setPaymentAmount("");
      alert("Payment recorded successfully!");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePOSCheckout = async () => {
    if (!confirm("This will record an official POS invoice in Sales, settle remaining balances, and issue the Warranty Certificate. Proceed?")) {
      return;
    }
    try {
      const res = await completeRepairAndInvoice(shopId, currentUser, ticket.id, paymentMethod, 90);
      alert(`Repair complete! Generated POS Invoice #${res.invoiceNumber} and Warranty #${res.warrantyCode}`);
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateRework = async () => {
    if (!claimReason.trim()) return;
    try {
      const reworkTicket = await createWarrantyClaim(shopId, currentUser, ticket.id, claimReason.trim());
      alert(`Warranty rework ticket created: #${reworkTicket.ticketNumber}!`);
      setClaimReason("");
      await loadDetails();
      onTicketUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePrintJobCard = () => {
    const doc = generateJobCardPdf(details, {
      shopName: "SKYFOX MOBILE REPAIR",
      generatedBy: {
        username: currentUser.username,
        role: currentUser.role,
      },
    });
    doc.save(`JobCard_${ticket.ticketNumber}.pdf`);
  };

  const handlePrintWarranty = () => {
    const doc = generateWarrantyCertificatePdf(details, {
      shopName: "SKYFOX MOBILE REPAIR",
      generatedBy: {
        username: currentUser.username,
        role: currentUser.role,
      },
    });
    doc.save(`Warranty_${ticket.ticketNumber}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl my-auto rounded-3xl bg-[#0d0f17] border border-white/[0.1] shadow-2xl text-zinc-100 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 bg-[#121522] border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black text-sky-400">{ticket.ticketNumber}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.08] text-white border border-white/10 uppercase">
                  {ticket.status.replace("_", " ")}
                </span>
                {ticket.isWarrantyRework && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    REWORK CLAIM
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                {ticket.brand} {ticket.model} • Customer: {ticket.customerName} ({ticket.customerPhone})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintJobCard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-zinc-300 hover:text-white border border-white/[0.08] transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-sky-400" />
              <span>Print Job Card</span>
            </button>

            {warranties.length > 0 && (
              <button
                type="button"
                onClick={handlePrintWarranty}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-zinc-300 hover:text-white border border-white/[0.08] transition-all cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Warranty</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-2 bg-[#0e111c] border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
          {[
            { id: "overview", label: "Overview & Timeline" },
            { id: "diagnostics", label: "Diagnostics" },
            { id: "estimates", label: `Estimates (${estimates.length})` },
            { id: "tasks_parts", label: `Tasks & Parts (${tasks.length}/${partsUsage.length})` },
            { id: "qc", label: "QC Gate" },
            { id: "billing", label: `Billing & POS (LKR ${ticket.balanceDue.toFixed(2)})` },
            { id: "warranty", label: `Warranty (${warranties.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? "bg-sky-500 text-black font-bold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: OVERVIEW & TIMELINE */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Status Action Bar */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-zinc-400 font-medium">Update Status Transition:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(
                      [
                        "received",
                        "diagnosing",
                        "awaiting_approval",
                        "awaiting_parts",
                        "in_repair",
                        "quality_check",
                        "ready_for_collection",
                        "collected",
                        "cancelled",
                      ] as RepairStatus[]
                    ).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleStatusChange(st)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          ticket.status === st
                            ? "bg-sky-500 text-black font-bold shadow-sm"
                            : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                        }`}
                      >
                        {st.replace("_", " ").toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid 2 Columns: Specs & Faults */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                  <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Device & Customer Profile</h4>
                  <div className="space-y-1.5 text-xs text-zinc-300">
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400">Customer:</span>
                      <span className="font-semibold">{ticket.customerName}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400">Phone:</span>
                      <span className="font-mono">{ticket.customerPhone}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400">Device Model:</span>
                      <span>{ticket.brand} {ticket.model}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400">IMEI 1:</span>
                      <span className="font-mono">{ticket.imei1 || "N/A"}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400">Passcode Protection:</span>
                      <span className="flex items-center gap-1 font-semibold text-amber-300">
                        {ticket.passcodeProtected ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-zinc-500" />}
                        {ticket.passcodeProtected ? "Provided (Masked)" : "None / Unlocked"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                  <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Reported Faults & Condition</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(ticket.reportedFaults || []).map((f: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
                        {f}
                      </span>
                    ))}
                  </div>
                  {ticket.intakeNotes && (
                    <p className="text-xs text-zinc-400 italic bg-black/20 p-2.5 rounded-xl border border-white/[0.04]">
                      Notes: {ticket.intakeNotes}
                    </p>
                  )}
                  {ticket.customerSignatureUrl && (
                    <div className="pt-2">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Customer Authorization Signature</span>
                      <img src={ticket.customerSignatureUrl} alt="Signature" className="h-10 border border-white/10 rounded-lg bg-black/30 px-2" />
                    </div>
                  )}
                </div>
              </div>

              {/* Status History Timeline */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Audit Trail & Status History</h4>
                <div className="space-y-2">
                  {statusHistory.map((ev: RepairStatusEvent) => (
                    <div key={ev.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs">
                      <div className="w-2 h-2 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-200">
                            {ev.fromStatus} → {ev.toStatus.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {new Date(ev.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{ev.reason || "Status updated"}</p>
                        <span className="text-[10px] text-zinc-500">By: {ev.performedBy?.displayName || ev.performedBy?.username}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DIAGNOSTICS */}
          {activeTab === "diagnostics" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-4">
                <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Hardware Diagnostic Metrics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Battery Health (%)</label>
                    <input
                      type="number"
                      value={batteryHealth}
                      onChange={(e) => setBatteryHealth(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Charging Current Draw (Amps)</label>
                    <input
                      type="text"
                      value={chargingAmps}
                      onChange={(e) => setChargingAmps(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Detailed Diagnostic Findings</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Digitizer IC shorted on line 3, flex cable torn, battery cycles at 920..."
                    value={diagNotes}
                    onChange={(e) => setDiagNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Suggested Repair Action</label>
                  <input
                    type="text"
                    placeholder="e.g. Replace OLED assembly + genuine battery pack"
                    value={suggestedAction}
                    onChange={(e) => setSuggestedAction(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveDiagnostic}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs transition-all cursor-pointer"
                >
                  Save Diagnostic Inspection
                </button>
              </div>

              {diagnostics.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-zinc-300">Diagnostic History:</h5>
                  {diagnostics.map((d: RepairDiagnostic) => (
                    <div key={d.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs space-y-1">
                      <div className="flex justify-between text-zinc-400 text-[10px]">
                        <span>Tech: {d.technician?.displayName || d.technician?.username}</span>
                        <span>{new Date(d.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-zinc-200">{d.findingsSummary}</p>
                      {d.batteryHealthPercent && <span className="text-[10px] text-amber-400 mr-3">Battery: {d.batteryHealthPercent}%</span>}
                      {d.chargingCurrentAmps && <span className="text-[10px] text-sky-400">Current: {d.chargingCurrentAmps}A</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ESTIMATES & CUSTOMER APPROVAL */}
          {activeTab === "estimates" && (
            <div className="space-y-5">
              {/* Create New Estimate Form */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-4">
                <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Draft New Estimate Quote</h4>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Technical Labor Charge (LKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={laborCharge}
                    onChange={(e) => setLaborCharge(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                  />
                </div>

                {/* Add part line */}
                <div className="space-y-2">
                  <span className="text-[11px] text-zinc-400 font-medium">Add Spare Part to Estimate:</span>
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Part description (e.g. OLED Display)"
                      value={newPartDesc}
                      onChange={(e) => setNewPartDesc(e.target.value)}
                      className="col-span-2 px-3 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cost (LKR)"
                      value={newPartCost}
                      onChange={(e) => setNewPartCost(e.target.value)}
                      className="px-3 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Selling Price (LKR)"
                      value={newPartPrice}
                      onChange={(e) => setNewPartPrice(e.target.value)}
                      className="px-3 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newPartDesc) return;
                      setEstimateParts([
                        ...estimateParts,
                        {
                          description: newPartDesc,
                          cost: parseFloat(newPartCost) || 0,
                          price: parseFloat(newPartPrice) || 0,
                          quantity: 1,
                        },
                      ]);
                      setNewPartDesc("");
                      setNewPartCost("");
                      setNewPartPrice("");
                    }}
                    className="px-3 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs text-zinc-200"
                  >
                    + Add Part Line
                  </button>
                </div>

                {estimateParts.length > 0 && (
                  <div className="space-y-1.5">
                    {estimateParts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-black/20 text-xs">
                        <span>{p.description} (1x)</span>
                        <span className="font-semibold text-emerald-400">LKR {p.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateEstimate}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-all cursor-pointer"
                >
                  Generate Estimate Version & Request Approval
                </button>
              </div>

              {/* Versioned Estimates List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300">Historical Estimate Quotes:</h4>
                {estimates.map((est: RepairEstimate) => (
                  <div key={est.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-teal-400">Version {est.version}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            est.status === "approved"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {est.status.replace("_", " ")}
                        </span>
                      </div>
                      <span className="text-sm font-black text-white">LKR {est.grandTotal.toFixed(2)}</span>
                    </div>

                    <div className="space-y-1 text-xs text-zinc-300">
                      {est.items.map((it: EstimateLineItem) => (
                        <div key={it.id} className="flex justify-between py-0.5 text-zinc-400">
                          <span>{it.description}</span>
                          <span className="font-semibold text-zinc-200">LKR {it.totalPrice.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {est.status === "awaiting_approval" && (
                      <button
                        type="button"
                        onClick={() => handleApproveEstimate(est.id)}
                        className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs"
                      >
                        ✓ Customer Approves This Estimate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: TASKS & PARTS INVENTORY */}
          {activeTab === "tasks_parts" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Tasks Checklist */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Technician Work Checklist</h4>
                <form onSubmit={handleAddTask} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New repair task..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-xl bg-sky-500 text-black font-bold text-xs">
                    + Add
                  </button>
                </form>

                <div className="space-y-2">
                  {tasks.map((tsk: RepairTask) => (
                    <label key={tsk.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tsk.isCompleted}
                        onChange={(e) => handleToggleTask(tsk.id, e.target.checked)}
                        className="rounded border-zinc-700 text-sky-500"
                      />
                      <span className={tsk.isCompleted ? "line-through text-zinc-500" : "text-zinc-200"}>
                        {tsk.title}
                      </span>
                    </label>
                  ))}
                  {tasks.length === 0 && <p className="text-xs text-zinc-500">No tasks logged yet.</p>}
                </div>
              </div>

              {/* Spare Parts Usage & Stock Decrement */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Parts Inventory Consumption</h4>
                <form onSubmit={handleRecordPartUsage} className="space-y-2">
                  <input
                    type="text"
                    required
                    placeholder="Part Name (e.g. iPhone 14 Pro Screen OEM)"
                    value={partUsageName}
                    onChange={(e) => setPartUsageName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="SKU"
                      value={partUsageSku}
                      onChange={(e) => setPartUsageSku(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cost (LKR)"
                      value={partUsageCost}
                      onChange={(e) => setPartUsageCost(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price (LKR)"
                      value={partUsagePrice}
                      onChange={(e) => setPartUsagePrice(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={partUsageStatus}
                      onChange={(e) => setPartUsageStatus(e.target.value as any)}
                      className="px-2 py-1 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                    >
                      <option value="consumed">Consumed (Deduct Stock)</option>
                      <option value="reserved">Reserved (Earmark)</option>
                      <option value="damaged">Damaged / Scrap</option>
                    </select>
                    <button type="submit" className="flex-1 px-3 py-1.5 rounded-xl bg-sky-500 text-black font-bold text-xs">
                      Log Part Consumption
                    </button>
                  </div>
                </form>

                <div className="space-y-1.5 pt-2">
                  {partsUsage.map((pu: RepairPartUsage) => (
                    <div key={pu.id} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs">
                      <div>
                        <span className="font-semibold text-zinc-200">{pu.productName} ({pu.quantity}x)</span>
                        <span className="text-[10px] text-zinc-500 block uppercase">Status: {pu.status}</span>
                      </div>
                      {pu.status === "consumed" && (
                        <button
                          type="button"
                          onClick={() => handleReturnPart(pu.id)}
                          className="text-[10px] text-sky-400 hover:text-sky-300"
                        >
                          Return Stock
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: QC GATE */}
          {activeTab === "qc" && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Mandatory Quality Control Inspection</h4>
                  <p className="text-xs text-zinc-400">100% checks must pass to unlock 'Ready for Collection'.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQcItems(qcItems.map((it) => ({ ...it, passed: true })))}
                    className="text-xs text-sky-400 hover:underline"
                  >
                    Pass All
                  </button>
                </div>
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
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      item.passed
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-white/[0.02] border-white/[0.05] text-zinc-400"
                    }`}
                  >
                    <span className="text-xs font-medium">{item.label}</span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${item.passed ? "bg-emerald-500 text-black font-bold" : "border border-zinc-600"}`}>
                      {item.passed && "✓"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleaningDone}
                    onChange={(e) => setCleaningDone(e.target.checked)}
                    className="rounded text-sky-500"
                  />
                  <span>Device Cleaned & Polished</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={screwsDone}
                    onChange={(e) => setScrewsDone(e.target.checked)}
                    className="rounded text-sky-500"
                  />
                  <span>All Internal/External Screws Secured</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleSubmitQC}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
              >
                Submit Quality Control Sign-Off
              </button>
            </div>
          )}

          {/* TAB 6: BILLING & POS COLLECTION */}
          {activeTab === "billing" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-4">
                <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Financial Overview</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Estimated Total:</span>
                    <span className="font-semibold text-white">LKR {ticket.estimatedCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Total Deposits & Payments:</span>
                    <span className="font-semibold text-emerald-400">LKR {ticket.totalPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/[0.08] text-sm">
                    <span className="font-bold text-zinc-200">Balance Due:</span>
                    <span className="font-black text-amber-400">LKR {ticket.balanceDue.toFixed(2)}</span>
                  </div>
                </div>

                {/* Final POS Settle Button */}
                <div className="p-3.5 rounded-xl bg-teal-950/20 border border-teal-500/30 space-y-2">
                  <span className="text-xs font-bold text-teal-300 block">POS Final Invoicing & Handover</span>
                  <p className="text-[11px] text-zinc-400">
                    Settles the ticket, generates an official POS invoice in Sales, clears device passcode, and issues the 90-day warranty.
                  </p>
                  <button
                    type="button"
                    onClick={handlePOSCheckout}
                    className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-all cursor-pointer shadow-md shadow-teal-600/20"
                  >
                    Generate Official POS Invoice & Deliver Device
                  </button>
                </div>
              </div>

              {/* Record Deposit / Partial Payment */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Record Deposit or Partial Payment</h4>
                <form onSubmit={handleRecordPayment} className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Amount (LKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value as any)}
                      className="px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                    >
                      <option value="deposit">Intake Deposit</option>
                      <option value="partial">Partial Payment</option>
                      <option value="final_balance">Final Settlement</option>
                    </select>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="qr">Digital / QR</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs">
                    Record Payment Receipt
                  </button>
                </form>

                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-medium text-zinc-400">Payment Transactions:</span>
                  {payments.map((p: RepairPayment) => (
                    <div key={p.id} className="flex justify-between p-2 rounded-xl bg-black/20 text-xs">
                      <span>{p.type.toUpperCase()} ({p.paymentMethod})</span>
                      <span className="font-semibold text-emerald-400">+LKR {p.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: WARRANTY */}
          {activeTab === "warranty" && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-4">
              <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Repair Warranty & Rework</h4>
              {warranties.length > 0 ? (
                warranties.map((w: RepairWarranty) => (
                  <div key={w.id} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-emerald-300">Code: {w.warrantyCode}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 uppercase">
                        {w.status}
                      </span>
                    </div>
                    <p className="text-zinc-300">Valid from {w.startDate} to {w.expiryDate} ({w.durationDays} Days)</p>
                    <p className="text-[11px] text-zinc-400">{w.terms}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-400">
                  Warranty is automatically issued upon POS invoice generation at collection.
                </p>
              )}

              {/* Rework claim creator */}
              <div className="pt-3 border-t border-white/[0.05] space-y-2">
                <span className="text-xs font-bold text-zinc-300">Create Warranty Rework Ticket:</span>
                <input
                  type="text"
                  placeholder="Reason for warranty claim (e.g. Touch ghosting after 2 weeks)..."
                  value={claimReason}
                  onChange={(e) => setClaimReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
                <button
                  type="button"
                  onClick={handleCreateRework}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs"
                >
                  Create Linked Warranty Rework Job
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
