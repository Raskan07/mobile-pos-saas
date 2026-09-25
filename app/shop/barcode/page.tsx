"use client";

/**
 * app/shop/barcode/page.tsx
 *
 * Dedicated Barcode Center — Enterprise-grade Barcode Label Printing & Management.
 * Features:
 *  - Real products loaded from Firebase filtered strictly by shopID
 *  - Product image, name, barcode number, price, stock, and category displays
 *  - Interactive live SVG label preview with selectable dimensions and toggleable fields
 *  - Bulk quantity management (including 1-click "Match Stock Quantities")
 *  - Extensible Printer Architecture supporting:
 *      1. Standard Desktop / Office Printers (High-res PDF Sheets & Thermal rolls)
 *      2. Zebra Direct Thermal (ZPL II)
 *      3. TSC Direct Thermal (TSPL / TSPL2)
 *  - Raw command inspector & copy modal for Zebra/TSC technicians
 *  - Hardware USB scanner capture + Camera scanner modal
 *  - Firestore audit logging for complete print traceability
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  ScanLine,
  Camera,
  Printer,
  Download,
  Package,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  LayoutGrid,
  Clock,
  RotateCcw,
  X,
  Loader2,
  AlertCircle,
  Minus,
  Plus,
  Tag,
  Store,
  Layers,
  Sparkles,
  Copy,
  Check,
  Code2,
  Terminal,
  Sliders,
  Warehouse,
  Filter,
} from "lucide-react";

import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { getProducts } from "@/lib/services/catalogService";
import {
  logBarcodePrints,
  getBarcodePrintLogs,
} from "@/lib/services/barcodeService";
import JsBarcode from "jsbarcode";
import {
  PAPER_PRESETS,
} from "@/lib/utils/barcodePdfGenerator";
import {
  BarcodeItem,
  LabelConfig,
  BarcodePrintLog,
  PaperPresetId,
} from "@/lib/types/barcode";
import { ProductItem } from "@/lib/types/catalog";
import {
  getAllPrinterProfiles,
  getPrinterDriver,
  renderLabelsForPrinter,
} from "@/lib/printers/printerRegistry";
import { PrinterOutput, PrinterProfile } from "@/lib/printers/types";
import CameraBarcodeScannerModal from "./CameraBarcodeScannerModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractProductImageUrl(product: any, variant?: any): string {
  if (variant) {
    if (typeof variant.image === "string" && variant.image.trim().length > 0) {
      return variant.image.trim();
    }
    if (typeof variant.imageUrl === "string" && variant.imageUrl.trim().length > 0) {
      return variant.imageUrl.trim();
    }
    if (Array.isArray(variant.images) && variant.images.length > 0) {
      const vFirst = variant.images.find((u: any) => typeof u === "string" && u.trim().length > 0);
      if (vFirst) return vFirst.trim();
    }
  }

  if (Array.isArray(product?.images) && product.images.length > 0) {
    const first = product.images.find((u: any) => typeof u === "string" && u.trim().length > 0);
    if (first) return first.trim();
  }

  if (typeof product?.images === "string" && product.images.trim().length > 0) {
    return product.images.trim();
  }

  if (typeof product?.imageUrl === "string" && product.imageUrl.trim().length > 0) {
    return product.imageUrl.trim();
  }

  if (typeof product?.image === "string" && product.image.trim().length > 0) {
    return product.image.trim();
  }

  return "";
}

function flattenProductToItems(product: ProductItem): BarcodeItem[] {
  const baseImage = extractProductImageUrl(product);
  const categoryName = product.categoryName || "General";
  const baseStock = typeof product.stockQuantity === "number" ? product.stockQuantity : 0;

  // If no variants, return the base product as a single item
  if (!product.hasVariants || !product.variants || product.variants.length === 0) {
    return [
      {
        id: product.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku || "",
        barcode: product.barcode || product.sku || "",
        sellingPrice: product.sellingPrice || 0,
        costPrice: product.costPrice,
        brand: product.brand,
        categoryName,
        image: baseImage,
        unit: product.unit,
        stock: baseStock,
      },
    ];
  }

  // Flatten each variant as its own row
  return product.variants.map((v) => {
    const variantParts: string[] = [];
    if (v.size) variantParts.push(`Size: ${v.size}`);
    if (v.color) variantParts.push(`Color: ${v.color}`);
    const variantName = variantParts.join(" | ") || `Variant ${v.id.slice(-4)}`;
    const variantImage = extractProductImageUrl(product, v) || baseImage;
    const variantStock = typeof v.stockQuantity === "number" ? v.stockQuantity : baseStock;

    return {
      id: `${product.id}_${v.id}`,
      productId: product.id,
      productName: product.name,
      variantId: v.id,
      variantName,
      sku: v.sku || product.sku || "",
      barcode: v.barcode || v.sku || product.barcode || product.sku || "",
      sellingPrice: v.sellingPrice ?? product.sellingPrice ?? 0,
      costPrice: v.costPrice ?? product.costPrice,
      brand: product.brand,
      categoryName,
      image: variantImage,
      unit: product.unit,
      stock: variantStock,
    };
  });
}

function formatCurrency(amount: number, symbol = "Rs."): string {
  return `${symbol} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Raw Code Inspector Modal for Zebra (ZPL) and TSC (TSPL) */
