"use client";

/**
 * ShopStaffDrawer.tsx
 *
 * Slide-in drawer displaying real-time staff members assigned strictly to the active Shop ID.
 */

import React, { useEffect, useState, useRef } from "react";
import gsap from "gsap";
import {
  Users,
  X,
  UserPlus,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  AlertCircle,
  Store,
  Layers,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";
import { ShopUser, ROLE_CONFIG } from "@/lib/types/user";
import { subscribeToUsersByShop, deleteUser } from "@/lib/services/userService";

interface ShopStaffDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  shop: Shop | null;
  onAddStaff: (shop: Shop) => void;
}

export function ShopStaffDrawer({
  isOpen,
  onClose,
  shop,
  onAddStaff,
}: ShopStaffDrawerProps) {
  const [users, setUsers] = useState<ShopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Subscribe to shop's staff
  useEffect(() => {
    if (!shop || !isOpen) {
      setUsers([]);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUsersByShop(shop.shopId, (fetchedUsers) => {
      setUsers(fetchedUsers);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [shop, isOpen]);

  // GSAP slide-in animation
  useEffect(() => {
    if (!isOpen) return;

    const overlay = overlayRef.current;
    const drawer = drawerRef.current;
    if (!overlay || !drawer) return;

    gsap.set(overlay, { opacity: 0 });
    gsap.set(drawer, { x: "100%", opacity: 0 });

    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.25, ease: "power2.out" })
      .to(
        drawer,
        {
          x: "0%",
          opacity: 1,
          duration: 0.35,
          ease: "power3.out",
        },
        "-=0.15"
      );
  }, [isOpen]);

  const handleClose = () => {
    const overlay = overlayRef.current;
    const drawer = drawerRef.current;
    if (!overlay || !drawer) {
      onClose();
      return;
    }

    const tl = gsap.timeline({
      onComplete: onClose,
    });

    tl.to(drawer, {
      x: "100%",
      opacity: 0,
      duration: 0.25,
      ease: "power2.in",
    }).to(
      overlay,
      {
        opacity: 0,
        duration: 0.18,
        ease: "power2.in",
      },
      "-=0.1"
    );
  };

  const handleDeleteUser = async (user: ShopUser) => {
    if (!shop) return;
    if (confirm(`Remove staff member ${user.displayName} from shop ${shop.shopId}?`)) {
      setDeletingId(user.uid);
      try {
        await deleteUser(user.uid, shop.shopId);
      } catch (err) {
        console.error("Error deleting user:", err);
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (!isOpen || !shop) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex justify-end"
      style={{
        background: "rgba(6, 6, 10, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        ref={drawerRef}
        className="w-full max-w-md h-full flex flex-col justify-between overflow-hidden relative"
        style={{
          background: "rgba(18, 17, 26, 0.95)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "-10px 0 40px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>{shop.shopName}</span>
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-orange-300 font-mono font-semibold px-1.5 py-0.5 rounded bg-orange-500/20">
                  {shop.shopId}
                </span>
                <span className="text-xs text-zinc-400">
                  {users.length} staff member{users.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Staff List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-400">
              <div className="w-6 h-6 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
              <span className="text-xs">Loading staff records…</span>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-center p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-300">No staff assigned yet</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Assign admins, managers, or cashiers to operate this shop.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAddStaff(shop)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-200 text-xs font-semibold transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Assign First Staff</span>
              </button>
            </div>
          ) : (
            users.map((user) => {
              const cfg = ROLE_CONFIG[user.role] || ROLE_CONFIG.cashier;
              return (
                <div
                  key={user.uid}
                  className="p-4 rounded-xl bg-black/40 border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">{user.displayName}</h4>
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-zinc-500" />
                        {user.email}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase ${cfg.bg} ${cfg.color} ${cfg.border} border`}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-white/[0.04]">
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      <Layers className="w-3 h-3 text-orange-400/70" />
                      <span>Shop: {user.shopId}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user)}
                      disabled={deletingId === user.uid}
                      className="text-red-400 hover:text-red-300 text-[11px] flex items-center gap-1 p-1 hover:bg-red-500/10 rounded transition-colors"
                      title="Remove staff member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deletingId === user.uid ? "Removing…" : "Remove"}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/[0.08] bg-black/20">
          <button
            type="button"
            onClick={() => onAddStaff(shop)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white text-xs font-semibold shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Assign New Staff Member</span>
          </button>
        </div>
      </div>
    </div>
  );
}
