"use client";

/**
 * components/layout/ShopUserNav.tsx
 *
 * Minimal, premium account dropdown:
 * - Single clickable account button (compact circular avatar with dynamic initial + chevron)
 * - Header text (username, role, access level) and separate Sign Out button removed
 * - Floating dropdown panel rendered via React Portal with fixed viewport positioning
 *   to prevent any layout collision, clipping, or z-index overflow bugs
 * - Menu items in order: Profile, Settings, Security, Divider, Sign Out
 * - Modal overlays for Profile (including multi-account switcher for admins), Settings, and Security
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  User,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
  X,
  Check,
  Search,
  ArrowLeftRight,
  ShieldCheck,
  Store,
  Sliders,
  Volume2,
  Printer,
  KeyRound,
  Lock,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { subscribeToAllShopAccounts } from "@/lib/services/shopAuthService";
import { ShopUser } from "@/lib/types/user";
import { BranchSelector } from "./BranchSelector";

interface ShopUserNavProps {
  className?: string;
  theme?: "teal" | "dark";
}

type ModalType = "profile" | "settings" | "security" | null;

interface DropdownPosition {
  top: number;
  right: number;
}

export function ShopUserNav({ className = "", theme = "dark" }: ShopUserNavProps) {
  const {
    shop,
    user,
    isAdmin,
    originalAdminUser,
    switchUser,
    logout,
  } = useShopAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [mounted, setMounted] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

  // Switcher state (managed in Profile modal)
  const [shopUsers, setShopUsers] = useState<ShopUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchFeedback, setSwitchFeedback] = useState<string | null>(null);

  // Settings preferences
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Set mounted flag for safe client-side portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate coordinates to float accurately under the account button without clipping
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }, []);

  // Update position on open, scroll, or resize
  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      const handleScrollOrResize = () => calculatePosition();
      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
      return () => {
        window.removeEventListener("scroll", handleScrollOrResize, true);
        window.removeEventListener("resize", handleScrollOrResize);
      };
    }
  }, [isOpen, calculatePosition]);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setActiveModal(null);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Strict admin check: current user is admin, or active session was originated by an admin
  const isActualAdmin = Boolean(
    (user?.role || "").toLowerCase().trim() === "admin" ||
    (originalAdminUser?.role || "").toLowerCase().trim() === "admin"
  );

  // Real-time listener for shop accounts (strictly active ONLY for administrators)
  useEffect(() => {
    if (!shop?.shopId || !isActualAdmin) {
      setShopUsers([]);
      return;
    }
    const unsub = subscribeToAllShopAccounts(shop.shopId, (accounts) => {
      setShopUsers(accounts);
    });
    return () => unsub();
  }, [shop?.shopId, isActualAdmin]);

  // Account switcher handler (strict security gate for admins only)
  const handleSelectAccount = (target: ShopUser) => {
    if (!isActualAdmin) {
      console.warn("[ShopUserNav] Access Denied: Profile switching is restricted to administrators.");
      return;
    }
    if (target.uid === user?.uid) return;
    setIsSwitching(true);
    switchUser(target);
    setSwitchFeedback(`Switched to ${target.displayName || target.username} (${target.role})`);
    setTimeout(() => {
      setIsSwitching(false);
      setSwitchFeedback(null);
    }, 900);
  };

  const handleReturnToAdmin = () => {
    if (!isActualAdmin || !originalAdminUser) return;
    handleSelectAccount(originalAdminUser);
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return shopUsers;
    return shopUsers.filter(
      (u) =>
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        u.username.toLowerCase().includes(q) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))
    );
  }, [shopUsers, searchQuery]);

  // Dynamic initial from current user's actual name (not hardcoded)
  const userInitial = useMemo(() => {
    const rawName = user?.displayName || user?.username || user?.email || "User";
    const trimmed = rawName.trim();
    return (trimmed.charAt(0) || "U").toUpperCase();
  }, [user]);

  const isActingSwitched = Boolean(originalAdminUser && user?.uid !== originalAdminUser.uid);
  const isTeal = theme === "teal";

  // Floating Dropdown Content
  const dropdownContent = isOpen && dropdownPosition && (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      style={{
        position: "fixed",
        top: `${dropdownPosition.top}px`,
        right: `${dropdownPosition.right}px`,
        zIndex: 99999,
      }}
      className="w-56 sm:w-60 rounded-2xl bg-[#0e1017] border border-white/15 shadow-[0_12px_48px_rgba(0,0,0,0.85)] p-1.5 flex flex-col select-auto animate-in fade-in duration-100"
    >
      {/* User Preview Header */}
      <div className="px-3 py-2.5 mb-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user?.displayName || user?.username || "Avatar"}
              className="w-7 h-7 rounded-full object-cover border border-white/20 shrink-0"
            />
          ) : (
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] text-white shrink-0 ${
                isTeal
                  ? "bg-teal-600"
                  : "bg-gradient-to-br from-violet-600 to-indigo-600"
              }`}
            >
              {userInitial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">
              {user?.displayName || user?.username || "Authenticated User"}
            </p>
            <p className="text-[10px] text-zinc-400 font-mono truncate">
              {user?.email || (user?.username ? `@${user.username}` : "Staff")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/[0.05]">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60 font-mono capitalize">
            {user?.role || "Staff"}
          </span>
          {isAdmin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/25 font-mono">
              Admin
            </span>
          )}
          {isActingSwitched && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
              Switched
            </span>
          )}
        </div>
      </div>

      {/* Menu Items strictly in the requested order */}
      <div className="flex flex-col gap-0.5">
        {/* 1. Profile — redirects directly to Profile page under Settings */}
        <Link
          role="menuitem"
          href="/shop/settings?view=profile"
          onClick={() => {
            setIsOpen(false);
          }}
          className="w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium text-zinc-200 hover:text-white hover:bg-white/[0.07] flex items-center gap-2.5 transition-colors cursor-pointer group"
        >
          <User className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors shrink-0" />
          <span>Profile</span>
        </Link>

        {/* 2. Settings — settings gear icon */}
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            setIsOpen(false);
            setActiveModal("settings");
          }}
          className="w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium text-zinc-200 hover:text-white hover:bg-white/[0.07] flex items-center gap-2.5 transition-colors cursor-pointer group"
        >
          <Settings className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors shrink-0" />
          <span>Settings</span>
        </button>

        {/* 3. Security — shield icon */}
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            setIsOpen(false);
            setActiveModal("security");
          }}
          className="w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium text-zinc-200 hover:text-white hover:bg-white/[0.07] flex items-center gap-2.5 transition-colors cursor-pointer group"
        >
          <Shield className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors shrink-0" />
          <span>Security</span>
        </button>

        {/* 4. Divider */}
        <div className="my-1 border-t border-white/[0.08]" role="separator" />

        {/* 5. Sign Out — logout icon */}
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            setIsOpen(false);
            logout();
          }}
          className="w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 flex items-center gap-2.5 transition-colors cursor-pointer group"
        >
          <LogOut className="w-4 h-4 text-rose-400 group-hover:text-rose-200 transition-colors shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      <BranchSelector compact />
      {/* ── Single Clickable Account Button ── */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User account menu"
        className={`group flex items-center gap-1.5 p-1 pr-2 rounded-full border transition-all duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09080d] ${
          isTeal
            ? "bg-[#0b2b24]/90 hover:bg-[#0f382f] border-[#165a4e]/80 hover:border-teal-400/50"
            : "bg-white/[0.05] hover:bg-white/[0.09] border-white/10 hover:border-white/20"
        } ${
          isOpen
            ? isTeal
              ? "ring-2 ring-teal-500/40 border-teal-500/60 bg-[#0f382f]"
              : "ring-2 ring-white/20 border-white/25 bg-white/[0.09]"
            : ""
        }`}
      >
        {/* Compact circular avatar containing user's photo or first letter */}
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user?.displayName || user?.username || "Avatar"}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-white/25 shadow-inner shrink-0 transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs select-none shadow-inner shrink-0 transition-transform duration-200 group-hover:scale-105 ${
              isTeal
                ? "bg-gradient-to-br from-teal-500 to-emerald-700 text-teal-50 border border-teal-400/30"
                : "bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white border border-white/20"
            }`}
          >
            {userInitial}
          </div>
        )}

        {/* Small chevron beside avatar */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      {/* ── Render Dropdown in Portal to Guarantee No Layout Clipping ── */}
      {mounted && typeof document !== "undefined" && dropdownContent
        ? createPortal(dropdownContent, document.body)
        : null}

      {/* ── Profile Modal (with Admin Account Switcher) ── */}
      {activeModal === "profile" && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1017] border border-white/10 shadow-2xl p-5 flex flex-col gap-4 text-zinc-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">User Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User Details Card */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center gap-3">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user?.displayName || user?.username || "Avatar"}
                  className="w-12 h-12 rounded-full object-cover border border-white/20 shrink-0"
                />
              ) : (
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base text-white shrink-0 ${
                    isTeal
                      ? "bg-gradient-to-br from-teal-500 to-emerald-700"
                      : "bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600"
                  }`}
                >
                  {userInitial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-white truncate">
                  {user?.displayName || user?.username || "Authenticated User"}
                </h4>
                <p className="text-xs text-zinc-400 font-mono truncate">
                  @{user?.username} {user?.email ? `• ${user.email}` : ""}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono capitalize">
                    {user?.role || "Staff"}
                  </span>
                  {shop?.shopId && (
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                      <Store className="w-3.5 h-3.5 text-zinc-500" />
                      {shop.shopId}
                    </span>
                  )}
                </div>
              </div>
              <Link
                href="/shop/settings?view=profile"
                onClick={() => setActiveModal(null)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors shrink-0"
              >
                Edit Profile
              </Link>
            </div>

            {/* Switched banner (Admin restore shortcut) */}
            {isActingSwitched && originalAdminUser && isActualAdmin && (
              <button
                type="button"
                onClick={handleReturnToAdmin}
                className="w-full px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 text-xs font-semibold flex items-center justify-between transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-amber-400 group-hover:rotate-180 transition-transform" />
                  <span>Return to Admin ({originalAdminUser.displayName || originalAdminUser.username})</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  Restore
                </span>
              </button>
            )}

            {/* Switch feedback */}
            {switchFeedback && (
              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{switchFeedback}</span>
              </div>
            )}

            {/* Profile Switcher: STRICTLY EXCLUSIVE TO ADMINISTRATORS (Hidden from all other users) */}
            {isActualAdmin ? (
              <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                    <span>Switch Profile ({shop?.shopId})</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                    {filteredUsers.length} total
                  </span>
                </div>

                {shopUsers.length > 3 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Filter accounts by name or role..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:border-teal-500 outline-none"
                    />
                  </div>
                )}

                <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
                  {filteredUsers.map((acc) => {
                    const isActive = acc.uid === user?.uid;
                    const accInitial = (acc.displayName || acc.username || "U").charAt(0).toUpperCase();

                    return (
                      <button
                        key={acc.uid}
                        type="button"
                        disabled={isSwitching}
                        onClick={() => handleSelectAccount(acc)}
                        className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                          isActive
                            ? "bg-teal-500/15 border border-teal-500/30 text-teal-200"
                            : "hover:bg-white/[0.05] border border-transparent text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center font-bold text-[10px] shrink-0 border border-zinc-700">
                            {accInitial}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate text-white">
                              {acc.displayName || acc.username}
                            </p>
                            <p className="text-[10px] text-zinc-400 font-mono truncate">
                              @{acc.username} • {acc.role}
                            </p>
                          </div>
                        </div>

                        {isActive && (
                          <span className="text-[10px] font-bold text-teal-400 flex items-center gap-1 font-mono">
                            <Check className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Non-admin read-only access card - Profile switching is hidden */
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5 text-zinc-400 text-xs">
                <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                <span className="text-[11px] leading-relaxed text-zinc-400">
                  Profile switching is restricted to administrators. Standard staff sessions remain locked to the assigned account.
                </span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal ── */}
      {activeModal === "settings" && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1017] border border-white/10 shadow-2xl p-5 flex flex-col gap-4 text-zinc-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">Application Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-medium text-white">Audio Feedback</p>
                    <p className="text-[11px] text-zinc-400">Play sounds on scan and checkout</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((prev) => !prev)}
                  className={`w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    soundEnabled ? "bg-teal-500" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      soundEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <Printer className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-medium text-white">Auto-Print Receipts</p>
                    <p className="text-[11px] text-zinc-400">Automatically trigger print after sale</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoPrintReceipt((prev) => !prev)}
                  className={`w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    autoPrintReceipt ? "bg-teal-500" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      autoPrintReceipt ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-medium text-white">Compact Grid View</p>
                    <p className="text-[11px] text-zinc-400">Display more items per screen row</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCompactMode((prev) => !prev)}
                  className={`w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    compactMode ? "bg-teal-500" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      compactMode ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Security Modal ── */}
      {activeModal === "security" && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1017] border border-white/10 shadow-2xl p-5 flex flex-col gap-4 text-zinc-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">Security & Session</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white">Session Scoping</p>
                  <p className="text-[11px] text-zinc-400">Strict multi-tenant token partition</p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                  Active
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white">Shop Identifier</p>
                  <p className="text-[11px] text-zinc-400 font-mono">{shop?.shopId || "pos-shop"}</p>
                </div>
                <Lock className="w-4 h-4 text-zinc-400" />
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white">User UID</p>
                  <p className="text-[11px] text-zinc-400 font-mono truncate max-w-[200px]">
                    {user?.uid || "session-anonymous"}
                  </p>
                </div>
                <KeyRound className="w-4 h-4 text-zinc-400" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