function RawCodeModal({
  isOpen,
  onClose,
  title,
  code,
  language,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  code: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0d0e15] border border-white/[0.12] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="text-[10px] text-zinc-400">{language}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy Code"}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-auto bg-black/40 font-mono text-xs text-zinc-300 select-all leading-relaxed whitespace-pre">
          {code}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.08] bg-[#090a10] flex items-center justify-between text-[11px] text-zinc-500">
          <span>Ready to send to direct thermal raw printer spooler.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 text-xs font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Live SVG barcode label preview */
function BarcodeLabelPreview({
  item,
  config,
  shopName,
}: {
  item: BarcodeItem;
  config: LabelConfig;
  shopName: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const preset = PAPER_PRESETS[config.paperPreset] || PAPER_PRESETS.a4_6col;
  const labelWidthMm =
    config.customWidthMm && config.customWidthMm > 10
      ? config.customWidthMm
      : preset.labelWidthMm;
  const labelHeightMm =
    config.customHeightMm && config.customHeightMm > 10
      ? config.customHeightMm
      : preset.labelHeightMm;

  // Proportional preview dimensions
  const scale = preset.columns >= 6 ? 6.2 : preset.columns >= 3 ? 4.2 : 4.8;
  const wPx = Math.max(140, Math.min(340, Math.round(labelWidthMm * scale)));
  const hPx = Math.max(90, Math.min(260, Math.round(labelHeightMm * scale)));

  useEffect(() => {
    if (!svgRef.current || !item) return;
    const code = (item.barcode || item.sku || "00000000").trim();
    try {
      JsBarcode(svgRef.current, code, {
        format: "CODE128",
        width: 1.7,
        height: Math.max(34, Math.min(62, Math.round(hPx * 0.46))),
        displayValue: true,
        fontSize: 10.5,
        font: "monospace",
        textMargin: 3,
        margin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (err) {
      console.warn("Barcode SVG preview error:", err);
    }
  }, [item, config, hPx]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative bg-white border border-zinc-200 shadow-xl rounded-xl overflow-hidden flex flex-col items-center justify-between select-none transition-all duration-200"
        style={{
          width: wPx,
          height: hPx,
          padding: "8px 10px",
        }}
      >
        {/* Store Name Header (Clean Minimalist) */}
        {config.showShopName && (
          <div
            className="text-center truncate w-full font-semibold uppercase tracking-widest text-zinc-400"
            style={{ fontSize: 9, lineHeight: "11px", letterSpacing: "0.08em" }}
          >
            {config.customShopName || shopName}
          </div>
        )}

        {/* 100% Crisp Vector SVG Barcode - Clean & Hero Focal Point */}
        <div className="flex-1 flex items-center justify-center w-full my-auto overflow-hidden py-1">
          <svg ref={svgRef} className="w-full h-full max-h-[64px] object-contain" />
        </div>

        {/* Clean Minimalist Footer: SKU and Price */}
        {(config.showSku || config.showPrice) && (
          <div className="flex items-center justify-between w-full pt-1.5 border-t border-zinc-100 mt-auto">
            {config.showSku ? (
              <span
                className="text-zinc-500 font-mono font-medium truncate text-[10px]"
                style={{ maxWidth: "50%" }}
              >
                {item.sku}
              </span>
            ) : (
              <span />
            )}
            {config.showPrice && (
              <span className="font-bold text-zinc-950 font-sans tracking-tight text-xs">
                {formatCurrency(item.sellingPrice, config.currencySymbol)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="text-[10px] text-zinc-400 font-mono text-center flex items-center gap-2">
        <span>{labelWidthMm}mm × {labelHeightMm}mm</span>
        <span>•</span>
        <span>{preset.columns} / row</span>
      </div>
    </div>
  );
}

/** Rich Product Row displaying Image, Name, Barcode Number, Price, Stock, Category */
function BarcodeItemRow({
  item,
  selected,
  quantity,
  highlighted,
  onToggle,
  onQuantityChange,
  onPreview,
  isPreviewed,
}: {
  item: BarcodeItem;
  selected: boolean;
  quantity: number;
  highlighted: boolean;
  onToggle: () => void;
  onQuantityChange: (qty: number) => void;
  onPreview: () => void;
  isPreviewed: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [item.image]);

  useEffect(() => {
    if (highlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  const stock = item.stock ?? 0;
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 5;

  return (
    <div
      ref={rowRef}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-150 cursor-pointer group ${
        highlighted
          ? "border-indigo-500/80 bg-indigo-500/15 ring-1 ring-indigo-500/40"
          : selected
          ? "border-indigo-500/40 bg-indigo-500/[0.08]"
          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
      }`}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0">
        {selected ? (
          <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
        ) : (
          <Square className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
        )}
      </div>

      {/* Thumbnail (reduced by 30%) */}
      <div className="flex-shrink-0 w-8 h-8 rounded-md bg-zinc-900 border border-white/[0.08] overflow-hidden flex items-center justify-center relative shadow-inner">
        {item.image && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={item.productName}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.04] text-zinc-400 font-bold text-[11px] select-none">
            {item.productName?.trim() ? (
              item.productName.trim().charAt(0).toUpperCase()
            ) : (
              <Package className="w-3.5 h-3.5 text-zinc-600" />
            )}
          </div>
        )}
      </div>

      {/* Main Details: Name, Category, Stock */}
      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
        {/* Name & Variant */}
        <div className="md:col-span-6 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-zinc-100 truncate">
              {item.productName}
            </span>
            {item.variantName && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-violet-500/10 border border-violet-500/20 text-[9px] font-medium text-violet-300">
                {item.variantName}
              </span>
            )}
          </div>
        </div>

        {/* Category Badge */}
        <div className="md:col-span-3 hidden sm:block">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[9.5px] text-zinc-400 truncate max-w-[130px]">
            {item.categoryName || "General"}
          </span>
        </div>

        {/* Stock Status */}
        <div className="md:col-span-3 flex items-center justify-start md:justify-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-medium ${
              isOutOfStock
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                : isLowStock
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}
          >
            <Warehouse className="w-2.5 h-2.5" />
            {isOutOfStock ? "Out of Stock" : `${stock} in stock`}
          </span>
        </div>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right w-20 hidden lg:block">
        <span className="text-xs font-bold text-zinc-200">
          {formatCurrency(item.sellingPrice)}
        </span>
      </div>

      {/* Bulk Quantity Stepper */}
      <div
        className="flex items-center gap-1 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            if (!selected) onToggle();
            onQuantityChange(Math.max(1, quantity - 1));
          }}
          className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs flex items-center justify-center transition-colors cursor-pointer"
          title="Decrease quantity"
        >
          <Minus className="w-2.5 h-2.5" />
        </button>
        <input
          type="number"
          min={1}
          max={999}
          value={quantity}
          onChange={(e) => {
            if (!selected) onToggle();
            const val = parseInt(e.target.value, 10);
            onQuantityChange(isNaN(val) ? 1 : Math.max(1, Math.min(999, val)));
          }}
          className="w-7 h-5 text-center text-[11px] font-bold text-white bg-white/[0.04] border border-white/[0.08] rounded outline-none focus:border-indigo-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono"
        />
        <button
          onClick={() => {
            if (!selected) onToggle();
            onQuantityChange(Math.min(999, quantity + 1));
          }}
          className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs flex items-center justify-center transition-colors cursor-pointer"
          title="Increase quantity"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Preview eye */}
      <button
        className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all cursor-pointer ${
          isPreviewed
            ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-400"
            : "bg-white/[0.04] border border-white/[0.06] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08]"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        title="Preview label"
      >
        {isPreviewed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Barcode Center Page
// ---------------------------------------------------------------------------

export default function BarcodeCenterPage() {
  const { shop, user, isAuthenticated, isLoading: authLoading } = useShopAuth();
  const router = useRouter();

  // ── Data ──
  const [allItems, setAllItems] = useState<BarcodeItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [printLogs, setPrintLogs] = useState<BarcodePrintLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // ── Selection & quantities ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // ── Label & Printer config ──
  const [labelConfig, setLabelConfig] = useState<LabelConfig>({
    paperPreset: "a4_6col",
    showShopName: true,
    showName: false,
    showVariant: false,
    showSku: true,
    showPrice: true,
    showCategory: false,
    currencySymbol: "Rs.",
    customShopName: "",
    printerType: "pdf",
    printerDpi: 203,
    printerDarkness: 15,
  });

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<"generator" | "history">("generator");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [stockFilter, setStockFilter] = useState<"ALL" | "IN_STOCK" | "LOW_STOCK">("ALL");
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(true);

  // ── Raw code modal state ──
  const [rawCodeModal, setRawCodeModal] = useState<{
    isOpen: boolean;
    title: string;
    code: string;
    language: string;
  }>({
    isOpen: false,
    title: "",
    code: "",
    language: "",
  });

  // ── Scanner input ──
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [scannerValue, setScannerValue] = useState("");

  const shopDisplayName = shop?.shopName || "POS Store";

  // ---------------------------------------------------------------------------
  // Load products on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !shop?.shopId) return;
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, shop?.shopId]);

  const loadProducts = useCallback(async () => {
    if (!shop?.shopId) return;
    setLoadingProducts(true);
    setLoadError(null);
    try {
      // Scoped strictly by shopId
      const products = await getProducts(shop.shopId);
      const flattened: BarcodeItem[] = [];
      products.forEach((p) => {
        flattened.push(...flattenProductToItems(p));
      });
      setAllItems(flattened);
      // Default preview to first item
      if (flattened.length > 0 && !previewItemId) {
        setPreviewItemId(flattened[0].id);
      }
    } catch (err) {
      console.error("[BarcodeCenter] Error loading products:", err);
      setLoadError("Failed to load products. Please check connection and try again.");
    } finally {
      setLoadingProducts(false);
    }
  }, [shop?.shopId, previewItemId]);

  // ---------------------------------------------------------------------------
  // Load print history when on history tab
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (activeTab === "history" && shop?.shopId) {
      setLogsLoading(true);
      getBarcodePrintLogs(shop.shopId, 100)
        .then(setPrintLogs)
        .catch(console.error)
        .finally(() => setLogsLoading(false));
    }
  }, [activeTab, shop?.shopId]);

  // ---------------------------------------------------------------------------
  // Hardware scanner listener — global keydown capture
  // ---------------------------------------------------------------------------
  const scanBufferRef = useRef<string>("");
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement;
      if (isTyping && activeEl !== scannerInputRef.current) return;

      if (e.key === "Enter") {
        if (scanBufferRef.current.length >= 3) {
          handleScannerMatch(scanBufferRef.current.trim());
        }
        scanBufferRef.current = "";
        return;
      }

      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => {
          scanBufferRef.current = "";
        }, 120);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allItems]);

  const handleScannerMatch = useCallback(
    (code: string) => {
      const cleanCode = code.trim().toLowerCase();
      const matched = allItems.find(
        (item) =>
          item.barcode?.toLowerCase() === cleanCode ||
          item.sku?.toLowerCase() === cleanCode
      );

      if (matched) {
        setHighlightedItemId(matched.id);
        setPreviewItemId(matched.id);
        setScannerValue(code);
        // Automatically select the scanned product and increment count
        setSelectedIds((prev) => new Set(prev).add(matched.id));
        setQuantities((prev) => ({
          ...prev,
          [matched.id]: (prev[matched.id] || 0) + 1,
        }));
        setTimeout(() => setHighlightedItemId(null), 3000);
      } else {
        setScannerValue(code);
      }
    },
    [allItems]
  );

  // ---------------------------------------------------------------------------
  // Category list for filtering
  // ---------------------------------------------------------------------------
  const categories = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      if (i.categoryName) set.add(i.categoryName);
    });
    return Array.from(set).sort();
  }, [allItems]);

  // ---------------------------------------------------------------------------
  // Filtered items
  // ---------------------------------------------------------------------------
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Category filter
      if (selectedCategory !== "ALL" && item.categoryName !== selectedCategory) {
        return false;
      }
      // Stock filter
      if (stockFilter === "IN_STOCK" && (item.stock ?? 0) <= 0) {
        return false;
      }
      if (stockFilter === "LOW_STOCK" && (item.stock ?? 0) > 5) {
        return false;
      }
      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.brand && item.brand.toLowerCase().includes(q)) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q)) ||
        (item.variantName && item.variantName.toLowerCase().includes(q))
      );
    });
  }, [allItems, searchQuery, selectedCategory, stockFilter]);

  // ---------------------------------------------------------------------------
  // Selection helpers & Bulk operations
  // ---------------------------------------------------------------------------
  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setQuantities((q) => ({ ...q, [id]: q[id] ?? 1 }));
      }
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    const ids = new Set(selectedIds);
    filteredItems.forEach((i) => {
      ids.add(i.id);
    });
    setSelectedIds(ids);
    setQuantities((prev) => {
      const next = { ...prev };
      filteredItems.forEach((i) => {
        if (!next[i.id]) next[i.id] = 1;
      });
      return next;
    });
  }, [filteredItems, selectedIds]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const applyBulkQuantityDelta = useCallback((delta: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        const current = next[id] ?? 1;
        next[id] = Math.max(1, Math.min(999, current + delta));
      });
      return next;
    });
  }, [selectedIds]);

  /** 1-click feature: Sets print quantity to each selected product's actual stock! */
  const matchStockQuantities = useCallback(() => {
    setQuantities((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        const item = allItems.find((i) => i.id === id);
        const itemStock = Math.max(1, item?.stock ?? 1);
        next[id] = itemStock;
      });
      return next;
    });
  }, [selectedIds, allItems]);

  const totalLabelsToPrint = useMemo(() => {
    let total = 0;
    selectedIds.forEach((id) => {
      total += quantities[id] ?? 1;
    });
    return total;
  }, [selectedIds, quantities]);

  // ---------------------------------------------------------------------------
  // Preview item
  // ---------------------------------------------------------------------------
  const previewItem = useMemo(() => {
    if (!previewItemId) return allItems[0] || null;
    return allItems.find((i) => i.id === previewItemId) || allItems[0] || null;
  }, [previewItemId, allItems]);

  // ---------------------------------------------------------------------------
  // Label Rendering & Print Dispatch
  // ---------------------------------------------------------------------------
  const handlePrintOrExport = useCallback(
    async (action: "direct_print" | "download" | "inspect") => {
      if (selectedIds.size === 0 || !shop?.shopId) return;
      setIsGenerating(true);

      const tasks = Array.from(selectedIds).map((id) => {
        const item = allItems.find((i) => i.id === id)!;
        return { item, quantity: quantities[id] ?? 1 };
      });

      const printerId =
        labelConfig.printerType === "zpl"
          ? "zebra_zpl"
          : labelConfig.printerType === "tspl"
          ? "tsc_tspl"
          : "standard_pdf";

      try {
        const driver = getPrinterDriver(printerId);
        const output: PrinterOutput = await renderLabelsForPrinter(printerId, {
          tasks,
          config: labelConfig,
          shopDisplayName,
        });

        // If inspecting raw commands
        if (action === "inspect") {
          setRawCodeModal({
            isOpen: true,
            title: `${driver.name} - Generated Code`,
            code: output.rawContent || "No raw text available for PDF driver.",
            language: output.metadata?.language || driver.name,
          });
          setIsGenerating(false);
          return;
        }

        // Traceability audit logging to Firestore: shops/{shopId}/barcode_logs
        if (user) {
          logBarcodePrints(
            shop.shopId,
            {
              userId: user.uid,
              username: user.username,
              role: user.role,
              displayName: user.displayName,
            },
            tasks.map((t) => ({
              productId: t.item.productId,
              productName: t.item.productName,
              variantId: t.item.variantId,
              variantName: t.item.variantName,
              barcode: t.item.barcode || t.item.sku,
              sku: t.item.sku,
              price: t.item.sellingPrice,
              quantity: t.quantity,
              paperPreset: labelConfig.paperPreset,
              action: "PRINT_BULK",
            }))
          ).catch((err) => console.warn("Traceability log error:", err));
        }

        if (action === "download") {
          driver.download(output);
        } else if (action === "direct_print") {
          if (driver.print) {
            await driver.print(output);
          } else {
            driver.download(output);
          }
        }
      } catch (err) {
        console.error("[BarcodeCenter] Print execution failed:", err);
        alert("Printing generation failed. Please review settings and retry.");
      } finally {
        setIsGenerating(false);
      }
    },
    [selectedIds, allItems, quantities, labelConfig, shop?.shopId, shopDisplayName, user]
  );

  // Reprint from log
  const handleReprint = useCallback(
    async (log: BarcodePrintLog) => {
      if (!shop?.shopId) return;
      setIsGenerating(true);

      const targetItem = allItems.find(
        (i) => i.productId === log.productId && (log.variantId ? i.variantId === log.variantId : true)
      ) || {
        id: log.productId,
        productId: log.productId,
        productName: log.productName,
        variantId: log.variantId,
        variantName: log.variantName,
        sku: log.sku,
        barcode: log.barcode,
        sellingPrice: log.price,
        unit: "pcs",
      };

      try {
        const driver = getPrinterDriver("standard_pdf");
        const output = await renderLabelsForPrinter("standard_pdf", {
          tasks: [{ item: targetItem, quantity: log.quantity }],
          config: { ...labelConfig, paperPreset: log.paperPreset },
          shopDisplayName,
        });

        if (driver.print) {
          await driver.print(output);
        } else {
          driver.download(output);
        }

        if (user) {
          logBarcodePrints(shop.shopId, { userId: user.uid, username: user.username, role: user.role }, [
            {
              productId: log.productId,
              productName: log.productName,
              variantId: log.variantId,
              variantName: log.variantName,
              barcode: log.barcode,
              sku: log.sku,
              price: log.price,
              quantity: log.quantity,
              paperPreset: log.paperPreset,
              action: "REPRINT_SCAN",
            },
          ]).catch(console.warn);
        }
      } catch (err) {
        console.error("[BarcodeCenter] Reprint failed:", err);
      } finally {
        setIsGenerating(false);
      }
    },
    [shop?.shopId, allItems, labelConfig, shopDisplayName, user]
  );

  const printerProfiles = useMemo(() => getAllPrinterProfiles(), []);

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex flex-col font-sans">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-30 bg-[#07080d]/95 backdrop-blur border-b border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/shop/dashboard")}
            className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer flex-shrink-0"
            title="Return to POS Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/10">
              <ScanLine className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white leading-none truncate">
                  Barcode Center
                </h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/15 border border-indigo-500/25 text-indigo-300">
                  Label Studio
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 truncate flex items-center gap-1.5">
                <span>{shopDisplayName}</span>
                <span>•</span>
                <span className="font-mono">{allItems.length} products synced</span>
              </p>
            </div>
          </div>
        </div>

        {/* Right Header: Cashier Badge & View Tabs */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {user && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[9px] font-bold text-indigo-300">
                {user.displayName?.charAt(0).toUpperCase() || user.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-[11px] text-zinc-300 max-w-[100px] truncate">
                {user.displayName || user.username}
              </span>
            </div>
          )}

          <div className="flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
            <button
              onClick={() => setActiveTab("generator")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                activeTab === "generator"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Label Studio</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Print Logs</span>
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════ */}
      {/* LABEL STUDIO (GENERATOR) TAB */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === "generator" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ── Quick Scan Lookup Bar ── */}
          <div className="border-b border-white/[0.06] px-4 py-2.5 bg-[#0a0b10]">
            <div className="flex items-center gap-2 max-w-5xl mx-auto">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  ref={scannerInputRef}
                  type="text"
                  value={scannerValue}
                  onChange={(e) => setScannerValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && scannerValue.trim()) {
                      handleScannerMatch(scannerValue.trim());
                    }
                  }}
                  placeholder="Scan barcode with USB reader or type code to auto-select..."
                  className="w-full pl-9 pr-10 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 focus:bg-white/[0.07] text-xs text-white placeholder-zinc-500 outline-none transition-all font-mono"
                  autoComplete="off"
                />
                {scannerValue && (
                  <button
                    onClick={() => setScannerValue("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Camera scanner trigger */}
              <button
                onClick={() => setShowCameraScanner(true)}
                title="Open camera barcode scanner"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/20 border border-indigo-600/30 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold transition-all cursor-pointer flex-shrink-0"
              >
                <Camera className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Camera Scan</span>
              </button>
            </div>
          </div>

          {/* ── Main Content Area (Left: Catalog, Right: Live Studio) ── */}
          <div className="flex-1 flex overflow-hidden">
            {/* ── LEFT: Products List & Bulk Controls ── */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-white/[0.06]">
              {/* Search & Filtering Strip */}
              <div className="px-4 py-2.5 border-b border-white/[0.06] bg-[#08090e] flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, barcode number, SKU, brand..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500/40 transition-all"
                  />
                </div>

                {/* Category dropdown */}
                {categories.length > 0 && (
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-zinc-300 outline-none focus:border-indigo-500/40 cursor-pointer"
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c} className="bg-zinc-900 text-white">
                        {c}
                      </option>
                    ))}
                  </select>
                )}

                {/* Stock filter dropdown */}
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-zinc-300 outline-none focus:border-indigo-500/40 cursor-pointer"
                >
                  <option value="ALL">All Stock</option>
                  <option value="IN_STOCK" className="bg-zinc-900 text-white">In Stock Only</option>
                  <option value="LOW_STOCK" className="bg-zinc-900 text-white">Low / Out of Stock</option>
                </select>
              </div>

              {/* Bulk Operations Bar */}
              <div className="px-4 py-2 bg-[#090a10] border-b border-white/[0.05] flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={selectAllFiltered}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-[11px] font-semibold border border-white/[0.06] transition-colors cursor-pointer"
                  >
                    Select All ({filteredItems.length})
                  </button>
                  <button
                    onClick={clearAll}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white text-[11px] font-medium border border-white/[0.06] transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>

                {/* Bulk tools active when items selected */}
                <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                  {selectedIds.size > 0 && (
                    <>
                      {/* Match Stock Quantities Button */}
                      <button
                        onClick={matchStockQuantities}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold transition-all cursor-pointer shadow-sm"
                        title="Set label quantity for each item equal to its current stock on hand"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        Match Stock Qty
                      </button>

                      {/* Delta steppers */}
                      <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06]">
                        <button
                          onClick={() => applyBulkQuantityDelta(1)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                          title="Add 1 to all selected"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => applyBulkQuantityDelta(5)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                          title="Add 5 to all selected"
                        >
                          +5
                        </button>
                        <button
                          onClick={() => applyBulkQuantityDelta(10)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                          title="Add 10 to all selected"
                        >
                          +10
                        </button>
                      </div>

                      <div className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/25 text-[11px] font-bold text-indigo-300">
                        {selectedIds.size} selected ({totalLabelsToPrint} labels)
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Table Column Header Guide */}
              <div className="px-4 py-1.5 bg-[#06070a] border-b border-white/[0.04] text-[10px] uppercase font-bold tracking-wider text-zinc-500 flex items-center gap-3">
                <span className="w-4"></span>
                <span className="w-8">Image</span>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
                  <span className="md:col-span-6">Product</span>
                  <span className="md:col-span-3 hidden sm:block">Category</span>
                  <span className="md:col-span-3 text-right">Stock</span>
                </div>
                <span className="w-20 text-right hidden lg:block">Price</span>
                <span className="w-24 text-center">Print Qty</span>
                <span className="w-6"></span>
              </div>

              {/* Products List Content */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {loadingProducts ? (
                  <div className="flex flex-col items-center justify-center h-56 gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-xs text-zinc-400">Loading products from Firebase...</p>
                  </div>
                ) : loadError ? (
                  <div className="flex flex-col items-center justify-center h-56 gap-3">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                    <p className="text-xs text-zinc-400">{loadError}</p>
                    <button
                      onClick={loadProducts}
                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-56 gap-3 text-zinc-500">
                    <Package className="w-10 h-10 text-zinc-600" />
                    <p className="text-xs">
                      {searchQuery || selectedCategory !== "ALL" || stockFilter !== "ALL"
                        ? "No products match the applied filters."
                        : "No products found for this shop in Firebase."}
                    </p>
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <BarcodeItemRow
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      quantity={quantities[item.id] ?? 1}
                      highlighted={highlightedItemId === item.id}
                      onToggle={() => toggleItem(item.id)}
                      onQuantityChange={(qty) =>
                        setQuantities((prev) => ({ ...prev, [item.id]: qty }))
                      }
                      onPreview={() => setPreviewItemId(item.id)}
                      isPreviewed={previewItemId === item.id}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── RIGHT: Live Label Studio & Customizer ── */}
            <div className="w-80 xl:w-[380px] flex-shrink-0 flex flex-col overflow-hidden bg-[#08090e] border-l border-white/[0.06]">
              {/* Live Preview Header & Sticker Canvas */}
              <div className="border-b border-white/[0.06] p-4 flex flex-col items-center gap-3 bg-[#0a0b12]">
                <div className="w-full flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    Label Preview
                  </span>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    {PAPER_PRESETS[labelConfig.paperPreset]?.columns || 1} / row
                  </span>
                </div>

                {previewItem && (
                  <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs">
                    <span className="text-zinc-300 font-medium truncate max-w-[200px]">
                      {previewItem.productName}
                    </span>
                    <span className="text-indigo-400 font-mono text-[10.5px] ml-2 flex-shrink-0 font-semibold">
                      #{previewItem.barcode || previewItem.sku}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-center w-full py-1">
                  {previewItem ? (
                    <BarcodeLabelPreview
                      item={previewItem}
                      config={labelConfig}
                      shopName={shopDisplayName}
                    />
                  ) : (
                    <div className="w-full h-36 rounded-xl bg-zinc-900/60 border border-dashed border-white/[0.08] flex flex-col items-center justify-center gap-2 text-zinc-500">
                      <Package className="w-6 h-6 text-zinc-600" />
                      <span className="text-xs text-zinc-500">Select a product to preview</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Configuration Controls */}
              <div className="flex-1 overflow-y-auto">
                <button
                  onClick={() => setConfigExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    Printer & Label Settings
                  </span>
                  {configExpanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </button>

                {configExpanded && (
                  <div className="p-4 space-y-4 text-xs">
                    {/* 1. Printer Target Selection */}
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        Target Printer Type
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {printerProfiles.map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() =>
                              setLabelConfig((c) => ({
                                ...c,
                                printerType: profile.type,
                                // If switching to thermal printer, default to thermal preset if on A4
                                paperPreset:
                                  profile.type !== "pdf" && c.paperPreset.startsWith("a4_")
                                    ? "thermal_50x30"
                                    : c.paperPreset,
                              }))
                            }
                            className={`px-2 py-2 rounded-xl border text-center transition-all cursor-pointer ${
                              labelConfig.printerType === profile.type
                                ? "border-indigo-500/60 bg-indigo-500/15 text-white font-bold"
                                : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="text-[10.5px] truncate">
                              {profile.type === "pdf"
                                ? "Standard PDF"
                                : profile.type === "zpl"
                                ? "Zebra (ZPL)"
                                : "TSC (TSPL)"}
                            </div>
                            <div className="text-[8.5px] text-zinc-500 mt-0.5 uppercase">
                              {profile.fileExtension}
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Zebra / TSC DPI and Density options */}
                      {labelConfig.printerType !== "pdf" && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-300">Resolution (DPI)</span>
                            <div className="flex gap-1">
                              {[203, 300].map((dpi) => (
                                <button
                                  key={dpi}
                                  type="button"
                                  onClick={() =>
                                    setLabelConfig((c) => ({
                                      ...c,
                                      printerDpi: dpi as any,
                                    }))
                                  }
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                    (labelConfig.printerDpi || 203) === dpi
                                      ? "bg-indigo-600 text-white"
                                      : "bg-white/[0.05] text-zinc-400"
                                  }`}
                                >
                                  {dpi} DPI
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-400">Direct Command Ready</span>
                            <button
                              type="button"
                              onClick={() => handlePrintOrExport("inspect")}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                            >
                              Inspect Code
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Paper Presets */}
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        Paper / Roll Format
                      </label>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {(Object.values(PAPER_PRESETS) as typeof PAPER_PRESETS[PaperPresetId][]).map(
                          (preset) => {
                            // If Zebra/TSC is selected, filter out A4 sheets to avoid driver misalignment
                            const isSheet = preset.id.startsWith("a4_");
                            if (labelConfig.printerType !== "pdf" && isSheet) return null;

                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() =>
                                  setLabelConfig((c) => ({
                                    ...c,
                                    paperPreset: preset.id,
                                  }))
                                }
                                className={`w-full text-left px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                                  labelConfig.paperPreset === preset.id
                                    ? "border-indigo-500/60 bg-indigo-500/10 text-white"
                                    : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold truncate">{preset.name}</span>
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-400 flex-shrink-0">
                                    {preset.labelWidthMm}×{preset.labelHeightMm}mm
                                  </span>
                                </div>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>

                    {/* 3. Custom Dimensions */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                          Label Dimensions (mm)
                        </label>
                        {(labelConfig.customWidthMm || labelConfig.customHeightMm) && (
                          <button
                            type="button"
                            onClick={() =>
                              setLabelConfig((c) => ({
                                ...c,
                                customWidthMm: undefined,
                                customHeightMm: undefined,
                              }))
                            }
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9.5px] text-zinc-500 block mb-1">Width (mm)</span>
                          <input
                            type="number"
                            min={15}
                            max={150}
                            value={
                              labelConfig.customWidthMm ??
                              PAPER_PRESETS[labelConfig.paperPreset]?.labelWidthMm ??
                              32
                            }
                            onChange={(e) =>
                              setLabelConfig((c) => ({
                                ...c,
                                customWidthMm: Number(e.target.value) || undefined,
                              }))
                            }
                            className="w-full px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-white outline-none focus:border-indigo-500/40 font-mono"
                          />
                        </div>
                        <div>
                          <span className="text-[9.5px] text-zinc-500 block mb-1">Height (mm)</span>
                          <input
                            type="number"
                            min={10}
                            max={120}
                            value={
                              labelConfig.customHeightMm ??
                              PAPER_PRESETS[labelConfig.paperPreset]?.labelHeightMm ??
                              24
                            }
                            onChange={(e) =>
                              setLabelConfig((c) => ({
                                ...c,
                                customHeightMm: Number(e.target.value) || undefined,
                              }))
                            }
                            className="w-full px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-white outline-none focus:border-indigo-500/40 font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 4. Display Toggles */}
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        Label Fields Display
                      </label>
                      <div className="space-y-1">
                        {(
                          [
                            { key: "showShopName", label: "Shop Header", icon: Store },
                            { key: "showPrice", label: "Price Tag", icon: Tag },
                            { key: "showSku", label: "SKU Code", icon: Tag },
                          ] as const
                        ).map(({ key, label, icon: Icon }) => (
                          <div
                            key={key}
                            className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/[0.05]"
                          >
                            <div className="flex items-center gap-2 text-[11px] text-zinc-300">
                              <Icon className="w-3.5 h-3.5 text-zinc-500" />
                              {label}
                            </div>
                            <button
                              type="button"
                              onClick={() => setLabelConfig((c) => ({ ...c, [key]: !c[key] }))}
                              className={`relative w-8 h-4.5 rounded-full transition-colors cursor-pointer ${
                                labelConfig[key] ? "bg-indigo-600" : "bg-zinc-700"
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all ${
                                  labelConfig[key] ? "left-4" : "left-0.5"
                                }`}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Currency Symbol */}
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                        Currency Symbol
                      </label>
                      <input
                        type="text"
                        value={labelConfig.currencySymbol}
                        onChange={(e) =>
                          setLabelConfig((c) => ({ ...c, currencySymbol: e.target.value }))
                        }
                        className="w-full px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-white outline-none focus:border-indigo-500/40"
                        placeholder="Rs."
                        maxLength={5}
                      />
                    </div>

                    {/* Custom Shop Name */}
                    {labelConfig.showShopName && (
                      <div>
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                          Custom Shop Title
                        </label>
                        <input
                          type="text"
                          value={labelConfig.customShopName || ""}
                          onChange={(e) =>
                            setLabelConfig((c) => ({ ...c, customShopName: e.target.value }))
                          }
                          className="w-full px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-white outline-none focus:border-indigo-500/40"
                          placeholder={shopDisplayName}
                          maxLength={32}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Print Actions Footer */}
              <div className="p-4 border-t border-white/[0.07] space-y-2 bg-[#07080d]">
                {selectedIds.size === 0 ? (
                  <p className="text-[11px] text-center text-zinc-500 py-1">
                    Select products from catalog to print
                  </p>
                ) : (
                  <p className="text-[11px] text-center text-zinc-400">
                    <span className="font-bold text-indigo-300">{selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""}</span> ·{" "}
                    <span className="font-bold text-white">{totalLabelsToPrint} label{totalLabelsToPrint !== 1 ? "s" : ""}</span>
                  </p>
                )}

                {labelConfig.printerType === "pdf" ? (
                  <>
                    <button
                      onClick={() => handlePrintOrExport("direct_print")}
                      disabled={selectedIds.size === 0 || isGenerating}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-indigo-600/25"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Printer className="w-4 h-4" />
                      )}
                      Print Barcodes
                    </button>

                    <button
                      onClick={() => handlePrintOrExport("download")}
                      disabled={selectedIds.size === 0 || isGenerating}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 disabled:cursor-not-allowed border border-white/[0.08] text-zinc-300 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download PDF Sheets
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handlePrintOrExport("download")}
                      disabled={selectedIds.size === 0 || isGenerating}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-indigo-600/25"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Download .{labelConfig.printerType === "zpl" ? "zpl" : "prn"} File
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handlePrintOrExport("direct_print")}
                        disabled={selectedIds.size === 0 || isGenerating}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 border border-white/[0.08] text-zinc-300 text-[11px] font-semibold transition-all cursor-pointer"
                        title="Copy raw commands to clipboard"
                      >
                        <Copy className="w-3 h-3" />
                        Copy Raw
                      </button>
                      <button
                        onClick={() => handlePrintOrExport("inspect")}
                        disabled={selectedIds.size === 0 || isGenerating}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 border border-white/[0.08] text-zinc-300 text-[11px] font-semibold transition-all cursor-pointer"
                      >
                        <Code2 className="w-3 h-3 text-indigo-400" />
                        Inspect Code
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* TRACEABILITY HISTORY TAB */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div className="flex-1 flex flex-col overflow-hidden max-w-5xl w-full mx-auto p-4">
          <div className="px-4 py-3 border border-white/[0.08] rounded-2xl bg-[#090a12] flex items-center justify-between mb-3 shadow-lg">
            <div>
              <h2 className="text-sm font-bold text-white">Barcode Print Traceability Audit</h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Multi-tenant event log of label printing for {shopDisplayName}
              </p>
            </div>
            <button
              onClick={() => {
                if (shop?.shopId) {
                  setLogsLoading(true);
                  getBarcodePrintLogs(shop.shopId, 100)
                    .then(setPrintLogs)
                    .catch(console.error)
                    .finally(() => setLogsLoading(false));
                }
              }}
              className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Refresh log"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {logsLoading ? (
              <div className="flex items-center justify-center h-48 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              </div>
            ) : printLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-500 bg-white/[0.01] rounded-2xl border border-white/[0.05]">
                <Clock className="w-8 h-8 text-zinc-600" />
                <p className="text-xs">No print history found. Generate your first barcode batch!</p>
              </div>
            ) : (
              printLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.12] transition-all group"
                >
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                      log.action === "REPRINT_SCAN"
                        ? "bg-amber-500/15 border border-amber-500/25 text-amber-400"
                        : log.action === "PRINT_BULK"
                        ? "bg-indigo-500/15 border border-indigo-500/25 text-indigo-400"
                        : "bg-emerald-500/15 border border-emerald-500/25 text-emerald-400"
                    }`}
                  >
                    {log.action === "REPRINT_SCAN" ? (
                      <RotateCcw className="w-4 h-4" />
                    ) : (
                      <Printer className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-100 truncate">
                        {log.productName}
                      </span>
                      {log.variantName && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/25 text-[9px] font-medium text-violet-300">
                          {log.variantName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 flex-wrap text-[10.5px] text-zinc-400 font-mono">
                      <span className="text-zinc-300">#{log.barcode}</span>
                      <span>•</span>
                      <span>{log.quantity} label{log.quantity !== 1 ? "s" : ""}</span>
                      <span>•</span>
                      <span>{PAPER_PRESETS[log.paperPreset]?.name || log.paperPreset}</span>
                      <span>•</span>
                      <span className="text-zinc-500 font-sans">
                        By {log.printedBy?.displayName || log.printedBy?.username}
                      </span>
                      <span>•</span>
                      <span className="text-zinc-500 font-sans">{timeAgo(log.createdAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleReprint(log)}
                    disabled={isGenerating}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-indigo-600/20 hover:border-indigo-500/30 border border-white/[0.07] text-zinc-300 hover:text-indigo-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reprint
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Camera Scanner Modal ── */}
      <CameraBarcodeScannerModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={(code) => {
          handleScannerMatch(code);
          setActiveTab("generator");
        }}
      />

      {/* ── Raw Code Inspector Modal ── */}
      <RawCodeModal
        isOpen={rawCodeModal.isOpen}
        onClose={() => setRawCodeModal((m) => ({ ...m, isOpen: false }))}
        title={rawCodeModal.title}
        code={rawCodeModal.code}
        language={rawCodeModal.language}
      />
    </div>
  );
}
