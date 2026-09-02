"use client";

/**
 * ShopDataFilterDemo.tsx
 *
 * Interactive visual demonstration component showing how multi-tenant data isolation
 * operates across collections using the `shopId` filter.
 */

import React, { useState } from "react";
import {
  ShieldCheck,
  Filter,
  Layers,
  Database,
  Lock,
  Eye,
  CheckCircle,
  FileCode,
  Store,
} from "lucide-react";
import { Shop } from "@/lib/types/shop";

interface ShopDataFilterDemoProps {
  shops: Shop[];
}

export function ShopDataFilterDemo({ shops }: ShopDataFilterDemoProps) {
  const [selectedShopId, setSelectedShopId] = useState<string>(
    shops.length > 0 ? shops[0].shopId : "SHP-1001"
  );
  const [selectedCollection, setSelectedCollection] = useState<string>("sales");

  const currentShop = shops.find((s) => s.shopId === selectedShopId) || shops[0];

  const collections = [
    { id: "products", label: "Products & Stock", count: "148 items" },
    { id: "sales", label: "POS Sales & Receipts", count: "1,240 records" },
    { id: "customers", label: "Customer Profiles", count: "320 clients" },
    { id: "repairs", label: "Repair Job Tickets", count: "24 active" },
    { id: "reports", label: "Financial Audits", count: "12 monthly" },
  ];

  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{
        background: "rgba(14, 13, 20, 0.75)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 20px 40px -10px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              Multi-Tenant Shop Data Isolation
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono border border-emerald-500/20">
                Active Policy
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Each user and shop strictly accesses records matching its unique <code className="text-orange-300">Shop ID</code>
            </p>
          </div>
        </div>

        {/* Shop Selector for filter preview */}
        {shops.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">Filter Preview:</span>
            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.1] text-xs font-mono text-orange-300 focus:border-orange-500/50"
            >
              {shops.map((s) => (
                <option key={s.shopId} value={s.shopId} className="bg-zinc-900 text-zinc-100">
                  {s.shopId} — {s.shopName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Interactive Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-5">
        {/* Left: Collections */}
        <div className="lg:col-span-4 space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-orange-400" />
            Target Collections
          </label>
          <div className="space-y-1.5">
            {collections.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setSelectedCollection(col.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all ${
                  selectedCollection === col.id
                    ? "bg-orange-500/15 text-orange-200 border border-orange-500/30 font-medium"
                    : "bg-black/30 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedCollection === col.id ? "bg-orange-400" : "bg-zinc-600"}`} />
                  <span>{col.label}</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">{col.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Active Query Code & Sandbox Preview */}
        <div className="lg:col-span-8 space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-orange-400" />
            Executed Firestore Query Filter
          </label>

          <div
            className="p-4 rounded-xl font-mono text-xs text-zinc-300 relative overflow-hidden"
            style={{
              background: "rgba(10, 9, 15, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div className="text-zinc-500 mb-1">// Reusable multi-tenant query helper (lib/services/userService.ts)</div>
            <div>
              <span className="text-purple-400">const</span>{" "}
              <span className="text-blue-400">shopQuery</span> ={" "}
              <span className="text-amber-300">query</span>(
            </div>
            <div className="pl-4">
              <span className="text-amber-300">collection</span>(db,{" "}
              <span className="text-emerald-400">"{selectedCollection}"</span>),
            </div>
            <div className="pl-4">
              <span className="text-amber-300">where</span>(
              <span className="text-emerald-400">"shopId"</span>,{" "}
              <span className="text-orange-400">"=="</span>,{" "}
              <span className="text-orange-300 font-bold">"{selectedShopId}"</span>
              )
            </div>
            <div>);</div>
          </div>

          {/* Validation Result Box */}
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                Isolated scope active for{" "}
                <strong className="text-emerald-200">
                  {currentShop ? currentShop.shopName : selectedShopId}
                </strong>
              </span>
            </div>
            <span className="font-mono text-[11px] text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
              0 Cross-Tenant Leaks
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
