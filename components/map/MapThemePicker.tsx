"use client";

/**
 * MapThemePicker.tsx
 *
 * Floating glassmorphism pill in the bottom-right corner of the map
 * that lets users switch between map themes (Dark, Light, Satellite, Hybrid, Terrain).
 */

import React, { useState } from "react";
import { Moon, Sun, Globe, Layers, Mountain, ChevronUp, ChevronDown } from "lucide-react";

export type MapThemeId = "dark" | "light" | "satellite" | "hybrid" | "terrain";

export interface MapThemeConfig {
  id: MapThemeId;
  label: string;
  mapId?: string;
  mapTypeId: string;
}

export const MAP_THEMES: MapThemeConfig[] = [
  {
    id: "dark",
    label: "Dark",
    mapId: "739af084373f96fe",
    mapTypeId: "roadmap",
  },
  {
    id: "light",
    label: "Light",
    mapId: "49ae42fed52588c3",
    mapTypeId: "roadmap",
  },
  {
    id: "satellite",
    label: "Satellite",
    mapTypeId: "satellite",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    mapTypeId: "hybrid",
  },
  {
    id: "terrain",
    label: "Terrain",
    mapTypeId: "terrain",
  },
];

const THEME_ICON: Record<MapThemeId, React.ReactNode> = {
  dark: <Moon className="w-3.5 h-3.5" />,
  light: <Sun className="w-3.5 h-3.5" />,
  satellite: <Globe className="w-3.5 h-3.5" />,
  hybrid: <Layers className="w-3.5 h-3.5" />,
  terrain: <Mountain className="w-3.5 h-3.5" />,
};

interface MapThemePickerProps {
  activeThemeId: MapThemeId;
  onThemeChange: (theme: MapThemeConfig) => void;
}

export function MapThemePicker({ activeThemeId, onThemeChange }: MapThemePickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const active = MAP_THEMES.find((t) => t.id === activeThemeId)!;

  return (
    <div
      className="absolute bottom-10 right-5 z-30 flex flex-col items-end gap-2"
      style={{ pointerEvents: "auto" }}
    >
      {/* ── Expanded theme list (slides up) ── */}
      <div
        className={`flex flex-col gap-1.5 transition-all duration-300 ease-in-out origin-bottom ${
          isExpanded
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-3 pointer-events-none"
        }`}
      >
        {MAP_THEMES.filter((t) => t.id !== activeThemeId).map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => {
              onThemeChange(theme);
              setIsExpanded(false);
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white transition-all duration-200 hover:scale-[1.04] group"
            style={{
              background: "rgba(10, 9, 20, 0.75)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            <span className="text-orange-400 group-hover:text-orange-300">
              {THEME_ICON[theme.id]}
            </span>
            <span>{theme.label}</span>
          </button>
        ))}
      </div>

      {/* ── Active / Toggle pill button ── */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-semibold text-orange-300 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
        style={{
          background: "rgba(10, 9, 20, 0.82)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(249,115,22,0.35)",
          boxShadow:
            "0 0 18px rgba(249,115,22,0.18), 0 4px 24px rgba(0,0,0,0.55)",
        }}
      >
        <span className="text-orange-400">{THEME_ICON[active.id]}</span>
        <span>{active.label}</span>
        <span className="text-zinc-500 ml-0.5">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </span>
      </button>
    </div>
  );
}
