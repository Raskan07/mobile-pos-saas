"use client";

/**
 * components/settings/BillTransferLogsWorkspace.tsx
 *
 * Dedicated "Bill Transfer Logs" page under Settings (`/shop/settings?view=bill_transfer_logs`).
 * Default Permission: Admin Only (`settings.bill_transfer_logs`).
 *
 * Unified 3-Zone Dashboard Layout (matching user wireframe):
 * - Top Row Left:  "Shop Devices Register" (register & manage POS machines with Computer icons, configure this machine)
 * - Top Row Right: "USB Printing Queue" (live Safe USB Print Queue with idempotency lock status & manual print)
 * - Bottom Full-Width Section: "Transfer Logs" (real-time inter-machine bill transfer history, filters, inspect & load)
 */

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  Monitor,
  Printer,
  CheckCircle2,
  Search,
  ShieldCheck,
  Plus,
  Trash2,
  Eye,
  X,
  Settings,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  PosDeviceRecord,
  BillTransferRecord,
  SafePrintJobRecord,
  BillTransferStatus,
} from "@/lib/types/billTransfer";
import {
  subscribeToShopBillTransfers,
  subscribeToShopDevices,
  subscribeToShopPrintQueue,
  getOrCreateLocalDeviceIdentity,
  updatePosDeviceConfiguration,
  updateBillTransferStatus,
  claimAndExecuteSafeUsbPrintJob,
  registerCompanionShopDevice,
  removeShopDevice,
  FRIENDLY_DEVICE_PRESETS,
  sanitizeFriendlyDeviceName,
} from "@/lib/services/billTransferService";

interface BillTransferLogsWorkspaceProps {
  onBack: () => void;
  showToast: (msg: string) => void;
  currency: string;
}

