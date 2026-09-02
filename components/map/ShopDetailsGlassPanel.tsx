"use client";

/**
 * ShopDetailsGlassPanel.tsx
 *
 * Floating glassmorphism details panel that slides in when a shop marker is selected on the map.
 */

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  Store,
  X,
  Phone,
  User,
  MapPin,
  Users,
  Copy,
  Check,
  UserPlus,
  Navigation,
  Compass,
  Layers,
  Sparkles,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";

interface ShopDetailsGlassPanelProps {
  shop: Shop | null;
  onClose: () => void;
  onAssignStaff: (shop: Shop) => void;
  onViewStaff: (shop: Shop) => void;
  onFocusCoordinates?: (lat: number, lng: number) => void;
}

export function ShopDetailsGlassPanel({
  shop,
  onClose,
  onAssignStaff,
  onViewStaff,
  onFocusCoordinates,
}: ShopDetailsGlassPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shop) return;
    const panel = panelRef.current;
    if (!panel) return;

    gsap.fromTo(
      panel,
      { x: 40, opacity: 0, scale: 0.95 },
      { x: 0, opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }
    );
  }, [shop]);

  const handleCopy = () => {
    if (!shop) return;
    navigator.clipboard.writeText(shop.shopId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    const panel = panelRef.current;
    if (!panel) {
      onClose();
      return;
    }
    gsap.to(panel, {
      x: 30,
      opacity: 0,
      scale: 0.95,
      duration: 0.22,
      ease: "power2.in",
      onComplete: onClose,
    });
  };

  if (!shop) return null;

  return (
    <div
      ref={panelRef}
      className="absolute bottom-6 right-6 z-30 w-full max-w-sm rounded-2xl p-5 overflow-hidden flex flex-col justify-between"
      style={{
        background: "rgba(14, 13, 22, 0.78)",
        backdropFilter: "blur(32px) saturate(200%) brightness(1.1)",
        WebkitBackdropFilter: "blur(32px) saturate(200%) brightness(1.1)",
        border: "1px solid rgba(249, 115, 22, 0.25)",
        boxShadow:
          "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(249, 115, 22, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* Top Ambient Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-orange-500/20 blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/[0.08] relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-orange-400"
            style={{
              background: "rgba(249, 115, 22, 0.15)",
              border: "1px solid rgba(249, 115, 22, 0.35)",
              boxShadow: "0 0 15px rgba(249, 115, 22, 0.2)",
            }}
          >
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2 truncate max-w-[190px]">
              {shop.shopName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                onClick={handleCopy}
                className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 cursor-pointer hover:bg-orange-500/30 flex items-center gap-1"
                title="Click to copy Shop ID"
              >
                <Layers className="w-3 h-3" />
                {shop.shopId}
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </span>
              <span className="text-[10px] text-emerald-400 font-medium uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                {shop.status}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleClose}
          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Details Grid */}
      <div className="py-3.5 space-y-2 text-xs relative z-10">
        <div className="flex justify-between py-1 border-b border-white/[0.04]">
          <span className="text-zinc-500 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-zinc-400" />
            Owner
          </span>
          <span className="text-zinc-200 font-medium">{shop.ownerName}</span>
        </div>

        <div className="flex justify-between py-1 border-b border-white/[0.04]">
          <span className="text-zinc-500 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-orange-400" />
            Phone
          </span>
          <span className="text-zinc-200 font-mono">{shop.phone}</span>
        </div>

        {shop.address && (
          <div className="flex justify-between py-1 border-b border-white/[0.04]">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              Address
            </span>
            <span className="text-zinc-300 truncate max-w-[180px]">{shop.address}</span>
          </div>
        )}

        {shop.latitude !== undefined && shop.longitude !== undefined && (
          <div className="flex justify-between py-1">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              Coordinates
            </span>
            <button
              type="button"
              onClick={() => {
                if (onFocusCoordinates && shop.latitude && shop.longitude) {
                  onFocusCoordinates(shop.latitude, shop.longitude);
                }
              }}
              className="text-orange-300 font-mono text-[11px] hover:underline flex items-center gap-1"
            >
              <span>{shop.latitude.toFixed(4)}, {shop.longitude.toFixed(4)}</span>
              <Navigation className="w-3 h-3 text-orange-400" />
            </button>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-2 flex items-center gap-2 relative z-10 border-t border-white/[0.08]">
        <button
          type="button"
          onClick={() => onViewStaff(shop)}
          className="flex-1 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-zinc-100 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
        >
          <Users className="w-3.5 h-3.5 text-orange-400" />
          <span>Staff {shop.staffCount !== undefined ? `(${shop.staffCount})` : ""}</span>
        </button>

        <button
          type="button"
          onClick={() => onAssignStaff(shop)}
          className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_15px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_20px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Assign Staff</span>
        </button>
      </div>
    </div>
  );
}
