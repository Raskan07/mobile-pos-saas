"use client";

import React, { useState } from "react";
import { X, ScanLine, Search, Check, Sparkles } from "lucide-react";
import { Product } from "./posData";

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanItem: (product: Product) => void;
  products?: Product[];
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScanItem,
  products = [],
}: BarcodeScannerModalProps) {
  const [manualCode, setManualCode] = useState("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleScanProduct = (prod: Product) => {
    setLastScanned(prod.name);
    onScanItem(prod);
    setTimeout(() => {
      setLastScanned(null);
    }, 1500);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    const matched = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === manualCode.trim().toLowerCase()) ||
        p.name.toLowerCase().includes(manualCode.trim().toLowerCase())
    );

    if (matched) {
      handleScanProduct(matched);
      setManualCode("");
    } else {
      alert(`No product found matching barcode or serial "${manualCode}". Try one from the list below!`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-500/10 border border-zinc-500/30 flex items-center justify-center text-zinc-400">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Barcode & IMEI Scanner</h3>
              <p className="text-[11px] text-zinc-400">Scan product box or enter barcode manually</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Simulated Scanner Viewport with Red Laser Line */}
          <div className="relative h-44 rounded-xl bg-black border-2 border-dashed border-zinc-500/40 flex flex-col items-center justify-center overflow-hidden">
            {/* Red Laser Sweep Line */}
            <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />
            
            {/* Viewfinder brackets */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-zinc-400" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-zinc-400" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-zinc-400" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-zinc-400" />

            <div className="text-center z-10 px-4">
              <div className="text-xs font-mono text-zinc-300 font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Optical Engine Active</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Point hardware scanner or select quick item below to simulate scan
              </p>
            </div>

            {lastScanned && (
              <div className="absolute bottom-2 px-3 py-1 rounded-full bg-emerald-500/90 text-white font-mono text-[10px] font-bold animate-in fade-in flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Scanned: {lastScanned}</span>
              </div>
            )}
          </div>

          {/* Manual Barcode Input */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Enter barcode or SKU (e.g. 880609123401)..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-zinc-600 hover:bg-zinc-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Add
            </button>
          </form>

          {/* Quick Tap Simulation Items */}
          {products.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Quick Scan Shop Products
              </div>
              <div className="grid grid-cols-2 gap-2">
                {products.slice(0, 6).map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleScanProduct(prod)}
                    className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-zinc-500/10 border border-white/[0.08] hover:border-zinc-500/40 text-left transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-semibold text-zinc-200 truncate group-hover:text-zinc-300">
                        {prod.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">{prod.barcode}</div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-500/10 px-1.5 py-0.5 rounded">
                      +Scan
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-zinc-900/60 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
