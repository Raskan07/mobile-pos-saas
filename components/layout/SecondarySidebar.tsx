"use client";

/**
 * SecondarySidebar.tsx
 *
 * The 220px slide-in contextual sidebar.
 * Animates in/out via GSAP (x-axis slide + opacity).
 * Sub-items stagger-animate in on open.
 */

import React, { useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import { NavSection, NavSubItem } from "./nav-config";
import { ChevronRight } from "lucide-react";

interface SecondarySidebarProps {
  section: NavSection | null;
  isOpen: boolean;
}

export function SecondarySidebar({ section, isOpen }: SecondarySidebarProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Slide panel in/out
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    if (isOpen && section) {
      // Slide in
      gsap.fromTo(
        panel,
        { x: -30, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.32,
          ease: "power3.out",
          clearProps: "transform",
        }
      );

      // Stagger sub-items in
      const items = itemsRef.current?.querySelectorAll("[data-nav-item]");
      if (items && items.length > 0) {
        gsap.fromTo(
          items,
          { x: -14, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.28,
            ease: "power2.out",
            stagger: 0.045,
            delay: 0.06,
          }
        );
      }
    } else if (!isOpen) {
      gsap.to(panel, {
        x: -20,
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
      });
    }
  }, [isOpen, section]);

  const handleItemClick = (e: React.MouseEvent, item: NavSubItem) => {
    if (item.actionId === "add-shop") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("open-add-shop-modal"));
      if (!pathname.includes("/sa-9x8f2k/shops")) {
        router.push("/sa-9x8f2k/shops");
      }
    }
  };

  return (
    <div
      ref={panelRef}
      className="flex-shrink-0 w-[220px] h-full flex flex-col relative z-10 overflow-hidden"
      style={{
        opacity: isOpen ? undefined : 0,
        pointerEvents: isOpen ? "auto" : "none",
        background: "rgba(10, 9, 18, 0.45)",
        backdropFilter: "blur(32px) saturate(200%) brightness(1.05)",
        WebkitBackdropFilter: "blur(32px) saturate(200%) brightness(1.05)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "inset -1px 0 0 rgba(255,255,255,0.04), 6px 0 40px rgba(0,0,0,0.5), inset 1px 0 0 rgba(255,255,255,0.02)",
      }}
    >
      {/* Ambient glows */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-60px",
          right: "-40px",
          width: "180px",
          height: "180px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(249,115,22,0.15) 0%, rgba(217,119,6,0.08) 40%, transparent 70%)",
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />

      {/* Section Header */}
      <div
        className="h-[60px] flex-shrink-0 flex items-center px-5"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(255,255,255,0.015)",
        }}
      >
        {section && (
          <div className="flex items-center gap-2.5">
            <div
              style={{
                padding: "5px",
                borderRadius: "7px",
                background: "rgba(249,115,22,0.1)",
                boxShadow: "0 0 10px rgba(249,115,22,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
            >
              <section.icon
                className="w-3 h-3 text-orange-400"
                strokeWidth={2}
              />
            </div>
            <span className="text-[11px] font-semibold tracking-[0.12em] text-zinc-300 uppercase">
              {section.label}
            </span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <div ref={itemsRef} className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {section?.subItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/sa-9x8f2k/shops" && pathname.startsWith(item.href));

          return (
            <div key={item.href} data-nav-item className="relative">
              {isActive && (
                <div
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-orange-500"
                  style={{
                    boxShadow: "0 0 8px rgba(249,115,22,0.7), 0 0 16px rgba(249,115,22,0.3)",
                  }}
                />
              )}
              <Link
                href={item.href}
                onClick={(e) => handleItemClick(e, item)}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg
                  text-[12.5px] font-medium
                  transition-all duration-150 group
                `}
                style={{
                  background: isActive
                    ? "rgba(249,115,22,0.08)"
                    : "transparent",
                  border: isActive
                    ? "1px solid rgba(249,115,22,0.18)"
                    : "1px solid transparent",
                  color: isActive ? "rgb(253,186,116)" : "rgb(161,161,170)",
                  boxShadow: isActive
                    ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 12px rgba(249,115,22,0.06)"
                    : "none",
                }}
              >
                <Icon
                  className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                    isActive ? "text-orange-400" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && (
                  <ChevronRight className="w-3 h-3 text-orange-500/60 flex-shrink-0" />
                )}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
