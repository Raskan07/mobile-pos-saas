"use client";

/**
 * DeleteShopModal.tsx
 *
 * Glassmorphic Confirmation Modal for safely deleting a registered shop
 * from Firestore with safety warnings and danger-accented aesthetic.
 */

import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { AlertTriangle, Trash2, X, Store, Layers } from "lucide-react";
import { Shop } from "@/lib/types/shop";
import { deleteShop } from "@/lib/services/shopService";

interface DeleteShopModalProps {
  isOpen: boolean;
  shop: Shop | null;
  onClose: () => void;
  onDeleted: (shopId: string) => void;
}

export function DeleteShopModal({
  isOpen,
  shop,
  onClose,
  onDeleted,
}: DeleteShopModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsDeleting(false);
    }
  }, [isOpen]);

  // Entrance animation
  useEffect(() => {
    if (!isOpen) return;

    const overlay = overlayRef.current;
    const modal = modalRef.current;
    if (!overlay || !modal) return;

    gsap.set(overlay, { opacity: 0 });
    gsap.set(modal, { y: 30, opacity: 0, scale: 0.95 });

    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.25, ease: "power2.out" })
      .to(modal, { y: 0, opacity: 1, scale: 1, duration: 0.32, ease: "power3.out" }, "-=0.12");
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
    tl.to(modal, { y: 20, opacity: 0, scale: 0.96, duration: 0.18, ease: "power2.in" })
      .to(overlay, { opacity: 0, duration: 0.15, ease: "power2.in" }, "-=0.08");
  };

  const handleDelete = async () => {
    if (!shop) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteShop(shop.shopId);
      onDeleted(shop.shopId);
      handleClose();
    } catch (err: any) {
      console.error("Error deleting shop:", err);
      setErrorMessage(err.message || "Failed to delete shop. Please try again.");
      setIsDeleting(false);
    }
  };

  if (!isOpen || !shop) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{
        background: "rgba(6, 6, 10, 0.8)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md rounded-2xl overflow-hidden flex flex-col my-auto"
        style={{
          background: "rgba(20, 16, 24, 0.96)",
          backdropFilter: "blur(36px) saturate(200%) brightness(1.05)",
          WebkitBackdropFilter: "blur(36px) saturate(200%) brightness(1.05)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          boxShadow:
            "0 30px 60px -15px rgba(0, 0, 0, 0.85), 0 0 45px rgba(239, 68, 68, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Red Danger Shimmer Top Accent */}
        <div
          className="h-1 w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, #ef4444 40%, #dc2626 70%, transparent)",
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shadow-[0_0_16px_rgba(239,68,68,0.25)] text-red-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Delete Shop</h2>
              <p className="text-xs text-zinc-400">Permanent removal confirmation</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
              {errorMessage}
            </div>
          )}

          <p className="text-zinc-300 leading-relaxed">
            Are you sure you want to permanently delete this shop? All branch data, configuration, and credentials will be removed from Firestore.
          </p>

          {/* Shop Highlight Box */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-orange-400" /> Shop Name
              </span>
              <span className="font-semibold text-zinc-200">{shop.shopName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-orange-400" /> Shop ID
              </span>
              <span className="font-mono font-bold text-orange-300">{shop.shopId}</span>
            </div>

            {shop.ownerName && (
              <div className="flex items-center justify-between border-t border-white/[0.04] pt-1.5">
                <span className="text-zinc-500">Owner</span>
                <span className="text-zinc-300">{shop.ownerName}</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-zinc-400 italic">
            Note: Associated staff users can be reassigned or updated separately in the Staff section.
          </p>
        </div>

        {/* Actions Footer */}
        <div className="px-6 py-4 border-t border-white/[0.08] bg-black/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-semibold shadow-[0_4px_20px_rgba(239,68,68,0.4)] active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {isDeleting ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Deleting…</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Shop</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
