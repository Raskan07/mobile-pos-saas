"use client";

/**
 * components/layout/AppShell.tsx
 *
 * Root Admin Panel Layout Shell.
 * - Replaces permanent dual sidebars with a clean top-left 3x3 Bento Grid Menu button
 *   so every Root Admin workspace gets 100% full screen width and maximum breathing room.
 * - Clicking the 3x3 Grid Menu button opens the full-screen glassmorphic Root Menu Launcher
 *   with instant access to all Root Admin modules (Shops, Staff, Map, Subscriptions, Wallet,
 *   Transactions, Refunds, Payouts, Analytics, Messages, Settings).
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X, ArrowLeft, Sparkles, LogOut } from "lucide-react";
import { NAV_CONFIG } from "./nav-config";

interface AppShellProps {
  children: React.ReactNode;
  defaultSectionId?: string;
}

/**
 * 3x3 Solid Square Grid Menu Icon matching the user's reference image.
 */
export function BentoGridMenuIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="4.2" height="4.2" rx="0.8" />
      <rect x="9.9" y="3" width="4.2" height="4.2" rx="0.8" />
      <rect x="16.8" y="3" width="4.2" height="4.2" rx="0.8" />
      <rect x="3" y="9.9" width="4.2" height="4.2" rx="0.8" />
      <rect x="9.9" y="9.9" width="4.2" height="4.2" rx="0.8" />
      <rect x="16.8" y="9.9" width="4.2" height="4.2" rx="0.8" />
      <rect x="3" y="16.8" width="4.2" height="4.2" rx="0.8" />
      <rect x="9.9" y="16.8" width="4.2" height="4.2" rx="0.8" />
      <rect x="16.8" y="16.8" width="4.2" height="4.2" rx="0.8" />
    </svg>
  );
}

export function AppShell({ children }: AppShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Close launcher on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative h-screen w-screen bg-[#09080d] text-zinc-100 font-sans select-none overflow-hidden flex flex-col">
      {/* ── Global Ambient Glassmorphic Glow Layer ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial from-[#191114] via-[#0d0c12] to-[#060508]" />
        <div className="absolute -top-32 right-1/4 w-[750px] h-[750px] bg-orange-600/12 rounded-full blur-[170px]" />
        <div className="absolute top-1/3 left-1/5 w-[650px] h-[650px] bg-amber-600/9 rounded-full blur-[160px]" />
        <div className="absolute -bottom-40 right-10 w-[700px] h-[700px] bg-purple-950/15 rounded-full blur-[190px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* ── Compact Top Root Navigation Bar with 3x3 Grid Menu Icon ── */}
      <header className="relative z-30 h-14 px-5 border-b border-white/[0.07] bg-[#0b0a10]/80 backdrop-blur-xl flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-orange-500/20 border border-white/[0.1] hover:border-orange-500/40 flex items-center justify-center text-zinc-200 hover:text-orange-300 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Open Root Admin Menu"
          >
            <BentoGridMenuIcon className="w-5 h-5" />
          </button>

          <Link
            href="/sup-ad-min/dashboard"
            className="flex items-center gap-2 text-sm font-black tracking-wider text-white hover:text-orange-300 transition-colors"
          >
            <span>SKYFOX</span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-orange-500/15 border border-orange-500/30 text-orange-300">
              ROOT TERMINAL
            </span>
          </Link>
        </div>

        {/* Quick Payment & Core Shortcuts in Top Bar */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5">
            {[
              { label: "Dashboard", href: "/sup-ad-min/dashboard" },
              { label: "Shops", href: "/sup-ad-min/shops" },
              { label: "Users", href: "/sup-ad-min/users" },
              { label: "Subscriptions", href: "/sup-ad-min/subscriptions" },
              { label: "Wallet", href: "/sa-9x8f2k/payments/wallet" },
              { label: "Transactions", href: "/sa-9x8f2k/payments/transactions" },
              { label: "Refunds", href: "/sa-9x8f2k/payments/refunds" },
              { label: "Payouts", href: "/sa-9x8f2k/payments/payouts" },
              { label: "Settings", href: "/sup-ad-min/settings" },
            ].map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? "bg-orange-500/20 text-orange-300 border border-orange-500/35"
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/super-admin/session", { method: "DELETE" }).catch(() => {});
              router.replace("/sup-ad-min");
              router.refresh();
            }}
            className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 border border-white/[0.08] hover:border-rose-500/35 text-xs font-semibold text-zinc-300 hover:text-rose-200 flex items-center gap-1.5 cursor-pointer transition-all"
            title="Sign Out Super Admin"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Full-Screen Glassmorphic Menu Launcher Overlay (when 3x3 Menu Icon is clicked) ── */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 bg-[#07080d]/95 backdrop-blur-2xl flex flex-col overflow-y-auto animate-in fade-in duration-150">
          {/* Top Bar inside Launcher */}
          <div className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-200 hover:text-white transition-all cursor-pointer"
                title="Close Menu"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Skyfox Root Admin Hub</span>
                  <Sparkles className="w-4 h-4 text-orange-400" />
                </h2>
                <p className="text-xs text-zinc-400">
                  Select any Root Terminal workspace below
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* All Root Admin Menu Sections & Cards */}
          <div className="flex-1 max-w-6xl mx-auto w-full px-6 pb-12 pt-2 space-y-7">
            {NAV_CONFIG.map((section) => {
              const SectionIcon = section.icon;
              return (
                <div key={section.id} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-300/90 border-b border-white/[0.07] pb-2">
                    <SectionIcon className="w-4 h-4 text-orange-400" />
                    <span>{section.label}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {section.subItems.map((sub) => {
                      const SubIcon = sub.icon;
                      const isActive = pathname === sub.href;

                      if (sub.actionId === "add-shop") {
                        return (
                          <button
                            key={`${section.id}-${sub.label}`}
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              if (pathname !== "/sa-9x8f2k/shops" && pathname !== "/sa-9x8f2k/shops/list") {
                                router.push("/sa-9x8f2k/shops/list");
                              }
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent("open-add-shop-modal"));
                              }, 150);
                            }}
                            className="group flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-white/[0.04] hover:bg-orange-500/15 border border-white/[0.08] hover:border-orange-500/40 transition-all cursor-pointer active:scale-95"
                          >
                            <SubIcon className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-semibold text-zinc-300 group-hover:text-white text-center">
                              {sub.label}
                            </span>
                          </button>
                        );
                      }

                      return (
                        <Link
                          key={`${section.id}-${sub.label}-${sub.href}`}
                          href={sub.href}
                          onClick={() => setIsMenuOpen(false)}
                          className={`group flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl border transition-all cursor-pointer active:scale-95 ${
                            isActive
                              ? "bg-orange-500/20 border-orange-500/50 text-white shadow-lg shadow-orange-950/30"
                              : "bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07] hover:border-white/[0.18] text-zinc-300 hover:text-white"
                          }`}
                        >
                          <SubIcon
                            className={`w-5 h-5 transition-colors ${
                              isActive
                                ? "text-orange-400"
                                : "text-zinc-400 group-hover:text-orange-300"
                            }`}
                          />
                          <span className="text-xs font-semibold text-center leading-tight">
                            {sub.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Content (100% Full Width) ── */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden min-w-0 w-full h-full">
        {children}
      </main>
    </div>
  );
}
