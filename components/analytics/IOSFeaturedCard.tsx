"use client";

/**
 * components/analytics/IOSFeaturedCard.tsx
 *
 * iOS-inspired featured card with dark glass morphism.
 * Features:
 * - Subtle specular rim highlight: shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]
 * - Secondary gray typography (eyebrow, descriptors, sub-labels)
 * - Deep dark background with high backdrop blur
 * - Optional icon accent, pill badge, and interactive children
 */

import React from "react";

interface IOSFeaturedCardProps {
  eyebrow?: string;
  title: string | React.ReactNode;
  value?: string | number | React.ReactNode;
  subtitle?: string | React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: {
    text: string;
    variant?: "positive" | "negative" | "neutral" | "warning" | "info";
  };
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export default function IOSFeaturedCard({
  eyebrow,
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  children,
  className = "",
  onClick,
  hoverable = false,
}: IOSFeaturedCardProps) {
  const badgeStyles = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    negative: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    neutral: "bg-zinc-800/80 text-zinc-300 border-zinc-700/60",
  }[badge?.variant || "neutral"];

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all duration-200 ${
        hoverable || onClick
          ? "cursor-pointer hover:border-white/[0.18] hover:bg-[#10121d] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_8px_20px_rgba(0,0,0,0.35)]"
          : ""
      } ${className}`}
    >
      <div className="p-3.5 sm:p-4 flex flex-col justify-between h-full">
        <div>
          {/* Header Row: Eyebrow + Icon + Badge */}
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {Icon && (
                <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-300 shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </div>
              )}
              {eyebrow && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 truncate">
                  {eyebrow}
                </span>
              )}
            </div>

            {badge && (
              <span
                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${badgeStyles}`}
              >
                {badge.text}
              </span>
            )}
          </div>

          {/* Title / Description */}
          {title && (
            <div className="text-[11px] font-medium text-zinc-400 tracking-tight leading-snug">
              {title}
            </div>
          )}

          {/* Hero Metric Value (Reduced ~25%) */}
          {value !== undefined && (
            <div className="text-lg sm:text-xl font-bold text-white tracking-tight font-mono my-0.5">
              {value}
            </div>
          )}

          {/* Subtitle / Secondary explanatory caption */}
          {subtitle && (
            <div className="text-[10px] text-zinc-400 font-medium leading-relaxed">
              {subtitle}
            </div>
          )}
        </div>

        {/* Optional Embedded Details / Children */}
        {children && <div className="mt-2.5 pt-2 border-t border-white/[0.06]">{children}</div>}
      </div>
    </div>
  );
}
