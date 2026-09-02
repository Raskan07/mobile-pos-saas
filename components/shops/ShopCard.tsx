"use client";

/**
 * ShopCard.tsx
 *
 * Frosted-glass card displaying shop metrics, Shop ID badge with copy action,
 * owner details, phone, staff count, and direct action triggers.
 */

import React, { useState } from "react";
import {
  Store,
  Phone,
  User,
  Users,
  Copy,
  Check,
  UserPlus,
  ArrowUpRight,
  Shield,
  Layers,
  MapPin,
  Calendar,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";

interface ShopCardProps {
  shop: Shop;
  onAssignStaff: (shop: Shop) => void;
  onViewStaff: (shop: Shop) => void;
}

export function ShopCard({ shop, onAssignStaff, onViewStaff }: ShopCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(shop.shopId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = new Date(shop.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className="group relative rounded-2xl p-5 transition-all duration-300 flex flex-col justify-between"
      style={{
        background: "rgba(18, 17, 26, 0.65)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow:
          "0 12px 30px -8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.border = "1px solid rgba(249, 115, 22, 0.35)";
        el.style.boxShadow =
          "0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 25px rgba(249, 115, 22, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)";
        el.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.border = "1px solid rgba(255, 255, 255, 0.08)";
        el.style.boxShadow =
          "0 12px 30px -8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06)";
        el.style.transform = "translateY(0)";
      }}
    >
      {/* Top Section */}
      <div className="space-y-3.5">
        {/* Header: Shop ID Badge & Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300 font-mono text-xs font-semibold cursor-pointer hover:bg-orange-500/25 transition-all shadow-[0_0_12px_rgba(249,115,22,0.15)]"
              title="Click to copy Shop ID"
            >
              <Layers className="w-3 h-3 text-orange-400" />
              <span>{shop.shopId}</span>
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-orange-400/70" />
              )}
            </div>
            {copied && <span className="text-[10px] text-emerald-400">Copied!</span>}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
              {shop.status}
            </span>
          </div>
        </div>

        {/* Shop Name & Owner */}
        <div>
          <h3 className="text-base font-semibold text-zinc-100 group-hover:text-orange-200 transition-colors flex items-center gap-2">
            <Store className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <span className="truncate">{shop.shopName}</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-zinc-500" />
            <span>Owner: <span className="text-zinc-300 font-medium">{shop.ownerName}</span></span>
          </p>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 gap-1.5 py-2 border-y border-white/[0.05] text-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Phone className="w-3 h-3 text-orange-400/80" />
              Contact
            </span>
            <span className="text-zinc-300 font-mono">{shop.phone}</span>
          </div>

          {shop.address && (
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-500">
                <MapPin className="w-3 h-3 text-zinc-500" />
                Location
              </span>
              <span className="text-zinc-300 truncate max-w-[170px]">{shop.address}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-zinc-400">
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Calendar className="w-3 h-3 text-zinc-500" />
              Registered
            </span>
            <span className="text-zinc-400 text-[11px]">{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-4 flex items-center justify-between gap-2 mt-2">
        <button
          type="button"
          onClick={() => onViewStaff(shop)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 hover:text-zinc-100 text-xs font-medium transition-all"
        >
          <Users className="w-3.5 h-3.5 text-orange-400" />
          <span>Staff {shop.staffCount !== undefined ? `(${shop.staffCount})` : ""}</span>
        </button>

        <button
          type="button"
          onClick={() => onAssignStaff(shop)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-200 text-xs font-semibold shadow-[0_0_15px_rgba(249,115,22,0.15)] hover:shadow-[0_0_20px_rgba(249,115,22,0.25)] transition-all"
        >
          <UserPlus className="w-3.5 h-3.5 text-orange-400" />
          <span>Assign</span>
        </button>
      </div>
    </div>
  );
}
