"use client";

/**
 * app/sa-9x8f2k/shops/page.tsx
 *
 * Clean, stunning Shop Registration & Management experience.
 * Features:
 *  - 3D interactive particle & wireframe sphere canvas
 *  - Ultra-clean minimalist glass interface
 *  - GSAP-powered "Add Shop" slide-up frosted modal with sequential field animation
 *  - Side-by-side confirmation panel with glowing Shop ID
 *  - Direct staff creation & single-shop user assignment with Firebase Auth
 *  - Fluid reverse GSAP closing animation returning to the canvas
 */

import React, { useState, useEffect, useRef } from "react";
import { Plus, Store, Users, Layers, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Shop } from "@/lib/types/shop";
import { subscribeToShops } from "@/lib/services/shopService";
import { AddShopModal } from "@/components/shops/AddShopModal";
import { AssignUserModal } from "@/components/shops/AssignUserModal";
import { ShopStaffDrawer } from "@/components/shops/ShopStaffDrawer";

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeTab, setActiveTab] = useState<"Default" | "Advanced">("Advanced");

  // Modals state
  const [isAddShopOpen, setIsAddShopOpen] = useState(false);
  const [isAssignStaffOpen, setIsAssignStaffOpen] = useState(false);
  const [isStaffDrawerOpen, setIsStaffDrawerOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subscribe to shops in real-time from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToShops((fetchedShops) => {
      setShops(fetchedShops);
      if (fetchedShops.length > 0 && !selectedShop) {
        setSelectedShop(fetchedShops[0]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to sidebar custom event "open-add-shop-modal"
  useEffect(() => {
    const handleOpenAddShop = () => {
      setIsAddShopOpen(true);
    };

    window.addEventListener("open-add-shop-modal", handleOpenAddShop);
    return () => window.removeEventListener("open-add-shop-modal", handleOpenAddShop);
  }, []);

  // Dynamic 3D Wireframe / Particle Sphere Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = 460);
    let height = (canvas.height = 460);

    const numPoints = 140;
    const radius = 170;
    const points: {
      x: number;
      y: number;
      z: number;
      origX: number;
      origY: number;
      origZ: number;
    }[] = [];

    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      points.push({
        x: x * radius,
        y: y * radius,
        z: z * radius,
        origX: x * radius,
        origY: y * radius,
        origZ: z * radius,
      });
    }

    let angleX = 0.003;
    let angleY = 0.006;
    let rotationX = 0.2;
    let rotationY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - width / 2;
      const mouseY = e.clientY - rect.top - height / 2;
      angleY = mouseX * 0.00005 + 0.003;
      angleX = mouseY * 0.00005 + 0.002;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      rotationX += angleX;
      rotationY += angleY;

      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);

      const projected = points.map((p) => {
        const x1 = p.origX * cosY - p.origZ * sinY;
        const z1 = p.origZ * cosY + p.origX * sinY;
        const y2 = p.origY * cosX - z1 * sinX;
        const z2 = z1 * cosX + p.origY * sinX;
        const fov = 400;
        const scale = fov / (fov + z2);
        return { x: x1 * scale + width / 2, y: y2 * scale + height / 2, z: z2, scale };
      });

      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const p1 = projected[i];
          const p2 = projected[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 65) {
            const alpha = Math.max(0.04, (1 - dist / 65) * 0.38 * ((p1.scale + p2.scale) / 2));
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
            ctx.lineWidth = 0.85;
            ctx.stroke();
          }
        }
      }

      for (const p of projected) {
        const depthAlpha = ((p.z + radius) / (2 * radius)) * 0.75 + 0.25;
        const size = Math.max(1, 1.8 * p.scale);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 138, 43, ${depthAlpha})`;
        ctx.fill();
        if (p.z > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(249, 115, 22, ${0.15 * depthAlpha})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const handleOpenAddShop = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsAddShopOpen(true);
  };

  const handleOpenAssignStaff = (shop?: Shop) => {
    if (shop) setSelectedShop(shop);
    setIsAssignStaffOpen(true);
  };

  const handleOpenStaffDrawer = (shop: Shop) => {
    setSelectedShop(shop);
    setIsStaffDrawerOpen(true);
  };

  return (
    <AppShell defaultSectionId="shops">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden p-8">
        
        {/* Centered Canvas 3D Particle Sphere */}
        <div className="relative flex items-center justify-center">
          <div className="absolute w-80 h-80 rounded-full bg-gradient-to-tr from-orange-600/15 via-amber-500/8 to-transparent blur-3xl pointer-events-none" />
          <canvas
            ref={canvasRef}
            className="cursor-grab active:cursor-grabbing relative z-10 hover:scale-[1.02] transition-transform duration-300"
            style={{ width: "380px", height: "380px" }}
          />
        </div>

        {/* Toggle Pill */}
        <div className="mt-4 flex items-center p-0.5 rounded-lg bg-black/40 border border-white/[0.08] backdrop-blur-md shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab("Default")}
            className={`px-4 py-1.5 rounded-md text-[11px] font-medium transition-all ${
              activeTab === "Default"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm border border-white/[0.08]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Default
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("Advanced")}
            className={`px-4 py-1.5 rounded-md text-[11px] font-medium transition-all ${
              activeTab === "Advanced"
                ? "bg-white/[0.14] text-zinc-100 shadow-sm border border-white/[0.08]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Advanced
          </button>
        </div>

        {/* Center Action Controls */}
        <div className="mt-6 flex flex-col items-center space-y-4">
          <p className="text-xs font-normal text-zinc-400 tracking-tight">
            {shops.length > 0
              ? `${shops.length} shop${shops.length > 1 ? "s" : ""} registered — click to add new shop or assign staff.`
              : "No shops registered yet — register a shop to begin."}
          </p>

          <div className="flex items-center gap-3">
            {/* Primary Add Shop Button */}
            <button
              type="button"
              onClick={handleOpenAddShop}
              className="group inline-flex items-center gap-2 pl-4 pr-3 py-2 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white font-medium text-xs shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all duration-200"
            >
              <span className="tracking-wide">Add Shop</span>
              <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </div>
            </button>

            {/* Quick Staff Assignment Action (if shops exist) */}
            {shops.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenAssignStaff(selectedShop || shops[0])}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 hover:text-zinc-100 text-xs font-medium transition-all"
              >
                <Users className="w-3.5 h-3.5 text-orange-400" />
                <span>Assign Staff</span>
              </button>
            )}
          </div>

          {/* Registered Shops Minimal Quick Selector Bar */}
          {shops.length > 0 && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2 max-w-xl">
              {shops.map((s) => (
                <button
                  key={s.shopId}
                  type="button"
                  onClick={() => handleOpenStaffDrawer(s)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/30 hover:bg-orange-500/10 border border-white/[0.06] hover:border-orange-500/30 text-[11px] text-zinc-400 hover:text-orange-200 transition-all font-mono"
                  title={`View staff for ${s.shopName}`}
                >
                  <Store className="w-3 h-3 text-orange-400" />
                  <span>{s.shopId}</span>
                  <span className="text-zinc-500 font-sans">({s.shopName})</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Modals & GSAP Animated Overlays ── */}
      <AddShopModal
        isOpen={isAddShopOpen}
        onClose={() => setIsAddShopOpen(false)}
        onShopCreated={(newShop) => {
          setSelectedShop(newShop);
        }}
        onRequestAssignStaff={(newShop) => {
          setIsAddShopOpen(false);
          setSelectedShop(newShop);
          setIsAssignStaffOpen(true);
        }}
      />

      <AssignUserModal
        isOpen={isAssignStaffOpen}
        onClose={() => setIsAssignStaffOpen(false)}
        targetShop={selectedShop}
        allShops={shops}
        onUserAssigned={(user) => {
          // Success handled in modal
        }}
      />

      <ShopStaffDrawer
        isOpen={isStaffDrawerOpen}
        onClose={() => setIsStaffDrawerOpen(false)}
        shop={selectedShop}
        onAddStaff={(shop) => {
          setIsStaffDrawerOpen(false);
          setSelectedShop(shop);
          setIsAssignStaffOpen(true);
        }}
      />
    </AppShell>
  );
}
