"use client";

/**
 * AddShopModal.tsx
 *
 * GSAP-powered Shop Registration Modal with:
 *  - Dimmed blurred frosted-glass backdrop
 *  - Form sliding up from bottom with smooth power3.out easing
 *  - Input fields animated in sequence (stagger)
 *  - Optional Location input (latitude and longitude with auto-detect)
 *  - Post-submission side-by-side transition showing confirmation panel on the right
 *  - High-contrast glowing Shop ID badge, copy-to-clipboard, and quick staff assignment trigger
 *  - Fluid reverse closing animation
 */

import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import {
  Store,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  UserPlus,
  ArrowRight,
  X,
  Phone,
  User,
  MapPin,
  Mail,
  RefreshCw,
  Layers,
  Navigation,
  Compass,
} from "lucide-react";
import { createShop, generateShopId } from "@/lib/services/shopService";
import { Shop } from "@/lib/types/shop";

interface AddShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShopCreated?: (shop: Shop) => void;
  onRequestAssignStaff?: (shop: Shop) => void;
}

export function AddShopModal({
  isOpen,
  onClose,
  onShopCreated,
  onRequestAssignStaff,
}: AddShopModalProps) {
  const [shopId, setShopId] = useState("");
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [isDetectingGeo, setIsDetectingGeo] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdShop, setCreatedShop] = useState<Shop | null>(null);
  const [copied, setCopied] = useState(false);

  // GSAP animation references
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const confirmationPanelRef = useRef<HTMLDivElement>(null);
  const fieldsContainerRef = useRef<HTMLDivElement>(null);

  // Initialize auto-generated Shop ID when modal opens
  useEffect(() => {
    if (isOpen) {
      setShopId(generateShopId());
      setShopName("");
      setOwnerName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setLatitude("");
      setLongitude("");
      setCreatedShop(null);
      setErrorMessage(null);
      setCopied(false);
    }
  }, [isOpen]);

  // Entrance GSAP animation
  useEffect(() => {
    if (!isOpen) return;

    const overlay = overlayRef.current;
    const formPanel = formPanelRef.current;
    const fields = fieldsContainerRef.current?.querySelectorAll("[data-animate-field]");

    if (!overlay || !formPanel) return;

    gsap.set(overlay, { opacity: 0 });
    gsap.set(formPanel, { y: 80, opacity: 0, scale: 0.96 });

    const tl = gsap.timeline();

    // 1. Fade in blurred glass backdrop
    tl.to(overlay, {
      opacity: 1,
      duration: 0.35,
      ease: "power2.out",
    });

    // 2. Slide form up from bottom with smooth easing
    tl.to(
      formPanel,
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.45,
        ease: "power3.out",
      },
      "-=0.15"
    );

    // 3. Animate input fields in sequence (stagger)
    if (fields && fields.length > 0) {
      gsap.set(fields, { y: 20, opacity: 0 });
      tl.to(
        fields,
        {
          y: 0,
          opacity: 1,
          duration: 0.35,
          ease: "power2.out",
          stagger: 0.055,
        },
        "-=0.25"
      );
    }
  }, [isOpen]);

  // Side-by-side transition when shop is successfully created
  useEffect(() => {
    if (!createdShop) return;

    const formPanel = formPanelRef.current;
    const confirmPanel = confirmationPanelRef.current;
    if (!confirmPanel) return;

    gsap.set(confirmPanel, { x: 50, opacity: 0, scale: 0.95 });

    const tl = gsap.timeline();

    if (formPanel) {
      tl.to(formPanel, {
        scale: 0.98,
        duration: 0.35,
        ease: "power3.out",
      });
    }

    tl.to(
      confirmPanel,
      {
        x: 0,
        opacity: 1,
        scale: 1,
        duration: 0.45,
        ease: "power3.out",
      },
      "-=0.2"
    );
  }, [createdShop]);

  const handleClose = () => {
    const overlay = overlayRef.current;
    const modalContainer = modalContainerRef.current;

    if (!overlay || !modalContainer) {
      onClose();
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        onClose();
      },
    });

    tl.to(modalContainer, {
      y: 40,
      opacity: 0,
      scale: 0.95,
      duration: 0.28,
      ease: "power2.in",
    });

    tl.to(
      overlay,
      {
        opacity: 0,
        duration: 0.22,
        ease: "power2.in",
      },
      "-=0.15"
    );
  };

  const handleRegenerateId = () => {
    setShopId(generateShopId());
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

  const handleCopyId = () => {
    if (!createdShop) return;
    navigator.clipboard.writeText(createdShop.shopId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Minimum required fields validation
    if (!shopId.trim() || !shopName.trim() || !ownerName.trim() || !phone.trim()) {
      setErrorMessage("Please fill in all 4 mandatory fields: Shop ID, Name, Owner, and Phone.");
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
      const newShop = await createShop({
        shopId,
        shopName,
        ownerName,
        phone,
        email,
        address,
        latitude: parsedLat,
        longitude: parsedLng,
      });

      setCreatedShop(newShop);
      if (onShopCreated) onShopCreated(newShop);
    } catch (err: any) {
      console.error("Error creating shop:", err);
      setErrorMessage(err.message || "Failed to register shop. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{
        background: "rgba(6, 6, 10, 0.72)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      {/* Modal Container */}
      <div
        ref={modalContainerRef}
        className={`relative w-full transition-all duration-500 ease-out flex flex-col md:flex-row gap-5 items-stretch justify-center max-h-[90vh] ${
          createdShop ? "max-w-4xl" : "max-w-xl"
        }`}
      >
        {/* ── Left Form Panel ── */}
        <div
          ref={formPanelRef}
          className="flex-1 rounded-2xl overflow-y-auto relative flex flex-col justify-between"
          style={{
            background: "rgba(18, 17, 26, 0.88)",
            backdropFilter: "blur(32px) saturate(200%) brightness(1.05)",
            WebkitBackdropFilter: "blur(32px) saturate(200%) brightness(1.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow:
              "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(249, 115, 22, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          }}
        >
          {/* Top Glow Accent */}
          <div
            className="absolute top-0 inset-x-0 h-1"
            style={{
              background:
                "linear-gradient(90deg, transparent, #ea4815 30%, #f97316 60%, transparent)",
            }}
          />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                <Store className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                  Register New Shop
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 font-mono font-normal border border-orange-500/20">
                    Branch Root
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Shop credentials, contact details, and optional map coordinates
                </p>
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2 animate-shake">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                {errorMessage}
              </div>
            )}

            <div ref={fieldsContainerRef} className="space-y-3.5">
              {/* Field 1: Unique Shop ID */}
              <div data-animate-field className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-orange-400" />
                    Shop ID <span className="text-orange-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleRegenerateId}
                    disabled={!!createdShop}
                    className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 font-mono hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" /> Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={shopId}
                    onChange={(e) => setShopId(e.target.value.toUpperCase())}
                    placeholder="e.g. SHP-1001"
                    disabled={!!createdShop || isSubmitting}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 text-zinc-100 text-sm font-mono tracking-wider transition-all placeholder:text-zinc-600 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Field 2: Shop Name */}
              <div data-animate-field className="space-y-1">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-orange-400" />
                  Shop Name <span className="text-orange-400">*</span>
                </label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Apex Mobile Care & POS"
                  disabled={!!createdShop || isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 text-zinc-100 text-sm transition-all placeholder:text-zinc-600 disabled:opacity-60"
                />
              </div>

              {/* Field 3 & 4: Owner Name and Contact Phone */}
              <div data-animate-field className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-orange-400" />
                    Owner Name <span className="text-orange-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Alex Henderson"
                    disabled={!!createdShop || isSubmitting}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-sm transition-all placeholder:text-zinc-600 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-orange-400" />
                    Contact Phone <span className="text-orange-400">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 382-9912"
                    disabled={!!createdShop || isSubmitting}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-sm transition-all placeholder:text-zinc-600 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Optional: Email & Address */}
              <div data-animate-field className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-zinc-500" />
                    Billing Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="billing@shop.com"
                    disabled={!!createdShop || isSubmitting}
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/[0.06] text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-zinc-500" />
                    Store Address (Optional)
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Floor 2, Market Plaza"
                    disabled={!!createdShop || isSubmitting}
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/[0.06] text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/40"
                  />
                </div>
              </div>

              {/* ── Optional Location Coordinates (Latitude & Longitude) ── */}
              <div
                data-animate-field
                className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-orange-400" />
                    Map Coordinates <span className="text-[10px] text-zinc-500 font-normal">(Optional for Map View)</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isDetectingGeo || !!createdShop}
                    className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 font-mono hover:underline disabled:opacity-50"
                  >
                    <Navigation className="w-3 h-3" />
                    {isDetectingGeo ? "Detecting…" : "Detect Location"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                      Latitude (e.g. 37.7749)
                    </label>
                    <input
                      type="text"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="37.7749"
                      disabled={!!createdShop || isSubmitting}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                      Longitude (e.g. -122.4194)
                    </label>
                    <input
                      type="text"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="-122.4194"
                      disabled={!!createdShop || isSubmitting}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/40"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {!createdShop && (
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
                  className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Creating Shop…</span>
                    </>
                  ) : (
                    <>
                      <span>Register Shop</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* ── Right Confirmation Panel (Appears after submission side-by-side) ── */}
        {createdShop && (
          <div
            ref={confirmationPanelRef}
            className="w-full md:w-[380px] rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden"
            style={{
              background: "rgba(22, 19, 32, 0.92)",
              backdropFilter: "blur(32px) saturate(200%) brightness(1.1)",
              WebkitBackdropFilter: "blur(32px) saturate(200%) brightness(1.1)",
              border: "1px solid rgba(249, 115, 22, 0.25)",
              boxShadow:
                "0 25px 50px -12px rgba(0,0,0,0.8), 0 0 50px rgba(249, 115, 22, 0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            {/* Ambient background glow */}
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-orange-500/15 blur-3xl pointer-events-none" />

            <div className="space-y-5 relative z-10">
              {/* Success Badge */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Shop Created Successfully!
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Firestore collection <code className="text-orange-300">shops</code> updated
                  </p>
                </div>
              </div>

              {/* High-Impact Glowing Shop ID Card */}
              <div
                className="p-4 rounded-xl relative overflow-hidden group border"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(15,14,23,0.7) 100%)",
                  borderColor: "rgba(249,115,22,0.35)",
                  boxShadow: "0 0 25px rgba(249,115,22,0.15), inset 0 1px 0 rgba(255,255,255,0.1)",
                }}
              >
                <div className="flex items-center justify-between text-[11px] text-orange-300/80 mb-1">
                  <span className="uppercase tracking-wider font-semibold">Assigned Shop ID</span>
                  <Sparkles className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xl font-bold font-mono tracking-widest text-orange-100 drop-shadow-[0_0_12px_rgba(249,115,22,0.5)]">
                    {createdShop.shopId}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-2 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-200 transition-all flex items-center gap-1 text-xs"
                    title="Copy Shop ID"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300 text-[10px]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Shop Summary Details */}
              <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-white/[0.06] text-xs">
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Shop Name</span>
                  <span className="text-zinc-200 font-medium">{createdShop.shopName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Owner</span>
                  <span className="text-zinc-200">{createdShop.ownerName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Contact Phone</span>
                  <span className="text-zinc-200 font-mono">{createdShop.phone}</span>
                </div>
                {createdShop.latitude && createdShop.longitude && (
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-500">Coordinates</span>
                    <span className="text-orange-300 font-mono text-[11px]">
                      {createdShop.latitude.toFixed(4)}, {createdShop.longitude.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2.5 pt-5 relative z-10">
              <button
                type="button"
                onClick={() => {
                  if (onRequestAssignStaff && createdShop) {
                    onRequestAssignStaff(createdShop);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create & Assign Staff</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] transition-colors text-center"
              >
                Done & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
