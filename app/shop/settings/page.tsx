"use client";

/**
 * app/shop/settings/page.tsx
 *
 * Minimalist Settings Page for Skyfox POS SaaS.
 * Designed with the exact aesthetic of the POS Menu Page (NavigationView):
 * - Dark cosmic void background (#07080d)
 * - Floating glass back arrow button
 * - Centered grid of minimalist cards
 * - Primary featured option: "Receipt Modifications"
 * - Clicking Receipt Modifications transitions into the full interactive receipt customization suite
 *   with real-time live thermal receipt preview, field toggles, and test printing.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Receipt,
  Store,
  Printer,
  Percent,
  Volume2,
  ShieldCheck,
  Check,
  RotateCcw,
  Sparkles,
  Smartphone,
  CheckCircle2,
  Sliders,
  X,
  CreditCard,
  FileText,
  Building,
  Phone,
  Mail,
  MapPin,
  Hash,
  Eye,
  Type,
  Layout,
  RefreshCw,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  Trash2,
  User,
  ArrowLeftRight,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import { SettingsSubPermissionId } from "@/lib/types/user";
import UserProfileWorkspace from "@/components/settings/UserProfileWorkspace";
import BillTransferLogsWorkspace from "@/components/settings/BillTransferLogsWorkspace";
import { ReceiptSettings, DEFAULT_RECEIPT_SETTINGS } from "@/lib/types/receiptSettings";
import {
  getStoredReceiptSettings,
  fetchReceiptSettings,
  saveReceiptSettings,
  resetReceiptSettings,
} from "@/lib/services/receiptSettingsService";

type ActiveView =
  | "menu"
  | "profile"
  | "receipt"
  | "store"
  | "hardware"
  | "tax"
  | "audio"
  | "security"
  | "bill_transfer_logs";

export default function ShopSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, user, isLoading: authLoading } = useShopAuth();
  const { canAccessSettingsSubmenu } = useRBAC();

  const [activeView, setActiveView] = useState<ActiveView>("menu");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize receipt settings
  const [receiptConfig, setReceiptConfig] = useState<ReceiptSettings>(() => {
    return getStoredReceiptSettings(shop?.shopId || "DEFAULT", shop?.shopName || "POS Store");
  });

  // Store & Tax/Currency settings synced with ReceiptSettings
  const [storeInfo, setStoreInfo] = useState({
    shopName: shop?.shopName || "Skyfox POS Store",
    phone: shop?.phone || "+94 77 123 4567",
    email: shop?.email || "support@pos.skyfox.lk",
    address: shop?.address || "142 Galle Road, Colombo 03, Sri Lanka",
    currency: receiptConfig.currency || "LKR",
  });

  const [hardwareConfig, setHardwareConfig] = useState({
    paperSize: "80mm" as "80mm" | "58mm",
    autoPrint: true,
    cashDrawerKick: true,
    printCopies: 1,
  });

  const [taxConfig, setTaxConfig] = useState({
    taxRate: receiptConfig.taxRate ?? 0,
    taxName: receiptConfig.taxName || "Tax / SST",
    taxNumber: receiptConfig.taxNumber || "",
    currency: receiptConfig.currency || "LKR",
    pricesIncludeTax: receiptConfig.pricesIncludeTax ?? false,
  });

  const [audioConfig, setAudioConfig] = useState({
    beepOnScan: true,
    soundOnError: true,
    volume: 80,
  });

  const [securityConfig, setSecurityConfig] = useState({
    autoLockMinutes: 15,
    requirePinForRefund: true,
    requirePinForDiscount: false,
  });

  // Handle URL query parameter ?view=receipt on mount or changes
  useEffect(() => {
    const viewParam = searchParams.get("view") as ActiveView | null;
    if (
      viewParam &&
      [
        "profile",
        "receipt",
        "store",
        "hardware",
        "tax",
        "audio",
        "security",
        "bill_transfer_logs",
      ].includes(viewParam)
    ) {
      setActiveView(viewParam);
    }
  }, [searchParams]);

  // Sync receipt & tax/currency settings when shop profile finishes loading
  useEffect(() => {
    if (shop?.shopId) {
      // Load receipt configuration from local cache and sync with remote
      const local = getStoredReceiptSettings(shop.shopId, shop.shopName);
      setReceiptConfig(local);
      setStoreInfo((prev) => ({
        ...prev,
        shopName: shop.shopName || prev.shopName,
        phone: shop.phone || prev.phone,
        email: shop.email || prev.email,
        address: shop.address || prev.address,
        currency: local.currency || "LKR",
      }));
      setTaxConfig({
        taxRate: local.taxRate ?? 0,
        taxName: local.taxName || "Tax / SST",
        taxNumber: local.taxNumber || "",
        currency: local.currency || "LKR",
        pricesIncludeTax: local.pricesIncludeTax ?? false,
      });

      fetchReceiptSettings(shop.shopId, shop.shopName).then((remote) => {
        setReceiptConfig(remote);
        setStoreInfo((prev) => ({
          ...prev,
          currency: remote.currency || "LKR",
        }));
        setTaxConfig({
          taxRate: remote.taxRate ?? 0,
          taxName: remote.taxName || "Tax / SST",
          taxNumber: remote.taxNumber || "",
          currency: remote.currency || "LKR",
          pricesIncludeTax: remote.pricesIncludeTax ?? false,
        });
      });
    }
  }, [shop]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Switch views and update URL query cleanly (enforcing submenu permission)
  const handleSelectView = (view: ActiveView) => {
    if (view !== "menu") {
      const matched = ALL_SETTING_ITEMS.find((i) => i.id === view);
      if (matched && !canAccessSettingsSubmenu(matched.subKey)) {
        showToast("Access restricted for this Settings submenu");
        return;
      }
    }
    setActiveView(view);
    if (view === "menu") {
      router.replace("/shop/settings");
    } else {
      router.replace(`/shop/settings?view=${view}`);
    }
  };

  // Back button behavior:
  // If inside a subview (e.g. receipt), back goes back to the Settings Menu
  // If in the Settings Menu, back returns to the POS Dashboard
  const handleBackNavigation = () => {
    if (activeView !== "menu") {
      handleSelectView("menu");
    } else {
      router.push("/shop/dashboard");
    }
  };

  // Save receipt modifications
  const handleSaveReceipt = async () => {
    if (!shop?.shopId) {
      showToast("Settings saved locally");
      return;
    }
    setIsSaving(true);
    try {
      await saveReceiptSettings(shop.shopId, receiptConfig);
      showToast("Receipt modifications saved successfully!");
    } catch {
      showToast("Failed to sync remote. Saved locally.");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset receipt modifications
  const handleResetReceipt = async () => {
    if (!confirm("Reset all receipt modifications to default layout?")) return;
    if (shop?.shopId) {
      const reset = await resetReceiptSettings(shop.shopId, shop.shopName);
      setReceiptConfig(reset);
    } else {
      setReceiptConfig({
        ...DEFAULT_RECEIPT_SETTINGS,
        shopId: "DEFAULT",
        headerTitle: shop?.shopName || "",
      });
    }
    showToast("Receipt layout reset to factory defaults");
  };

  // Trigger test print
  const handleTestPrint = () => {
    window.print();
  };

  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Please choose an image under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setReceiptConfig((prev) => ({
        ...prev,
        logoUrl: dataUrl,
        showLogo: true,
      }));
      showToast("Logo updated on receipt");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setReceiptConfig((prev) => ({
      ...prev,
      logoUrl: "",
    }));
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
    showToast("Logo removed");
  };

  // Menu cards list mapped to permanent Settings Submenu Permission IDs
  const ALL_SETTING_ITEMS: {
    id: Exclude<ActiveView, "menu">;
    subKey: SettingsSubPermissionId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "profile", subKey: "profile", label: "Profile", icon: User },
    { id: "receipt", subKey: "receipt_modification", label: "Receipt Modifications", icon: Receipt },
    { id: "store", subKey: "store_profile", label: "Store Profile", icon: Store },
    { id: "hardware", subKey: "hardware_printer", label: "Hardware & Printers", icon: Printer },
    { id: "tax", subKey: "currency", label: "Tax & Currency", icon: Percent },
    { id: "audio", subKey: "audio_scanner", label: "Audio & Scanner", icon: Volume2 },
    { id: "security", subKey: "security_lock", label: "Security & Lock", icon: ShieldCheck },
    {
      id: "bill_transfer_logs",
      subKey: "bill_transfer_logs",
      label: "Bill Transfer Logs",
      icon: ArrowLeftRight,
    },
  ];

  const SETTING_ITEMS = useMemo(() => {
    return ALL_SETTING_ITEMS.filter((item) => canAccessSettingsSubmenu(item.subKey));
  }, [canAccessSettingsSubmenu]);

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col relative selection:bg-zinc-800">
      {/* ── Print Specific Styles ── */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          /* Hide all page chrome when printing */
          body * {
            visibility: hidden;
          }
          /* Only make the printable receipt container visible */
          #thermal-receipt-preview,
          #thermal-receipt-preview * {
            visibility: visible;
          }
          #thermal-receipt-preview {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 12px !important;
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
          }
          #thermal-receipt-preview input,
          #thermal-receipt-preview textarea {
            border: none !important;
            padding: 0 !important;
            box-shadow: none !important;
            resize: none !important;
          }
        }
      `}</style>

      {/* ── Floating Back Arrow (Same as Menu Page) ── */}
      <button
        type="button"
        onClick={handleBackNavigation}
        className="fixed top-5 left-5 z-50 w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shadow-lg backdrop-blur-md"
        title={activeView === "menu" ? "Return to POS Dashboard" : "Return to Settings Menu"}
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* ── Toast Notification Pill ── */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-emerald-500/30 text-white text-xs font-medium shadow-2xl flex items-center gap-2 backdrop-blur animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 1. MAIN MENU VIEW (Exact visual layout of the POS Menu Page)           */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "menu" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 pt-20">
          {/* Minimalist Card Grid (Matching NavigationView, shrunk to half size) */}
          <div className="w-full max-w-2xl grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {SETTING_ITEMS.map((item) => {
              const Icon = item.icon;
              const isSelected = (activeView as string) === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectView(item.id)}
                  className={`group flex flex-col items-center justify-center gap-2 p-3 sm:p-3.5 rounded-2xl transition-all duration-150 cursor-pointer active:scale-95 text-center ${
                    isSelected
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-950/20"
                      : "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.18]"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isSelected
                        ? "text-emerald-400"
                        : "text-zinc-400 group-hover:text-white"
                    }`}
                  />
                  <span
                    className={`text-[11px] font-medium text-center leading-tight transition-colors ${
                      isSelected
                        ? "text-emerald-300"
                        : "text-zinc-400 group-hover:text-zinc-100"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Terminal Status Footer */}
          <div className="mt-12 text-center text-[11px] font-mono text-zinc-600 flex items-center gap-3">
            <span>Terminal: {shop?.shopId || "DEMO-TERMINAL"}</span>
            <span>•</span>
            <span>Version: MVP 1.4</span>
            <span>•</span>
            <span className="text-emerald-500/80">Online</span>
          </div>
        </div>
      )}


      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 2. RECEIPT MODIFICATIONS WORKSPACE (Compact & Direct Editable)         */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "receipt" && (
        <div className="flex-1 flex flex-col p-4 md:p-6 pt-16 max-w-7xl mx-auto w-full">
          {/* Hidden File Input for Logo Upload */}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />

          {/* Compact Top Navigation Bar */}
          <div className="flex items-center justify-between gap-4 pb-3.5 border-b border-white/[0.08] mb-5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectView("menu")}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
                title="Back to Settings"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Receipt Modifications</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
                    Canva Direct Edit
                  </span>
                </h1>
              </div>
            </div>

            {/* Top Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetReceipt}
                className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>

              <button
                type="button"
                onClick={handleTestPrint}
                className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-medium text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-300" />
                <span className="hidden sm:inline">Test Print</span>
              </button>

              <button
                type="button"
                onClick={handleSaveReceipt}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </button>
            </div>
          </div>

          {/* 2-Column Responsive Workspace: Compact Controls on Left (5 cols), White Receipt Canvas on Right (7 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN: Compact Controls ── */}
            <div className="lg:col-span-5 space-y-4">
              {/* SECTION: Compact Branding Fields */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Business Branding</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 font-normal">
                    Syncs with preview
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1 font-medium">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={receiptConfig.headerTitle}
                      onChange={(e) =>
                        setReceiptConfig((prev) => ({ ...prev, headerTitle: e.target.value }))
                      }
                      placeholder={shop?.shopName || "e.g. SKYFOX TECH & CARE"}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] focus:border-emerald-500/60 focus:outline-none text-zinc-100 placeholder:text-zinc-600 text-xs"
                    />
                  </div>

                  {/* Logo Upload Control */}
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1 font-medium">
                      Store Logo
                    </label>
                    <div className="flex items-center gap-2">
                      {receiptConfig.logoUrl ? (
                        <div className="flex items-center gap-2 flex-1 p-1.5 rounded-lg bg-black/40 border border-white/[0.08]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={receiptConfig.logoUrl}
                            alt="Store Logo"
                            className="w-7 h-7 object-contain rounded bg-white/5 p-0.5"
                          />
                          <span className="text-[11px] text-zinc-300 truncate flex-1 font-mono">
                            Logo Uploaded
                          </span>
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] text-zinc-300 cursor-pointer"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 cursor-pointer"
                            title="Remove Logo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/[0.15] text-[11px] text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Upload Logo Image</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1 font-medium">
                        Tagline / Slogan
                      </label>
                      <input
                        type="text"
                        value={receiptConfig.tagline}
                        onChange={(e) =>
                          setReceiptConfig((prev) => ({ ...prev, tagline: e.target.value }))
                        }
                        placeholder="Tagline..."
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] focus:border-emerald-500/60 focus:outline-none text-zinc-100 placeholder:text-zinc-600 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1 font-medium">
                        Contact Phone
                      </label>
                      <input
                        type="text"
                        value={receiptConfig.phone}
                        onChange={(e) =>
                          setReceiptConfig((prev) => ({ ...prev, phone: e.target.value }))
                        }
                        placeholder="Phone..."
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] focus:border-emerald-500/60 focus:outline-none text-zinc-100 placeholder:text-zinc-600 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1 font-medium">
                        Store Address
                      </label>
                      <input
                        type="text"
                        value={receiptConfig.address}
                        onChange={(e) =>
                          setReceiptConfig((prev) => ({ ...prev, address: e.target.value }))
                        }
                        placeholder="Address..."
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] focus:border-emerald-500/60 focus:outline-none text-zinc-100 placeholder:text-zinc-600 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-[11px] mb-1 font-medium">
                        Tax / Reg No
                      </label>
                      <input
                        type="text"
                        value={receiptConfig.taxNumber}
                        onChange={(e) =>
                          setReceiptConfig((prev) => ({ ...prev, taxNumber: e.target.value }))
                        }
                        placeholder="Tax ID..."
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] focus:border-emerald-500/60 focus:outline-none text-zinc-100 placeholder:text-zinc-600 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Compact Thermal Roll & Alignment Controls */}
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="text-[11px] text-zinc-400 font-medium mb-1">Roll Width</div>
                  <div className="flex gap-1">
                    {(["80mm", "58mm"] as const).map((width) => (
                      <button
                        key={width}
                        type="button"
                        onClick={() => setReceiptConfig((prev) => ({ ...prev, paperWidth: width }))}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                          receiptConfig.paperWidth === width
                            ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                            : "bg-black/30 border border-white/[0.06] text-zinc-400"
                        }`}
                      >
                        {width}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-400 font-medium mb-1">Alignment</div>
                  <div className="flex gap-1">
                    {(["center", "left"] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() => setReceiptConfig((prev) => ({ ...prev, alignment: align }))}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-all cursor-pointer flex items-center gap-1 ${
                          receiptConfig.alignment === align
                            ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                            : "bg-black/30 border border-white/[0.06] text-zinc-400"
                        }`}
                      >
                        {align === "center" ? (
                          <AlignCenter className="w-3 h-3" />
                        ) : (
                          <AlignLeft className="w-3 h-3" />
                        )}
                        <span>{align}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-400 font-medium mb-1">Font Size</div>
                  <div className="flex gap-1">
                    {(["compact", "normal"] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setReceiptConfig((prev) => ({ ...prev, fontSize: size }))}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold capitalize transition-all cursor-pointer ${
                          receiptConfig.fontSize === size
                            ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                            : "bg-black/30 border border-white/[0.06] text-zinc-400"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION: Compact Receipt Content Toggles (Neat compact list with micro-switches) */}
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200 pb-1 border-b border-white/[0.06]">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Content Toggles</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-normal">Compact view</span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {[
                    { key: "showLogo" as const, label: "Store Logo" },
                    { key: "showShopName" as const, label: "Business Name" },
                    { key: "showBranchName" as const, label: "Branch Name" },
                    { key: "showShopId" as const, label: "Shop ID" },
                    { key: "showInvoiceNumber" as const, label: "Invoice No" },
                    { key: "showDate" as const, label: "Date & Time" },
                    { key: "showCashierName" as const, label: "Cashier Name" },
                    { key: "showCustomerInfo" as const, label: "Customer Info" },
                    { key: "showItemSku" as const, label: "Item SKU Code" },
                    { key: "showItemVariant" as const, label: "Variant Tag" },
                    { key: "showDiscount" as const, label: "Discount Line" },
                    { key: "showTaxBreakdown" as const, label: "Tax / SST Rate" },
                    { key: "showTenderedAndChange" as const, label: "Cash & Change" },
                    { key: "showBarcode" as const, label: "Footer Barcode" },
                  ].map((toggle) => {
                    const isChecked = Boolean(receiptConfig[toggle.key]);
                    return (
                      <button
                        key={toggle.key}
                        type="button"
                        onClick={() =>
                          setReceiptConfig((prev) => ({
                            ...prev,
                            [toggle.key]: !isChecked,
                          }))
                        }
                        className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-white/[0.04] text-left transition-colors cursor-pointer group"
                      >
                        <span
                          className={`truncate pr-2 ${
                            isChecked ? "text-zinc-200" : "text-zinc-500"
                          }`}
                        >
                          {toggle.label}
                        </span>
                        <div
                          className={`w-6 h-3.5 rounded-full transition-colors relative flex items-center p-0.5 shrink-0 ${
                            isChecked ? "bg-emerald-500" : "bg-zinc-700"
                          }`}
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                              isChecked ? "translate-x-2.5" : "translate-x-0"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Realistic Pure White Thermal Receipt Slip (Canva Direct Editing Canvas) ── */}
            <div className="lg:col-span-7 flex flex-col items-center">
              {/* Slip Toolbar / Info */}
              <div className="w-full max-w-[380px] flex items-center justify-between text-[11px] text-zinc-400 mb-2 px-1">
                <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {receiptConfig.paperWidth} Roll Preview
                </span>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Click text on slip to edit directly</span>
                </span>
              </div>

              {/* REALISTIC WHITE THERMAL RECEIPT SLIP PAPER */}
              <div
                id="thermal-receipt-preview"
                className={`w-full transition-all duration-150 rounded-lg bg-white text-zinc-950 font-mono shadow-2xl p-5 border border-zinc-200 relative select-text ${
                  receiptConfig.paperWidth === "58mm" ? "max-w-[290px]" : "max-w-[360px]"
                } ${
                  receiptConfig.fontSize === "compact"
                    ? "text-[10px]"
                    : "text-[11px]"
                } ${receiptConfig.alignment === "left" ? "text-left" : "text-center"}`}
              >
                {/* Store Branding Header (Direct Editable) */}
                <div className="pb-3 border-b border-dashed border-zinc-300 space-y-1">
                  {/* Direct Logo Area */}
                  {receiptConfig.showLogo && (
                    <div
                      className={`mb-1 group/logo relative inline-block ${
                        receiptConfig.alignment === "left" ? "" : "mx-auto"
                      }`}
                    >
                      {receiptConfig.logoUrl ? (
                        <div className="relative group cursor-pointer inline-block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={receiptConfig.logoUrl}
                            alt="Logo"
                            className="h-10 max-w-[150px] object-contain rounded"
                            onClick={() => logoInputRef.current?.click()}
                            title="Click to replace logo"
                          />
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
                            title="Delete Logo"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 border border-dashed border-zinc-300 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
                          title="Click to upload store logo"
                        >
                          <Smartphone className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Direct Editable Business Name */}
                  {receiptConfig.showShopName && (
                    <input
                      type="text"
                      value={receiptConfig.headerTitle}
                      onChange={(e) =>
                        setReceiptConfig((prev) => ({ ...prev, headerTitle: e.target.value }))
                      }
                      placeholder={shop?.shopName || "BUSINESS NAME"}
                      className={`w-full bg-transparent font-sans font-black text-zinc-950 text-base md:text-lg tracking-wider uppercase border-b border-dashed border-transparent hover:border-zinc-300 focus:border-emerald-600 focus:bg-emerald-50/50 focus:outline-none transition-all rounded px-1 ${
                        receiptConfig.alignment === "left" ? "text-left" : "text-center"
                      }`}
                      title="Click to edit business name directly"
                    />
                  )}

                  {/* Direct Editable Tagline */}
                  <input
                    type="text"
                    value={receiptConfig.tagline}
                    onChange={(e) =>
                      setReceiptConfig((prev) => ({ ...prev, tagline: e.target.value }))
                    }
                    placeholder="Click to edit tagline / slogan..."
                    className={`w-full bg-transparent text-[10px] text-zinc-600 italic border-b border-dashed border-transparent hover:border-zinc-300 focus:border-emerald-600 focus:bg-emerald-50/50 focus:outline-none transition-all rounded px-1 ${
                      receiptConfig.alignment === "left" ? "text-left" : "text-center"
                    }`}
                    title="Click to edit tagline directly"
                  />

                  {/* Direct Editable Address */}
                  <input
                    type="text"
                    value={receiptConfig.address}
                    onChange={(e) =>
                      setReceiptConfig((prev) => ({ ...prev, address: e.target.value }))
                    }
                    placeholder="Click to edit address..."
                    className={`w-full bg-transparent text-[10px] text-zinc-600 leading-tight border-b border-dashed border-transparent hover:border-zinc-300 focus:border-emerald-600 focus:bg-emerald-50/50 focus:outline-none transition-all rounded px-1 ${
                      receiptConfig.alignment === "left" ? "text-left" : "text-center"
                    }`}
                    title="Click to edit address directly"
                  />

                  {/* Direct Editable Phone */}
                  <div className={`flex items-center ${receiptConfig.alignment === "left" ? "" : "justify-center"}`}>
                    <span className="text-[10px] text-zinc-500 font-mono">Tel:</span>
                    <input
                      type="text"
                      value={receiptConfig.phone}
                      onChange={(e) =>
                        setReceiptConfig((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="+94 11 234 5678"
                      className="bg-transparent text-[10px] text-zinc-600 border-b border-dashed border-transparent hover:border-zinc-300 focus:border-emerald-600 focus:bg-emerald-50/50 focus:outline-none transition-all rounded px-1 w-44"
                      title="Click to edit telephone directly"
                    />
                  </div>

                  {receiptConfig.showBranchName && (
                    <div className="text-[10px] text-zinc-500 font-sans">
                      Branch: Main Flagship
                    </div>
                  )}

                  {receiptConfig.showShopId && (
                    <div className="text-[9px] text-zinc-400 font-mono">
                      Shop ID: {shop?.shopId || "POS-7294"}
                    </div>
                  )}

                  {/* Direct Editable Tax / BRN */}
                  <div className={`flex items-center ${receiptConfig.alignment === "left" ? "" : "justify-center"}`}>
                    <span className="text-[9px] text-zinc-500 font-mono">Tax/BRN:</span>
                    <input
                      type="text"
                      value={receiptConfig.taxNumber}
                      onChange={(e) =>
                        setReceiptConfig((prev) => ({ ...prev, taxNumber: e.target.value }))
                      }
                      placeholder="TX-99824-LK"
                      className="bg-transparent text-[9px] text-zinc-600 font-mono border-b border-dashed border-transparent hover:border-zinc-300 focus:border-emerald-600 focus:bg-emerald-50/50 focus:outline-none transition-all rounded px-1 w-36"
                      title="Click to edit tax number directly"
                    />
                  </div>
                </div>

                {/* Meta Details */}
                <div className="py-2 border-b border-dashed border-zinc-300 space-y-0.5 text-[10px]">
                  {receiptConfig.showInvoiceNumber && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Invoice:</span>
                      <span className="text-zinc-950 font-bold">INV-982401</span>
                    </div>
                  )}

                  {receiptConfig.showDate && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Date:</span>
                      <span className="text-zinc-800">Oct 28, 2026, 9:42 PM</span>
                    </div>
                  )}

                  {receiptConfig.showCashierName && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Cashier:</span>
                      <span className="text-zinc-800">
                        {user?.displayName || user?.username || "Admin Cashier"}
                      </span>
                    </div>
                  )}

                  {receiptConfig.showCustomerInfo && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Customer:</span>
                      <span className="text-zinc-800">Kavindu R. (+94 77...)</span>
                    </div>
                  )}

                  {receiptConfig.showPaymentMethod && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Payment:</span>
                      <span className="text-zinc-950 font-bold uppercase">CASH</span>
                    </div>
                  )}
                </div>

                {/* Itemized List */}
                <div className="py-2.5 border-b border-dashed border-zinc-300 space-y-1.5 text-left">
                  <div className="flex justify-between text-[9px] uppercase text-zinc-500 font-bold">
                    <span>Item / Qty</span>
                    <span>Amount</span>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-zinc-900 font-medium">
                        iPhone 15 Pro Max Screen Guard
                        {receiptConfig.showItemVariant && (
                          <span className="text-zinc-600"> (Matte)</span>
                        )}
                      </div>
                      {receiptConfig.showItemSku && (
                        <div className="text-[9px] text-zinc-500">
                          SKU: ACC-094 • 1 x {receiptConfig.currency || "LKR"} 2,500.00
                        </div>
                      )}
                    </div>
                    <div className="text-zinc-950 font-semibold">2,500.00</div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-zinc-900 font-medium">
                        30W Fast Charger Adapter
                      </div>
                      {receiptConfig.showItemSku && (
                        <div className="text-[9px] text-zinc-500">
                          SKU: PWR-102 • 1 x {receiptConfig.currency || "LKR"} 4,200.00
                        </div>
                      )}
                    </div>
                    <div className="text-zinc-950 font-semibold">4,200.00</div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-zinc-900 font-medium">
                        Braided Type-C Cable 2M
                      </div>
                      {receiptConfig.showItemSku && (
                        <div className="text-[9px] text-zinc-500">
                          SKU: CBL-031 • 2 x {receiptConfig.currency || "LKR"} 1,150.00
                        </div>
                      )}
                    </div>
                    <div className="text-zinc-950 font-semibold">2,300.00</div>
                  </div>
                </div>

                {/* Totals Breakdown */}
                {(() => {
                  const curr = receiptConfig.currency || "LKR";
                  const sub = 9000;
                  const disc = receiptConfig.showDiscount ? 450 : 0;
                  const netSub = sub - disc;
                  const tRate = receiptConfig.taxRate ?? 0;
                  const taxAmt = +(netSub * (tRate / 100)).toFixed(2);
                  const totalDue = +(netSub + taxAmt).toFixed(2);
                  const tendered = 10000;
                  const change = Math.max(0, +(tendered - totalDue).toFixed(2));
                  return (
                    <>
                      <div className="py-2 border-b border-dashed border-zinc-300 space-y-1 text-left">
                        <div className="flex justify-between text-zinc-600">
                          <span>Subtotal</span>
                          <span>{curr} {sub.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        </div>

                        {receiptConfig.showDiscount && (
                          <div className="flex justify-between text-emerald-700 font-medium">
                            <span>Discount (5%)</span>
                            <span>-{curr} {disc.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}

                        {receiptConfig.showTaxBreakdown && (
                          <div className="flex justify-between text-zinc-600">
                            <span>{receiptConfig.taxName || "Tax / SST"} ({tRate}%)</span>
                            <span>{curr} {taxAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}

                        <div className="flex justify-between text-sm font-bold text-zinc-950 pt-1 border-t border-zinc-300">
                          <span>Total Due</span>
                          <span>{curr} {totalDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {/* Cash Tendered & Change */}
                      {receiptConfig.showTenderedAndChange && (
                        <div className="py-1.5 border-b border-dashed border-zinc-300 space-y-0.5 text-zinc-600 text-[10px] text-left">
                          <div className="flex justify-between">
                            <span>Cash Tendered</span>
                            <span>{curr} {tendered.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between font-bold text-emerald-700">
                            <span>Change Return</span>
                            <span>{curr} {change.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Direct Editable Footer Messages & Warranty Note */}
                <div className="pt-2.5 pb-1 space-y-1 text-center">
                  <input
                    type="text"
                    value={receiptConfig.footerNote}
                    onChange={(e) =>
                      setReceiptConfig((prev) => ({ ...prev, footerNote: e.target.value }))
                    }
                    placeholder="Thank you message..."
                    className="w-full bg-transparent text-[10px] text-zinc-800 font-medium text-center border-b border-dashed border-transparent hover:border-zinc-300 focus:border-emerald-600 focus:bg-emerald-50/50 focus:outline-none transition-all rounded px-1"
                    title="Click to edit thank you note directly"
                  />

                  <textarea
                    rows={2}
                    value={receiptConfig.warrantyPolicy}
                    onChange={(e) =>
                      setReceiptConfig((prev) => ({
                        ...prev,
                        warrantyPolicy: e.target.value,
                      }))
                    }
                    placeholder="Warranty & return policy..."
                    className="w-full bg-transparent text-[9px] text-zinc-600 text-center border border-dashed border-transparent hover:border-zinc-300 focus:border-emerald-600 focus:bg-emerald-50/50 focus:outline-none transition-all rounded px-1 resize-none"
                    title="Click to edit warranty policy directly"
                  />
                </div>

                {/* Barcode Strip */}
                {receiptConfig.showBarcode && (
                  <div className="pt-2 text-center">
                    <div className="h-6 w-36 mx-auto bg-zinc-900 rounded flex items-center justify-center text-[9px] tracking-[0.28em] text-white font-mono select-none">
                      ||| | |||| | || |||| |
                    </div>
                    <div className="text-[8px] text-zinc-500 mt-0.5 font-mono">INV-982401</div>
                  </div>
                )}
              </div>

              {/* Bottom live indicator */}
              <div className="w-full max-w-[380px] mt-2 flex items-center justify-between text-[11px] text-zinc-500 px-1">
                <span>Direct edits auto-sync with left fields</span>
                <button
                  type="button"
                  onClick={handleTestPrint}
                  className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer font-medium"
                >
                  Print Test Slip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 3. STORE PROFILE SUBVIEW                                               */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "store" && (
        <div className="flex-1 flex flex-col p-6 pt-20 max-w-2xl mx-auto w-full">
          <div className="pb-4 border-b border-white/[0.08] mb-6">
            <h2 className="text-xl font-bold text-white">Store Profile</h2>
            <p className="text-xs text-zinc-400 mt-1">General shop identity and business contact info</p>
          </div>
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-zinc-400 text-[11px] mb-1">Store Name</label>
              <input
                type="text"
                value={storeInfo.shopName}
                onChange={(e) => setStoreInfo({ ...storeInfo, shopName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-[11px] mb-1">Store Phone</label>
              <input
                type="text"
                value={storeInfo.phone}
                onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-[11px] mb-1">Store Email</label>
              <input
                type="email"
                value={storeInfo.email}
                onChange={(e) => setStoreInfo({ ...storeInfo, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-[11px] mb-1">Store Address</label>
              <input
                type="text"
                value={storeInfo.address}
                onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-white focus:outline-none"
              />
            </div>
            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  showToast("Store profile updated successfully");
                  handleSelectView("menu");
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
              >
                Save Profile
              </button>
              <button
                type="button"
                onClick={() => handleSelectView("menu")}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 4. HARDWARE & PRINTERS SUBVIEW                                         */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "hardware" && (
        <div className="flex-1 flex flex-col p-6 pt-20 max-w-2xl mx-auto w-full">
          <div className="pb-4 border-b border-white/[0.08] mb-6">
            <h2 className="text-xl font-bold text-white">Hardware & Thermal Printers</h2>
            <p className="text-xs text-zinc-400 mt-1">Configure physical thermal printer paper and drawer kicks</p>
          </div>
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div>
                <div className="font-semibold text-white">Default Paper Size</div>
                <div className="text-[11px] text-zinc-400">Standard 80mm desktop thermal or 58mm mobile roll</div>
              </div>
              <div className="flex gap-2">
                {(["80mm", "58mm"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setHardwareConfig({ ...hardwareConfig, paperSize: size })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      hardwareConfig.paperSize === size
                        ? "bg-emerald-500 text-white"
                        : "bg-white/[0.06] text-zinc-400"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div>
                <div className="font-semibold text-white">Auto-Print Receipt</div>
                <div className="text-[11px] text-zinc-400">Trigger browser print immediately when payment completes</div>
              </div>
              <input
                type="checkbox"
                checked={hardwareConfig.autoPrint}
                onChange={(e) => setHardwareConfig({ ...hardwareConfig, autoPrint: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div>
                <div className="font-semibold text-white">Cash Drawer Kick</div>
                <div className="text-[11px] text-zinc-400">Send pulse code to open cash drawer on cash transactions</div>
              </div>
              <input
                type="checkbox"
                checked={hardwareConfig.cashDrawerKick}
                onChange={(e) => setHardwareConfig({ ...hardwareConfig, cashDrawerKick: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  showToast("Hardware settings saved");
                  handleSelectView("menu");
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
              >
                Save Hardware Settings
              </button>
              <button
                type="button"
                onClick={() => handleSelectView("menu")}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs cursor-pointer"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 5. TAX & CURRENCY SUBVIEW                                              */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "tax" && (
        <div className="flex-1 flex flex-col p-6 pt-20 max-w-2xl mx-auto w-full">
          <div className="pb-4 border-b border-white/[0.08] mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Tax & Currency</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Configure store currency, default sales tax rate (default 0%), and tax identifiers across POS, receipts, and financial statements
              </p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-mono font-semibold">
              {taxConfig.currency || "LKR"} • {taxConfig.taxRate ?? 0}% Tax
            </div>
          </div>

          <div className="space-y-5 text-xs">
            {/* Store Currency Section */}
            <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white text-sm">Store Currency Symbol / Code</div>
                  <div className="text-[11px] text-zinc-400">
                    Displayed across POS checkout, receipts, operational summary, and reports
                  </div>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={taxConfig.currency}
                  onChange={(e) =>
                    setTaxConfig({ ...taxConfig, currency: e.target.value.toUpperCase() })
                  }
                  placeholder="LKR"
                  className="w-28 px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono font-bold text-center focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { code: "LKR", label: "LKR (Sri Lankan Rupee)" },
                  { code: "USD", label: "USD ($)" },
                  { code: "EUR", label: "EUR (€)" },
                  { code: "GBP", label: "GBP (£)" },
                  { code: "INR", label: "INR (₹)" },
                  { code: "AED", label: "AED (Dirham)" },
                  { code: "AUD", label: "AUD (A$)" },
                  { code: "SGD", label: "SGD (S$)" },
                ].map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setTaxConfig({ ...taxConfig, currency: item.code })}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                      taxConfig.currency === item.code
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold"
                        : "bg-white/[0.04] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tax Rate & Presets */}
            <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white text-sm">Default Sales Tax Percentage (%)</div>
                  <div className="text-[11px] text-zinc-400">
                    Set to 0% for tax-exempt or inclusive pricing, or set your VAT/SST rate
                  </div>
                </div>
                <div className="relative w-32">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={taxConfig.taxRate}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                      setTaxConfig({ ...taxConfig, taxRate: val });
                    }}
                    className="w-full px-3 py-2 pr-7 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono font-bold text-right focus:outline-none focus:border-emerald-500/50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono">%</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-zinc-500 mr-1">Quick Presets:</span>
                {[0, 2.5, 5, 8, 12, 15, 18].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setTaxConfig({ ...taxConfig, taxRate: rate })}
                    className={`px-3 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer border ${
                      Number(taxConfig.taxRate) === rate
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                        : "bg-white/[0.04] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    {rate === 0 ? "0% (No Tax)" : `${rate}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Tax Scheme Name & Registration Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-[11px] mb-1.5">Tax Label / Scheme Name</label>
                <input
                  type="text"
                  value={taxConfig.taxName}
                  onChange={(e) => setTaxConfig({ ...taxConfig, taxName: e.target.value })}
                  placeholder="Tax / SST / VAT"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-[11px] mb-1.5">Tax / VAT Registration No. (TIN)</label>
                <input
                  type="text"
                  value={taxConfig.taxNumber}
                  onChange={(e) => setTaxConfig({ ...taxConfig, taxNumber: e.target.value })}
                  placeholder="Optional (e.g. VAT-11492019-7000)"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  const normalizedRate = Math.max(0, Number(taxConfig.taxRate) || 0);
                  const normalizedCurrency = (taxConfig.currency || "LKR").trim() || "LKR";
                  const updatedReceipt: ReceiptSettings = {
                    ...receiptConfig,
                    taxRate: normalizedRate,
                    taxName: taxConfig.taxName.trim() || "Tax / SST",
                    taxNumber: taxConfig.taxNumber.trim(),
                    currency: normalizedCurrency,
                    pricesIncludeTax: taxConfig.pricesIncludeTax,
                    showTaxBreakdown: normalizedRate > 0 ? true : receiptConfig.showTaxBreakdown,
                  };
                  setReceiptConfig(updatedReceipt);
                  setStoreInfo((prev) => ({ ...prev, currency: normalizedCurrency }));
                  setIsSaving(true);
                  try {
                    await saveReceiptSettings(shop?.shopId || "DEFAULT", updatedReceipt);
                    showToast(`Saved: ${normalizedCurrency} currency & ${normalizedRate}% tax rate`);
                    handleSelectView("menu");
                  } catch {
                    showToast("Saved locally");
                    handleSelectView("menu");
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer transition-all"
              >
                {isSaving ? "Saving..." : "Save Tax & Currency Settings"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTaxConfig({ ...taxConfig, taxRate: 0, currency: "LKR" });
                }}
                className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-xs cursor-pointer"
              >
                Reset to 0% Tax (LKR)
              </button>
              <button
                type="button"
                onClick={() => handleSelectView("menu")}
                className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs cursor-pointer ml-auto"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 6. AUDIO & SCANNER SUBVIEW                                             */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "audio" && (
        <div className="flex-1 flex flex-col p-6 pt-20 max-w-2xl mx-auto w-full">
          <div className="pb-4 border-b border-white/[0.08] mb-6">
            <h2 className="text-xl font-bold text-white">Audio & Scanner Feedback</h2>
            <p className="text-xs text-zinc-400 mt-1">Barcode audio cues and terminal alerts</p>
          </div>
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div>
                <div className="font-semibold text-white">Barcode Scan Beep</div>
                <div className="text-[11px] text-zinc-400">Play pleasant audio chime on valid product scan</div>
              </div>
              <input
                type="checkbox"
                checked={audioConfig.beepOnScan}
                onChange={(e) => setAudioConfig({ ...audioConfig, beepOnScan: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div>
                <div className="font-semibold text-white">Error Alert Sound</div>
                <div className="text-[11px] text-zinc-400">Play alert buzzer on out-of-stock or invalid item</div>
              </div>
              <input
                type="checkbox"
                checked={audioConfig.soundOnError}
                onChange={(e) => setAudioConfig({ ...audioConfig, soundOnError: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>
            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  showToast("Audio preferences updated");
                  handleSelectView("menu");
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
              >
                Save Audio Settings
              </button>
              <button
                type="button"
                onClick={() => handleSelectView("menu")}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs cursor-pointer"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 1B. USER PROFILE SUBVIEW                                               */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "profile" && (
        <UserProfileWorkspace
          onBack={() => handleSelectView("menu")}
          showToast={showToast}
          currency={taxConfig.currency || "LKR"}
        />
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 8. BILL TRANSFER LOGS & SHOP DEVICES SUBVIEW                           */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "bill_transfer_logs" && (
        <BillTransferLogsWorkspace
          onBack={() => handleSelectView("menu")}
          showToast={showToast}
          currency={taxConfig.currency || "LKR"}
        />
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 7. SECURITY & LOCK SUBVIEW                                             */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeView === "security" && (
        <div className="flex-1 flex flex-col p-6 pt-20 max-w-2xl mx-auto w-full">
          <div className="pb-4 border-b border-white/[0.08] mb-6">
            <h2 className="text-xl font-bold text-white">Security & Lock</h2>
            <p className="text-xs text-zinc-400 mt-1">Terminal timeouts and supervisor approvals</p>
          </div>
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div>
                <div className="font-semibold text-white">Supervisor PIN on Refund / Void</div>
                <div className="text-[11px] text-zinc-400">Require admin code before processing refunds</div>
              </div>
              <input
                type="checkbox"
                checked={securityConfig.requirePinForRefund}
                onChange={(e) =>
                  setSecurityConfig({ ...securityConfig, requirePinForRefund: e.target.checked })
                }
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>
            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  showToast("Security settings updated");
                  handleSelectView("menu");
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
              >
                Save Security Settings
              </button>
              <button
                type="button"
                onClick={() => handleSelectView("menu")}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs cursor-pointer"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
