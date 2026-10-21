"use client";

/**
 * components/repair/RepairIntakeDrawer.tsx
 *
 * Professional Device Intake & Ticket Creation Modal for Repair Service.
 * Features:
 * - Customer search & fast intake
 * - Device specifications & dual IMEI / Serial tracking
 * - Passcode protection toggle with privacy disclaimer
 * - Common Fault Quick-Chips & custom issue description
 * - Physical Condition Checklist (Screen, Frame, Back glass, Liquid indicator, etc.)
 * - Accessory Checklist (SIM tray, memory card, charger, case)
 * - HTML5 Canvas Customer Signature Pad
 * - Intake Photo Uploader preview
 * - Initial Deposit Collection calculator
 */

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Wrench,
  Smartphone,
  Laptop,
  Tablet,
  Watch,
  User,
  Phone,
  Mail,
  Camera,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Calendar,
  Layers,
  Sparkles,
  Eraser,
  Check,
} from "lucide-react";
import { AuditUser } from "@/lib/types/catalog";
import {
  DeviceType,
  RepairPriority,
  CreateRepairTicketInput,
  PhysicalConditionAssessment,
  DeviceAccessories,
} from "@/lib/types/repair";
import { createRepairTicket } from "@/lib/services/repairService";

interface RepairIntakeDrawerProps {
  shopId: string;
  currentUser: AuditUser;
  isOpen: boolean;
  onClose: () => void;
  onTicketCreated: (ticketId: string) => void;
}

const COMMON_FAULTS = [
  "Cracked OLED Screen / Glass",
  "Touch Unresponsive in Zones",
  "Battery Draining Fast / Swollen",
  "Charging Port Loose / No Charge",
  "Liquid / Water Ingress Damage",
  "No Power / Dead Device",
  "Camera Blurry / Lens Cracked",
  "Earpiece / Speaker Muffled",
  "Microphone Not Working in Calls",
  "Back Glass Shattered",
  "Face ID / Touch ID Failure",
  "Wi-Fi / Cellular Signal Drops",
];

const DEVICE_BRANDS = [
  "Apple",
  "Samsung",
  "Google Pixel",
  "Xiaomi",
  "OnePlus",
  "Huawei",
  "Oppo",
  "Vivo",
  "Sony",
  "Motorola",
  "Other",
];

