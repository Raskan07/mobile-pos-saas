"use client";

/**
 * app/unauthorized/page.tsx
 *
 * Displayed when an authenticated user attempts to access a realm or role
 * they are not authorized for (e.g. a shop user trying to access /sup-ad-min/*).
 */

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen w-full bg-[#06060a] text-white flex items-center justify-center p-6 select-none">
      <div className="max-w-md w-full rounded-2xl bg-[#10121a] border border-rose-500/30 p-7 text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400 mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-white">403 — Access Denied</h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Your current session is not authorized to access this protected realm. Super Admin and Shop sessions are strictly isolated.
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
