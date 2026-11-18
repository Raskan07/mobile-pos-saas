"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import UserProfileWorkspace from "@/components/settings/UserProfileWorkspace";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { getStoredReceiptSettings } from "@/lib/services/receiptSettingsService";

export default function ShopUserProfilePage() {
  const router = useRouter();
  const { shop } = useShopAuth();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currency =
    getStoredReceiptSettings(shop?.shopId || "DEFAULT", shop?.shopName || "POS Store")
      .currency || "LKR";

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col relative selection:bg-zinc-800">
      <button
        type="button"
        onClick={() => router.push("/shop/settings")}
        className="fixed top-5 left-5 z-50 w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shadow-lg backdrop-blur-md"
        title="Return to Settings"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-emerald-500/30 text-white text-xs font-medium shadow-2xl flex items-center gap-2 backdrop-blur">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <UserProfileWorkspace
        onBack={() => router.push("/shop/settings")}
        showToast={showToast}
        currency={currency}
      />
    </div>
  );
}

