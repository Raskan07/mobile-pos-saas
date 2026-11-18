"use client";

/**
 * app/shop/dashboard/BillTransferModal.tsx
 *
 * Clean, modern, streamlined Inter-Machine Bill Transfer Modal for Skyfox POS.
 *
 * Features:
 * - No extra tabs ("This Machine & USB Printing" and "Register Shop Terminal" removed from modal;
 *   those live in Settings -> Bill Transfer Logs).
 * - Computer icon (`Monitor`) displayed on every registered POS device card for instant visual clarity.
 * - Clean destination machine grid with friendly names ("Front Counter", "Main Billing", etc.),
 *   live online indicator, and attached USB printer badge.
 * - Streamlined transfer controls (Delivery Mode, Priority, Clear Local Bill toggle, Handover Note).
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  ArrowLeftRight,
  Monitor,
  Printer,
  CheckCircle2,
  Send,
  Zap,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";
import { CartItem, DiscountSetting } from "./posData";
import {
  PosDeviceRecord,
  BillTransferMode,
  BillTransferPriority,
  BillTransferRecord,
  TransferredBillCustomer,
} from "@/lib/types/billTransfer";
import {
  LocalDeviceIdentity,
  createInterMachineBillTransfer,
} from "@/lib/services/billTransferService";

interface BillTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  shopName: string;
  branchId: string;
  branchName: string;
  currentUser: {
    userId: string;
    username: string;
    displayName: string;
    role: string;
  };
  localDevice: LocalDeviceIdentity;
  onLocalDeviceUpdated?: (updated: PosDeviceRecord) => void;
  devices: PosDeviceRecord[];
  cart: CartItem[];
  subtotal: number;
  discountSetting: DiscountSetting;
  discountAmount: number;
  taxLabel: string;
  taxRatePct: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  preferredPaymentMethod: "cash" | "card" | "bank" | "mobile";
  selectedCustomer: TransferredBillCustomer | null;
  onTransferSuccess: (transfer: BillTransferRecord, clearLocalCart: boolean) => void;
}

export default function BillTransferModal({
  isOpen,
  onClose,
  shopId,
  branchId,
  branchName,
  currentUser,
  localDevice,
  devices,
  cart,
  subtotal,
  discountSetting,
  discountAmount,
  taxLabel,
  taxRatePct,
  taxAmount,
  grandTotal,
  currency,
  preferredPaymentMethod,
  selectedCustomer,
  onTransferSuccess,
}: BillTransferModalProps) {
  const [selectedTargetDeviceId, setSelectedTargetDeviceId] = useState<string>("");
  const [transferMode, setTransferMode] = useState<BillTransferMode>("direct_usb_print");
  const [priority, setPriority] = useState<BillTransferPriority>("normal");
  const [clearSenderCart, setClearSenderCart] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Show other shop devices first; if only this machine is registered, show all devices
  const destinationDevices = useMemo(() => {
    const others = devices.filter((d) => d.id !== localDevice.deviceId);
    return others.length > 0 ? others : devices;
  }, [devices, localDevice.deviceId]);

  useEffect(() => {
    if (destinationDevices.length > 0 && !selectedTargetDeviceId) {
      setSelectedTargetDeviceId(destinationDevices[0].id);
    } else if (
      selectedTargetDeviceId &&
      !destinationDevices.some((d) => d.id === selectedTargetDeviceId)
    ) {
      setSelectedTargetDeviceId(destinationDevices[0]?.id || "");
    }
  }, [destinationDevices, selectedTargetDeviceId]);

  if (!isOpen) return null;

  const totalItemsCount = cart.reduce((acc, c) => acc + c.quantity, 0);
  const selectedTargetDevice = destinationDevices.find((d) => d.id === selectedTargetDeviceId);

  const handleSendTransfer = async () => {
    if (!selectedTargetDevice) {
      setErrorMsg("Please select a destination machine to receive this bill.");
      return;
    }
    if (cart.length === 0) {
      setErrorMsg("Current bill is empty. Add products before transferring.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const record = await createInterMachineBillTransfer(shopId, {
        shopId,
        branchId,
        branchName,
        sourceDeviceId: localDevice.deviceId,
        sourceDeviceName: localDevice.friendlyName,
        sender: currentUser,
        targetDeviceId: selectedTargetDevice.id,
        targetDeviceName: selectedTargetDevice.friendlyName,
        transferMode,
        priority,
        clearSenderCartOnTransfer: clearSenderCart,
        autoTriggerUsbPrint: transferMode === "direct_usb_print",
        notes,
        cartItems: cart,
        subtotal,
        discountSetting,
        discountAmount,
        taxLabel,
        taxRatePct,
        taxAmount,
        grandTotal,
        currency,
        preferredPaymentMethod,
        customer: selectedCustomer,
      });

      onTransferSuccess(record, clearSenderCart);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to transfer bill.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-[#0b0d14] border border-white/[0.09] shadow-[0_24px_80px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-zinc-100">
        {/* ── CLEAN MODERN HEADER ── */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Transfer Bill to Machine
              </h2>
              <p className="text-[11px] text-zinc-400">
                From <span className="text-zinc-200 font-medium">{localDevice.friendlyName}</span> •{" "}
                <span className="font-mono text-zinc-400">{shopId}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── MODAL BODY ── */}
        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-rose-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Compact Bill Summary Pill */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-zinc-300">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">
                  {totalItemsCount} {totalItemsCount === 1 ? "Item" : "Items"} in Bill
                </div>
                <div className="text-[11px] text-zinc-400">
                  {selectedCustomer ? selectedCustomer.name : "Walk-in Guest"}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                Total Amount
              </div>
              <div className="text-base font-black font-mono text-white">
                {currency} {grandTotal.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Destination Devices Grid with Computer Icons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">
                Select Destination Machine
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                {destinationDevices.length} registered
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {destinationDevices.map((dev) => {
                const isSelected = selectedTargetDeviceId === dev.id;
                const isSelf = dev.id === localDevice.deviceId;
                return (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => setSelectedTargetDeviceId(dev.id)}
                    className={`group relative p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? "bg-indigo-500/15 border-indigo-500/60 shadow-lg shadow-indigo-950/40"
                        : "bg-white/[0.025] hover:bg-white/[0.05] border-white/[0.07]"
                    }`}
                  >
                    {/* Computer Icon for Each Device */}
                    <div
                      className={`relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-indigo-500/25 border border-indigo-400/40 text-indigo-300"
                          : "bg-white/[0.04] border border-white/[0.08] text-zinc-400 group-hover:text-zinc-200"
                      }`}
                    >
                      <Monitor className="w-5 h-5" />
                      <span
                        className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0b0d14] ${
                          dev.status === "online"
                            ? "bg-emerald-400"
                            : "bg-amber-400"
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          {dev.friendlyName}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                        {isSelf
                          ? "This Machine"
                          : dev.locationLabel || dev.branchName}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[9px] font-mono text-emerald-400/90">
                        <Printer className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">
                          {dev.usbPrintAgentEnabled ? "USB Print Ready" : "Cart Only"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clean Action Mode Selector */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-zinc-200 block">
              Receiving Machine Action
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "direct_usb_print" as BillTransferMode,
                  label: "Approve & Print",
                  sub: "Popup + Print Bill",
                },
                {
                  id: "load_to_cart" as BillTransferMode,
                  label: "Load to Cart",
                  sub: "Open in POS Cart",
                },
                {
                  id: "load_and_checkout" as BillTransferMode,
                  label: "Instant Checkout",
                  sub: "Open Payment Modal",
                },
              ].map((m) => {
                const active = transferMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTransferMode(m.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? "bg-indigo-500/15 border-indigo-500/50 text-white"
                        : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.07] text-zinc-400"
                    }`}
                  >
                    <div className="text-[11px] font-bold text-white">{m.label}</div>
                    <div className="text-[9.5px] text-zinc-400 mt-0.5">{m.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority + Clear Local Cart Row */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Priority</span>
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setPriority("normal")}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold cursor-pointer ${
                    priority === "normal"
                      ? "bg-white/15 text-white"
                      : "text-zinc-400"
                  }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setPriority("urgent")}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer ${
                    priority === "urgent"
                      ? "bg-amber-500/25 text-amber-300"
                      : "text-zinc-400"
                  }`}
                >
                  <Zap className="w-2.5 h-2.5" />
                  <span>Urgent</span>
                </button>
              </div>
            </div>

            <label className="p-2.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-zinc-300">
                Clear My Cart
              </span>
              <input
                type="checkbox"
                checked={clearSenderCart}
                onChange={(e) => setClearSenderCart(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </label>
          </div>

          {/* Optional Note */}
          <div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add optional note for receiving machine..."
              className="w-full px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="px-5 py-3.5 border-t border-white/[0.07] bg-white/[0.015] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-zinc-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !selectedTargetDevice || cart.length === 0}
            onClick={handleSendTransfer}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {isSubmitting
                ? "Sending..."
                : `Send to ${selectedTargetDevice?.friendlyName || "Machine"}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
