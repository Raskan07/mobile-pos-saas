"use client";

/**
 * ShopMapCanvas.tsx
 *
 * Full-screen futuristic dark interactive Map canvas powered by @vis.gl/react-google-maps
 * Features:
 *  - High-performance declarative React Google Maps architecture
 *  - Custom animated pulsing shop markers (custom JSX beacons inside AdvancedMarker)
 *  - Auto viewport bounding for all registered shop locations
 *  - Smooth camera panning on marker selection
 *  - Zoom & Pan interactive controls
 */

import React, { useEffect } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";
import {
  Store,
  Plus,
  Minus,
  Compass,
  Navigation,
  Layers,
  Sparkles,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";

interface ShopMapCanvasProps {
  apiKey: string;
  shops: Shop[];
  selectedShop: Shop | null;
  onSelectShop: (shop: Shop) => void;
  centerCoords?: { lat: number; lng: number } | null;
  /** Map ID for cloud-based styling (e.g. dark / light). Pass undefined for satellite/hybrid/terrain. */
  mapId?: string;
  /** Map type: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' */
  mapTypeId?: string;
}



// Helper to handle smooth camera moves and bounds fitting
function MapController({
  shops,
  centerCoords,
}: {
  shops: { lat: number; lng: number }[];
  centerCoords?: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (centerCoords) {
      map.panTo(centerCoords);
      map.setZoom(15);
    } else if (shops.length > 0 && typeof window !== "undefined" && (window as any).google?.maps) {
      const google = (window as any).google;
      const bounds = new google.maps.LatLngBounds();
      shops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
      map.fitBounds(bounds, { top: 120, bottom: 120, left: 120, right: 120 });
    }
  }, [map, centerCoords, shops.length]);

  return null;
}

export function ShopMapCanvas({
  apiKey,
  shops,
  selectedShop,
  onSelectShop,
  centerCoords,
  mapId = "739af084373f96fe",
  mapTypeId = "roadmap",
}: ShopMapCanvasProps) {
  // Default coordinate if no shops have lat/long (e.g. San Francisco or Center City)
  const defaultCenter = { lat: 37.7749, lng: -122.4194 };

  // Calculate geocoded shop positions
  const geocodedShops = shops.map((s, idx) => {
    if (s.latitude !== undefined && s.longitude !== undefined) {
      return { ...s, lat: s.latitude, lng: s.longitude };
    }
    const angle = idx * 1.2 + 0.5;
    const dist = 0.035 + (idx % 4) * 0.025;
    return {
      ...s,
      lat: defaultCenter.lat + Math.sin(angle) * dist,
      lng: defaultCenter.lng + Math.cos(angle) * dist,
    };
  });

  return (
    <div className="relative w-full h-full min-h-[500px] flex-1 overflow-hidden bg-[#0a0910]">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI={true}
          mapId={mapId || null}
          mapTypeId={mapTypeId}
          className="w-full h-full"
        >
          <MapController shops={geocodedShops} centerCoords={centerCoords} />

          {/* ── Custom Animated Glowing Shop Markers ── */}
          {geocodedShops.map((shop) => {
            const isSelected = selectedShop?.shopId === shop.shopId;
            return (
              <AdvancedMarker
                key={shop.shopId}
                position={{ lat: shop.lat, lng: shop.lng }}
                onClick={() => onSelectShop(shop)}
                title={`${shop.shopName} (${shop.shopId})`}
              >
                <div className="relative flex flex-col items-center group cursor-pointer">
                  {/* Radar Pulse Effect */}
                  <div
                    className={`absolute -inset-2.5 rounded-full pointer-events-none transition-all ${
                      isSelected
                        ? "bg-orange-500/40 animate-ping"
                        : "bg-orange-500/20 group-hover:animate-ping"
                    }`}
                  />
                  <div className="absolute -inset-1 rounded-full bg-orange-500/30 blur-sm pointer-events-none" />

                  {/* Core Futuristic Beacon Icon */}
                  <div
                    className={`relative z-10 w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                      isSelected
                        ? "bg-gradient-to-tr from-[#ea4815] to-[#f97316] text-white scale-125 border-2 border-white shadow-[0_0_20px_rgba(249,115,22,0.8)]"
                        : "bg-[#181622]/90 backdrop-blur-md text-orange-400 border border-orange-500/40 shadow-[0_0_12px_rgba(0,0,0,0.6)] group-hover:scale-110 group-hover:border-orange-400"
                    }`}
                  >
                    <Store className="w-4 h-4" />
                  </div>

                  {/* Hover / Selection Badge */}
                  <div
                    className={`absolute -top-7 px-2.5 py-0.5 rounded-lg text-[10px] font-mono whitespace-nowrap transition-all duration-200 pointer-events-none ${
                      isSelected
                        ? "bg-orange-500 text-white font-bold opacity-100 scale-100 shadow-[0_0_10px_rgba(249,115,22,0.6)]"
                        : "bg-black/85 text-orange-200 opacity-0 group-hover:opacity-100 border border-white/10 scale-95 group-hover:scale-100"
                    }`}
                  >
                    {shop.shopName}
                  </div>
                </div>
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>

      {/* ── Floating Shop Pins Overview Bar (Bottom Left) ── */}
      <div className="absolute bottom-6 left-6 z-20 hidden md:flex items-center gap-2 pointer-events-auto max-w-lg overflow-x-auto py-1">
        {geocodedShops.slice(0, 6).map((shop) => {
          const isSelected = selectedShop?.shopId === shop.shopId;
          return (
            <button
              key={shop.shopId}
              type="button"
              onClick={() => onSelectShop(shop)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono transition-all ${
                isSelected
                  ? "bg-orange-500/25 border-orange-500/50 text-orange-200 shadow-[0_0_15px_rgba(249,115,22,0.25)] border"
                  : "bg-black/50 border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:bg-black/70 border"
              }`}
              style={{
                backdropFilter: "blur(20px)",
              }}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSelected ? "bg-orange-400 animate-ping" : "bg-zinc-500"
                }`}
              />
              <span>{shop.shopId}</span>
              <span className="text-[11px] text-zinc-500 font-sans truncate max-w-[90px]">
                {shop.shopName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
