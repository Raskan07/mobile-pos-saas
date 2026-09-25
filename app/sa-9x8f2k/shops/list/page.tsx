"use client";

/**
 * app/sa-9x8f2k/shops/list/page.tsx
 *
 * Clean, compact, and modern Registered Shops Directory.
 * - Rounded search bar, filter pills, and "+ New Shop" button
 * - Small rounded KPI chips with thin borders (no heavy gradients)
 * - Single compact rows for each shop (clean table/row format)
 * - Sleek action icons with instant hover tooltips
 * - Full CRUD & Visibility controls: See, Edit, Hide/Unhide, Delete
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Store,
  Plus,
  Search,
  Eye,
  EyeOff,
  Edit3,
  Trash2,
  MapPin,
  Phone,
  User,
  Layers,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Users,
  Compass,
  ArrowUpDown,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Shop } from "@/lib/types/shop";
import {
  subscribeToShops,
  toggleShopHide,
} from "@/lib/services/shopService";
import { ShopDetailsModal } from "@/components/shops/ShopDetailsModal";
import { EditShopModal } from "@/components/shops/EditShopModal";
import { DeleteShopModal } from "@/components/shops/DeleteShopModal";
import { AddShopModal } from "@/components/shops/AddShopModal";
import { AssignUserModal } from "@/components/shops/AssignUserModal";
import { useLoading } from "@/lib/context/LoadingContext";

type FilterTab = "all" | "active" | "hidden";
type SortOption = "newest" | "oldest" | "name" | "staff";

interface ToastMessage {
  id: string;
  type: "success" | "info" | "warning";
  text: string;
}

export default function RegisteredShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search controls
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  // Selected Shop & Modals State
  const [selectedShopForView, setSelectedShopForView] = useState<Shop | null>(null);
  const [selectedShopForEdit, setSelectedShopForEdit] = useState<Shop | null>(null);
  const [selectedShopForDelete, setSelectedShopForDelete] = useState<Shop | null>(null);
  const [selectedShopForStaff, setSelectedShopForStaff] = useState<Shop | null>(null);
  const [isAddShopOpen, setIsAddShopOpen] = useState(false);

  // Copied shop ID feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { showLoading, hideLoading } = useLoading();

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (text: string, type: "success" | "info" | "warning" = "success") => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  // Real-time Firestore Subscription
  useEffect(() => {
    setLoading(true);
    showLoading();
    const unsubscribe = subscribeToShops(
      (fetchedShops) => {
        setShops(fetchedShops);
        setLoading(false);
        hideLoading();
      },
      (err) => {
        console.error("Failed to load shops:", err);
        setLoading(false);
        hideLoading();
      }
    );

    return () => {
      unsubscribe();
      hideLoading();
    };
  }, [showLoading, hideLoading]);

  // Listen to sidebar custom event "open-add-shop-modal"
  useEffect(() => {
    const handleOpenAddShop = () => {
      setIsAddShopOpen(true);
    };

    window.addEventListener("open-add-shop-modal", handleOpenAddShop);
    return () => window.removeEventListener("open-add-shop-modal", handleOpenAddShop);
  }, []);

  // Copy helper
  const handleCopy = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    addToast(`Shop ID "${id}" copied`, "info");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle Hide / Unhide Handler
  const handleToggleHide = async (shop: Shop, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isCurrentlyHidden = Boolean(shop.isHidden || shop.status === "inactive");
    try {
      await toggleShopHide(shop.shopId, isCurrentlyHidden);
      addToast(
        isCurrentlyHidden
          ? `"${shop.shopName}" is now active and visible.`
          : `"${shop.shopName}" is now hidden.`,
        "info"
      );
      if (selectedShopForView && selectedShopForView.shopId === shop.shopId) {
        setSelectedShopForView({
          ...selectedShopForView,
          isHidden: !isCurrentlyHidden,
          status: !isCurrentlyHidden ? "inactive" : "active",
        });
      }
    } catch (err) {
      console.error("Error toggling shop visibility:", err);
      addToast("Failed to change shop visibility.", "warning");
    }
  };

  // Filter & Sort computation
  const filteredShops = useMemo(() => {
    return shops
      .filter((s) => {
        const isHidden = s.isHidden || s.status === "inactive";
        if (filterTab === "active" && isHidden) return false;
        if (filterTab === "hidden" && !isHidden) return false;

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          s.shopId.toLowerCase().includes(q) ||
          s.shopName.toLowerCase().includes(q) ||
          s.ownerName.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          (s.address && s.address.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortOption === "newest") return b.createdAt - a.createdAt;
        if (sortOption === "oldest") return a.createdAt - b.createdAt;
        if (sortOption === "name") return a.shopName.localeCompare(b.shopName);
        if (sortOption === "staff") return (b.staffCount || 0) - (a.staffCount || 0);
        return 0;
      });
  }, [shops, filterTab, searchQuery, sortOption]);

  // Counts for Metrics
  const metrics = useMemo(() => {
    const total = shops.length;
    const hiddenCount = shops.filter((s) => s.isHidden || s.status === "inactive").length;
    const activeCount = total - hiddenCount;
    const mappedCount = shops.filter(
      (s) => typeof s.latitude === "number" && typeof s.longitude === "number"
    ).length;
    const totalStaff = shops.reduce((acc, s) => acc + (s.staffCount || 0), 0);

    return { total, activeCount, hiddenCount, mappedCount, totalStaff };
  }, [shops]);

  return (
    <AppShell defaultSectionId="shops">
      {/* ── Toast Notifications Stack ── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-3.5 py-2 rounded-xl border backdrop-blur-xl shadow-2xl text-xs flex items-center gap-2 transition-all animate-slide-in ${
              toast.type === "warning"
                ? "bg-amber-950/85 border-amber-500/30 text-amber-200"
                : toast.type === "info"
                ? "bg-zinc-900/90 border-orange-500/30 text-orange-200"
                : "bg-zinc-900/90 border-emerald-500/30 text-emerald-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            <span className="font-medium">{toast.text}</span>
          </div>
        ))}
      </div>

      {/* ── Main Container (Clean, compact, modern) ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden p-5 sm:p-6 max-w-7xl mx-auto w-full">
        {/* ── Top Controls Bar: Rounded Search + Filters + Action Button ── */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 flex-shrink-0">
          {/* Left: Rounded Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shops, owners, IDs, phones, locations…"
              className="w-full pl-9 pr-9 py-2 rounded-full bg-black/40 border border-white/[0.08] hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/15 text-zinc-200 text-xs transition-all placeholder:text-zinc-600 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.08]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Center & Right Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Rounded Filter Pills */}
            <div className="flex items-center p-0.5 rounded-full bg-black/40 border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                  filterTab === "all"
                    ? "bg-white/[0.12] text-zinc-100 shadow-sm border border-white/[0.08]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                All ({metrics.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("active")}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                  filterTab === "active"
                    ? "bg-emerald-500/20 text-emerald-300 shadow-sm border border-emerald-500/30"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Active ({metrics.activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("hidden")}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                  filterTab === "hidden"
                    ? "bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/30"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Hidden ({metrics.hiddenCount})
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 border border-white/[0.08] text-[11px] text-zinc-400">
              <ArrowUpDown className="w-3 h-3 text-zinc-500" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="bg-transparent text-zinc-200 text-[11px] focus:outline-none cursor-pointer"
              >
                <option value="newest" className="bg-[#12101a] text-zinc-200">Newest</option>
                <option value="oldest" className="bg-[#12101a] text-zinc-200">Oldest</option>
                <option value="name" className="bg-[#12101a] text-zinc-200">Name</option>
                <option value="staff" className="bg-[#12101a] text-zinc-200">Staff Count</option>
              </select>
            </div>

            {/* Rounded New Shop Button */}
            <button
              type="button"
              onClick={() => setIsAddShopOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ea4815] hover:bg-[#f95721] text-white font-medium text-xs shadow-[0_2px_12px_rgba(234,72,21,0.3)] hover:shadow-[0_4px_18px_rgba(234,72,21,0.45)] active:scale-[0.98] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Shop</span>
            </button>
          </div>
        </div>

        {/* ── KPI Chips (Small, rounded, thin borders, no heavy gradients) ── */}
        <div className="flex flex-wrap items-center gap-2 py-2 flex-shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.07] text-[11px] text-zinc-400">
            <Store className="w-3 h-3 text-zinc-400" />
            <span>Total Shops:</span>
            <span className="font-mono font-semibold text-zinc-200">{metrics.total}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.07] text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span>Active:</span>
            <span className="font-mono font-semibold text-emerald-400">{metrics.activeCount}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.07] text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Hidden:</span>
            <span className="font-mono font-semibold text-amber-300">{metrics.hiddenCount}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.07] text-[11px] text-zinc-400">
            <Compass className="w-3 h-3 text-orange-400/80" />
            <span>GPS Mapped:</span>
            <span className="font-mono font-semibold text-zinc-200">{metrics.mappedCount}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.07] text-[11px] text-zinc-400">
            <Users className="w-3 h-3 text-orange-400/80" />
            <span>Total Staff:</span>
            <span className="font-mono font-semibold text-zinc-200">{metrics.totalStaff}</span>
          </div>
        </div>

        {/* ── Compact Rows List ── */}
        <div className="flex-1 overflow-y-auto mt-2 rounded-xl border border-white/[0.07] bg-black/25">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-500 space-y-2.5">
              <div className="w-6 h-6 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
              <span className="text-xs font-mono">Syncing shops…</span>
            </div>
          ) : filteredShops.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Store className="w-8 h-8 text-zinc-600 mx-auto" />
              <div className="text-xs text-zinc-400">
                {searchQuery || filterTab !== "all"
                  ? "No registered shops match your criteria."
                  : "No registered shops found."}
              </div>
              {searchQuery || filterTab !== "all" ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterTab("all");
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs transition-colors"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddShopOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ea4815] text-white text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register First Shop</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {/* Header Label Row */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-black/40 text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-medium select-none sticky top-0 z-10 backdrop-blur-md">
                <div className="col-span-4 sm:col-span-3">Shop & ID</div>
                <div className="col-span-3 sm:col-span-2">Owner</div>
                <div className="hidden md:block col-span-2">Contact</div>
                <div className="hidden lg:block col-span-2">Location</div>
                <div className="hidden sm:block col-span-1 text-center">Staff</div>
                <div className="col-span-2 sm:col-span-1 text-center">Status</div>
                <div className="col-span-3 sm:col-span-1 text-right">Actions</div>
              </div>

              {/* Rows */}
              {filteredShops.map((shop) => {
                const isHidden = shop.isHidden || shop.status === "inactive";
                const isCopied = copiedId === shop.shopId;

                return (
                  <div
                    key={shop.shopId}
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-xs hover:bg-white/[0.03] transition-colors duration-150 group"
                  >
                    {/* Shop ID & Name */}
                    <div className="col-span-4 sm:col-span-3 flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => handleCopy(shop.shopId, e)}
                        className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 text-[11px] font-mono font-medium text-orange-300 transition-colors"
                        title="Click to copy Shop ID"
                      >
                        <span>{shop.shopId}</span>
                        {isCopied ? (
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 text-orange-400/60" />
                        )}
                      </button>

                      <span
                        className="font-medium text-zinc-100 truncate group-hover:text-orange-200 transition-colors cursor-pointer"
                        onClick={() => setSelectedShopForView(shop)}
                        title={shop.shopName}
                      >
                        {shop.shopName}
                      </span>
                    </div>

                    {/* Owner */}
                    <div className="col-span-3 sm:col-span-2 text-zinc-300 truncate text-[11.5px] flex items-center gap-1.5">
                      <User className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                      <span className="truncate">{shop.ownerName}</span>
                    </div>

                    {/* Contact Phone */}
                    <div className="hidden md:block col-span-2 font-mono text-zinc-400 text-[11px] truncate">
                      {shop.phone}
                    </div>

                    {/* Location / Address */}
                    <div className="hidden lg:block col-span-2 text-zinc-400 text-[11px] truncate">
                      {shop.address ? (
                        <span className="truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                          <span className="truncate">{shop.address}</span>
                        </span>
                      ) : shop.latitude && shop.longitude ? (
                        <span className="font-mono text-orange-300/80 text-[10.5px]">
                          {shop.latitude.toFixed(3)}, {shop.longitude.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-zinc-600 italic">—</span>
                      )}
                    </div>

                    {/* Staff Count */}
                    <div className="hidden sm:block col-span-1 text-center font-mono">
                      <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10.5px] text-zinc-300">
                        {shop.staffCount || 0}
                      </span>
                    </div>

                    {/* Status Pill */}
                    <div className="col-span-2 sm:col-span-1 text-center">
                      {isHidden ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-[10px] text-amber-300 font-medium">
                          <EyeOff className="w-2.5 h-2.5" />
                          <span>Hidden</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] text-emerald-300 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>

                    {/* Action Icon Buttons with Hover Tooltips */}
                    <div className="col-span-3 sm:col-span-1 flex items-center justify-end gap-1">
                      {/* See Button */}
                      <div className="relative group/btn">
                        <button
                          type="button"
                          onClick={() => setSelectedShopForView(shop)}
                          aria-label="View Details"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-orange-300 hover:bg-orange-500/15 transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-zinc-900 border border-white/[0.1] text-[10px] text-zinc-200 whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-xl">
                          View details
                        </div>
                      </div>

                      {/* Edit Button */}
                      <div className="relative group/btn">
                        <button
                          type="button"
                          onClick={() => setSelectedShopForEdit(shop)}
                          aria-label="Edit Shop"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-zinc-900 border border-white/[0.1] text-[10px] text-zinc-200 whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-xl">
                          Edit shop
                        </div>
                      </div>

                      {/* Hide / Unhide Button */}
                      <div className="relative group/btn">
                        <button
                          type="button"
                          onClick={(e) => handleToggleHide(shop, e)}
                          aria-label={isHidden ? "Unhide Shop" : "Hide Shop"}
                          className={`p-1.5 rounded-lg transition-all ${
                            isHidden
                              ? "text-amber-400 hover:bg-amber-500/20"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]"
                          }`}
                        >
                          {isHidden ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-zinc-900 border border-white/[0.1] text-[10px] text-zinc-200 whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-xl">
                          {isHidden ? "Unhide shop" : "Hide shop"}
                        </div>
                      </div>

                      {/* Delete Button */}
                      <div className="relative group/btn">
                        <button
                          type="button"
                          onClick={() => setSelectedShopForDelete(shop)}
                          aria-label="Delete Shop"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/15 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-zinc-900 border border-white/[0.1] text-[10px] text-red-300 whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-xl">
                          Delete shop
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals Integrated ── */}
      {/* 1. See Option: Details Modal */}
      <ShopDetailsModal
        isOpen={Boolean(selectedShopForView)}
        shop={selectedShopForView}
        onClose={() => setSelectedShopForView(null)}
        onEdit={(shop) => {
          setSelectedShopForView(null);
          setSelectedShopForEdit(shop);
        }}
        onToggleHide={(shop) => {
          handleToggleHide(shop);
        }}
        onDelete={(shop) => {
          setSelectedShopForView(null);
          setSelectedShopForDelete(shop);
        }}
        onAssignStaff={(shop) => {
          setSelectedShopForView(null);
          setSelectedShopForStaff(shop);
        }}
      />

      {/* 2. Edit Option: Edit Modal */}
      <EditShopModal
        isOpen={Boolean(selectedShopForEdit)}
        shop={selectedShopForEdit}
        onClose={() => setSelectedShopForEdit(null)}
        onShopUpdated={(updated) => {
          addToast(`"${updated.shopName}" details saved.`);
        }}
      />

      {/* 3. Delete Option: Delete Confirmation Modal */}
      <DeleteShopModal
        isOpen={Boolean(selectedShopForDelete)}
        shop={selectedShopForDelete}
        onClose={() => setSelectedShopForDelete(null)}
        onDeleted={(deletedId) => {
          addToast(`Shop "${deletedId}" deleted.`, "warning");
        }}
      />

      {/* 4. Add Shop Modal */}
      <AddShopModal
        isOpen={isAddShopOpen}
        onClose={() => setIsAddShopOpen(false)}
        onShopCreated={(newShop) => {
          addToast(`Shop "${newShop.shopName}" (${newShop.shopId}) registered!`);
        }}
        onRequestAssignStaff={(newShop) => {
          setIsAddShopOpen(false);
          setSelectedShopForStaff(newShop);
        }}
      />

      {/* 5. Assign Staff Modal */}
      <AssignUserModal
        isOpen={Boolean(selectedShopForStaff)}
        targetShop={selectedShopForStaff}
        allShops={shops}
        onClose={() => setSelectedShopForStaff(null)}
        onUserAssigned={() => {
          addToast("Staff member created and assigned successfully!");
          setSelectedShopForStaff(null);
        }}
      />
    </AppShell>
  );
}
