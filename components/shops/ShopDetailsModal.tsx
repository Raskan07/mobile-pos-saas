"use client";

/**
 * ShopDetailsModal.tsx
 *
 * Premium Glassmorphic Modal for viewing comprehensive details of a registered shop:
 * - Live Shop ID with Copy Action
 * - Active / Hidden Status Indicators
 * - Owner, Contact, Email, Physical Address
 * - Geolocation Coordinates with Google Maps external link
 * - Real-time Assigned Staff Directory
 * - Action buttons: Edit, Hide/Unhide, Assign Staff, Delete
 */

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  Store,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Layers,
  Copy,
  Check,
  X,
  Edit3,
  Eye,
  EyeOff,
  Trash2,
  UserPlus,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Users,
  Compass,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";
import { ShopUser, ROLE_CONFIG } from "@/lib/types/user";
import { subscribeToUsersByShop } from "@/lib/services/userService";

interface ShopDetailsModalProps {
  isOpen: boolean;
  shop: Shop | null;
  onClose: () => void;
  onEdit: (shop: Shop) => void;
  onToggleHide: (shop: Shop) => void;
  onDelete: (shop: Shop) => void;
  onAssignStaff: (shop: Shop) => void;
}

export function ShopDetailsModal({
  isOpen,
  shop,
  onClose,
  onEdit,
  onToggleHide,
  onDelete,
  onAssignStaff,
}: ShopDetailsModalProps) {
  const [copied, setCopied] = useState(false);
  const [staffList, setStaffList] = useState<ShopUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Subscribe to staff members for this shop
  useEffect(() => {
    if (!isOpen || !shop) return;
    setLoadingStaff(true);
    const unsubscribe = subscribeToUsersByShop(shop.shopId, (users) => {
      setStaffList(users);
      setLoadingStaff(false);
    });

    return () => unsubscribe();
  }, [isOpen, shop]);

  // Entrance GSAP animation
  useEffect(() => {
    if (!isOpen) return;

    const overlay = overlayRef.current;
    const modal = modalRef.current;
    if (!overlay || !modal) return;

    gsap.set(overlay, { opacity: 0 });
    gsap.set(modal, { y: 40, opacity: 0, scale: 0.95 });

    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.28, ease: "power2.out" })
      .to(
        modal,
        { y: 0, opacity: 1, scale: 1, duration: 0.38, ease: "power3.out" },
        "-=0.15"
      );
  }, [isOpen]);

  const handleClose = () => {
    const overlay = overlayRef.current;
    const modal = modalRef.current;
    if (!overlay || !modal) {
      onClose();
      return;
    }

    const tl = gsap.timeline({
      onComplete: onClose,
    });
    tl.to(modal, { y: 25, opacity: 0, scale: 0.96, duration: 0.22, ease: "power2.in" })
      .to(overlay, { opacity: 0, duration: 0.18, ease: "power2.in" }, "-=0.1");
  };

  const handleCopyId = () => {
    if (!shop) return;
    navigator.clipboard.writeText(shop.shopId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !shop) return null;

  const isHidden = shop.isHidden || shop.status === "inactive";
  const formattedCreated = new Date(shop.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const formattedUpdated = new Date(shop.updatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const mapsUrl =
    shop.latitude && shop.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${shop.latitude},${shop.longitude}`
      : null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{
        background: "rgba(6, 6, 10, 0.78)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
        style={{
          background: "rgba(18, 16, 26, 0.94)",
          backdropFilter: "blur(36px) saturate(200%) brightness(1.05)",
          WebkitBackdropFilter: "blur(36px) saturate(200%) brightness(1.05)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow:
            "0 30px 60px -15px rgba(0, 0, 0, 0.8), 0 0 45px rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        }}
      >
        {/* Top Gradient Shimmer Bar */}
        <div
          className="h-1 w-full flex-shrink-0"
          style={{
            background:
              "linear-gradient(90deg, transparent, #ea4815 30%, #f97316 70%, transparent)",
          }}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shadow-[0_0_16px_rgba(249,115,22,0.2)]">
              <Store className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">{shop.shopName}</h2>
                {isHidden ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-medium">
                    <EyeOff className="w-3 h-3" /> Hidden
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">Registered Shop Overview & Live Staff Roster</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Shop ID Hero Banner */}
          <div
            className="p-4 rounded-xl flex items-center justify-between border"
            style={{
              background:
                "linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(13,12,18,0.85) 100%)",
              borderColor: "rgba(249,115,22,0.28)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-widest text-orange-300/80 font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-orange-400" />
                Unique Shop Identifier
              </span>
              <div className="text-2xl font-bold font-mono tracking-wider text-orange-100 drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">
                {shop.shopId}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-200 transition-all font-mono text-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>

          {/* Shop Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Owner Info */}
            <div className="p-3.5 rounded-xl bg-black/35 border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <User className="w-3 h-3 text-orange-400/80" /> Owner Full Name
              </span>
              <p className="text-sm font-medium text-zinc-200">{shop.ownerName}</p>
            </div>

            {/* Phone Number */}
            <div className="p-3.5 rounded-xl bg-black/35 border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-orange-400/80" /> Contact Phone
              </span>
              <p className="text-sm font-mono text-zinc-200">{shop.phone}</p>
            </div>

            {/* Billing Email */}
            <div className="p-3.5 rounded-xl bg-black/35 border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-orange-400/80" /> Billing / Contact Email
              </span>
              <p className="text-xs text-zinc-300 truncate">
                {shop.email || <span className="text-zinc-600 italic">Not specified</span>}
              </p>
            </div>

            {/* Physical Address */}
            <div className="p-3.5 rounded-xl bg-black/35 border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-orange-400/80" /> Store Address
              </span>
              <p className="text-xs text-zinc-300 truncate">
                {shop.address || <span className="text-zinc-600 italic">Not specified</span>}
              </p>
            </div>
          </div>

          {/* Coordinates & Location Section */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Compass className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <span className="text-zinc-300 font-medium block">Geolocation Coordinates</span>
                <span className="text-zinc-500 text-[11px] font-mono">
                  {shop.latitude && shop.longitude
                    ? `Lat: ${shop.latitude.toFixed(6)}, Long: ${shop.longitude.toFixed(6)}`
                    : "Coordinates not mapped yet"}
                </span>
              </div>
            </div>

            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-orange-300 hover:text-orange-200 text-xs transition-colors"
              >
                <span>Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Assigned Staff Members List */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-400" />
                <h3 className="font-semibold text-zinc-200">
                  Assigned Staff ({staffList.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onAssignStaff(shop);
                }}
                className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 text-xs font-medium hover:underline"
              >
                <UserPlus className="w-3 h-3" /> Add Staff Member
              </button>
            </div>

            {loadingStaff ? (
              <div className="p-4 rounded-xl bg-black/30 border border-white/[0.05] flex items-center justify-center text-zinc-500">
                <div className="w-4 h-4 rounded-full border-2 border-orange-500/30 border-t-orange-400 animate-spin mr-2" />
                Loading staff roster…
              </div>
            ) : staffList.length === 0 ? (
              <div className="p-4 rounded-xl bg-black/25 border border-white/[0.05] text-center text-zinc-500">
                No staff members currently assigned to this shop ID.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {staffList.map((user) => {
                  const roleCfg = ROLE_CONFIG[user.role] || {
                    label: user.role,
                    color: "text-zinc-400",
                    bg: "bg-zinc-500/10",
                    border: "border-zinc-500/20",
                  };
                  return (
                    <div
                      key={user.uid}
                      className="p-2.5 rounded-xl bg-black/40 border border-white/[0.05] flex items-center justify-between hover:border-white/[0.1] transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-orange-500/20 to-amber-500/10 border border-white/[0.08] flex items-center justify-center font-bold text-orange-300 text-xs">
                          {(user.displayName || user.username || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-zinc-200 font-medium leading-tight">
                            {user.displayName || user.username}
                          </div>
                          <div className="text-zinc-500 text-[11px] leading-tight font-mono">{user.username ? `@${user.username}` : user.email}</div>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${roleCfg.bg} ${roleCfg.color} ${roleCfg.border}`}
                      >
                        {roleCfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.05] text-[11px] text-zinc-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-600" /> Created: {formattedCreated}
            </span>
            <span>Updated: {formattedUpdated}</span>
          </div>
        </div>

        {/* Modal Footer Actions Bar */}
        <div className="px-6 py-4 border-t border-white/[0.08] bg-black/40 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              handleClose();
              onDelete(shop);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 hover:text-red-200 text-xs font-medium transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Shop</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onToggleHide(shop);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 hover:text-zinc-100 text-xs font-medium transition-all"
            >
              {isHidden ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Unhide Shop</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Hide Shop</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                handleClose();
                onEdit(shop);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_16px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_22px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Details</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
