"use client";

/**
 * components/rbac/ShopRouteGuard.tsx
 *
 * Global route and submenu authorization guard for all `/shop/*` routes.
 * Prevents direct URL access to unauthorized modules or unauthorized Settings submenus,
 * and ensures protected content is never rendered while permissions are still loading.
 */

import React, { Suspense } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { ShieldAlert, ArrowLeft, Lock, Loader2 } from "lucide-react";
import { useRBAC } from "@/lib/rbac/useRBAC";
import { resolveRoutePermissionRequirement } from "@/lib/rbac/permissions";

function ShopRouteGuardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isPermissionsLoading,
    canAccessModule,
    canAccessSubPermission,
  } = useRBAC();

  const viewParam = searchParams.get("view");
  const requirement = resolveRoutePermissionRequirement(pathname, viewParam);

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

