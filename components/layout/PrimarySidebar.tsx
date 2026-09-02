"use client";

/**
 * PrimarySidebar.tsx
 *
 * The narrow icon-rail sidebar (72px wide).
 * Renders one rounded icon button per NAV_CONFIG section.
 * GSAP handles hover scale and active-indicator animations.
 */

import React, { useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import { NAV_CONFIG, NavSection } from "./nav-config";

interface PrimarySidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
}

interface NavItemButtonProps {
  section: NavSection;
  isActive: boolean;
  onClick: () => void;
}

function NavItemButton({ section, isActive, onClick }: NavItemButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const Icon = section.icon;

  // Animate indicator in when this item becomes active
  useEffect(() => {
    if (!indicatorRef.current) return;
    if (isActive) {
      gsap.fromTo(
        indicatorRef.current,
        { scaleY: 0, opacity: 0 },
        { scaleY: 1, opacity: 1, duration: 0.25, ease: "back.out(1.7)" }
      );
    }
  }, [isActive]);

  const handleMouseEnter = useCallback(() => {
    if (!btnRef.current || isActive) return;
    gsap.to(btnRef.current, {
      scale: 1.1,
      duration: 0.2,
      ease: "back.out(2)",
    });
  }, [isActive]);

  const handleMouseLeave = useCallback(() => {
    if (!btnRef.current || isActive) return;
    gsap.to(btnRef.current, {
      scale: 1,
      duration: 0.18,
      ease: "power2.out",
    });
  }, [isActive]);

  const handleClick = useCallback(() => {
    if (btnRef.current) {
      gsap.to(btnRef.current, {
        scale: 0.92,
        duration: 0.08,
        ease: "power2.in",
        yoyo: true,
        repeat: 1,
      });
    }
    onClick();
  }, [onClick]);

  return (
    <div className="relative flex items-center">
      {/* Active left-edge indicator bar */}
      {isActive && (
        <div
          ref={indicatorRef}
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-orange-500"
          style={{
            boxShadow: "0 0 10px 1px rgba(249,115,22,0.7)",
            transformOrigin: "top",
          }}
        />
      )}

      <button
        ref={btnRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={section.label}
        aria-label={section.label}
        aria-pressed={isActive}
        className={`
          relative mx-auto flex flex-col items-center justify-center
          w-11 h-11 rounded-xl transition-colors duration-200
          ${
            isActive
              ? "bg-orange-500/20 text-orange-400 shadow-[0_0_16px_rgba(249,115,22,0.25)]"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]"
          }
        `}
      >
        <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
      </button>
    </div>
  );
}

export function PrimarySidebar({ activeId, onSelect }: PrimarySidebarProps) {
  return (
    <aside
      className="
        flex-shrink-0 flex flex-col items-center
        w-[72px] h-full relative z-20
      "
      style={{
        background: "rgba(8, 7, 14, 0.55)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "inset -1px 0 0 rgba(255,255,255,0.04), 4px 0 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* Ambient gradient orb – top */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-40px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "120px",
          height: "120px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)",
          filter: "blur(18px)",
          pointerEvents: "none",
          animation: "orbPulse 4s ease-in-out infinite",
        }}
      />

      {/* Ambient gradient orb – bottom */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "-40px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "100px",
          height: "100px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)",
          filter: "blur(16px)",
          pointerEvents: "none",
          animation: "orbPulse 5s ease-in-out infinite reverse",
        }}
      />

      {/* Shimmer top border accent */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.5), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* Logo mark */}
      <div
        className="flex items-center justify-center w-full h-[60px] flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #f97316, #d97706)",
            boxShadow: "0 0 18px rgba(249,115,22,0.6), 0 0 40px rgba(249,115,22,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}
        >
          <span className="text-white font-black text-sm tracking-tight">M</span>
        </div>
      </div>

      {/* Primary nav items */}
      <nav className="flex flex-col gap-2 py-4 w-full px-2 flex-1">
        {NAV_CONFIG.map((section) => (
          <NavItemButton
            key={section.id}
            section={section}
            isActive={activeId === section.id}
            onClick={() => onSelect(section.id)}
          />
        ))}
      </nav>

      {/* User avatar at bottom */}
      <div
        className="flex-shrink-0 py-4 w-full flex justify-center"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <button
          title="Profile"
          className="relative group"
          aria-label="User profile"
        >
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80"
            alt="User avatar"
            className="w-8 h-8 rounded-lg object-cover transition-all duration-200"
            style={{
              boxShadow: "0 0 0 1px rgba(255,255,255,0.1)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLImageElement).style.boxShadow = "0 0 0 1.5px rgba(249,115,22,0.6), 0 0 12px rgba(249,115,22,0.3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLImageElement).style.boxShadow = "0 0 0 1px rgba(255,255,255,0.1)";
            }}
          />
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500"
            style={{ boxShadow: "0 0 6px rgba(16,185,129,0.8)", outline: "2px solid rgba(8,7,14,0.8)" }}
          />
        </button>
      </div>

    </aside>
  );
}
