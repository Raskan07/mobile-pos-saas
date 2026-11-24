"use client";

/**
 * app/sa-9x8f2k/settings/page.tsx
 *
 * Super Admin Platform Settings & Session Security Center.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  ShieldCheck,
  LogOut,
  Globe,
  Bell,
  Lock,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function SuperAdminSettingsPage() {
  const router = useRouter();
  const [adminInfo, setAdminInfo] = useState<{
    username: string;
    email: string;
    displayName: string;
    role: string;
  } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/super-admin/session")
      .then((r) => r.json())
      .then((data) => {
        if (data?.authenticated && data?.superAdmin) {
          setAdminInfo(data.superAdmin);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/super-admin/session", { method: "DELETE" });
      router.replace("/sup-ad-min");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <AppShell defaultSectionId="settings">
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                Super Admin Platform Settings
              </h1>
              <p className="text-xs text-zinc-400">
                Global platform configuration, session security, and administrative broadcast controls
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-bold text-rose-300 flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{loggingOut ? "Signing Out..." : "Sign Out Super Admin"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-orange-300">
              <ShieldCheck className="w-4 h-4 text-orange-400" />
              <span>Authenticated Super Admin Session</span>
            </div>
            <div className="space-y-1.5 text-xs text-zinc-300">
              <div>
                Display Name:{" "}
                <strong className="text-white">
                  {adminInfo?.displayName || "Skyfox Super Admin"}
                </strong>
              </div>
              <div>
                Username:{" "}
                <strong className="font-mono text-white">
                  {adminInfo?.username || "rootadmin"}
                </strong>
              </div>
              <div>
                Email:{" "}
                <strong className="font-mono text-white">
                  {adminInfo?.email || "root@skyfox.pos"}
                </strong>
              </div>
              <div>
                Role:{" "}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold uppercase">
                  {adminInfo?.role || "super_admin"}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Realm & Cookie Isolation</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Super Admin sessions use an isolated HttpOnly signed session cookie (
              <code className="text-zinc-200">skyfox_super_admin_session</code>) separate from
              tenant shop sessions (<code className="text-zinc-200">skyfox_shop_session</code>).
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href="/sup-ad-min/shops"
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white"
              >
                Manage Shops
              </Link>
              <Link
                href="/sup-ad-min/users"
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white"
              >
                Manage Users
              </Link>
              <Link
                href="/sa-9x8f2k/subscriptions"
                className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-xs font-semibold text-orange-300"
              >
                Subscription Studio
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
