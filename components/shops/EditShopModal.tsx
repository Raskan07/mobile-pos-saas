"use client";

/**
 * EditShopModal.tsx
 *
 * Glassmorphic Modal for editing registered shop credentials,
 * contact details, store location, map coordinates, and operational status.
 */

import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import {
  Store,
  User,
  Phone,
  Mail,
  MapPin,
  Compass,
  Navigation,
  Layers,
  Save,
  X,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";
import { updateShop } from "@/lib/services/shopService";

interface EditShopModalProps {
  isOpen: boolean;
  shop: Shop | null;
  onClose: () => void;
  onShopUpdated: (updatedShop: Shop) => void;
}

export function EditShopModal({
  isOpen,
  shop,
  onClose,
  onShopUpdated,
}: EditShopModalProps) {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [isHidden, setIsHidden] = useState(false);

  const [isDetectingGeo, setIsDetectingGeo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Sync state when shop changes
  useEffect(() => {
    if (shop) {
      setShopName(shop.shopName || "");
      setOwnerName(shop.ownerName || "");
      setPhone(shop.phone || "");
      setEmail(shop.email || "");
      setAddress(shop.address || "");
      setLatitude(shop.latitude !== undefined ? String(shop.latitude) : "");
      setLongitude(shop.longitude !== undefined ? String(shop.longitude) : "");
      setStatus(shop.status === "inactive" ? "inactive" : "active");
      setIsHidden(Boolean(shop.isHidden));
      setErrorMessage(null);
    }
  }, [shop, isOpen]);

  // Entrance animation
  useEffect(() => {
    if (!isOpen) return;

    const overlay = overlayRef.current;
    const modal = modalRef.current;
    if (!overlay || !modal) return;

    gsap.set(overlay, { opacity: 0 });
    gsap.set(modal, { y: 35, opacity: 0, scale: 0.96 });

    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.28, ease: "power2.out" })
      .to(modal, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, "-=0.15");
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
    tl.to(modal, { y: 25, opacity: 0, scale: 0.96, duration: 0.2, ease: "power2.in" })
      .to(overlay, { opacity: 0, duration: 0.16, ease: "power2.in" }, "-=0.1");
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your browser.");
      return;
    }
    setIsDetectingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setIsDetectingGeo(false);
      },
      (err) => {
        console.warn("Geo error:", err);
        setIsDetectingGeo(false);
        setErrorMessage("Could not detect location. You can enter lat & long manually.");
      },
      { timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setErrorMessage(null);

    if (!shopName.trim() || !ownerName.trim() || !phone.trim()) {
      setErrorMessage("Please fill in all mandatory fields: Shop Name, Owner Name, and Contact Phone.");
      return;
    }

    const parsedLat = latitude.trim() !== "" ? parseFloat(latitude.trim()) : undefined;
    const parsedLng = longitude.trim() !== "" ? parseFloat(longitude.trim()) : undefined;

    if (parsedLat !== undefined && isNaN(parsedLat)) {
      setErrorMessage("Latitude must be a valid number (e.g. 37.7749).");
      return;
    }
    if (parsedLng !== undefined && isNaN(parsedLng)) {
      setErrorMessage("Longitude must be a valid number (e.g. -122.4194).");
      return;
    }

    setIsSubmitting(true);
    try {
      const updates = {
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        latitude: parsedLat,
        longitude: parsedLng,
        status: isHidden ? ("inactive" as const) : status,
        isHidden: isHidden,
      };

      await updateShop(shop.shopId, updates);

      const updatedShopData: Shop = {
        ...shop,
        ...updates,
        updatedAt: Date.now(),
      };

      onShopUpdated(updatedShopData);
      handleClose();
    } catch (err: any) {
      console.error("Error updating shop:", err);
      setErrorMessage(err.message || "Failed to save shop changes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !shop) return null;

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
        className="relative w-full max-w-xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
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
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                Edit Shop Details
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/25">
                  {shop.shopId}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Update registered branch information and coordinates</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Readonly Shop ID Notice */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-400" />
              <span className="text-zinc-400 font-medium">Shop Identifier:</span>
              <span className="font-mono font-bold text-orange-300">{shop.shopId}</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">Immutable Root ID</span>
          </div>

          {/* Shop Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-orange-400" /> Shop Name <span className="text-orange-400">*</span>
            </label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="e.g. Nexus Electronics & POS"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 text-zinc-100 text-xs transition-all placeholder:text-zinc-600"
            />
          </div>

          {/* Owner Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-orange-400" /> Owner Name <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs transition-all placeholder:text-zinc-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-orange-400" /> Contact Phone <span className="text-orange-400">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +1 555-492-3810"
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs transition-all placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Billing Email & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-orange-400" /> Billing Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="billing@domain.com"
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs transition-all placeholder:text-zinc-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-400" /> Store Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Suite 400, Grand Mall"
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs transition-all placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Map Coordinates Section */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-orange-400" /> Map Coordinates
              </span>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isDetectingGeo || isSubmitting}
                className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 font-mono hover:underline disabled:opacity-50"
              >
                <Navigation className="w-3 h-3" />
                {isDetectingGeo ? "Detecting…" : "Auto-detect"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 uppercase font-mono">Latitude</label>
                <input
                  type="text"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="37.7749"
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 uppercase font-mono">Longitude</label>
                <input
                  type="text"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="-122.4194"
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/40"
                />
              </div>
            </div>
          </div>

          {/* Visibility / Hide Toggle */}
          <div className="p-3.5 rounded-xl bg-black/35 border border-white/[0.06] flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                {isHidden ? (
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Shop Visibility (Hide Option)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {isHidden
                  ? "Shop is currently hidden from standard operations."
                  : "Shop is currently active and visible."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsHidden(!isHidden)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isHidden
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              }`}
            >
              {isHidden ? "Hidden (Click to Show)" : "Visible (Click to Hide)"}
            </button>
          </div>

          {/* Form Actions Footer */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
