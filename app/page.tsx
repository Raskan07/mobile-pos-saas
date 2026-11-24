"use client";

/**
 * app/page.tsx
 *
 * Public Root Landing Page (/).
 * Displays only the Skyfox company logo with a refined, subtle cinematic entrance,
 * weightless breathing float, and gentle ambient glow.
 */

import React, { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";

export default function PublicRootLandingPage() {
  const logoWrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (logoWrapRef.current) {
        // 1. Clean cinematic entrance reveal
        gsap.fromTo(
          logoWrapRef.current,
          { opacity: 0, scale: 0.92, y: 14, filter: "blur(8px)" },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 1.35,
            ease: "power3.out",
          }
        );

        // 2. Subtle continuous weightless float
        gsap.to(logoWrapRef.current, {
          y: -6,
          duration: 3.6,
          delay: 1.35,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      }

      if (glowRef.current) {
        // 3. Soft breathing ambient aura
        gsap.fromTo(
          glowRef.current,
          { opacity: 0.45, scale: 0.92 },
          {
            opacity: 0.85,
            scale: 1.08,
            duration: 4.2,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          }
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <main className="relative min-h-screen w-full bg-[#050508] flex items-center justify-center p-6 overflow-hidden select-none">
      {/* Subtle Ambient Cosmic Aura */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-radial from-[#151018] via-[#08070c] to-[#040406]" />
        <div
          ref={glowRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-orange-600/15 via-amber-500/10 to-transparent blur-[130px]"
        />
      </div>

      {/* Centered Animated Skyfox Company Logo Only */}
      <div className="relative z-10 flex items-center justify-center">
        <div
          ref={logoWrapRef}
          className="relative w-[220px] sm:w-[280px] md:w-[340px] h-auto flex items-center justify-center opacity-0 will-change-transform"
        >
          <Image
            src="/assets/logo.png"
            alt="Skyfox"
            width={340}
            height={120}
            priority
            className="w-full h-auto object-contain drop-shadow-[0_14px_44px_rgba(249,115,22,0.16)]"
          />
        </div>
      </div>
    </main>
  );
}
