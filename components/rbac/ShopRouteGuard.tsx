"use client";

/**
 * components/rbac/ShopRouteGuard.tsx
 *
 * Global route and submenu authorization guard for all `/shop/*` routes.
 * - Also delivers the real-time iOS Message Delivery Suspension Overlay whenever a shop
 *   is suspended by Root Admin (`shop.status === "suspended"` or `shop.subscription?.status === "suspended"`).
 */

import React, { Suspense } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  ShieldAlert,
  ArrowLeft,
  Lock,
  Loader2,
  MessageCircle,
  CheckCheck,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac/useRBAC";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { resolveRoutePermissionRequirement } from "@/lib/rbac/permissions";

function ShopRouteGuardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { logout } = useShopAuth();
  const {
    user,
    shop,
    isAuthenticated,
    isPermissionsLoading,
    canAccessModule,
    canAccessSubPermission,
  } = useRBAC();

  const viewParam = searchParams.get("view");
  const requirement = resolveRoutePermissionRequirement(pathname, viewParam);

  // ── REAL-TIME iOS MESSAGE DELIVERY SUSPENSION SCREEN ──
  const isShopSuspended =
    isAuthenticated &&
    shop &&
    (shop.status === "suspended" || shop.subscription?.status === "suspended");

  if (isShopSuspended && shop) {
    const sub = shop.subscription;
    const suspendedAt = sub?.suspendedAt ? new Date(sub.suspendedAt) : new Date();
    const timeStr = suspendedAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const suspensionMessage =
      sub?.suspensionReason ||
      `Hello ${shop.ownerName || shop.shopName}, your Skyfox POS subscription for ${
        shop.shopName
      } (${shop.shopId}) has been suspended by Root Administration. Please settle your subscription balance to restore instant terminal access.`;

    return (
      <div className="fixed inset-0 z-[100] bg-[#050508]/95 backdrop-blur-2xl text-white flex flex-col items-center justify-between p-4 sm:p-6 select-none overflow-y-auto">
        {/* Top iOS Push Notification Banner (Slide-Down Frosted Glass Pill) */}
        <div className="w-full max-w-md mt-2 p-3.5 rounded-[22px] bg-[#1c1c1e]/95 border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-3xl flex items-start gap-3 animate-in slide-in-from-top-6 duration-300">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#34C759] to-[#28a745] flex items-center justify-center shrink-0 shadow-md">
            <MessageCircle className="w-5 h-5 text-white fill-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-tight text-white">
                SKYFOX ROOT ADMIN
              </span>
              <span className="text-[10px] text-zinc-400">now</span>
            </div>
            <p className="text-xs text-zinc-200 font-medium line-clamp-2 mt-0.5 leading-snug">
              {suspensionMessage}
            </p>
          </div>
        </div>

        {/* Center iOS iMessage Conversation Card */}
        <div className="w-full max-w-md my-auto rounded-[32px] bg-[#121214] border border-white/15 shadow-[0_25px_80px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
          {/* iOS Messages Top Contact Bar */}
          <div className="px-5 py-4 bg-[#1c1c1e]/90 border-b border-white/10 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-zinc-950 font-black text-base shadow-lg">
              SF
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-xs font-bold text-white">Skyfox Root Admin</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#0A84FF]" />
            </div>
            <span className="text-[10px] text-zinc-400">
              iMessage • Shop ID: {shop.shopId}
            </span>
          </div>

          {/* iOS Message Thread Body */}
          <div className="p-5 space-y-3 bg-[#000000]">
            <div className="text-center text-[10px] font-medium text-zinc-500">
              Today {timeStr}
            </div>

            {/* Incoming iOS Message Bubble */}
            <div className="flex flex-col items-start space-y-1">
              <div className="max-w-[90%] rounded-[20px] rounded-bl-[5px] bg-[#262629] px-4 py-3 text-[13px] text-white leading-relaxed shadow-sm">
                <p className="font-semibold text-orange-400 mb-1">
                  Subscription Suspended — {shop.shopName}
                </p>
                <p className="text-zinc-100">{suspensionMessage}</p>
                {sub && (
                  <div className="mt-2.5 pt-2 border-t border-white/10 text-[11px] text-zinc-300 space-y-0.5 font-mono">
                    <div>Plan: {sub.planName}</div>
                    <div>
                      Amount Due: {sub.currency}{" "}
                      {sub.effectiveBillingAmount?.toLocaleString()}/
                      {sub.billingCycle === "annual" ? "yr" : "mo"}
                    </div>
                  </div>
                )}
              </div>

              {/* Outgoing System Acknowledgement Bubble with iOS "Delivered" Receipt */}
              <div className="self-end mt-2 flex flex-col items-end">
                <div className="rounded-[20px] rounded-br-[5px] bg-[#0A84FF] px-3.5 py-2 text-xs text-white font-medium">
                  Terminal {shop.shopId} locked awaiting reactivation
                </div>
                <span className="text-[10px] text-zinc-400 font-medium mt-1 flex items-center gap-1">
                  <CheckCheck className="w-3 h-3 text-[#0A84FF]" />
                  Delivered
                </span>
              </div>
            </div>
          </div>

          {/* iOS Bottom Action Footer */}
          <div className="p-4 bg-[#1c1c1e] border-t border-white/10 flex items-center justify-between gap-2.5">
            <div className="text-[11px] text-zinc-400 leading-tight">
              Terminal unlocks automatically once Root Admin reactivates{" "}
              <strong className="text-white">{shop.shopId}</strong>.
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/shop");
              }}
              className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <div className="text-[11px] text-zinc-500 mb-1">
          Skyfox Real-Time Subscription Guard • Listening for instant reactivation…
        </div>
      </div>
    );
  }

  // Public login / base POS routes do not require module-level gate
  if (!requirement.moduleId) {
    return <>{children}</>;
  }

  // Never render protected module content while permissions are still loading
  if (isPermissionsLoading) {
    return (
      <div className="min-h-screen bg-[#07080d] text-zinc-200 flex flex-col items-center justify-center p-6 select-none">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
          <p className="text-xs font-mono text-zinc-400">
            Verifying role permissions…
          </p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to `/shop` login
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-[#07080d] text-zinc-200 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#0e111a] border border-white/10 p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white">Authentication Required</h2>
          <p className="text-xs text-zinc-400">
            Please sign in to your shop account to access this module.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/shop")}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            Go to Shop Login
          </button>
        </div>
      </div>
    );
  }

  // Check parent module permission and optional submenu permission
  const hasModulePerm = canAccessModule(requirement.moduleId);
  const hasSubPerm = requirement.subKey
    ? canAccessSubPermission(requirement.moduleId, requirement.subKey)
    : true;

  if (!hasModulePerm || !hasSubPerm) {
    return (
      <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col items-center justify-center p-6 select-none">
        <div className="max-w-md w-full rounded-2xl bg-[#0d1018] border border-rose-500/25 shadow-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold text-white">Access Restricted</h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Your current role (<span className="text-zinc-200 font-mono capitalize">{user.role}</span>) does not have permission to access{" "}
              <span className="text-white font-semibold">
                {requirement.displayName || requirement.moduleId}
              </span>
              .
            </p>
            <p className="text-[11px] font-mono text-zinc-500 pt-1">
              Required permission:{" "}
              {requirement.subKey
                ? `${requirement.moduleId}.${requirement.subKey}`
                : requirement.moduleId}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2.5">
            {requirement.subKey && hasModulePerm && (
              <button
                type="button"
                onClick={() => router.replace("/shop/settings")}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 text-xs font-medium cursor-pointer"
              >
                Allowed Settings
              </button>
            )}
            <button
              type="button"
              onClick={() => router.replace("/shop/dashboard")}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to POS Terminal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function ShopRouteGuard({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07080d] text-zinc-200 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      }
    >
      <ShopRouteGuardInner>{children}</ShopRouteGuardInner>
    </Suspense>
  );
}
