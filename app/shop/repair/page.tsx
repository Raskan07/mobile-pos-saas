"use client";

/**
 * app/shop/repair/page.tsx
 *
 * Skyfox Mobile POS — Complete Multi-Tenant Repair Management System.
 *
 * Features:
 * 1. Currency strictly in LKR (Sri Lankan Rupees).
 * 2. Sleek neutral gray secondary styling throughout, harmonized with POS teal/emerald accents.
 * 3. Minimalistic gray IOSSpinner loading indicator.
 * 4. Dedicated POS Repair Intake & Service Builder page view (matching RepairDesk POS workflow).
 * 5. 20% reduced category selection card size for an ultra-clean, compact layout.
 * 6. Custom Repair Problem creation with persistent storage in Firestore & localStorage, complete with dynamic icon selection.
 * 7. "Parts" tab (renamed from Products) for simple, fast parts inventory management:
 *    - Stores part ID/SKU, part name, cost price (LKR), selling price (LKR), and stock quantity.
 *    - Instant search by Name or by ID/SKU.
 *    - 1-click "Add to Ticket" to immediately append the part to the repair cart.
 * 8. Dedicated Service Charge Modal to easily configure and append technical labor / diagnostic / express fees to any ticket.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Laptop,
  Tablet,
  Watch,
  User,
  Phone,
  Mail,
  Calendar,
  X,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Sparkles,
  Layers,
  FileText,
  Printer,
  BarChart3,
  FileSpreadsheet,
  Gamepad2,
  Headphones,
  Check,
  Trash2,
  RotateCcw,
  CreditCard,
  Tag,
  Info,
  ShoppingCart,
  UserPlus,
  ShieldCheck,
  HardDrive,
  Cpu,
  Monitor,
  Camera,
  Battery,
  Zap,
  Droplet,
  Volume2,
  Wifi,
  DollarSign,
  Receipt,
  Settings2,
  PlusCircle,
  Package,
  FolderPlus,
  Folder,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { AuditUser } from "@/lib/types/catalog";
import {
  RepairTicket,
  RepairStatus,
  DeviceType,
  RepairPriority,
  CreateRepairTicketInput,
  PhysicalConditionAssessment,
  DeviceAccessories,
} from "@/lib/types/repair";
import {
  subscribeToRepairTickets,
  createRepairTicket,
  completeRepairAndInvoice,
  deleteRepairTicket,
  CustomRepairProblem,
  CustomRepairPart,
  subscribeToCustomRepairProblems,
  saveCustomRepairProblem,
  deleteCustomRepairProblem,
  subscribeToCustomRepairParts,
  saveCustomRepairPart,
  deleteCustomRepairPart,
} from "@/lib/services/repairService";
import CustomerPickerModal, { SelectedCustomerSummary } from "../customers/CustomerPickerModal";
import { RepairDetailView } from "@/components/repair/RepairDetailView";
import { RepairAnalyticsModal } from "@/components/repair/RepairAnalyticsModal";
import { RepairReceiptModal, RepairReceiptMode } from "@/components/repair/RepairReceiptModal";
import { ShopUserNav } from "@/components/layout/ShopUserNav";
import { IOSSpinner } from "@/components/ui/IOSSpinner";

// ── Types for POS Repair Intake Cart ─────────────────────────────────────────

interface RepairCartItem {
  id: string;
  category: string;
  brand: string;
  model: string;
  problem: string;
  partTier: string;
  qty: number;
  unitCostLKR?: number;
  unitPriceLKR: number;
  taxAmountLKR: number;
  totalLKR: number;
  sku?: string;
  details?: {
    imei?: string;
    serial?: string;
    condition?: string;
    notes?: string;
  };
}

type BreadcrumbStep = "Category" | "Manufacturer" | "Devices" | "Problems" | "Parts" | "Details";

// ── Icon Registry for Custom Problems ────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Monitor,
  Battery,
  Zap,
  Droplet,
  Camera,
  Layers,
  Volume2,
  Cpu,
  Wrench,
  ShieldAlert,
  Sparkles,
  HardDrive,
  Wifi,
  Smartphone,
  Tablet,
  Laptop,
  Gamepad2,
  Headphones,
};

const AVAILABLE_ICONS = [
  { id: "Monitor", label: "Display / Screen", icon: Monitor },
  { id: "Battery", label: "Battery / Power", icon: Battery },
  { id: "Zap", label: "Charging Port", icon: Zap },
  { id: "Droplet", label: "Liquid / Water", icon: Droplet },
  { id: "Camera", label: "Camera / Lens", icon: Camera },
  { id: "Layers", label: "Back Glass / Frame", icon: Layers },
  { id: "Volume2", label: "Audio / Speaker", icon: Volume2 },
  { id: "Cpu", label: "Motherboard / IC", icon: Cpu },
  { id: "Wrench", label: "General Hardware", icon: Wrench },
  { id: "ShieldAlert", label: "Security / Lock", icon: ShieldAlert },
  { id: "Sparkles", label: "Cleaning / Detail", icon: Sparkles },
  { id: "HardDrive", label: "Storage / SSD", icon: HardDrive },
  { id: "Wifi", label: "Network / Antenna", icon: Wifi },
  { id: "Smartphone", label: "Phone Device", icon: Smartphone },
];

// ── Preset Catalogs ──────────────────────────────────────────────────────────

const REPAIR_CATEGORIES = [
  { id: "mobile", name: "Mobile Repair", icon: Smartphone, tag: "Phones" },
  { id: "computer", name: "Computer Repair", icon: Laptop, tag: "PCs / Macs" },
  { id: "tablet", name: "Tablet Repair", icon: Tablet, tag: "iPads / Tabs" },
  { id: "watch", name: "Smartwatch Repair", icon: Watch, tag: "Apple / Galaxy" },
  { id: "console", name: "Gaming Console", icon: Gamepad2, tag: "PS / Xbox / Switch" },
  { id: "audio", name: "Audio & Gadgets", icon: Headphones, tag: "AirPods / Buds" },
];

const BRANDS_BY_CATEGORY: Record<string, string[]> = {
  mobile: ["Apple", "Samsung", "Google Pixel", "Xiaomi", "OnePlus", "Huawei", "Oppo", "Vivo", "Sony", "Motorola", "Other"],
  computer: ["Apple (Mac)", "Dell", "HP", "Lenovo", "Asus", "Acer", "MSI", "Microsoft Surface", "Custom Desktop"],
  tablet: ["Apple (iPad)", "Samsung Galaxy Tab", "Lenovo Tab", "Amazon Fire", "Xiaomi Pad", "Microsoft Surface Go"],
  watch: ["Apple Watch", "Samsung Galaxy Watch", "Garmin", "Huawei Watch", "Fitbit"],
  console: ["Sony PlayStation 5", "Sony PS4", "Microsoft Xbox Series X/S", "Xbox One", "Nintendo Switch", "Steam Deck"],
  audio: ["Apple AirPods", "Sony Headphones", "Bose", "JBL", "Sennheiser", "Beats"],
};

const POPULAR_MODELS: Record<string, string[]> = {
  "Apple": ["iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro Max", "iPhone 14", "iPhone 13", "iPhone 12", "iPhone 11"],
  "Apple (iPad)": ["iPad Pro 12.9\" (M2)", "iPad Pro 11\" (M4)", "iPad Air (5th Gen)", "iPad 10th Gen (10.9\")", "iPad Mini (6th Gen)"],
  "Apple (Mac)": ["MacBook Pro 16\" (M3)", "MacBook Pro 14\" (M2)", "MacBook Air 15\" (M2)", "MacBook Air 13\" (M1)", "iMac 24\" (M3)"],
  "Samsung": ["Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24", "Galaxy S23 Ultra", "Galaxy Z Fold 5", "Galaxy Z Flip 5", "Galaxy A54 5G", "Galaxy A34"],
  "Samsung Galaxy Tab": ["Galaxy Tab S9 Ultra", "Galaxy Tab S9+", "Galaxy Tab S9 FE", "Galaxy Tab A9+"],
  "Google Pixel": ["Pixel 9 Pro", "Pixel 9", "Pixel 8 Pro", "Pixel 8", "Pixel 7a", "Pixel 7 Pro"],
  "Xiaomi": ["Xiaomi 14 Ultra", "Xiaomi 13 Pro", "Redmi Note 13 Pro+", "Redmi Note 12", "Poco F5 Pro"],
  "OnePlus": ["OnePlus 12", "OnePlus 12R", "OnePlus 11 5G", "OnePlus Nord CE 3"],
  "Sony PlayStation 5": ["PS5 Digital Edition", "PS5 Disc Edition", "PS5 Slim"],
};

const DEFAULT_PROBLEMS = [
  { id: "screen", name: "Screen / Display Replacement", icon: "Monitor", basePriceLKR: 18500, timeEst: "1 - 2 Hours" },
  { id: "battery", name: "Battery Replacement & Calibration", icon: "Battery", basePriceLKR: 7500, timeEst: "45 Mins" },
  { id: "charging", name: "Charging Port Repair / Replacement", icon: "Zap", basePriceLKR: 4500, timeEst: "1 Hour" },
  { id: "water", name: "Liquid Damage Ultrasonic Cleaning", icon: "Droplet", basePriceLKR: 5500, timeEst: "24 Hours" },
  { id: "camera", name: "Camera Lens / Sensor Repair", icon: "Camera", basePriceLKR: 8500, timeEst: "2 Hours" },
  { id: "backglass", name: "Back Glass Laser Removal & Fix", icon: "Layers", basePriceLKR: 9500, timeEst: "3 Hours" },
  { id: "audio", name: "Earpiece / Speaker / Mic Clean & Fix", icon: "Volume2", basePriceLKR: 4000, timeEst: "1 Hour" },
  { id: "board", name: "Motherboard / Logic Board IC Repair", icon: "Cpu", basePriceLKR: 16500, timeEst: "2 - 3 Days" },
  { id: "diag", name: "Comprehensive Diagnostic Inspection", icon: "Wrench", basePriceLKR: 2000, timeEst: "30 Mins" },
];

const DEFAULT_PART_TIERS = [
  { id: "oem", name: "Genuine OEM (100% Original)", multiplier: 1.0, badge: "Best Quality", warranty: "90 Days Warranty" },
  { id: "premium", name: "Premium High-Grade Aftermarket", multiplier: 0.8, badge: "Most Popular", warranty: "60 Days Warranty" },
  { id: "standard", name: "Standard Aftermarket Replacement", multiplier: 0.65, badge: "Budget Friendly", warranty: "30 Days Warranty" },
  { id: "labor_only", name: "Labor Only (Customer Provided Part)", multiplier: 0.45, badge: "Service Only", warranty: "Service Guarantee" },
];

const DEFAULT_PART_CATEGORIES: string[] = [
  "Displays",
  "Batteries",
  "Charging Ports",
  "Cameras",
  "Housing & Glass",
  "Motherboard & IC",
  "Speakers & Audio",
  "Accessories & Other",
];

export default function RepairPage() {
  const router = useRouter();
  const { shop, user, isAuthenticated, isLoading: authLoading } = useShopAuth();

  // Primary View Mode: "pos_intake" or "tickets"
  const [activeView, setActiveView] = useState<"pos_intake" | "tickets">("pos_intake");

  // Workshop Tickets State
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [workshopSection, setWorkshopSection] = useState<"active" | "collections" | "all">("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  // Modals
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [receiptModalTicket, setReceiptModalTicket] = useState<RepairTicket | null>(null);
  const [receiptModalMode, setReceiptModalMode] = useState<RepairReceiptMode>("intake");
  const [isInvoicesModalOpen, setIsInvoicesModalOpen] = useState(false);
  const [invoicesSearchQuery, setInvoicesSearchQuery] = useState("");
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isCreateProblemOpen, setIsCreateProblemOpen] = useState(false);
  const [isCreatePartOpen, setIsCreatePartOpen] = useState(false);
  const [isServiceChargeOpen, setIsServiceChargeOpen] = useState(false);

  const [ticketSearchInput, setTicketSearchInput] = useState("");
  const [ticketSuccessMessage, setTicketSuccessMessage] = useState<string | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [collectingTicketId, setCollectingTicketId] = useState<string | null>(null);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);

  // Custom Catalogs (Stored in Firestore & LocalStorage)
  const [customProblems, setCustomProblems] = useState<CustomRepairProblem[]>([]);
  const [customParts, setCustomParts] = useState<CustomRepairPart[]>([]);

  // ── POS Intake Form & Wizard State ─────────────────────────────────────────

  // Top Tabs on Right Panel: "Repairs", "Parts" (renamed from Products), "Trade In", etc.
  const [activeTopTab, setActiveTopTab] = useState<string>("Repairs");
  const [currentStep, setCurrentStep] = useState<BreadcrumbStep>("Category");

  // Customer in POS Cart (Clean defaults without mock customer)
  const [currentCustomer, setCurrentCustomer] = useState<{
    id?: string;
    name: string;
    phone: string;
    email?: string;
    type: string;
  }>({
    name: "Walk-in Customer",
    phone: "",
    email: "",
    type: "Walk-in",
  });

  // Selected Device & Service Configuration
  const [selectedCategory, setSelectedCategory] = useState<string>("mobile");
  const [selectedBrand, setSelectedBrand] = useState<string>("Apple");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [customModelInput, setCustomModelInput] = useState<string>("");
  const [selectedProblem, setSelectedProblem] = useState<string>("");
  const [selectedPartTier, setSelectedPartTier] = useState<string>("oem");
  const [selectedCustomPartId, setSelectedCustomPartId] = useState<string | null>(null);
  const [customProblemPrice, setCustomProblemPrice] = useState<string>("");

  // Step 6 Intake Details & Conditions
  const [imeiOrSerial, setImeiOrSerial] = useState("");
  const [passcode, setPasscode] = useState("");
  const [hasPasscode, setHasPasscode] = useState(false);
  const [screenCondition, setScreenCondition] = useState<PhysicalConditionAssessment["screenCondition"]>("mint");
  const [frameCondition, setFrameCondition] = useState<PhysicalConditionAssessment["frameCondition"]>("mint");
  const [hasLiquidDamage, setHasLiquidDamage] = useState(false);
  const [customerComplaint, setCustomerComplaint] = useState("");
  const [priority, setPriority] = useState<RepairPriority>("normal");
  const [depositAmount, setDepositAmount] = useState<string>("0");
  const [depositMethod, setDepositMethod] = useState<"cash" | "card" | "qr" | "bank_transfer">("cash");
  const [isWarrantyClaim, setIsWarrantyClaim] = useState(false);

  // Cart of Repair Services / Items (Strictly empty, no mock items)
  const [cartItems, setCartItems] = useState<RepairCartItem[]>([]);

  const [discountLKR, setDiscountLKR] = useState<number>(0);
  const [wizardFilterQuery, setWizardFilterQuery] = useState("");

  // Search Filter for Parts Tab (Search by Name or by ID)
  const [partsSearchQuery, setPartsSearchQuery] = useState("");

  // ── Parts Tab Sub-Views: "category" | "all" ────────────────────────────────
  const [partsSubTab, setPartsSubTab] = useState<"category" | "all">("category");
  const [selectedPartsCategory, setSelectedPartsCategory] = useState<string>("Displays");
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [newCategoryNameInput, setNewCategoryNameInput] = useState("");
  const [customPartCategories, setCustomPartCategories] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("repair_part_categories");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_PART_CATEGORIES;
  });

  // ── New Problem Form State ─────────────────────────────────────────────────
  const [newProbName, setNewProbName] = useState("");
  const [newProbPriceLKR, setNewProbPriceLKR] = useState("");
  const [newProbTimeEst, setNewProbTimeEst] = useState("1 - 2 Hours");
  const [newProbIcon, setNewProbIcon] = useState("Wrench");

  // ── New Part Form State ────────────────────────────────────────────────────
  const [newPartName, setNewPartName] = useState("");
  const [newPartCategory, setNewPartCategory] = useState("Displays");
  const [isAddingNewCategoryInline, setIsAddingNewCategoryInline] = useState(false);
  const [newPartSku, setNewPartSku] = useState("");
  const [newPartCostLKR, setNewPartCostLKR] = useState("");
  const [newPartSellingPriceLKR, setNewPartSellingPriceLKR] = useState("");
  const [newPartTier, setNewPartTier] = useState("Genuine OEM (100% Original)");
  const [newPartWarranty, setNewPartWarranty] = useState("90 Days Warranty");
  const [newPartStockQty, setNewPartStockQty] = useState("10");

  // ── Service Charge Modal Form State ────────────────────────────────────────
  const [serviceChargeTitle, setServiceChargeTitle] = useState("Technical Labor Fee");
  const [serviceChargeAmountLKR, setServiceChargeAmountLKR] = useState("");
  const [serviceChargeNotes, setServiceChargeNotes] = useState("Inspection & precision labor charge");

  // Redirect if unauthenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/shop");
    }
  }, [authLoading, isAuthenticated, router]);

  // Construct AuditUser
  const auditUser: AuditUser = useMemo(
    () => ({
      userId: user?.uid || "anon",
      username: user?.username || "technician",
      role: user?.role || "cashier",
      displayName: user?.displayName || user?.username || "Technician",
    }),
    [user]
  );

  // Real-time listener for Workshop Tickets (Subscribe to full shop ticket list, filter in-memory so counts & sections never lose records)
  useEffect(() => {
    if (!shop?.shopId) return;
    setLoading(true);

    const unsub = subscribeToRepairTickets(shop.shopId, (fetched) => {
      setTickets(fetched);
      setLoading(false);
    });

    return () => unsub();
  }, [shop?.shopId]);

  // Real-time listener for Custom Problems & Parts Catalog
  useEffect(() => {
    if (!shop?.shopId) return;
    const unsubProblems = subscribeToCustomRepairProblems(shop.shopId, (fetched) => {
      setCustomProblems(fetched);
    });
    const unsubParts = subscribeToCustomRepairParts(shop.shopId, (fetched) => {
      setCustomParts(fetched);
    });
    return () => {
      unsubProblems();
      unsubParts();
    };
  }, [shop?.shopId]);

  // Status Classifications: Active Workshop vs Issue Collections / Repair History
  const ACTIVE_WORKSHOP_STATUSES: RepairStatus[] = [
    "pending",
    "received",
    "diagnosing",
    "awaiting_approval",
    "awaiting_parts",
    "in_repair",
    "quality_check",
    "ready_for_collection",
    "warranty_rework",
  ];

  const COLLECTION_HISTORY_STATUSES: RepairStatus[] = [
    "ready_for_collection",
    "collected",
    "delivered",
    "irreparable",
    "customer_declined",
    "cancelled",
  ];

  // Filtered tickets with Section, Status, Customer, Date Range & Search
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // 1. Section filter
      if (workshopSection === "active" && !ACTIVE_WORKSHOP_STATUSES.includes(t.status)) {
        return false;
      }
      if (workshopSection === "collections" && !COLLECTION_HISTORY_STATUSES.includes(t.status)) {
        return false;
      }

      // 2. Specific status pill filter
      if (statusFilter !== "all" && t.status !== statusFilter) {
        return false;
      }

      // 3. Customer name / phone filter
      if (customerFilter.trim()) {
        const cf = customerFilter.toLowerCase().trim();
        const matchCust =
          t.customerName.toLowerCase().includes(cf) ||
          t.customerPhone.toLowerCase().includes(cf);
        if (!matchCust) return false;
      }

      // 4. Date range filter (by createdAt)
      if (dateFromFilter) {
        const fromTs = new Date(`${dateFromFilter}T00:00:00`).getTime();
        if (!isNaN(fromTs) && t.createdAt < fromTs) return false;
      }
      if (dateToFilter) {
        const toTs = new Date(`${dateToFilter}T23:59:59.999`).getTime();
        if (!isNaN(toTs) && t.createdAt > toTs) return false;
      }

      // 5. General search query (ticket number, customer, device, IMEI, invoice/receipt ref)
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        t.ticketNumber.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.customerPhone.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q) ||
        t.brand.toLowerCase().includes(q) ||
        (t.imei1 && t.imei1.toLowerCase().includes(q)) ||
        (t.serialNumber && t.serialNumber.toLowerCase().includes(q)) ||
        (t.finalInvoiceNumber && t.finalInvoiceNumber.toLowerCase().includes(q)) ||
        (t.intakeReceiptNumber && t.intakeReceiptNumber.toLowerCase().includes(q));

      return matchQuery;
    });
  }, [tickets, workshopSection, statusFilter, customerFilter, dateFromFilter, dateToFilter, searchQuery]);

  // All Problems Combined (Default + Stored Custom)
  const allProblems = useMemo<
    { id: string; name: string; icon: string; basePriceLKR: number; timeEst: string; isCustom?: boolean }[]
  >(() => {
    const customMapped = customProblems.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon || "Wrench",
      basePriceLKR: p.basePriceLKR,
      timeEst: p.timeEst || "1 - 2 Hours",
      isCustom: true,
    }));
    return [...DEFAULT_PROBLEMS, ...customMapped];
  }, [customProblems]);

  // All Parts (Strictly live from Firestore customParts catalog, no mock fallbacks)
  const allShopParts = useMemo(() => {
    return customParts;
  }, [customParts]);

  // Available categories (merged from custom categories + any category set on any part)
  const availableCategories = useMemo(() => {
    const set = new Set<string>(customPartCategories);
    allShopParts.forEach((p) => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set);
  }, [customPartCategories, allShopParts]);

  // Parts count per category
  const categoryPartCounts = useMemo(() => {
    const map: Record<string, number> = {};
    availableCategories.forEach((c) => (map[c] = 0));
    allShopParts.forEach((p) => {
      const c = p.category?.trim() || "Accessories & Other";
      map[c] = (map[c] || 0) + 1;
    });
    return map;
  }, [availableCategories, allShopParts]);

  // Handler to create category
  const handleCreateCategory = (catName?: string) => {
    const raw = (catName || newCategoryNameInput).trim();
    if (!raw) return;
    if (!customPartCategories.some((c) => c.toLowerCase() === raw.toLowerCase())) {
      const updated = [...customPartCategories, raw];
      setCustomPartCategories(updated);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("repair_part_categories", JSON.stringify(updated));
        } catch (e) {}
      }
    }
    setSelectedPartsCategory(raw);
    setNewPartCategory(raw);
    setNewCategoryNameInput("");
    setIsNewCategoryModalOpen(false);
  };

  // Filtered Parts for Parts Tab (Category Wise or All + Instant search by Name or ID/SKU)
  const filteredPartsForTab = useMemo(() => {
    const q = partsSearchQuery.toLowerCase().trim();
    let list = allShopParts;

    if (partsSubTab === "category") {
      list = list.filter((p) => {
        const partCat = (p.category || "Accessories & Other").trim().toLowerCase();
        return partCat === selectedPartsCategory.trim().toLowerCase();
      });
    }

    if (!q) return list;

    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        p.tier.toLowerCase().includes(q)
    );
  }, [allShopParts, partsSearchQuery, partsSubTab, selectedPartsCategory]);

  // Workshop Metrics (All in LKR)
  const stats = useMemo(() => {
    const activeWorkshopCount = tickets.filter((t) =>
      [
        "pending",
        "received",
        "diagnosing",
        "awaiting_approval",
        "awaiting_parts",
        "in_repair",
        "quality_check",
        "ready_for_collection",
        "warranty_rework",
      ].includes(t.status)
    ).length;
    const waitingParts = tickets.filter((t) => t.status === "awaiting_parts").length;
    const ready = tickets.filter((t) => t.status === "ready_for_collection").length;
    const completed = tickets.filter((t) => ["collected", "delivered"].includes(t.status)).length;
    const collectionAndHistoryCount = tickets.filter((t) =>
      [
        "ready_for_collection",
        "collected",
        "delivered",
        "irreparable",
        "customer_declined",
        "cancelled",
      ].includes(t.status)
    ).length;
    const totalRev = tickets.reduce((acc, t) => acc + (t.totalPaid || 0), 0);

    return {
      active: activeWorkshopCount,
      waitingParts,
      ready,
      completed,
      collectionAndHistoryCount,
      total: tickets.length,
      revenue: totalRev,
    };
  }, [tickets]);

  // Cart Calculations
  const cartSubtotalLKR = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + it.totalLKR, 0);
  }, [cartItems]);

  const cartTotalItems = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + it.qty, 0);
  }, [cartItems]);

  const cartGrandTotalLKR = useMemo(() => {
    return Math.max(0, cartSubtotalLKR - discountLKR);
  }, [cartSubtotalLKR, discountLKR]);

  // ── Handlers for Cart & Wizard ──────────────────────────────────────────────

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    const brands = BRANDS_BY_CATEGORY[catId] || [];
    if (brands.length > 0) {
      setSelectedBrand(brands[0]);
      const models = POPULAR_MODELS[brands[0]] || [];
      setSelectedModel(models[0] || "Standard Model");
    }
    setCurrentStep("Manufacturer");
  };

  const handleSelectBrand = (brandName: string) => {
    setSelectedBrand(brandName);
    const models = POPULAR_MODELS[brandName] || [];
    if (models.length > 0) {
      setSelectedModel(models[0]);
    } else {
      setSelectedModel("");
    }
    setCurrentStep("Devices");
  };

  const handleSelectModel = (modelName: string) => {
    setSelectedModel(modelName);
    setCurrentStep("Problems");
  };

  const handleSelectProblem = (probId: string) => {
    setSelectedProblem(probId);
    setCurrentStep("Parts");
  };

  const handleSelectPartTier = (tierId: string) => {
    setSelectedPartTier(tierId);
    setSelectedCustomPartId(null);
    setCurrentStep("Details");
  };

  const handleSelectCustomPart = (part: CustomRepairPart) => {
    setSelectedCustomPartId(part.id);
    setSelectedPartTier(part.tier);
    setCurrentStep("Details");
  };

  // 1-Click Add Part Direct to Left POS Cart (from Parts Tab)
  const handleAddPartDirectToCart = (part: CustomRepairPart) => {
    const newItem: RepairCartItem = {
      id: `cart_part_${Date.now()}`,
      category: "Spare Part",
      brand: part.category || "Hardware",
      model: part.name,
      problem: `[Part] ${part.name}`,
      partTier: `${part.sku ? part.sku + " • " : ""}${part.tier}`,
      qty: 1,
      unitCostLKR: part.costPriceLKR,
      unitPriceLKR: part.sellingPriceLKR,
      taxAmountLKR: 0,
      totalLKR: part.sellingPriceLKR,
      sku: part.sku || part.id,
      details: {
        notes: `Warranty: ${part.warrantyPeriod}`,
      },
    };
    setCartItems((prev) => [...prev, newItem]);
  };

  // Add configured repair service to cart
  const handleAddServiceToCart = () => {
    const finalModel = customModelInput.trim() || selectedModel || "Device";
    const probObj = allProblems.find((p) => p.id === selectedProblem) || allProblems[0];
    const catObj = REPAIR_CATEGORIES.find((c) => c.id === selectedCategory) || REPAIR_CATEGORIES[0];

    let finalPrice = probObj.basePriceLKR;
    let finalCost = 0;
    let finalPartName = "Genuine OEM (100% Original)";
    let finalSku: string | undefined = undefined;

    if (selectedCustomPartId) {
      const customPart = allShopParts.find((p) => p.id === selectedCustomPartId);
      if (customPart) {
        finalPrice = customPart.sellingPriceLKR;
        finalCost = customPart.costPriceLKR;
        finalPartName = `${customPart.name} (${customPart.tier})`;
        finalSku = customPart.sku || customPart.id;
      }
    } else {
      const tierObj = DEFAULT_PART_TIERS.find((t) => t.id === selectedPartTier) || DEFAULT_PART_TIERS[0];
      finalPrice = Math.round(probObj.basePriceLKR * tierObj.multiplier);
      finalPartName = tierObj.name;
    }

    if (customProblemPrice) {
      const parsed = parseFloat(customProblemPrice);
      if (!isNaN(parsed) && parsed > 0) finalPrice = parsed;
    }

    const newItem: RepairCartItem = {
      id: `cart_${Date.now()}`,
      category: catObj.name,
      brand: selectedBrand,
      model: finalModel,
      problem: probObj.name,
      partTier: finalPartName,
      qty: 1,
      unitCostLKR: finalCost,
      unitPriceLKR: finalPrice,
      taxAmountLKR: 0,
      totalLKR: finalPrice,
      sku: finalSku,
      details: {
        imei: imeiOrSerial,
        notes: customerComplaint,
      },
    };

    setCartItems((prev) => [...prev, newItem]);
    setCurrentStep("Category");
  };

  // Add Standalone Service Charge
  const handleApplyServiceCharge = () => {
    const amount = parseFloat(serviceChargeAmountLKR) || 0;
    if (amount <= 0) {
      alert("Please enter a valid service charge amount.");
      return;
    }

    const newItem: RepairCartItem = {
      id: `charge_${Date.now()}`,
      category: "Labor / Service Fee",
      brand: "Workshop",
      model: "Counter Service",
      problem: serviceChargeTitle.trim() || "Technical Service Charge",
      partTier: "Labor Fee",
      qty: 1,
      unitPriceLKR: amount,
      taxAmountLKR: 0,
      totalLKR: amount,
      details: {
        notes: serviceChargeNotes,
      },
    };

    setCartItems((prev) => [...prev, newItem]);
    setIsServiceChargeOpen(false);
  };

  const handleRemoveCartItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((i) => {
          if (i.id === id) {
            const newQty = Math.max(1, i.qty + delta);
            return {
              ...i,
              qty: newQty,
              totalLKR: newQty * i.unitPriceLKR,
            };
          }
          return i;
        })
        .filter((i) => i.qty > 0)
    );
  };

  // Save New Custom Problem to Firestore & LocalStorage
  const handleSaveProblem = async () => {
    if (!shop?.shopId) return;
    if (!newProbName.trim()) {
      alert("Please enter a repair problem title.");
      return;
    }
    const price = parseFloat(newProbPriceLKR) || 0;
    if (price <= 0) {
      alert("Please specify a valid base price in LKR.");
      return;
    }

    const newProb: CustomRepairProblem = {
      id: `prob_${Date.now()}`,
      name: newProbName.trim(),
      icon: newProbIcon || "Wrench",
      basePriceLKR: price,
      timeEst: newProbTimeEst.trim() || "1 - 2 Hours",
      shopId: shop.shopId,
      createdAt: Date.now(),
    };

    try {
      await saveCustomRepairProblem(shop.shopId, newProb);
      setNewProbName("");
      setNewProbPriceLKR("");
      setIsCreateProblemOpen(false);
    } catch (e: any) {
      alert(`Failed to save problem: ${e.message}`);
    }
  };

  // Save New Custom Part to Firestore & LocalStorage (Stores Part ID, Cost & Selling Price)
  const handleSavePart = async () => {
    if (!shop?.shopId) return;
    if (!newPartName.trim()) {
      alert("Please enter a part name.");
      return;
    }
    const cost = parseFloat(newPartCostLKR) || 0;
    const sell = parseFloat(newPartSellingPriceLKR) || 0;
    if (sell <= 0) {
      alert("Please specify a selling price in LKR.");
      return;
    }

    const autoSku = `PRT-${Date.now().toString().slice(-4)}`;
    const finalSku = newPartSku.trim() || autoSku;
    const finalCategory = (newPartCategory.trim() || selectedPartsCategory || "Displays").trim();

    // Auto register category if not present
    if (!customPartCategories.some((c) => c.toLowerCase() === finalCategory.toLowerCase())) {
      const updated = [...customPartCategories, finalCategory];
      setCustomPartCategories(updated);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("repair_part_categories", JSON.stringify(updated));
        } catch (e) {}
      }
    }

    const newPart: CustomRepairPart = {
      id: `part_${Date.now()}`,
      name: newPartName.trim(),
      sku: finalSku,
      category: finalCategory,
      costPriceLKR: cost,
      sellingPriceLKR: sell,
      tier: newPartTier,
      warrantyPeriod: newPartWarranty,
      inStockQty: parseInt(newPartStockQty) || 1,
      shopId: shop.shopId,
      createdAt: Date.now(),
    };

    try {
      await saveCustomRepairPart(shop.shopId, newPart);
      setNewPartName("");
      setNewPartSku("");
      setNewPartCostLKR("");
      setNewPartSellingPriceLKR("");
      setNewPartStockQty("10");
      setIsAddingNewCategoryInline(false);
      setIsCreatePartOpen(false);
    } catch (e: any) {
      alert(`Failed to save part: ${e.message}`);
    }
  };

  // Create Ticket in Firestore
  const handleCreateTicket = async () => {
    if (isCreatingTicket) return;
    if (!shop?.shopId) {
      alert("Missing shop context. Please ensure you are logged in.");
      return;
    }

    if (cartItems.length === 0) {
      alert("Cart is empty. Please select at least one repair service.");
      return;
    }

    setIsCreatingTicket(true);

    const deviceItem = cartItems.find((it) => it.category !== "Labor / Service Fee") || cartItems[0];
    const allFaults = cartItems.map((it) =>
      it.category === "Labor / Service Fee"
        ? `${it.problem} (Service Charge: LKR ${it.totalLKR.toFixed(2)})`
        : `${it.problem} (${it.partTier})`
    );

    const conditionData: PhysicalConditionAssessment = {
      screenCondition: screenCondition,
      frameCondition: frameCondition,
      backGlassCondition: "mint",
      liquidDamageIndicator: hasLiquidDamage ? "triggered" : "intact",
      cameraLenses: "clean",
      buttonsFeel: "responsive",
      chargePortCondition: "clean",
      notes: customerComplaint,
    };

    const accessoriesData: DeviceAccessories = {
      simTray: true,
      simCard: false,
      sdCard: false,
      protectiveCase: false,
      chargerAdapter: false,
      chargingCable: false,
      originalBox: false,
    };

    const initialDep = parseFloat(depositAmount) || 0;

    const initialLineItems = cartItems.map((it) => {
      const isServiceFee = it.category === "Labor / Service Fee";
      const isPart =
        !isServiceFee &&
        (it.category === "Spare Part" || it.problem.startsWith("[Part]") || Boolean(it.sku));
      return {
        type: (isServiceFee ? "service_fee" : isPart ? "part" : "labor") as
          | "labor"
          | "part"
          | "service_fee"
          | "express_surcharge",
        description: isServiceFee
          ? `${it.problem}${it.details?.notes ? ` — ${it.details.notes}` : ""}`
          : `${it.problem} — ${it.brand} ${it.model} (${it.partTier})`,
        sku: isServiceFee ? "SVC-FEE" : it.sku,
        quantity: it.qty,
        unitCost: it.unitCostLKR || 0,
        unitSellingPrice: it.unitPriceLKR,
        totalPrice: it.totalLKR,
      };
    });

    const input: CreateRepairTicketInput = {
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      customerPhone: currentCustomer.phone,
      customerEmail: currentCustomer.email,
      deviceType: (selectedCategory as DeviceType) || "phone",
      brand: deviceItem.brand || selectedBrand || "Device",
      model: deviceItem.model || selectedModel || "General Model",
      serialNumber: imeiOrSerial,
      imei1: imeiOrSerial,
      passcodeProtected: hasPasscode,
      passcodeMasked: hasPasscode ? passcode : undefined,
      reportedFaults: allFaults,
      intakeNotes: customerComplaint,
      condition: conditionData,
      accessories: accessoriesData,
      priority: priority,
      estimatedCost: cartGrandTotalLKR,
      discountAmount: discountLKR || 0,
      initialDepositAmount: initialDep,
      depositPaymentMethod: depositMethod,
      estimatedCompletionDate: "Tomorrow, 5:00 PM",
      initialLineItems,
    };

    try {
      const created = await createRepairTicket(shop.shopId, auditUser, input);
      setTicketSuccessMessage(`Repair Ticket #${created.ticketNumber} created successfully for ${currentCustomer.name}!`);
      setCartItems([]);
      setReceiptModalMode("intake");
      setReceiptModalTicket(created);
      setTimeout(() => setTicketSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error("Failed to create ticket:", err);
      alert(`Error creating ticket: ${err.message || err}`);
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const handleCancelCart = () => {
    if (confirm("Clear current repair order and reset cart?")) {
      setCartItems([]);
      setCurrentStep("Category");
    }
  };

  const handleReopenInPOS = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSearchInput.trim()) return;
    const match = tickets.find(
      (t) =>
        t.ticketNumber.toLowerCase() === ticketSearchInput.trim().toLowerCase() ||
        t.id.toLowerCase() === ticketSearchInput.trim().toLowerCase()
    );
    if (match) {
      setSelectedTicketId(match.id);
      setTicketSearchInput("");
    } else {
      alert(`No repair ticket found matching ID: ${ticketSearchInput}`);
    }
  };

  // Quick Collect Handler from Workshop Table / Card
  const handleQuickCollectTicket = async (e: React.MouseEvent, ticket: RepairTicket) => {
    e.stopPropagation();
    if (!shop?.shopId || collectingTicketId === ticket.id) return;
    setCollectingTicketId(ticket.id);
    try {
      const res = await completeRepairAndInvoice(shop.shopId, auditUser, ticket.id, "cash", 90);
      setTicketSuccessMessage(
        `Ticket #${ticket.ticketNumber} marked COLLECTED! Invoice #${res.invoiceNumber} generated.`
      );
      setReceiptModalMode("billing");
      setReceiptModalTicket({
        ...ticket,
        status: "collected",
        finalInvoiceNumber: res.invoiceNumber,
        finalSaleId: res.saleId,
        totalPaid: ticket.estimatedCost || ticket.totalPaid,
        balanceDue: 0,
      });
      setTimeout(() => setTicketSuccessMessage(null), 6000);
    } catch (err: any) {
      alert(err.message || "Failed to collect ticket.");
    } finally {
      setCollectingTicketId(null);
    }
  };

  // Delete Repair Ticket Handler
  const handleDeleteTicket = async (e: React.MouseEvent, ticket: RepairTicket) => {
    e.stopPropagation();
    if (!shop?.shopId || deletingTicketId === ticket.id) return;
    if (
      !confirm(
        `Are you sure you want to delete Repair Ticket #${ticket.ticketNumber} (${ticket.brand} ${ticket.model} — ${ticket.customerName})?`
      )
    ) {
      return;
    }

    setDeletingTicketId(ticket.id);
    try {
      await deleteRepairTicket(shop.shopId, auditUser, ticket.id);
      if (selectedTicketId === ticket.id) {
        setSelectedTicketId(null);
      }
      setTicketSuccessMessage(`Repair Ticket #${ticket.ticketNumber} has been deleted.`);
      setTimeout(() => setTicketSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(err.message || "Failed to delete repair ticket.");
    } finally {
      setDeletingTicketId(null);
    }
  };

  // Status Badge Helper (Clean, Minimalist Workshop Styling)
  const renderStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Pending
          </span>
        );
      case "received":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-200 border border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            Received
          </span>
        );
      case "diagnosing":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-amber-300 border border-amber-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Diagnosing
          </span>
        );
      case "awaiting_approval":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-amber-300 border border-amber-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Awaiting Approval
          </span>
        );
      case "awaiting_parts":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-purple-300 border border-purple-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Awaiting Parts
          </span>
        );
      case "in_repair":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-teal-300 border border-teal-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            In Repair
          </span>
        );
      case "quality_check":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-sky-300 border border-sky-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            QC Gate
          </span>
        );
      case "ready_for_collection":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-800/50">
            <Check className="w-3 h-3 text-emerald-400" />
            Ready for Collection
          </span>
        );
      case "collected":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-700/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Collected
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/70 shadow-sm shadow-emerald-950/50">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Delivered
          </span>
        );
      case "warranty_rework":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-rose-950/40 text-rose-300 border border-rose-800/40">
            Warranty Rework
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-600/70 shadow-sm shadow-rose-950/50">
            <X className="w-3 h-3 text-rose-400" />
            Cancelled
          </span>
        );
      case "irreparable":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-red-950/80 text-red-300 border border-red-600/70">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            Irreparable
          </span>
        );
      case "customer_declined":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-orange-950/80 text-orange-300 border border-orange-600/70">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            Customer Declined
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 capitalize">
            {String(status).replace(/_/g, " ")}
          </span>
        );
    }
  };

  const renderDeviceIcon = (type: string) => {
    switch (type) {
      case "phone":
      case "mobile":
        return <Smartphone className="w-4 h-4 text-zinc-400" />;
      case "laptop":
      case "computer":
        return <Laptop className="w-4 h-4 text-zinc-400" />;
      case "tablet":
        return <Tablet className="w-4 h-4 text-teal-400" />;
      case "watch":
        return <Watch className="w-4 h-4 text-zinc-400" />;
      case "console":
        return <Gamepad2 className="w-4 h-4 text-zinc-400" />;
      default:
        return <Wrench className="w-4 h-4 text-zinc-400" />;
    }
  };

  const BREADCRUMB_STEPS: BreadcrumbStep[] = ["Category", "Manufacturer", "Devices", "Problems", "Parts", "Details"];

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* ── Top Header Navigation Bar ── */}
      <header className="sticky top-0 z-40 h-14 px-4 bg-[#092e2a] border-b border-[#144f47] flex items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="w-8 h-8 rounded-lg bg-[#0e3d37] hover:bg-[#134e47] border border-[#175b52] flex items-center justify-center text-zinc-200 transition-all cursor-pointer"
            title="Return to Main Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-wide text-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {shop?.shopName || "Repair Store A"}
            </span>
            <span className="text-zinc-400 font-mono text-[11px] hidden sm:inline">| Skyfox Repair POS</span>
          </div>
        </div>

        {/* View Toggle Tabs */}
        <div className="flex items-center gap-1 bg-[#062420] p-1 rounded-lg border border-[#0f443e]">
          <button
            type="button"
            onClick={() => setActiveView("pos_intake")}
            className={`px-3 py-1 rounded-md font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeView === "pos_intake"
                ? "bg-[#115e54] text-white shadow-sm"
                : "text-zinc-300 hover:text-white hover:bg-white/[0.05]"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Point Of Sale Intake</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("tickets")}
            className={`px-3 py-1 rounded-md font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeView === "tickets"
                ? "bg-[#115e54] text-white shadow-sm"
                : "text-zinc-300 hover:text-white hover:bg-white/[0.05]"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Workshop Tickets ({tickets.length})</span>
          </button>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsAnalyticsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0e3d37] hover:bg-[#134e47] border border-[#175b52] text-zinc-200 text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <BarChart3 className="w-3.5 h-3.5 text-teal-300" />
            <span className="hidden md:inline">Reports & KPIs</span>
          </button>

          {/* Premium Account Dropdown */}
          <ShopUserNav theme="teal" />
        </div>
      </header>

      {/* ── Success Banner ── */}
      {ticketSuccessMessage && (
        <div className="bg-emerald-950/80 border-b border-emerald-800/80 px-4 py-2 flex items-center justify-between text-xs text-emerald-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">{ticketSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setTicketSuccessMessage(null)}
            className="text-emerald-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── VIEW 1: DEDICATED FULL-PAGE POS REPAIR INTAKE ── */}
      {activeView === "pos_intake" && (
        <div className="flex-1 flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)]">
          {/* ════════════ LEFT COLUMN: POS TICKET CART & ACTIONS (~38% width) ════════════ */}
          <aside className="w-full lg:w-[38%] bg-[#0b0d13] border-r border-zinc-800/90 flex flex-col justify-between shrink-0">
            <div className="p-4 space-y-4">
              {/* Re-open in POS / Scan Ticket */}
              <form onSubmit={handleReopenInPOS} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-300 whitespace-nowrap">Re-open in POS:</span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Scan or enter Ticket ID..."
                    value={ticketSearchInput}
                    onChange={(e) => setTicketSearchInput(e.target.value)}
                    className="w-full pl-3 pr-8 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-teal-500 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-teal-400 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              {/* Customer Info Card */}
              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-200 text-xs">
                      {currentCustomer.name
                        ? currentCustomer.name
                            .split(" ")
                            .filter(Boolean)
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")
                        : "WC"}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-white">{currentCustomer.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {currentCustomer.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 font-mono">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-zinc-500" />
                          {currentCustomer.phone || "No phone attached"}
                        </span>
                        {currentCustomer.email && (
                          <span className="truncate max-w-[150px] hidden sm:inline text-zinc-500">
                            {currentCustomer.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCustomerPickerOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Change</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500 hover:text-zinc-300 cursor-pointer">Quick Intake Options</span>
                  <div className="flex items-center gap-3">
                    <span className="text-teal-400 hover:underline cursor-pointer">Customer Profile</span>
                  </div>
                </div>
              </div>

              {/* Repair Services / Parts Cart Table */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  <span className="col-span-2 text-center">QTY</span>
                  <span className="col-span-5">Item / Service</span>
                  <span className="col-span-2 text-right">Price</span>
                  <span className="col-span-2 text-right">Total</span>
                  <span className="col-span-1 text-center"></span>
                </div>

                <div className="divide-y divide-zinc-800/60 max-h-[220px] overflow-y-auto">
                  {cartItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-1 px-3 py-2 items-center text-xs text-zinc-200 hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* QTY */}
                      <div className="col-span-2 flex items-center justify-center gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(item.id, -1)}
                          className="w-4 h-4 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold w-4 text-center">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(item.id, 1)}
                          className="w-4 h-4 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      {/* Item Name */}
                      <div className="col-span-5 pr-1">
                        <div className="font-semibold text-white truncate">{item.problem}</div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {item.brand} {item.model} • {item.partTier}
                        </div>
                      </div>

                      {/* Price in LKR */}
                      <div className="col-span-2 text-right font-mono text-[11px] text-zinc-300">
                        {item.unitPriceLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>

                      {/* Total in LKR */}
                      <div className="col-span-2 text-right font-mono font-bold text-teal-400 text-xs">
                        {item.totalLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>

                      {/* Delete */}
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveCartItem(item.id)}
                          className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {cartItems.length === 0 && (
                    <div className="py-8 text-center text-zinc-500 space-y-1 px-4">
                      <ShoppingCart className="w-5 h-5 mx-auto text-zinc-600" />
                      <p className="text-xs font-medium text-zinc-400">Your repair cart is empty</p>
                      <p className="text-[11px] text-zinc-500">
                        Select a category and device on the right panel or pick a part from the Parts tab.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Add Service Charge Button */}
              <button
                type="button"
                onClick={() => setIsServiceChargeOpen(true)}
                className="w-full py-2 px-3 rounded-xl bg-teal-950/40 hover:bg-teal-900/50 border border-teal-800/60 text-teal-300 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-teal-950/30"
              >
                <Tag className="w-3.5 h-3.5 text-teal-400" />
                <span>+ Add Service Charge / Technical Labor Fee (LKR)</span>
              </button>

              {/* Order Summary Totals in LKR */}
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-zinc-400">
                  <span>Total Items</span>
                  <span>{cartTotalItems}</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span>Sub Total</span>
                  <span>LKR {cartSubtotalLKR.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-zinc-400 items-center">
                  <span>Discount</span>
                  <div className="flex items-center gap-1">
                    <span>LKR</span>
                    <input
                      type="number"
                      min="0"
                      value={discountLKR || ""}
                      onChange={(e) => setDiscountLKR(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-16 px-1.5 py-0.5 text-right rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Tax (0%)</span>
                  <span>LKR 0.00</span>
                </div>
                <div className="pt-2 border-t border-zinc-800 flex justify-between items-baseline font-bold text-sm text-white">
                  <span className="font-sans text-xs font-semibold text-zinc-300">Total</span>
                  <span className="text-emerald-400 font-mono text-base">
                    LKR {cartGrandTotalLKR.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="p-3 bg-zinc-950 border-t border-zinc-800 space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveView("tickets")}
                  className="px-2 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Wrench className="w-3.5 h-3.5 text-zinc-400" />
                  <span>View Tickets</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsInvoicesModalOpen(true)}
                  className="px-2 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-400" />
                  <span>View Invoices</span>
                </button>

                <button
                  type="button"
                  onClick={() => alert("Estimate drafted! You can share this quote with the customer.")}
                  className="px-2 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Create Estimate</span>
                </button>

                <button
                  type="button"
                  disabled={isCreatingTicket}
                  onClick={handleCreateTicket}
                  className="px-2 py-2.5 rounded-lg bg-[#0c776b] hover:bg-[#0f8b7d] disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-md shadow-teal-900/30 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {isCreatingTicket ? (
                    <>
                      <IOSSpinner size={14} color="#ffffff" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Ticket</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setIsWarrantyClaim(!isWarrantyClaim)}
                  className={`px-2 py-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    isWarrantyClaim
                      ? "bg-amber-950/40 border-amber-800 text-amber-300"
                      : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{isWarrantyClaim ? "Warranty Active" : "Warranty Claim"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsServiceChargeOpen(true)}
                  className="px-2 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>+ Service Fee</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelCart}
                  className="px-2 py-2.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/50 text-rose-300 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Cancel</span>
                </button>

                <button
                  type="button"
                  disabled={isCreatingTicket}
                  onClick={handleCreateTicket}
                  className="px-2 py-2.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-md shadow-green-950/40 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {isCreatingTicket ? (
                    <>
                      <IOSSpinner size={14} color="#ffffff" />
                      <span>Checking out...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Checkout</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </aside>

          {/* ════════════ RIGHT COLUMN: REPAIR SERVICE & DEVICE BUILDER / PARTS TAB (~62% width) ════════════ */}
          <main className="w-full lg:w-[62%] bg-[#080a0f] flex flex-col p-4 md:p-6 overflow-y-auto space-y-4">
            {/* Top Category Tabs (Renamed Products into Parts) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold border-b border-zinc-800">
              {["Repairs", "Parts", "Trade In", "Miscellaneous", "Gift Cards", "Product Bundle"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTopTab(tab)}
                  className={`px-4 py-2 rounded-t-lg transition-all whitespace-nowrap cursor-pointer ${
                    activeTopTab === tab
                      ? "bg-[#0c776b] text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* ── 1. PARTS TAB VIEW (Category Wise & All Sub-tabs, Fast Search by Name or ID) ── */}
            {activeTopTab === "Parts" && (
              <div className="space-y-3">
                {/* Clean Top Bar: [Category Wise | All] Sub-Tabs + Search + Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  {/* Sub-Tabs Switcher */}
                  <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setPartsSubTab("category")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        partsSubTab === "category"
                          ? "bg-[#0c776b] text-white shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Category Wise</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPartsSubTab("all")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        partsSubTab === "all"
                          ? "bg-[#0c776b] text-white shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>All</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                        {allShopParts.length}
                      </span>
                    </button>
                  </div>

                  {/* Search Bar for Parts (Search by Name or ID) */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder={
                        partsSubTab === "category"
                          ? `Search in ${selectedPartsCategory} or by Name / ID...`
                          : "Search all parts by Name or ID / SKU..."
                      }
                      value={partsSearchQuery}
                      onChange={(e) => setPartsSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-zinc-900/90 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-teal-500 outline-none transition-all"
                    />
                    {partsSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPartsSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Action Buttons: [+ New Category] and [+ Add Part] */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategoryNameInput("");
                        setIsNewCategoryModalOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Create a new parts category"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-teal-400" />
                      <span>+ New Category</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewPartSku(`PRT-${Date.now().toString().slice(-4)}`);
                        if (partsSubTab === "category") {
                          setNewPartCategory(selectedPartsCategory);
                        }
                        setIsCreatePartOpen(true);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Part</span>
                    </button>
                  </div>
                </div>

                {/* ── SUB-VIEW A: CATEGORY WISE ── */}
                {partsSubTab === "category" && (
                  <div className="space-y-3">
                    {/* Category Tabs / Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                      {availableCategories.map((cat) => {
                        const isSelected = selectedPartsCategory.toLowerCase() === cat.toLowerCase();
                        const count = categoryPartCounts[cat] || 0;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedPartsCategory(cat)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                              isSelected
                                ? "bg-[#0c776b] text-white border-teal-500 shadow-sm font-semibold"
                                : "bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            <span>{cat}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                isSelected ? "bg-black/25 text-white" : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          setNewCategoryNameInput("");
                          setIsNewCategoryModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 rounded-xl text-xs text-teal-400 hover:text-teal-300 border border-dashed border-teal-500/40 hover:border-teal-500 bg-teal-500/10 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 font-medium"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Category</span>
                      </button>
                    </div>

                    {/* Selected Category Header Banner */}
                    <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-teal-400" />
                          <span>{selectedPartsCategory}</span>
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          ({filteredPartsForTab.length} {filteredPartsForTab.length === 1 ? "part" : "parts"}
                          {partsSearchQuery ? ` matching "${partsSearchQuery}"` : ""})
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setNewPartSku(`PRT-${Date.now().toString().slice(-4)}`);
                          setNewPartCategory(selectedPartsCategory);
                          setIsCreatePartOpen(true);
                        }}
                        className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold cursor-pointer flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Add Part to {selectedPartsCategory}</span>
                      </button>
                    </div>

                    {/* Parts Table for Selected Category */}
                    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                      <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 bg-zinc-900/90 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        <span className="col-span-2">Part ID / SKU</span>
                        <span className="col-span-4">Part Name & Grade</span>
                        <span className="col-span-2 text-right">Cost Price</span>
                        <span className="col-span-2 text-right">Selling Price</span>
                        <span className="col-span-2 text-center">Quick Action</span>
                      </div>

                      <div className="divide-y divide-zinc-800/60 max-h-[460px] overflow-y-auto">
                        {filteredPartsForTab.map((part) => {
                          const marginLKR = part.sellingPriceLKR - part.costPriceLKR;
                          const marginPct = part.sellingPriceLKR > 0 ? ((marginLKR / part.sellingPriceLKR) * 100).toFixed(0) : 0;
                          return (
                            <div
                              key={part.id}
                              className="grid grid-cols-12 gap-2 px-3.5 py-3 items-center text-xs text-zinc-200 hover:bg-zinc-800/40 transition-colors group"
                            >
                              {/* Part ID / SKU */}
                              <div className="col-span-2">
                                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-teal-300 border border-zinc-700">
                                  {part.sku || part.id}
                                </span>
                              </div>

                              {/* Part Name & Details */}
                              <div className="col-span-4 pr-1">
                                <div className="font-semibold text-white truncate">{part.name}</div>
                                <div className="text-[10px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                                  <span>{part.tier}</span>
                                  <span>•</span>
                                  <span className="text-zinc-500">{part.warrantyPeriod}</span>
                                </div>
                              </div>

                              {/* Cost Price */}
                              <div className="col-span-2 text-right font-mono text-zinc-400">
                                <div className="text-xs">LKR {part.costPriceLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                                <span className="text-[9px] text-zinc-500">Unit Cost</span>
                              </div>

                              {/* Selling Price */}
                              <div className="col-span-2 text-right font-mono">
                                <div className="text-xs font-bold text-teal-400">
                                  LKR {part.sellingPriceLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </div>
                                <span className="text-[9px] text-emerald-400/90 font-medium">
                                  +{marginLKR.toLocaleString("en-US")} ({marginPct}%)
                                </span>
                              </div>

                              {/* Quick Add Button */}
                              <div className="col-span-2 flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleAddPartDirectToCart(part)}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer active:scale-95"
                                  title="Add part directly to ticket cart"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add to Ticket</span>
                                </button>

                                {/* Delete custom part */}
                                {Boolean(part.id) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Delete part "${part.name}"?`)) {
                                        deleteCustomRepairPart(shop?.shopId || "", part.id);
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-opacity"
                                    title="Delete part"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {filteredPartsForTab.length === 0 && (
                          <div className="py-12 text-center text-zinc-500 space-y-2">
                            <Layers className="w-6 h-6 mx-auto text-zinc-600" />
                            <p className="text-xs font-medium text-zinc-300">
                              No parts found in {selectedPartsCategory}
                              {partsSearchQuery ? ` matching "${partsSearchQuery}"` : ""}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Click "+ Add Part to {selectedPartsCategory}" to store a part under this category.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SUB-VIEW B: ALL PARTS ── */}
                {partsSubTab === "all" && (
                  <div className="space-y-3">
                    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                      <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 bg-zinc-900/90 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        <span className="col-span-2">Part ID / SKU</span>
                        <span className="col-span-4">Part Name & Category</span>
                        <span className="col-span-2 text-right">Cost Price</span>
                        <span className="col-span-2 text-right">Selling Price</span>
                        <span className="col-span-2 text-center">Quick Action</span>
                      </div>

                      <div className="divide-y divide-zinc-800/60 max-h-[480px] overflow-y-auto">
                        {filteredPartsForTab.map((part) => {
                          const marginLKR = part.sellingPriceLKR - part.costPriceLKR;
                          const marginPct = part.sellingPriceLKR > 0 ? ((marginLKR / part.sellingPriceLKR) * 100).toFixed(0) : 0;
                          return (
                            <div
                              key={part.id}
                              className="grid grid-cols-12 gap-2 px-3.5 py-3 items-center text-xs text-zinc-200 hover:bg-zinc-800/40 transition-colors group"
                            >
                              {/* Part ID / SKU */}
                              <div className="col-span-2">
                                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-teal-300 border border-zinc-700">
                                  {part.sku || part.id}
                                </span>
                              </div>

                              {/* Part Name & Category Badge */}
                              <div className="col-span-4 pr-1">
                                <div className="font-semibold text-white truncate">{part.name}</div>
                                <div className="text-[10px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-teal-300 border border-zinc-700 font-medium">
                                    {part.category || "General"}
                                  </span>
                                  <span>•</span>
                                  <span>{part.tier}</span>
                                </div>
                              </div>

                              {/* Cost Price */}
                              <div className="col-span-2 text-right font-mono text-zinc-400">
                                <div className="text-xs">LKR {part.costPriceLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                                <span className="text-[9px] text-zinc-500">Unit Cost</span>
                              </div>

                              {/* Selling Price */}
                              <div className="col-span-2 text-right font-mono">
                                <div className="text-xs font-bold text-teal-400">
                                  LKR {part.sellingPriceLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </div>
                                <span className="text-[9px] text-emerald-400/90 font-medium">
                                  +{marginLKR.toLocaleString("en-US")} ({marginPct}%)
                                </span>
                              </div>

                              {/* Quick Add Button */}
                              <div className="col-span-2 flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleAddPartDirectToCart(part)}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer active:scale-95"
                                  title="Add part directly to ticket cart"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add to Ticket</span>
                                </button>

                                {/* Delete custom part */}
                                {Boolean(part.id) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Delete part "${part.name}"?`)) {
                                        deleteCustomRepairPart(shop?.shopId || "", part.id);
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-opacity"
                                    title="Delete part"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {filteredPartsForTab.length === 0 && (
                          <div className="py-12 text-center text-zinc-500 space-y-2">
                            <Layers className="w-6 h-6 mx-auto text-zinc-600" />
                            <p className="text-xs font-medium text-zinc-300">
                              {partsSearchQuery ? `No parts found matching "${partsSearchQuery}"` : "No parts in inventory yet"}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {partsSearchQuery ? "Try searching with another name or ID, or click \"+ Add Part\" to create one." : "Click \"+ Add Part\" to register spare parts into inventory."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 2. REPAIRS WIZARD VIEW ── */}
            {activeTopTab === "Repairs" && (
              <>
                {/* Breadcrumb Trail */}
                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-1.5 text-xs overflow-x-auto">
                    {BREADCRUMB_STEPS.map((step, idx) => {
                      const isCurrent = currentStep === step;
                      return (
                        <React.Fragment key={step}>
                          <button
                            type="button"
                            onClick={() => setCurrentStep(step)}
                            className={`font-medium transition-colors cursor-pointer hover:underline ${
                              isCurrent
                                ? "text-teal-400 font-bold"
                                : "text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {step}
                          </button>
                          {idx < BREADCRUMB_STEPS.length - 1 && (
                            <span className="text-zinc-600">›</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  <span className="text-[11px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700 shrink-0">
                    Step {BREADCRUMB_STEPS.indexOf(currentStep) + 1} of 6
                  </span>
                </div>

                {/* Search Input for Wizard */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search category, brand, device model, or problem..."
                    value={wizardFilterQuery}
                    onChange={(e) => setWizardFilterQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-zinc-900/90 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-teal-500 outline-none transition-all"
                  />
                  {wizardFilterQuery && (
                    <button
                      type="button"
                      onClick={() => setWizardFilterQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* ── STEP 1: CATEGORY SELECTION (20% REDUCED COMPACT SIZE) ── */}
                {currentStep === "Category" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-200">Select Repair Service Category:</h3>
                      <span className="text-[11px] text-zinc-400">Click a category card to proceed</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {/* + Add Category Teal Card */}
                      <div
                        onClick={() => {
                          const customName = prompt("Enter new category name:");
                          if (customName) setSelectedCategory(customName.toLowerCase());
                        }}
                        className="p-3.5 rounded-xl bg-[#0c776b] hover:bg-[#0e897a] text-white flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer transition-all shadow-sm border border-teal-500/30 group active:scale-95 min-h-[105px]"
                      >
                        <Plus className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold">Add Category</span>
                      </div>

                      {/* Standard Categories — 20% Smaller Height & Padding */}
                      {REPAIR_CATEGORIES.filter((c) =>
                        !wizardFilterQuery ||
                        c.name.toLowerCase().includes(wizardFilterQuery.toLowerCase()) ||
                        c.tag.toLowerCase().includes(wizardFilterQuery.toLowerCase())
                      ).map((cat) => {
                        const IconComp = cat.icon;
                        const isSelected = selectedCategory === cat.id;
                        return (
                          <div
                            key={cat.id}
                            onClick={() => handleSelectCategory(cat.id)}
                            className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer relative min-h-[105px] group ${
                              isSelected
                                ? "bg-zinc-800/90 border-teal-500 shadow-sm"
                                : "bg-zinc-900/60 hover:bg-zinc-800/80 border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                                isSelected
                                  ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                                  : "bg-zinc-800 group-hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                              }`}
                            >
                              <IconComp className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-zinc-100 group-hover:text-white leading-tight">
                                {cat.name}
                              </h4>
                              <span className="text-[10px] text-zinc-400">{cat.tag}</span>
                            </div>
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-teal-400" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── STEP 2: MANUFACTURER SELECTION ── */}
                {currentStep === "Manufacturer" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep("Category")}
                          className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <h3 className="text-sm font-semibold text-zinc-200">
                          Select Manufacturer / Brand ({selectedCategory}):
                        </h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {(BRANDS_BY_CATEGORY[selectedCategory] || BRANDS_BY_CATEGORY["mobile"])
                        .filter((b) => !wizardFilterQuery || b.toLowerCase().includes(wizardFilterQuery.toLowerCase()))
                        .map((brandName) => {
                          const isSelected = selectedBrand === brandName;
                          return (
                            <div
                              key={brandName}
                              onClick={() => handleSelectBrand(brandName)}
                              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-center items-center text-center gap-1 ${
                                isSelected
                                  ? "bg-zinc-800 border-teal-500 text-teal-300 font-bold"
                                  : "bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
                              }`}
                            >
                              <span className="text-xs">{brandName}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ── STEP 3: DEVICES & MODELS ── */}
                {currentStep === "Devices" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep("Manufacturer")}
                          className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <h3 className="text-sm font-semibold text-zinc-200">
                          Select Device Model ({selectedBrand}):
                        </h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {(POPULAR_MODELS[selectedBrand] || [
                        "Standard Pro Model",
                        "Plus / Max Edition",
                        "Base Edition",
                        "Lite Edition",
                        "Ultra Series",
                      ])
                        .filter((m) => !wizardFilterQuery || m.toLowerCase().includes(wizardFilterQuery.toLowerCase()))
                        .map((modelName) => {
                          const isSelected = selectedModel === modelName;
                          return (
                            <div
                              key={modelName}
                              onClick={() => handleSelectModel(modelName)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                                isSelected
                                  ? "bg-zinc-800 border-teal-500 text-teal-300 font-bold"
                                  : "bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
                              }`}
                            >
                              <span>{modelName}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                            </div>
                          );
                        })}
                    </div>

                    {/* Custom Model Entry */}
                    <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                      <span className="text-xs font-semibold text-zinc-400 block">Or enter specific unlisted model:</span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. iPad Air 4th Gen A2316"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customModelInput.trim()) {
                              handleSelectModel(customModelInput.trim());
                            }
                          }}
                          className="px-4 py-1.5 rounded-lg bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold cursor-pointer"
                        >
                          Use Model
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── STEP 4: PROBLEMS / SERVICES (WITH CREATE PROBLEM & CUSTOM PERSISTENCE) ── */}
                {currentStep === "Problems" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep("Devices")}
                          className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-200">
                            Select Repair Problem for {selectedBrand} {selectedModel}:
                          </h3>
                          <p className="text-[11px] text-zinc-400">Standard workshop rates in LKR</p>
                        </div>
                      </div>

                      {/* + Create Problem Button */}
                      <button
                        type="button"
                        onClick={() => setIsCreateProblemOpen(true)}
                        className="px-3 py-1.5 rounded-lg bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>+ Create Problem</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {allProblems
                        .filter((p) => !wizardFilterQuery || p.name.toLowerCase().includes(wizardFilterQuery.toLowerCase()))
                        .map((prob) => {
                          const IconComp = ICON_MAP[prob.icon] || Wrench;
                          const isSelected = selectedProblem === prob.id;
                          return (
                            <div
                              key={prob.id}
                              onClick={() => handleSelectProblem(prob.id)}
                              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 relative group ${
                                isSelected
                                  ? "bg-zinc-800 border-teal-500 shadow-sm"
                                  : "bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800"
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-teal-400">
                                    <IconComp className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="font-semibold text-xs text-white block">{prob.name}</span>
                                    {"isCustom" in prob && (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                                        Custom Saved
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Delete custom problem */}
                                {"isCustom" in prob && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Delete custom problem "${prob.name}"?`)) {
                                        deleteCustomRepairProblem(shop?.shopId || "", prob.id);
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1"
                                    title="Delete problem"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                                <span className="text-[10px] text-zinc-400">{prob.timeEst}</span>
                                <span className="font-mono font-bold text-teal-400">
                                  LKR {prob.basePriceLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ── STEP 5: PARTS & QUALITY GRADE (WITH SEARCH BY NAME OR ID) ── */}
                {currentStep === "Parts" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep("Problems")}
                          className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-200">
                            Choose Part Quality / Spare Part:
                          </h3>
                          <p className="text-[11px] text-zinc-400">Search by Name or ID • Shows Cost & Selling Price</p>
                        </div>
                      </div>

                      {/* + Create Part Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setNewPartSku(`PRT-${Date.now().toString().slice(-4)}`);
                          setIsCreatePartOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>+ Create Part</span>
                      </button>
                    </div>

                    {/* Standard Quality Tiers */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-zinc-400">Standard Quality Grades:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {DEFAULT_PART_TIERS.map((tier) => {
                          const probObj = allProblems.find((p) => p.id === selectedProblem) || allProblems[0];
                          const estLKR = Math.round(probObj.basePriceLKR * tier.multiplier);
                          const isSelected = selectedPartTier === tier.id && !selectedCustomPartId;
                          return (
                            <div
                              key={tier.id}
                              onClick={() => handleSelectPartTier(tier.id)}
                              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                                isSelected
                                  ? "bg-zinc-800 border-teal-500 shadow-sm"
                                  : "bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800"
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="text-xs font-bold text-white block">{tier.name}</span>
                                  <span className="text-[11px] text-zinc-400">{tier.warranty}</span>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-teal-300 border border-teal-500/20 font-medium">
                                  {tier.badge}
                                </span>
                              </div>

                              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                                <span className="text-xs text-zinc-400">Estimated Cost:</span>
                                <span className="font-mono font-bold text-teal-400 text-sm">
                                  LKR {estLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Stored Parts Catalog (Searchable by Name or ID) */}
                    <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-400">
                          Or Choose from Stored Parts Catalog (Search by Name / ID):
                        </span>
                        <span className="text-[11px] text-teal-400 font-mono">
                          {filteredPartsForTab.length} parts found
                        </span>
                      </div>

                      {/* Search box inside Step 5 */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Search parts by Name or ID (e.g. PRT-IP14, Screen, Battery)..."
                          value={partsSearchQuery}
                          onChange={(e) => setPartsSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-teal-500 outline-none"
                        />
                        {partsSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setPartsSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {filteredPartsForTab.length === 0 ? (
                        <div className="py-6 px-4 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
                          <Package className="w-5 h-5 mx-auto mb-1.5 text-zinc-600" />
                          <p className="text-xs font-medium text-zinc-400">
                            {partsSearchQuery ? `No parts found matching "${partsSearchQuery}"` : "No spare parts registered yet"}
                          </p>
                          <p className="text-[11px] text-zinc-600 mt-0.5">
                            Select one of the Standard Quality Grades above, or click &quot;+ Create Part&quot; to add a new spare part.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                          {filteredPartsForTab.map((part) => {
                            const isSelected = selectedCustomPartId === part.id;
                            return (
                              <div
                                key={part.id}
                                onClick={() => handleSelectCustomPart(part)}
                                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 relative group ${
                                  isSelected
                                    ? "bg-zinc-800 border-teal-500 shadow-sm"
                                    : "bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800"
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-800 text-teal-300 border border-zinc-700">
                                        {part.sku || part.id}
                                      </span>
                                      <span className="text-xs font-bold text-white truncate max-w-[170px]">{part.name}</span>
                                    </div>
                                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                                      {part.tier} • {part.warrantyPeriod}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-zinc-400">{part.inStockQty || 1} in stock</span>
                                </div>

                                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                                  <span className="text-zinc-400 font-mono text-[11px]">
                                    Cost: LKR {part.costPriceLKR.toLocaleString("en-US")}
                                  </span>
                                  <span className="font-mono font-bold text-teal-400">
                                    Sell: LKR {part.sellingPriceLKR.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── STEP 6: DETAILS & INTAKE CHECKLIST ── */}
                {currentStep === "Details" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep("Parts")}
                          className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-200">
                            Device Intake Checklist & Security:
                          </h3>
                          <p className="text-[11px] text-zinc-400">
                            {selectedBrand} {selectedModel} • {selectedProblem}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4 text-xs">
                      {/* Serial / IMEI & Passcode */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-zinc-400 mb-1 font-medium">Serial Number / IMEI</label>
                          <input
                            type="text"
                            placeholder="Scan or enter 15-digit IMEI / Serial..."
                            value={imeiOrSerial}
                            onChange={(e) => setImeiOrSerial(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none font-mono"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-zinc-400 font-medium">Device Passcode</label>
                            <button
                              type="button"
                              onClick={() => setHasPasscode(!hasPasscode)}
                              className="text-[10px] text-teal-400 hover:underline"
                            >
                              {hasPasscode ? "Clear / No Passcode" : "+ Customer Provided Passcode"}
                            </button>
                          </div>
                          {hasPasscode ? (
                            <input
                              type="text"
                              placeholder="e.g. 1234 or Pattern"
                              value={passcode}
                              onChange={(e) => setPasscode(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none font-mono"
                            />
                          ) : (
                            <div className="px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50 text-zinc-500">
                              Passcode not provided (Pattern / Face ID)
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Physical Condition Checklist */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
                        <div>
                          <label className="block text-zinc-400 mb-1 font-medium">Screen Condition</label>
                          <select
                            value={screenCondition}
                            onChange={(e) => setScreenCondition(e.target.value as any)}
                            className="w-full px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none"
                          >
                            <option value="mint">Mint (No Scratches)</option>
                            <option value="scratched">Minor Scratches</option>
                            <option value="cracked">Cracked Front Glass</option>
                            <option value="bleeding_oled">OLED Bleeding / Black Spot</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-zinc-400 mb-1 font-medium">Frame / Body</label>
                          <select
                            value={frameCondition}
                            onChange={(e) => setFrameCondition(e.target.value as any)}
                            className="w-full px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none"
                          >
                            <option value="mint">Mint Condition</option>
                            <option value="minor_scratches">Normal Wear & Tear</option>
                            <option value="dented">Corner Dented / Dinged</option>
                            <option value="bent">Frame Warped / Bent</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-zinc-400 mb-1 font-medium">Liquid Ingress</label>
                          <button
                            type="button"
                            onClick={() => setHasLiquidDamage(!hasLiquidDamage)}
                            className={`w-full py-1.5 px-3 rounded-lg border text-left font-medium transition-all ${
                              hasLiquidDamage
                                ? "bg-rose-950/40 border-rose-800 text-rose-300"
                                : "bg-zinc-800 border-zinc-700 text-zinc-300"
                            }`}
                          >
                            {hasLiquidDamage ? "⚠ Liquid Indicator Triggered" : "✓ No Visible Liquid Exposure"}
                          </button>
                        </div>
                      </div>

                      {/* Customer Notes */}
                      <div>
                        <label className="block text-zinc-400 mb-1 font-medium">Fault Details & Customer Complaint</label>
                        <textarea
                          rows={2}
                          value={customerComplaint}
                          onChange={(e) => setCustomerComplaint(e.target.value)}
                          placeholder="Describe specific fault symptoms reported by customer..."
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none text-xs"
                        />
                      </div>

                      {/* Intake Deposit (in LKR) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
                        <div>
                          <label className="block text-zinc-400 mb-1 font-medium">Intake Deposit Amount (LKR)</label>
                          <input
                            type="number"
                            step="100"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-400 mb-1 font-medium">Payment Method</label>
                          <select
                            value={depositMethod}
                            onChange={(e) => setDepositMethod(e.target.value as any)}
                            className="w-full px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white outline-none"
                          >
                            <option value="cash">Cash Counter</option>
                            <option value="card">Credit / Debit Card</option>
                            <option value="qr">LANKAQR / Digital QR</option>
                            <option value="bank_transfer">Direct Bank Transfer</option>
                          </select>
                        </div>
                      </div>

                      {/* Add to Cart Button */}
                      <button
                        type="button"
                        onClick={handleAddServiceToCart}
                        className="w-full py-3 rounded-xl bg-[#0c776b] hover:bg-[#0f8b7d] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-teal-950/40 cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>Add Configured Service to Ticket Cart</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── 3. OTHER TABS PLACEHOLDER (Trade In, Miscellaneous, etc.) ── */}
            {activeTopTab !== "Repairs" && activeTopTab !== "Parts" && (
              <div className="py-16 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 mx-auto">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">{activeTopTab} Section</h4>
                  <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                    Manage {activeTopTab.toLowerCase()} items or quickly navigate back to the repairs intake wizard or parts catalog.
                  </p>
                </div>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTopTab("Repairs")}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
                  >
                    Go to Repairs
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTopTab("Parts")}
                    className="px-3.5 py-1.5 rounded-lg bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold cursor-pointer"
                  >
                    Go to Parts
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── VIEW 2: WORKSHOP TICKETS & STATUS MANAGEMENT ── */}
      {activeView === "tickets" && (
        <main className="relative z-10 flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-4">
          {/* Top Section Switcher & Quick Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 w-fit">
              <button
                type="button"
                onClick={() => {
                  setWorkshopSection("active");
                  setStatusFilter("all");
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  workshopSection === "active"
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Active Workshop</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    workshopSection === "active"
                      ? "bg-black/25 text-white"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {stats.active}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setWorkshopSection("collections");
                  setStatusFilter("all");
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  workshopSection === "collections"
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Issue Collections / Repair History</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    workshopSection === "collections"
                      ? "bg-black/25 text-white"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {stats.collectionAndHistoryCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setWorkshopSection("all");
                  setStatusFilter("all");
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  workshopSection === "all"
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>All Tickets</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    workshopSection === "all"
                      ? "bg-black/25 text-white"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {stats.total}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsInvoicesModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-teal-400" />
                <span>View Invoices & Receipts</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView("pos_intake")}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Repair Intake</span>
              </button>
            </div>
          </div>

          {/* Minimalist KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-zinc-400 block">Active Workshop</span>
                <span className="text-xl font-bold text-white">{stats.active}</span>
              </div>
              <span className="text-[11px] text-teal-400 bg-teal-950/40 border border-teal-800/40 px-2 py-0.5 rounded-md font-medium">
                In queue
              </span>
            </div>

            <div className="px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-zinc-400 block">Awaiting Parts</span>
                <span className="text-xl font-bold text-purple-300">{stats.waitingParts}</span>
              </div>
              <span className="text-[11px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-md font-medium">
                Parts hold
              </span>
            </div>

            <div className="px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-zinc-400 block">Ready for Collection</span>
                <span className="text-xl font-bold text-emerald-400">{stats.ready}</span>
              </div>
              <span className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-md font-medium">
                Awaiting pickup
              </span>
            </div>

            <div className="px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-zinc-400 block">Collected & Delivered</span>
                <span className="text-xl font-bold text-zinc-100">{stats.completed}</span>
              </div>
              <span className="text-[11px] text-zinc-300 font-mono bg-zinc-800/80 px-2 py-0.5 rounded-md">
                LKR {stats.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Search & Multi-Filter Control Panel */}
          <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/90 space-y-3">
            {/* Row 1: Search, Customer Filter, Date Range Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
              {/* Ticket # / IMEI / Device Search */}
              <div className="relative lg:col-span-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search ticket #, invoice #, IMEI, model..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-7 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-500 focus:border-teal-500 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Customer Name / Phone Filter */}
              <div className="relative lg:col-span-3">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter by customer or phone..."
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-full pl-9 pr-7 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-500 focus:border-teal-500 outline-none transition-all"
                />
                {customerFilter && (
                  <button
                    type="button"
                    onClick={() => setCustomerFilter("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Date From */}
              <div className="flex items-center gap-1.5 lg:col-span-2">
                <span className="text-[11px] text-zinc-400 shrink-0">From:</span>
                <input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:border-teal-500 outline-none"
                />
              </div>

              {/* Date To */}
              <div className="flex items-center gap-1.5 lg:col-span-2">
                <span className="text-[11px] text-zinc-400 shrink-0">To:</span>
                <input
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:border-teal-500 outline-none"
                />
              </div>

              {/* Reset Filters Button */}
              <div className="lg:col-span-1 flex items-center justify-end">
                {(searchQuery || customerFilter || dateFromFilter || dateToFilter || statusFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setCustomerFilter("");
                      setDateFromFilter("");
                      setDateToFilter("");
                      setStatusFilter("all");
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Contextual Status Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pt-2 border-t border-zinc-800/70 text-xs">
              {(workshopSection === "active"
                ? [
                    { id: "all", label: "All Active Workshop" },
                    { id: "pending", label: "Pending" },
                    { id: "received", label: "Received" },
                    { id: "diagnosing", label: "Diagnosing" },
                    { id: "awaiting_approval", label: "Awaiting Approval" },
                    { id: "awaiting_parts", label: "Awaiting Parts" },
                    { id: "in_repair", label: "In Repair" },
                    { id: "quality_check", label: "QC Gate" },
                    { id: "ready_for_collection", label: "Ready for Collection" },
                    { id: "warranty_rework", label: "Warranty Rework" },
                  ]
                : workshopSection === "collections"
                ? [
                    { id: "all", label: "All Collections & History" },
                    { id: "ready_for_collection", label: "Ready for Collection" },
                    { id: "collected", label: "Collected Repairs" },
                    { id: "delivered", label: "Delivered Repairs" },
                    { id: "irreparable", label: "Irreparable" },
                    { id: "customer_declined", label: "Customer Declined" },
                    { id: "cancelled", label: "Cancelled" },
                  ]
                : [
                    { id: "all", label: "All Statuses" },
                    { id: "pending", label: "Pending" },
                    { id: "received", label: "Received" },
                    { id: "diagnosing", label: "Diagnosing" },
                    { id: "awaiting_approval", label: "Awaiting Approval" },
                    { id: "awaiting_parts", label: "Awaiting Parts" },
                    { id: "in_repair", label: "In Repair" },
                    { id: "quality_check", label: "QC Gate" },
                    { id: "ready_for_collection", label: "Ready for Collection" },
                    { id: "collected", label: "Collected" },
                    { id: "delivered", label: "Delivered" },
                    { id: "cancelled", label: "Cancelled" },
                  ]
              ).map((tab) => {
                const isCancelledTab = tab.id === "cancelled";
                const isDeliveredTab = tab.id === "delivered";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                      statusFilter === tab.id
                        ? isCancelledTab
                          ? "bg-rose-950/80 text-rose-200 border border-rose-600/70 shadow-sm"
                          : isDeliveredTab
                          ? "bg-emerald-950/80 text-emerald-200 border border-emerald-500/70 shadow-sm"
                          : "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                        : isCancelledTab
                        ? "text-rose-400/80 hover:text-rose-200 hover:bg-rose-950/40"
                        : isDeliveredTab
                        ? "text-emerald-400/90 hover:text-emerald-200 hover:bg-emerald-950/40"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
              <IOSSpinner size={32} color="#71717a" />
              <p className="text-xs text-zinc-400 font-medium">Loading repair tickets...</p>
            </div>
          )}

          {/* Minimalist Professional Workshop Ticket Table */}
          {!loading && (
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/90 overflow-hidden">
              {filteredTickets.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-950/60 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Ticket & Date</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Device & Reported Problems</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Financials (LKR)</th>
                        <th className="py-3 px-4 text-right">Receipts & Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-xs">
                      {filteredTickets.map((ticket) => {
                        const payableAmount = Math.max(
                          0,
                          (ticket.estimatedCost || 0) -
                            (ticket.discountAmount || 0) +
                            (ticket.additionalCharges || 0)
                        );
                        const balanceAmount = Math.max(0, payableAmount - (ticket.totalPaid || 0));

                        const isCancelled = ticket.status === "cancelled";
                        const isDelivered = ticket.status === "delivered";
                        const isCollected = ticket.status === "collected";
                        const isDeclinedOrIrreparable =
                          ticket.status === "irreparable" || ticket.status === "customer_declined";

                        return (
                          <tr
                            key={ticket.id}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className={`group transition-colors cursor-pointer ${
                              isCancelled
                                ? "bg-rose-950/20 hover:bg-rose-950/35 border-l-4 border-l-rose-500"
                                : isDelivered
                                ? "bg-emerald-950/25 hover:bg-emerald-950/40 border-l-4 border-l-emerald-500"
                                : isCollected
                                ? "bg-emerald-950/15 hover:bg-emerald-950/25 border-l-4 border-l-emerald-600/80"
                                : isDeclinedOrIrreparable
                                ? "bg-orange-950/15 hover:bg-orange-950/25 border-l-4 border-l-orange-500"
                                : "hover:bg-zinc-800/40"
                            }`}
                          >
                            {/* Ticket & Date */}
                            <td className="py-3.5 px-4 align-top whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-mono font-bold ${
                                    isCancelled
                                      ? "text-rose-400 line-through decoration-rose-500/70"
                                      : isDelivered || isCollected
                                      ? "text-emerald-400 group-hover:text-emerald-300"
                                      : "text-teal-400 group-hover:text-teal-300"
                                  }`}
                                >
                                  {ticket.ticketNumber}
                                </span>
                                {isCancelled && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-700/60">
                                    CANCELLED
                                  </span>
                                )}
                                {isDelivered && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-600/70">
                                    DELIVERED
                                  </span>
                                )}
                                {ticket.priority === "urgent" && !isCancelled && !isDelivered && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/50">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 mt-0.5">
                                {new Date(ticket.createdAt).toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </div>
                              {ticket.finalInvoiceNumber && (
                                <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                                  INV: {ticket.finalInvoiceNumber}
                                </div>
                              )}
                            </td>

                            {/* Customer */}
                            <td className="py-3.5 px-4 align-top">
                              <div className="font-medium text-zinc-100">{ticket.customerName}</div>
                              <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                                {ticket.customerPhone || "No phone"}
                              </div>
                            </td>

                            {/* Device & Reported Problems */}
                            <td className="py-3.5 px-4 align-top max-w-[280px]">
                              <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
                                {renderDeviceIcon(ticket.deviceType)}
                                <span>
                                  {ticket.brand} {ticket.model}
                                </span>
                              </div>
                              {(ticket.imei1 || ticket.serialNumber) && (
                                <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                                  IMEI/SN: {ticket.imei1 || ticket.serialNumber}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {(ticket.reportedFaults || []).slice(0, 3).map((fault, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-300 border border-zinc-700/80 truncate max-w-[180px]"
                                  >
                                    {fault}
                                  </span>
                                ))}
                                {(ticket.reportedFaults || []).length > 3 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                    +{(ticket.reportedFaults || []).length - 3}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 align-top whitespace-nowrap">
                              {renderStatusBadge(ticket.status)}
                              {ticket.assignedTechnicianName && (
                                <div className="text-[10px] text-zinc-400 mt-1">
                                  Tech: <span className="text-zinc-300">{ticket.assignedTechnicianName}</span>
                                </div>
                              )}
                            </td>

                            {/* Financials */}
                            <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono">
                              <div className="font-semibold text-zinc-100">
                                {payableAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </div>
                              <div className="text-[10px] text-zinc-400 mt-0.5">
                                Paid: {(ticket.totalPaid || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </div>
                              {balanceAmount > 0 ? (
                                <div className="text-[10px] text-amber-400 font-medium">
                                  Due: {balanceAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </div>
                              ) : (
                                payableAmount > 0 && (
                                  <div className="text-[10px] text-emerald-400 font-medium">Settled</div>
                                )
                              )}
                            </td>

                            {/* Receipts & Quick Actions */}
                            <td
                              className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {/* Receipt 1: Job Receiving Receipt */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptModalMode("intake");
                                    setReceiptModalTicket(ticket);
                                  }}
                                  title="View / Print Job Receiving Receipt"
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <FileText className="w-3 h-3 text-teal-400" />
                                  <span>Job Receipt</span>
                                </button>

                                {/* Receipt 2: Final Billing Receipt */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptModalMode("billing");
                                    setReceiptModalTicket(ticket);
                                  }}
                                  title="View / Print Final Customer Billing Receipt"
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <CreditCard className="w-3 h-3 text-emerald-400" />
                                  <span>Billing Receipt</span>
                                </button>

                                {/* Quick Collect Action when Ready for Collection */}
                                {ticket.status === "ready_for_collection" && (
                                  <button
                                    type="button"
                                    disabled={collectingTicketId === ticket.id}
                                    onClick={(e) => handleQuickCollectTicket(e, ticket)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                  >
                                    {collectingTicketId === ticket.id ? (
                                      <>
                                        <IOSSpinner size={12} color="#ffffff" />
                                        <span>Collecting...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3 h-3" />
                                        <span>Mark Collected</span>
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* Open Ticket Details Modal */}
                                <button
                                  type="button"
                                  onClick={() => setSelectedTicketId(ticket.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-medium transition-all cursor-pointer flex items-center gap-0.5"
                                >
                                  <span>Manage</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete Ticket Button */}
                                <button
                                  type="button"
                                  disabled={deletingTicketId === ticket.id}
                                  onClick={(e) => handleDeleteTicket(e, ticket)}
                                  title="Delete Repair Ticket"
                                  className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-950/60 border border-zinc-700/80 hover:border-rose-700/60 text-zinc-400 hover:text-rose-300 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {deletingTicketId === ticket.id ? (
                                    <IOSSpinner size={12} color="#fda4af" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">No matching repair records found</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-md">
                      {workshopSection === "collections"
                        ? "No ready-for-collection or historical collected repairs match your current filters."
                        : "No repair tickets match your current search or filter criteria."}
                    </p>
                  </div>
                  {(searchQuery || customerFilter || dateFromFilter || dateToFilter || statusFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setCustomerFilter("");
                        setDateFromFilter("");
                        setDateToFilter("");
                        setStatusFilter("all");
                      }}
                      className="text-xs text-teal-400 hover:text-teal-300 font-medium cursor-pointer"
                    >
                      Clear active filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* ── MODAL 1: CREATE CUSTOM REPAIR PROBLEM ── */}
      {isCreateProblemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1017] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Create Custom Repair Problem</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateProblemOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[80vh]">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Problem / Service Title</label>
                <input
                  type="text"
                  placeholder="e.g. HDMI Port Replacement, Face ID Sensor Fix..."
                  value={newProbName}
                  onChange={(e) => setNewProbName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Base Price (LKR)</label>
                  <input
                    type="number"
                    step="100"
                    placeholder="e.g. 12500"
                    value={newProbPriceLKR}
                    onChange={(e) => setNewProbPriceLKR(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none font-mono focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Turnaround Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 - 2 Hours"
                    value={newProbTimeEst}
                    onChange={(e) => setNewProbTimeEst(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Icon Picker */}
              <div>
                <label className="block text-zinc-400 mb-2 font-medium">
                  Choose Default Icon:
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {AVAILABLE_ICONS.map((ic) => {
                    const IconComp = ic.icon;
                    const isPicked = newProbIcon === ic.id;
                    return (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => setNewProbIcon(ic.id)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                          isPicked
                            ? "bg-teal-500/20 border-teal-500 text-teal-300 font-bold"
                            : "bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800 text-zinc-400"
                        }`}
                        title={ic.label}
                      >
                        <IconComp className="w-5 h-5" />
                        <span className="text-[9px] truncate max-w-[50px]">{ic.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateProblemOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProblem}
                className="px-4 py-2 rounded-xl bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Save & Store Problem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: CREATE CUSTOM REPAIR PART (Cost & Selling Price, Part ID / SKU) ── */}
      {isCreatePartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1017] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add Spare Part to Catalog</h3>
                  <span className="text-[11px] text-zinc-400">Stores Part ID, Cost & Selling Prices in LKR</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatePartOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[80vh]">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Part Name & Model</label>
                <input
                  type="text"
                  placeholder="e.g. iPhone 14 Pro OLED Display Screen"
                  value={newPartName}
                  onChange={(e) => setNewPartName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 font-medium">Part Category</label>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewCategoryInline(!isAddingNewCategoryInline)}
                    className="text-[10px] text-teal-400 hover:underline cursor-pointer"
                  >
                    {isAddingNewCategoryInline ? "Select Existing Category" : "+ New Category"}
                  </button>
                </div>
                {isAddingNewCategoryInline ? (
                  <input
                    type="text"
                    placeholder="Type new category name (e.g. Displays, Batteries...)"
                    value={newPartCategory}
                    onChange={(e) => setNewPartCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-teal-500 text-white outline-none"
                    autoFocus
                  />
                ) : (
                  <select
                    value={newPartCategory}
                    onChange={(e) => setNewPartCategory(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none text-xs"
                  >
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 font-medium">Part ID / SKU</label>
                  <button
                    type="button"
                    onClick={() => setNewPartSku(`PRT-${Date.now().toString().slice(-4)}`)}
                    className="text-[10px] text-teal-400 hover:underline cursor-pointer"
                  >
                    Auto-Generate ID
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. PRT-IP14P-SCR"
                  value={newPartSku}
                  onChange={(e) => setNewPartSku(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none font-mono focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Cost Price (LKR)</label>
                  <input
                    type="number"
                    step="100"
                    placeholder="e.g. 14000"
                    value={newPartCostLKR}
                    onChange={(e) => setNewPartCostLKR(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none font-mono focus:border-teal-500"
                  />
                  <span className="text-[10px] text-zinc-500 mt-0.5 block">What shop pays</span>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Selling Price (LKR)</label>
                  <input
                    type="number"
                    step="100"
                    placeholder="e.g. 22500"
                    value={newPartSellingPriceLKR}
                    onChange={(e) => setNewPartSellingPriceLKR(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none font-mono font-bold text-teal-400 focus:border-teal-500"
                  />
                  <span className="text-[10px] text-emerald-400/90 mt-0.5 block">Price to customer</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-zinc-400 mb-1 font-medium">Stock Qty</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="10"
                    value={newPartStockQty}
                    onChange={(e) => setNewPartStockQty(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-zinc-400 mb-1 font-medium">Quality Tier</label>
                  <select
                    value={newPartTier}
                    onChange={(e) => setNewPartTier(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none text-xs"
                  >
                    <option value="Genuine OEM (100% Original)">Genuine OEM (100% Original)</option>
                    <option value="Premium High-Grade Aftermarket">Premium Grade A+</option>
                    <option value="Standard Aftermarket">Standard Aftermarket</option>
                    <option value="Refurbished Original">Refurbished Original</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Warranty Duration</label>
                <select
                  value={newPartWarranty}
                  onChange={(e) => setNewPartWarranty(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none"
                >
                  <option value="90 Days Warranty">90 Days Warranty</option>
                  <option value="180 Days (6 Months)">180 Days (6 Months)</option>
                  <option value="30 Days Warranty">30 Days Warranty</option>
                  <option value="Lifetime Limited Warranty">Lifetime Limited</option>
                  <option value="No Warranty">No Warranty</option>
                </select>
              </div>
            </div>

            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatePartOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePart}
                className="px-4 py-2 rounded-xl bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Store Part</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2.5: CREATE NEW PARTS CATEGORY ── */}
      {isNewCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-[#0e1017] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Create Parts Category</h3>
                  <span className="text-[11px] text-zinc-400">e.g. Displays, Batteries, Cameras</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCategoryModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1.5 text-xs font-medium">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Displays, Back Glass, Charging Flex..."
                  value={newCategoryNameInput}
                  onChange={(e) => setNewCategoryNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateCategory();
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-xs outline-none focus:border-teal-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewCategoryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCreateCategory()}
                className="px-4 py-2 rounded-xl bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Category</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: SERVICE CHARGE & TECHNICAL LABOR MODAL ── */}
      {isServiceChargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1017] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add Service Charge / Labor Fee</h3>
                  <span className="text-[11px] text-zinc-400">Apply technical labor to repair ticket</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsServiceChargeOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Quick Preset Pills */}
              <div>
                <label className="block text-zinc-400 mb-2 font-medium">Quick Labor Presets:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { title: "Technical Labor Fee", cost: "3500" },
                    { title: "Diagnostic Inspection", cost: "2000" },
                    { title: "Micro-Soldering Labor", cost: "8500" },
                    { title: "Express Rush Surcharge", cost: "2500" },
                    { title: "Water Ingress Cleaning", cost: "4000" },
                    { title: "Data Backup & Transfer", cost: "5000" },
                  ].map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => {
                        setServiceChargeTitle(preset.title);
                        setServiceChargeAmountLKR(preset.cost);
                      }}
                      className="px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-teal-500 text-left transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <span className="font-semibold text-zinc-200">{preset.title}</span>
                      <span className="font-mono text-teal-400 text-[11px] mt-0.5">LKR {preset.cost}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Service Charge Title</label>
                <input
                  type="text"
                  placeholder="e.g. Technical Labor Fee"
                  value={serviceChargeTitle}
                  onChange={(e) => setServiceChargeTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Service Charge Amount (LKR)</label>
                <input
                  type="number"
                  step="100"
                  placeholder="0.00"
                  value={serviceChargeAmountLKR}
                  onChange={(e) => setServiceChargeAmountLKR(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none font-mono text-sm font-bold text-teal-400 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Technician Notes / Memo</label>
                <input
                  type="text"
                  placeholder="Optional notes for customer or invoice..."
                  value={serviceChargeNotes}
                  onChange={(e) => setServiceChargeNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsServiceChargeOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyServiceCharge}
                className="px-4 py-2 rounded-xl bg-[#0c776b] hover:bg-[#0f8b7d] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Apply Service Charge to Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Picker Modal ── */}
      {isCustomerPickerOpen && (
        <CustomerPickerModal
          shopId={shop?.shopId || ""}
          selectedCustomerId={currentCustomer.id || null}
          onSelect={(c) => {
            if (c) {
              setCurrentCustomer({
                id: c.customerId,
                name: c.name,
                phone: c.phone,
                email: c.email,
                type: "Registered Customer",
              });
            } else {
              setCurrentCustomer({
                name: "Walk-in Customer",
                phone: "N/A",
                type: "Walk-in",
              });
            }
            setIsCustomerPickerOpen(false);
          }}
          onClose={() => setIsCustomerPickerOpen(false)}
        />
      )}

      {/* ── Ticket Detail View Workbench ── */}
      {selectedTicketId && (
        <RepairDetailView
          shopId={shop?.shopId || ""}
          shopName={shop?.shopName || "Mobile Repair Workshop"}
          ticketId={selectedTicketId}
          initialTicket={tickets.find((t) => t.id === selectedTicketId)}
          currentUser={auditUser}
          onClose={() => setSelectedTicketId(null)}
          onTicketUpdated={() => {}}
        />
      )}

      {/* ── Customer Receipt Modal (Receipt 1: Job Receiving / Receipt 2: Final Billing) ── */}
      {receiptModalTicket && (
        <RepairReceiptModal
          isOpen={!!receiptModalTicket}
          onClose={() => setReceiptModalTicket(null)}
          shopId={shop?.shopId || ""}
          shopName={shop?.shopName || "Mobile Repair Workshop"}
          initialMode={receiptModalMode}
          ticket={receiptModalTicket}
          cashierName={auditUser.username}
        />
      )}

      {/* ── View Invoices & Customer Receipts Modal ── */}
      {isInvoicesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl bg-[#0b0e14] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-teal-500/15 text-teal-400 border border-teal-500/30">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Repair Invoices & Customer Receipts</h3>
                  <p className="text-[11px] text-zinc-400">
                    Generate, view, and print customer-safe Job Receiving Receipts and Final Billing Invoices
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoicesModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search by invoice #, ticket #, customer name, phone, or device..."
                  value={invoicesSearchQuery}
                  onChange={(e) => setInvoicesSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-500 focus:border-teal-500 outline-none"
                />
                {invoicesSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setInvoicesSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/70">
              {tickets
                .filter((t) => {
                  if (!invoicesSearchQuery.trim()) return true;
                  const q = invoicesSearchQuery.toLowerCase();
                  return (
                    t.ticketNumber.toLowerCase().includes(q) ||
                    (t.finalInvoiceNumber && t.finalInvoiceNumber.toLowerCase().includes(q)) ||
                    (t.intakeReceiptNumber && t.intakeReceiptNumber.toLowerCase().includes(q)) ||
                    t.customerName.toLowerCase().includes(q) ||
                    t.customerPhone.toLowerCase().includes(q) ||
                    `${t.brand} ${t.model}`.toLowerCase().includes(q)
                  );
                })
                .map((t) => {
                  const payable = Math.max(
                    0,
                    (t.estimatedCost || 0) - (t.discountAmount || 0) + (t.additionalCharges || 0)
                  );
                  return (
                    <div
                      key={t.id}
                      className="p-4 hover:bg-zinc-900/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-teal-400">{t.ticketNumber}</span>
                          {t.intakeReceiptNumber && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                              Intake: {t.intakeReceiptNumber}
                            </span>
                          )}
                          {t.finalInvoiceNumber && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/50">
                              Invoice: {t.finalInvoiceNumber}
                            </span>
                          )}
                          {renderStatusBadge(t.status)}
                        </div>
                        <div className="text-zinc-200 font-medium">
                          {t.customerName} ({t.customerPhone}) —{" "}
                          <span className="text-zinc-400">
                            {t.brand} {t.model}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Received: {new Date(t.createdAt).toLocaleString()} • Payable:{" "}
                          <span className="text-zinc-300 font-mono">
                            LKR {payable.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>{" "}
                          • Paid:{" "}
                          <span className="text-emerald-400 font-mono">
                            LKR {(t.totalPaid || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setReceiptModalMode("intake");
                            setReceiptModalTicket(t);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-medium transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-teal-400" />
                          <span>Receipt 1: Job Receiving</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReceiptModalMode("billing");
                            setReceiptModalTicket(t);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Receipt 2: Final Billing</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsInvoicesModalOpen(false);
                            setSelectedTicketId(t.id);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
                        >
                          Open Ticket
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── Analytics & KPIs Modal ── */}
      {isAnalyticsOpen && (
        <RepairAnalyticsModal
          tickets={tickets}
          isOpen={isAnalyticsOpen}
          onClose={() => setIsAnalyticsOpen(false)}
          shopName={shop?.shopName || "Mobile Repair Workshop"}
        />
      )}
    </div>
  );
}
