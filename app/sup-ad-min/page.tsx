"use client";

/**
 * app/sup-ad-min/page.tsx
 *
 * Super Admin Login Page (/sup-ad-min).
 * - Authenticates Super Admin credentials against the server endpoint
 *   `POST /api/auth/super-admin/session`, which verifies the account's actual
 *   `super_admin` role in Firestore and issues an HttpOnly signed session cookie.
 * - Redirects to `/sup-ad-min/dashboard` on success.
 */

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ShieldCheck, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/sup-ad-min/dashboard";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMsg("Please enter your Super Admin username/email and password.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/super-admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setErrorMsg(data.error || "Invalid Super Admin credentials.");
        setIsSubmitting(false);
        return;
      }

      const target =
        nextPath && nextPath.startsWith("/sup-ad-min")
          ? nextPath
          : "/sup-ad-min/dashboard";
      router.replace(target);
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err?.message || "Connection error while verifying Super Admin.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#050508] text-white font-sans flex flex-col items-center justify-center p-6 overflow-hidden select-none">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-radial from-[#1b1215] via-[#09080d] to-[#040406]" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-600/12 rounded-full blur-[160px]" />
      </div>

      {/* Login Container */}
      <div className="relative z-10 w-full max-w-[380px] space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative h-12 w-auto">
            <Image
              src="/assets/logo.png"
              alt="Skyfox"
              width={220}
              height={72}
              priority
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-[10px] font-mono uppercase tracking-[0.25em] text-orange-300 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
            <span>Super Admin Authentication</span>
          </div>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.09] backdrop-blur-2xl shadow-2xl space-y-4"
        >
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-zinc-400">
              Super Admin Username or Email
            </label>
            <input
              type="text"
              required
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="rootadmin or root@skyfox.pos"
              disabled={isSubmitting}
              className="w-full h-11 px-3.5 rounded-xl bg-black/50 border border-white/10 focus:border-orange-500/60 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-zinc-400">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Super Admin password"
                disabled={isSubmitting}
                className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-black/50 border border-white/10 focus:border-orange-500/60 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-[#ea4815] via-[#f95721] to-[#ff6229] hover:from-[#f95721] hover:to-[#ff7340] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isSubmitting ? "Verifying Super Admin Role..." : "Sign In to Super Admin"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
