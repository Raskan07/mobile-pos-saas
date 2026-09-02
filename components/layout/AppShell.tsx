"use client";

/**
 * AppShell.tsx
 *
 * Top-level layout shell with ambient transparent glassmorphism background,
 * primary icon rail, contextual secondary sidebar, and main content area.
 */

import React, { useState, useCallback } from "react";
import { PrimarySidebar } from "./PrimarySidebar";
import { SecondarySidebar } from "./SecondarySidebar";
import { NAV_CONFIG, NavSection } from "./nav-config";

interface AppShellProps {
  children: React.ReactNode;
  /** Default open section id (optional). Useful for pre-selecting based on route. */
  defaultSectionId?: string;
}

export function AppShell({ children, defaultSectionId }: AppShellProps) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    defaultSectionId ?? null
  );

  const activeSection: NavSection | null =
    NAV_CONFIG.find((s) => s.id === activeSectionId) ?? null;

  const isSecondaryOpen = activeSectionId !== null;

  const handlePrimarySelect = useCallback((id: string) => {
    setActiveSectionId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="relative h-screen w-screen bg-[#09080d] text-zinc-100 font-sans select-none overflow-hidden flex flex-col">
      {/* ── Global Ambient Glassmorphic Glow Layer ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Radial Dark Backdrop */}
        <div className="absolute inset-0 bg-radial from-[#191114] via-[#0d0c12] to-[#060508]" />
        
        {/* Ambient Glowing Orbs */}
        <div className="absolute -top-32 right-1/4 w-[750px] h-[750px] bg-orange-600/12 rounded-full blur-[170px] animate-pulse" />
        <div className="absolute top-1/3 left-1/5 w-[650px] h-[650px] bg-amber-600/9 rounded-full blur-[160px]" />
        <div className="absolute -bottom-40 right-10 w-[700px] h-[700px] bg-purple-950/15 rounded-full blur-[190px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] bg-orange-950/10 rounded-full blur-[150px]" />

        {/* Subtle Matrix Dot Grid */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* ── Main Layout with Frosted Glass Backdrop ── */}
      <div className="relative z-10 w-full h-full flex overflow-hidden backdrop-blur-2xl">
        {/* Primary icon-rail sidebar */}
        <PrimarySidebar
          activeId={activeSectionId}
          onSelect={handlePrimarySelect}
        />

        {/* Secondary contextual sidebar */}
        <SecondarySidebar section={activeSection} isOpen={isSecondaryOpen} />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {children}
        </main>
      </div>
    </div>
  );
}