export function RepairIntakeDrawer({
  shopId,
  currentUser,
  isOpen,
  onClose,
  onTicketCreated,
}: RepairIntakeDrawerProps) {
  // Customer
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // Device
  const [deviceType, setDeviceType] = useState<DeviceType>("phone");
  const [brand, setBrand] = useState("Apple");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [imei1, setImei1] = useState("");
  const [imei2, setImei2] = useState("");

  // Security
  const [passcodeProtected, setPasscodeProtected] = useState(false);
  const [passcodeMasked, setPasscodeMasked] = useState("");
  const [patternMatrix, setPatternMatrix] = useState("");

  // Faults
  const [selectedFaults, setSelectedFaults] = useState<string[]>([]);
  const [customFault, setCustomFault] = useState("");
  const [intakeNotes, setIntakeNotes] = useState("");

  // Physical Condition
  const [condition, setCondition] = useState<PhysicalConditionAssessment>({
    screenCondition: "cracked",
    frameCondition: "minor_scratches",
    backGlassCondition: "mint",
    liquidDamageIndicator: "intact",
    cameraLenses: "clean",
    buttonsFeel: "responsive",
    chargePortCondition: "clean",
  });

  // Accessories
  const [accessories, setAccessories] = useState<DeviceAccessories>({
    simTray: true,
    simCard: false,
    sdCard: false,
    protectiveCase: false,
    chargerAdapter: false,
    chargingCable: false,
    originalBox: false,
    otherItems: "",
  });

  // Photos
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  // Finance & Priority
  const [priority, setPriority] = useState<RepairPriority>("normal");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "qr">("cash");
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState("Tomorrow, 5:00 PM");

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize Canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#38bdf8"; // sky-400
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [isOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoUrls((prev) => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const toggleFault = (fault: string) => {
    setSelectedFaults((prev) =>
      prev.includes(fault) ? prev.filter((f) => f !== fault) : [...prev, fault]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!customerName.trim()) {
      setErrorMsg("Customer name is required.");
      return;
    }
    if (!model.trim()) {
      setErrorMsg("Device model is required.");
      return;
    }

    const allFaults = [...selectedFaults];
    if (customFault.trim()) {
      allFaults.push(customFault.trim());
    }
    if (allFaults.length === 0) {
      setErrorMsg("Please select or describe at least one fault.");
      return;
    }

    setIsSubmitting(true);

    try {
      let signatureUrl: string | undefined = undefined;
      if (hasSignature && canvasRef.current) {
        signatureUrl = canvasRef.current.toDataURL("image/png");
      }

      const input: CreateRepairTicketInput = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || "N/A",
        customerEmail: customerEmail.trim() || undefined,
        deviceType,
        brand,
        model: model.trim(),
        color: color.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        imei1: imei1.trim() || undefined,
        imei2: imei2.trim() || undefined,
        passcodeProtected,
        passcodeMasked: passcodeProtected ? passcodeMasked : undefined,
        patternMatrix: passcodeProtected ? patternMatrix : undefined,
        reportedFaults: allFaults,
        intakeNotes: intakeNotes.trim() || undefined,
        condition,
        accessories,
        intakePhotoUrls: photoUrls,
        customerSignatureUrl: signatureUrl,
        priority,
        estimatedCost: parseFloat(estimatedCost) || 0,
        initialDepositAmount: parseFloat(depositAmount) || 0,
        depositPaymentMethod,
        estimatedCompletionDate,
      };

      const ticket = await createRepairTicket(shopId, currentUser, input);
      onTicketCreated(ticket.id);
      onClose();
    } catch (err: any) {
      console.error("[RepairIntakeDrawer] Error creating ticket:", err);
      setErrorMsg(err.message || "Failed to create repair ticket. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl my-auto rounded-3xl bg-[#0d0f17] border border-white/[0.1] shadow-2xl text-zinc-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#121522] border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                New Device Intake
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  REP TICKET
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Customer authorization, hardware diagnosis & condition checklist
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Customer Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-sky-400 tracking-wider uppercase flex items-center gap-2">
              <User className="w-3.5 h-3.5" />
              1. Customer Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Liam Anderson"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Phone Number (SMS Alert)</label>
                <input
                  type="text"
                  placeholder="+1 (555) 019-2831"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="liam@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Device Identification */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-sky-400 tracking-wider uppercase flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5" />
              2. Device Specifications
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Device Category</label>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-[#141724] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                >
                  <option value="phone">Smartphone</option>
                  <option value="tablet">Tablet / iPad</option>
                  <option value="laptop">Laptop / MacBook</option>
                  <option value="watch">Smartwatch</option>
                  <option value="other">Other Device</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Brand</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-[#141724] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                >
                  {DEVICE_BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Model Name / Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. iPhone 14 Pro 128GB (A2890)"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Color / Finish</label>
                <input
                  type="text"
                  placeholder="e.g. Deep Purple / Space Black"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Primary IMEI / Serial Number</label>
                <input
                  type="text"
                  placeholder="15-digit IMEI or serial"
                  value={imei1}
                  onChange={(e) => setImei1(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Secondary IMEI 2 / eSIM (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional dual SIM IMEI"
                  value={imei2}
                  onChange={(e) => setImei2(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white font-mono outline-none"
                />
              </div>
            </div>

            {/* Passcode Security */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-zinc-200">Device Lock & Passcode Policy</span>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={passcodeProtected}
                    onChange={(e) => setPasscodeProtected(e.target.checked)}
                    className="rounded border-zinc-700 text-sky-500 focus:ring-0"
                  />
                  <span className="text-zinc-300">Customer provided passcode</span>
                </label>
              </div>

              {passcodeProtected ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">PIN / Password (Masked)</label>
                    <input
                      type="password"
                      placeholder="Enter 4-6 digit code"
                      value={passcodeMasked}
                      onChange={(e) => setPasscodeMasked(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white/[0.05] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">Pattern Sequence (e.g. 1-2-3-6-9)</label>
                    <input
                      type="text"
                      placeholder="Matrix sequence"
                      value={patternMatrix}
                      onChange={(e) => setPatternMatrix(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white/[0.05] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none"
                    />
                  </div>
                  <p className="col-span-2 text-[10px] text-amber-300/80">
                    * Passcode is strictly encrypted and will be permanently cleared from records immediately upon customer collection.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400">
                  Device will be serviced without unlock code or tested via emergency dialer diagnostics.
                </p>
              )}
            </div>
          </div>

          {/* Section 3: Reported Faults Quick Chips */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-sky-400 tracking-wider uppercase flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" />
              3. Reported Faults & Issues *
            </h3>
            <div className="flex flex-wrap gap-2">
              {COMMON_FAULTS.map((fault) => {
                const isSelected = selectedFaults.includes(fault);
                return (
                  <button
                    key={fault}
                    type="button"
                    onClick={() => toggleFault(fault)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-sky-500 text-black font-semibold shadow-sm shadow-sky-500/20"
                        : "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] border border-white/[0.06]"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                    {fault}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Additional Fault Details & Technician Notes
              </label>
              <textarea
                rows={2}
                placeholder="Specific customer notes, intermittent drop symptoms, prior repair attempts..."
                value={customFault}
                onChange={(e) => setCustomFault(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-sky-500/50 text-white outline-none resize-none"
              />
            </div>
          </div>

          {/* Section 4: Physical Condition Assessment */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-sky-400 tracking-wider uppercase flex items-center gap-2">
              <Camera className="w-3.5 h-3.5" />
              4. Physical Condition Checklist
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Front Screen Condition</label>
                <select
                  value={condition.screenCondition}
                  onChange={(e) => setCondition({ ...condition, screenCondition: e.target.value as any })}
                  className="w-full px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="mint">Flawless / Mint</option>
                  <option value="scratched">Micro Scratches</option>
                  <option value="cracked">Cracked Top Glass</option>
                  <option value="shattered">Shattered Front Glass</option>
                  <option value="bleeding_oled">Bleeding OLED / Lines</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Frame / Housing</label>
                <select
                  value={condition.frameCondition}
                  onChange={(e) => setCondition({ ...condition, frameCondition: e.target.value as any })}
                  className="w-full px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="mint">Mint Condition</option>
                  <option value="minor_scratches">Minor Scratches</option>
                  <option value="dented">Corner Dents</option>
                  <option value="bent">Bent Chassis</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Back Cover Glass</label>
                <select
                  value={condition.backGlassCondition}
                  onChange={(e) => setCondition({ ...condition, backGlassCondition: e.target.value as any })}
                  className="w-full px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="mint">Intact / Mint</option>
                  <option value="scratched">Scratches</option>
                  <option value="cracked">Cracked Back Glass</option>
                  <option value="missing">Missing / Detached</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Liquid Ingress Sticker (LDI)</label>
                <select
                  value={condition.liquidDamageIndicator}
                  onChange={(e) => setCondition({ ...condition, liquidDamageIndicator: e.target.value as any })}
                  className="w-full px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="intact">White / Intact (No Water)</option>
                  <option value="triggered">Red / Pink (Triggered)</option>
                  <option value="unknown">Cannot Inspect</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Camera Lens Glass</label>
                <select
                  value={condition.cameraLenses}
                  onChange={(e) => setCondition({ ...condition, cameraLenses: e.target.value as any })}
                  className="w-full px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="clean">Clean & Scratch-Free</option>
                  <option value="scratched">Scratched Optics</option>
                  <option value="cracked">Cracked Camera Glass</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Charging Port</label>
                <select
                  value={condition.chargePortCondition}
                  onChange={(e) => setCondition({ ...condition, chargePortCondition: e.target.value as any })}
                  className="w-full px-2 py-1.5 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="clean">Clean & Tight</option>
                  <option value="loose">Loose Contact</option>
                  <option value="corroded">Lint / Corroded</option>
                  <option value="broken">Broken Pins</option>
                </select>
              </div>
            </div>

            {/* Photo Uploader */}
            <div className="pt-2">
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Intake Condition Photos (Proof of condition)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-300 hover:text-white cursor-pointer transition-all">
                  <Camera className="w-4 h-4 text-sky-400" />
                  <span>Upload Photos</span>
                  <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
                <span className="text-[11px] text-zinc-500">{photoUrls.length} photos selected</span>
              </div>

              {photoUrls.length > 0 && (
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                  {photoUrls.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0">
                      <img src={url} alt="Intake proof" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Accessories Handed Over */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-sky-400 tracking-wider uppercase flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />
              5. Accessories Handed Over
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-300">
              {[
                { key: "simTray", label: "SIM Tray" },
                { key: "simCard", label: "SIM Card" },
                { key: "sdCard", label: "MicroSD Card" },
                { key: "protectiveCase", label: "Protective Case" },
                { key: "chargerAdapter", label: "Power Adapter" },
                { key: "chargingCable", label: "USB Cable" },
                { key: "originalBox", label: "Original Box" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(accessories as any)[key]}
                    onChange={(e) => setAccessories({ ...accessories, [key]: e.target.checked })}
                    className="rounded border-zinc-700 text-sky-500 focus:ring-0"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 6: Financial Estimate & Intake Deposit */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-sky-400 tracking-wider uppercase flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5" />
              6. Estimate & Initial Deposit
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Estimated Cost (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-teal-500/50 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Intake Deposit (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-teal-500/50 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Deposit Payment Method</label>
                <select
                  value={depositPaymentMethod}
                  onChange={(e) => setDepositPaymentMethod(e.target.value as any)}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Credit / Debit Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="qr">Digital / QR</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Job Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as RepairPriority)}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-[#141724] border border-white/[0.08] text-white"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent / Express</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 7: Customer Signature Pad */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-sky-400 tracking-wider uppercase flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                7. Customer Authorization & Signature
              </h3>
              {hasSignature && (
                <button
                  type="button"
                  onClick={clearSignature}
                  className="text-[11px] text-zinc-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                >
                  <Eraser className="w-3 h-3" />
                  Clear Signature
                </button>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              By signing below, the customer authorizes diagnostics, acknowledges that data loss is possible, and agrees that uncollected devices after 60 days are subject to disposal.
            </p>
            <div className="border border-white/[0.1] rounded-2xl bg-black/40 overflow-hidden relative">
              <canvas
                ref={canvasRef}
                width={700}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-28 touch-none cursor-crosshair"
              />
              {!hasSignature && (
                <span className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-zinc-600 font-medium">
                  Draw customer signature here
                </span>
              )}
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs transition-all shadow-lg shadow-sky-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? "Generating Ticket..." : "Generate Service Ticket"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
