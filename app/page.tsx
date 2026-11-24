/**
 * app/page.tsx
 *
 * Public Root Landing Page (/).
 * Displays only the Skyfox company logo in a minimal, responsive, premium presentation.
 * Contains no login form, no dashboard, no automatic redirect, and no authenticated content.
 */

import React from "react";
import Image from "next/image";

export default function PublicRootLandingPage() {
  return (
    <main className="relative min-h-screen w-full bg-[#050508] flex items-center justify-center p-6 overflow-hidden select-none">
      {/* Subtle Ambient Cosmic Aura */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-radial from-[#151018] via-[#08070c] to-[#040406]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-orange-600/12 via-amber-500/8 to-transparent blur-[140px]" />
      </div>

      {/* Centered Skyfox Company Logo Only */}
      <div className="relative z-10 flex items-center justify-center">
        <div className="relative w-[220px] sm:w-[280px] md:w-[340px] h-auto flex items-center justify-center">
          <Image
            src="/assets/logo.png"
            alt="Skyfox"
            width={340}
            height={120}
            priority
            className="w-full h-auto object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.85)]"
          />
        </div>
      </div>
    </main>
  );
}