export default function BillTransferLogsWorkspace({
  onBack,
  showToast,
  currency,
}: BillTransferLogsWorkspaceProps) {
  const router = useRouter();
  const { shop, user, activeBranchId, activeBranchName } = useShopAuth();

  const shopId = shop?.shopId || "SHOP-7294";
  const branchId = activeBranchId && activeBranchId !== "ALL" ? activeBranchId : "main";
  const branchName = activeBranchName || "Main Branch";

  const [transfers, setTransfers] = useState<BillTransferRecord[]>([]);
  const [devices, setDevices] = useState<PosDeviceRecord[]>([]);
  const [printQueue, setPrintQueue] = useState<SafePrintJobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<"ALL" | BillTransferStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTransfer, setSelectedTransfer] = useState<BillTransferRecord | null>(null);

  // Shop Devices Register panel state
  const [newDeviceName, setNewDeviceName] = useState("Main Billing");
  const [newDeviceLocation, setNewDeviceLocation] = useState("Central Checkout Desk");
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [editingThisMachine, setEditingThisMachine] = useState(false);
  const [myMachineName, setMyMachineName] = useState("Front Counter");

  const localDevice = useMemo(() => {
    try {
      return getOrCreateLocalDeviceIdentity(
        shopId,
        user?.displayName || user?.username || "Cashier"
      );
    } catch {
      return null;
    }
  }, [shopId, user?.displayName, user?.username]);

  useEffect(() => {
    if (localDevice?.friendlyName) {
      setMyMachineName(localDevice.friendlyName);
    }
  }, [localDevice?.friendlyName]);

  useEffect(() => {
    if (!shopId) return;
    setIsLoading(true);

    const unsubTransfers = subscribeToShopBillTransfers(shopId, (list) => {
      setTransfers(list);
      setIsLoading(false);
    });
    const unsubDevices = subscribeToShopDevices(shopId, setDevices);
    const unsubPrintQueue = subscribeToShopPrintQueue(shopId, setPrintQueue);

    return () => {
      unsubTransfers();
      unsubDevices();
      unsubPrintQueue();
    };
  }, [shopId]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter((trf) => {
      if (statusFilter !== "ALL" && trf.status !== statusFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        trf.transferCode.toLowerCase().includes(q) ||
        trf.sourceDeviceName.toLowerCase().includes(q) ||
        trf.targetDeviceName.toLowerCase().includes(q) ||
        trf.senderDisplayName.toLowerCase().includes(q) ||
        (trf.customer?.name && trf.customer.name.toLowerCase().includes(q)) ||
        (trf.notes && trf.notes.toLowerCase().includes(q))
      );
    });
  }, [transfers, statusFilter, searchQuery]);

  const handleLoadTransferToPos = async (trf: BillTransferRecord) => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          `skyfox_pending_transfer_load_${shopId}`,
          JSON.stringify(trf)
        );
      } catch {}
    }
    await updateBillTransferStatus(shopId, trf.id, "accepted", {
      userId: user?.uid || "cashier",
      displayName: user?.displayName || user?.username || "Cashier",
    });
    showToast(`Loaded ${trf.transferCode} into POS billing cart`);
    router.push("/shop/dashboard");
  };

  const handleTriggerSafeUsbPrint = async (trf: BillTransferRecord) => {
    const jobId = trf.printJobId || `pjob_${shopId}_${trf.id}`;
    const res = await claimAndExecuteSafeUsbPrintJob(
      shopId,
      localDevice?.deviceId || "DEV-LOCAL",
      jobId,
      trf,
      localDevice?.usbAgentPort || 9100
    );
    if (res.executed) {
      showToast(`Printed ${trf.transferCode} via Safe USB Print Queue`);
    } else {
      showToast(res.reason || "Duplicate print prevented by Safe Print Queue");
    }
  };

  const handleQuickAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim()) return;
    setIsAddingDevice(true);
    try {
      await registerCompanionShopDevice(shopId, branchId, branchName, {
        friendlyName: sanitizeFriendlyDeviceName(newDeviceName, "Main Billing"),
        deviceRole: "main_billing",
        locationLabel: newDeviceLocation,
        usbPrintAgentEnabled: true,
      });
      showToast(`Registered POS machine "${newDeviceName}" under ${shopId}`);
    } catch {
      showToast("Failed to register terminal");
    } finally {
      setIsAddingDevice(false);
    }
  };

  const handleUpdateThisMachineName = async () => {
    if (!myMachineName.trim()) return;
    try {
      await updatePosDeviceConfiguration(
        shopId,
        branchId,
        branchName,
        {
          userId: user?.uid || "admin",
          displayName: user?.displayName || user?.username || "Admin",
          role: user?.role || "admin",
        },
        {
          friendlyName: sanitizeFriendlyDeviceName(myMachineName, "Front Counter"),
        }
      );
      setEditingThisMachine(false);
      showToast(`Updated this machine name to "${myMachineName}"`);
    } catch {
      showToast("Failed to update machine name");
    }
  };

  const getStatusBadge = (status: BillTransferStatus) => {
    switch (status) {
      case "pending":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      case "delivered":
        return "bg-sky-500/15 text-sky-300 border-sky-500/30";
      case "accepted":
      case "completed":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      case "printed":
        return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
      case "rejected":
      case "cancelled":
        return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      default:
        return "bg-zinc-800 text-zinc-300 border-zinc-700";
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 pt-16 max-w-7xl mx-auto w-full space-y-5">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Back to Settings Menu"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold text-white tracking-tight">
                Bill Transfer Logs
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Admin Only • {shopId}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Shop Devices Register, USB Printing Queue & Inter-Machine Transfer Logs
            </p>
          </div>
        </div>

        {/* This Machine Quick Badge & Rename */}
        <div className="flex items-center gap-2">
          {editingThisMachine ? (
            <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.1] rounded-xl p-1">
              <input
                type="text"
                value={myMachineName}
                onChange={(e) => setMyMachineName(e.target.value)}
                className="px-2.5 py-1 rounded-lg bg-black/50 text-xs text-white outline-none w-36"
                placeholder="This machine name..."
              />
              <button
                type="button"
                onClick={handleUpdateThisMachineName}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 text-[11px] font-bold text-white cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingThisMachine(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingThisMachine(true)}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-200 flex items-center gap-2 cursor-pointer"
              title="Rename this POS computer"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>This PC: <strong>{myMachineName}</strong></span>
              <Settings className="w-3 h-3 text-zinc-400" />
            </button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TOP ROW: [LEFT: SHOP DEVICES REGISTER] + [RIGHT: USB PRINTING QUEUE]    */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── TOP LEFT (5 cols): SHOP DEVICES REGISTER ── */}
        <section className="lg:col-span-5 rounded-2xl bg-[#0c0e17] border border-white/[0.08] p-4 flex flex-col justify-between min-h-[320px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Monitor className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                    Shop Devices Register
                  </h2>
                  <p className="text-[10px] text-zinc-400">
                    Registered machines in {shopId} ({devices.length})
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-zinc-300">
                Friendly Names Only
              </span>
            </div>

            {/* Quick Register Form */}
            <form onSubmit={handleQuickAddDevice} className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {FRIENDLY_DEVICE_PRESETS.slice(0, 4).map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setNewDeviceName(p.name);
                      setNewDeviceLocation(p.location);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors cursor-pointer ${
                      newDeviceName === p.name
                        ? "bg-indigo-500/20 border-indigo-500/50 text-white"
                        : "bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="Friendly name (e.g. Main Billing)"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.09] text-xs text-white outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isAddingDevice}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingDevice ? "Adding..." : "Register"}</span>
                </button>
              </div>
            </form>

            {/* Registered Devices List with Computer Icons */}
            <div className="space-y-1.5 max-h-[175px] overflow-y-auto pr-1 pt-1">
              {devices.map((dev) => {
                const isThisMachine = dev.id === localDevice?.deviceId;
                return (
                  <div
                    key={dev.id}
                    className="p-2.5 rounded-xl bg-white/[0.025] hover:bg-white/[0.045] border border-white/[0.07] flex items-center justify-between gap-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                        <Monitor className="w-4 h-4" />
                        <span
                          className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                            dev.status === "online" ? "bg-emerald-400" : "bg-amber-400"
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {dev.friendlyName}
                          </span>
                          {isThisMachine && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                              This PC
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {dev.locationLabel || dev.branchName} •{" "}
                          {dev.usbPrintAgentEnabled ? "USB Printer Ready" : "Cart Only"}
                        </div>
                      </div>
                    </div>

                    {!isThisMachine && (
                      <button
                        type="button"
                        onClick={() => removeShopDevice(shopId, dev.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400 cursor-pointer shrink-0"
                        title="Remove terminal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── TOP RIGHT (7 cols): USB PRINTING QUEUE ── */}
        <section className="lg:col-span-7 rounded-2xl bg-[#0c0e17] border border-white/[0.08] p-4 flex flex-col justify-between min-h-[320px]">
          <div className="space-y-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Printer className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                    USB Printing Queue
                  </h2>
                  <p className="text-[10px] text-zinc-400">
                    Safe single-execution USB thermal print queue ({printQueue.length} jobs)
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                Duplicate Print Protection Active
              </span>
            </div>

            {printQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-xs text-zinc-500">
                <Printer className="w-7 h-7 text-zinc-600 mb-2" />
                <p className="font-semibold text-zinc-300">USB Print Queue is Clear</p>
                <p className="text-[11px] text-zinc-500 max-w-sm mt-0.5">
                  Transferred bills sent with USB printing appear here with idempotent lock protection.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[235px] rounded-xl border border-white/[0.06]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.07] bg-white/[0.03] text-[10px] uppercase font-mono text-zinc-400">
                      <th className="py-2 px-3">Bill</th>
                      <th className="py-2 px-3">Destination Machine</th>
                      <th className="py-2 px-3">Amount</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {printQueue.map((job) => (
                      <tr key={job.id} className="hover:bg-white/[0.025]">
                        <td className="py-2.5 px-3 font-mono font-bold text-white">
                          {job.transferCode}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                            <Monitor className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>{job.targetDeviceName}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">
                            {job.printerFriendlyName} ({job.paperWidth})
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-zinc-200 font-semibold">
                          {job.payloadSummary?.currency || currency}{" "}
                          {Number(job.payloadSummary?.grandTotal || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                              job.status === "printed"
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            }`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[10px] text-zinc-400">
                          {job.printedAt
                            ? new Date(job.printedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Queued"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* BOTTOM ROW: FULL-WIDTH TRANSFER LOGS                                    */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl bg-[#0c0e17] border border-white/[0.08] p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Transfer Logs
              </h2>
              <p className="text-[10px] text-zinc-400">
                Complete audit history of all bills transferred between machines ({filteredTransfers.length})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search code, machine, cashier..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.08] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(["ALL", "pending", "delivered", "accepted", "printed", "rejected"] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize border transition-all cursor-pointer ${
                      statusFilter === st
                        ? "bg-white/15 border-white/30 text-white"
                        : "bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {st === "ALL" ? "All" : st}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-xs text-zinc-400">
            Loading transfer logs...
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="p-10 text-center space-y-1.5">
            <ArrowLeftRight className="w-7 h-7 text-zinc-600 mx-auto" />
            <p className="text-xs font-bold text-zinc-300">No Bill Transfers Recorded Yet</p>
            <p className="text-[11px] text-zinc-500">
              Every bill transferred between POS computers in {shopId} will be logged here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
                  <th className="py-2.5 px-3.5">Transfer Code</th>
                  <th className="py-2.5 px-3.5">From Machine → To Machine</th>
                  <th className="py-2.5 px-3.5">Cashier / Customer</th>
                  <th className="py-2.5 px-3.5">Items & Total</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">Timestamp</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredTransfers.map((trf) => (
                  <tr key={trf.id} className="hover:bg-white/[0.025] transition-colors">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-white">
                      {trf.transferCode}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                          <Monitor className="w-3 h-3 text-zinc-400" />
                          {trf.sourceDeviceName}
                        </span>
                        <span className="text-indigo-400">→</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-200">
                          <Monitor className="w-3 h-3 text-indigo-400" />
                          {trf.targetDeviceName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="text-zinc-200 font-medium">{trf.senderDisplayName}</div>
                      <div className="text-[10px] text-zinc-400">
                        {trf.customer ? trf.customer.name : "Walk-in Guest"}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono">
                      <div className="font-bold text-white">
                        {currency} {Number(trf.grandTotal || 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {trf.itemCount} {trf.itemCount === 1 ? "item" : "items"}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${getStatusBadge(
                          trf.status
                        )}`}
                      >
                        {trf.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-[11px] text-zinc-400">
                      {new Date(trf.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedTransfer(trf)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] text-zinc-200 cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadTransferToPos(trf)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/30 text-[11px] font-semibold text-indigo-200 cursor-pointer"
                        >
                          Load to POS
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── INSPECT BILL MODAL ── */}
      {selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl bg-[#0e1019] border border-white/15 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-sm font-bold text-white font-mono">
                  {selectedTransfer.transferCode} • {selectedTransfer.sourceDeviceName} →{" "}
                  {selectedTransfer.targetDeviceName}
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Sent by {selectedTransfer.senderDisplayName} •{" "}
                  {new Date(selectedTransfer.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransfer(null)}
                className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {selectedTransfer.cartItems.map((item, idx) => (
                <div
                  key={`${item.product.id}_${idx}`}
                  className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-white">{item.product.name}</div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      Qty: {item.quantity} × {selectedTransfer.currency}{" "}
                      {(item.customPrice ?? item.product.price).toFixed(2)}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-white">
                    {selectedTransfer.currency}{" "}
                    {((item.customPrice ?? item.product.price) * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] flex items-center justify-between">
              <span className="font-bold text-zinc-300">Grand Total</span>
              <span className="text-base font-black font-mono text-white">
                {selectedTransfer.currency} {selectedTransfer.grandTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleTriggerSafeUsbPrint(selectedTransfer)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Safe USB Print</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = selectedTransfer;
                  setSelectedTransfer(null);
                  handleLoadTransferToPos(t);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
              >
                Load Bill into POS Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
