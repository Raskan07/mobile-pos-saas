"use client";

/**
 * AssignUserModal.tsx
 *
 * GSAP-animated modal to register user accounts via Firebase Auth & Firestore `users`
 * Enforces assignment to exactly ONE shop with role selector (admin, manager, cashier).
 */

import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import {
  UserPlus,
  Mail,
  Lock,
  User,
  Phone,
  ShieldCheck,
  Store,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { createUserAndAssignToShop } from "@/lib/services/userService";
import { Shop } from "@/lib/types/shop";
import { UserRole, ROLE_CONFIG, ShopUser } from "@/lib/types/user";

interface AssignUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetShop?: Shop | null;
  allShops?: Shop[];
  onUserAssigned?: (user: ShopUser) => void;
}

export function AssignUserModal({
  isOpen,
  onClose,
  targetShop,
  allShops = [],
  onUserAssigned,
}: AssignUserModalProps) {
  const [selectedShopId, setSelectedShopId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<ShopUser | null>(null);

  // GSAP animation refs
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (targetShop) {
        setSelectedShopId(targetShop.shopId);
      } else if (allShops.length > 0) {
        setSelectedShopId(allShops[0].shopId);
      }
      setDisplayName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setRole("cashier");
      setCreatedUser(null);
      setErrorMessage(null);
      setShowPassword(false);
    }
  }, [isOpen, targetShop, allShops]);

  // GSAP entrance animation
  useEffect(() => {
    if (!isOpen) return;
    const overlay = overlayRef.current;
    const modalPanel = modalPanelRef.current;

    if (!overlay || !modalPanel) return;

    gsap.set(overlay, { opacity: 0 });
    gsap.set(modalPanel, { y: 60, opacity: 0, scale: 0.96 });

    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.3, ease: "power2.out" })
      .to(
        modalPanel,
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.4,
          ease: "power3.out",
        },
        "-=0.15"
      );
  }, [isOpen]);

  const handleClose = () => {
    const overlay = overlayRef.current;
    const modalPanel = modalPanelRef.current;
    if (!overlay || !modalPanel) {
      onClose();
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        onClose();
      },
    });

    tl.to(modalPanel, {
      y: 40,
      opacity: 0,
      scale: 0.95,
      duration: 0.25,
      ease: "power2.in",
    }).to(
      overlay,
      {
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
      },
      "-=0.15"
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedShopId) {
      setErrorMessage("Please select a target shop to assign this user.");
      return;
    }
    if (!displayName.trim() || !email.trim()) {
      setErrorMessage("Please enter the user's full name and email.");
      return;
    }
    if (password && password.length < 6) {
      setErrorMessage("Password should be at least 6 characters for Firebase Auth.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await createUserAndAssignToShop(
        {
          displayName,
          email,
          phone,
          role,
          shopId: selectedShopId,
        },
        password || "shop123456" // Default temporary pass if none provided
      );

      setCreatedUser(user);
      if (onUserAssigned) onUserAssigned(user);
    } catch (err: any) {
      console.error("Error registering user:", err);
      setErrorMessage(err.message || "Failed to create user. Please try again.");
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
      <div
        ref={modalPanelRef}
        className="w-full max-w-lg rounded-2xl overflow-hidden relative"
        style={{
          background: "rgba(18, 17, 26, 0.9)",
          backdropFilter: "blur(32px) saturate(200%) brightness(1.05)",
          WebkitBackdropFilter: "blur(32px) saturate(200%) brightness(1.05)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Accent Bar */}
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
              <UserPlus className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                Assign User to Shop
              </h2>
              <p className="text-xs text-zinc-400">
                Create Firebase Auth account bound strictly to one Shop ID
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

        {/* Content Body */}
        {createdUser ? (
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-emerald-200">
                  Staff Account Created & Assigned!
                </p>
                <p className="text-emerald-300/80">
                  User <span className="font-medium text-emerald-100">{createdUser.displayName}</span> ({createdUser.email}) is now bound to Shop <span className="font-mono font-semibold text-emerald-200">{createdUser.shopId}</span> as <span className="font-semibold uppercase">{createdUser.role}</span>.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/[0.08] space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-zinc-500">Firebase UID</span>
                <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[200px]">
                  {createdUser.uid}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-zinc-500">Assigned Shop ID</span>
                <span className="text-orange-400 font-mono font-semibold">
                  {createdUser.shopId}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-zinc-500">Role</span>
                <span className="capitalize text-zinc-200 font-medium">{createdUser.role}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-500">Data Isolation</span>
                <span className="text-emerald-400 font-mono text-[11px]">
                  ✓ shopId == {createdUser.shopId}
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreatedUser(null);
                  setEmail("");
                  setDisplayName("");
                  setPassword("");
                }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-colors"
              >
                Add Another Staff
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_15px_rgba(234,72,21,0.35)] transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Target Shop Assignment */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-orange-400" />
                  Assigned Shop <span className="text-orange-400">*</span>
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">1 Shop per User</span>
              </label>

              {targetShop ? (
                <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Store className="w-4 h-4 text-orange-400" />
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">{targetShop.shopName}</div>
                      <div className="text-[11px] text-orange-300/80 font-mono">ID: {targetShop.shopId}</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-300 font-mono uppercase font-semibold">
                    Locked
                  </span>
                </div>
              ) : (
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 text-zinc-100 text-xs font-mono transition-all"
                >
                  <option value="" disabled>Select Target Shop…</option>
                  {allShops.map((s) => (
                    <option key={s.shopId} value={s.shopId} className="bg-zinc-900 text-zinc-100">
                      {s.shopId} — {s.shopName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Role Selection Tabs */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                Assign Role <span className="text-orange-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["admin", "manager", "cashier"] as UserRole[]).map((r) => {
                  const cfg = ROLE_CONFIG[r];
                  const isSelected = role === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      disabled={isSubmitting}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? `${cfg.bg} ${cfg.border} border-2 shadow-[0_0_15px_rgba(249,115,22,0.15)]`
                          : "bg-black/30 border-white/[0.08] hover:border-white/[0.15] opacity-70"
                      }`}
                    >
                      <div className={`text-xs font-semibold capitalize ${isSelected ? cfg.color : "text-zinc-300"}`}>
                        {cfg.label}
                      </div>
                      <div className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                        {r === "admin" ? "Full access" : r === "manager" ? "Stock & repairs" : "POS terminal"}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-zinc-400 italic pt-0.5">
                {ROLE_CONFIG[role].description}
              </p>
            </div>

            {/* Name & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <User className="w-3 h-3 text-zinc-400" />
                  Full Name <span className="text-orange-400">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Sarah Connor"
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs placeholder:text-zinc-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-zinc-400" />
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Email & Password for Firebase Auth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-zinc-400" />
                  Login Email <span className="text-orange-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@store.com"
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs placeholder:text-zinc-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-zinc-400" />
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 chars"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] focus:border-orange-500/60 text-zinc-100 text-xs placeholder:text-zinc-600 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
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
                    <span>Creating Account…</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Assign User</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
