"use client";

/**
 * app/sa-9x8f2k/map/page.tsx
 *
 * Shop Map & Operations Command View powered by @vis.gl/react-google-maps
 * Features:
 *  - Full-screen dark futuristic Google Map canvas
 *  - Floating transparent glassmorphism search & filter bar
 *  - Custom animated pulsing shop markers (AdvancedMarker)
 *  - Interactive floating glass details panel on marker click
 *  - Quick "Add Shop" with location coordinate support and staff assignment
 */

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Shop } from "@/lib/types/shop";
import { subscribeToShops } from "@/lib/services/shopService";
import { ShopMapCanvas } from "@/components/map/ShopMapCanvas";
import { FloatingSearchPanel } from "@/components/map/FloatingSearchPanel";
import { ShopDetailsGlassPanel } from "@/components/map/ShopDetailsGlassPanel";
import { MapThemePicker, MAP_THEMES, MapThemeConfig } from "@/components/map/MapThemePicker";
import { AddShopModal } from "@/components/shops/AddShopModal";
import { AssignUserModal } from "@/components/shops/AssignUserModal";
import { ShopStaffDrawer } from "@/components/shops/ShopStaffDrawer";

const GOOGLE_MAPS_API_KEY = "AIzaSyALeWJ7fL9Cu7DCm9mxmMJcIVGELjohwBc";

export default function ShopMapPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "active" | "inactive">("ALL");
  const [focusCoords, setFocusCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [isAddShopOpen, setIsAddShopOpen] = useState(false);
  const [isAssignStaffOpen, setIsAssignStaffOpen] = useState(false);
  const [isStaffDrawerOpen, setIsStaffDrawerOpen] = useState(false);
  const [activeShopForModal, setActiveShopForModal] = useState<Shop | null>(null);

  // Map theme (dark by default)
  const [activeTheme, setActiveTheme] = useState<MapThemeConfig>(MAP_THEMES[0]);

  // Subscribe to real-time shops from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToShops((fetchedShops) => {
      setShops(fetchedShops);
    });

    return () => unsubscribe();
  }, []);

  // Filtered shops based on search & status
  const filteredShops = shops.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      s.shopName.toLowerCase().includes(q) ||
      s.shopId.toLowerCase().includes(q) ||
      s.ownerName.toLowerCase().includes(q) ||
      s.phone.includes(q);

    const matchesStatus =
      statusFilter === "ALL" || s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleSelectShop = (shop: Shop) => {
    setSelectedShop(shop);
    if (shop.latitude !== undefined && shop.longitude !== undefined) {
      setFocusCoords({ lat: shop.latitude, lng: shop.longitude });
    }
  };

  const handleAssignStaff = (shop: Shop) => {
    setActiveShopForModal(shop);
    setIsAssignStaffOpen(true);
  };

  const handleViewStaff = (shop: Shop) => {
    setActiveShopForModal(shop);
    setIsStaffDrawerOpen(true);
  };

  const handleShopCreated = (newShop: Shop) => {
    setSelectedShop(newShop);
    if (newShop.latitude && newShop.longitude) {
      setFocusCoords({ lat: newShop.latitude, lng: newShop.longitude });
    }
  };

  return (
    <AppShell defaultSectionId="shops">
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        {/* ── Floating Top Search & Control Panel ── */}
        <FloatingSearchPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          totalShops={shops.length}
          filteredCount={filteredShops.length}
          onOpenAddShop={() => setIsAddShopOpen(true)}
        />

        {/* ── Fullscreen Dark Map Canvas with @vis.gl/react-google-maps ── */}
        <ShopMapCanvas
          apiKey={GOOGLE_MAPS_API_KEY}
          shops={filteredShops}
          selectedShop={selectedShop}
          onSelectShop={handleSelectShop}
          centerCoords={focusCoords}
          mapId={activeTheme.mapId}
          mapTypeId={activeTheme.mapTypeId}
        />

        {/* ── Floating Map Theme Picker (bottom-right) ── */}
        <MapThemePicker
          activeThemeId={activeTheme.id}
          onThemeChange={setActiveTheme}
        />

        {/* ── Floating Glass Shop Details Panel ── */}
        <ShopDetailsGlassPanel
          shop={selectedShop}
          onClose={() => setSelectedShop(null)}
          onAssignStaff={handleAssignStaff}
          onViewStaff={handleViewStaff}
          onFocusCoordinates={(lat, lng) => setFocusCoords({ lat, lng })}
        />
      </div>

      {/* ── Modals & Drawers ── */}
      <AddShopModal
        isOpen={isAddShopOpen}
        onClose={() => setIsAddShopOpen(false)}
        onShopCreated={handleShopCreated}
        onRequestAssignStaff={(shop) => {
          setIsAddShopOpen(false);
          setActiveShopForModal(shop);
          setIsAssignStaffOpen(true);
        }}
      />

      <AssignUserModal
        isOpen={isAssignStaffOpen}
        onClose={() => setIsAssignStaffOpen(false)}
        targetShop={activeShopForModal}
        allShops={shops}
      />

      <ShopStaffDrawer
        isOpen={isStaffDrawerOpen}
        onClose={() => setIsStaffDrawerOpen(false)}
        shop={activeShopForModal}
        onAddStaff={(shop) => {
          setIsStaffDrawerOpen(false);
          setActiveShopForModal(shop);
          setIsAssignStaffOpen(true);
        }}
      />
    </AppShell>
  );
}
