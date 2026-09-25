"use client";

/**
 * app/shop/login/page.tsx
 *
 * Redirects to the unified SpaceFox authentication interface at /shop
 */

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shopId = searchParams.get("shopId");

  useEffect(() => {
    if (shopId) {
      router.replace(`/shop?shopId=${encodeURIComponent(shopId)}`);
    } else {
      router.replace("/shop");
    }
  }, [router, shopId]);

  return (
    <div className="min-h-screen w-full bg-[#050508] flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
    </div>
  );
}

export default function ShopLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginRedirect />
    </Suspense>
  );
}
