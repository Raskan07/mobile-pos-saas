"use client";

/**
 * app/shop/settings/receipt/page.tsx
 * Direct route to Receipt Modifications.
 * Renders the Settings page with the "receipt" view active.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReceiptSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/shop/settings?view=receipt");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#07080d] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
