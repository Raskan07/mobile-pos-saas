"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Search,
  ScanLine,
  Trash2,
  Plus,
  Minus,
  X,
  CreditCard,
  Banknote,
  Building2,
  Smartphone,
  Tag,
  CheckCircle2,
  ChevronDown,
  Clock,
  Sparkles,
  Percent,
  DollarSign,
  ArrowRight,
  ShoppingCart,
  Layers,
  LayoutGrid,
  Headphones,
  Wrench,
  Radio,
  Store,
  LogOut,
  BookOpen,
  UserPlus,
  User,
  Star,
  Bell,
  ArrowLeftRight,
  Monitor,
  Printer,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import {
  subscribeToShopNotifications,
  isNotificationReadByShop,
  isNotificationArchivedByShop,
} from "@/lib/services/notificationService";
import {
  Product,
  CartItem,
  DiscountSetting,
  getCartLineKey,
} from "./posData";
import { getProducts, getCategories } from "@/lib/services/catalogService";
import { createSaleRecord } from "@/lib/services/salesService";
import { SaleRecord } from "@/lib/types/sale";
import { Category, ProductVariant } from "@/lib/types/catalog";
import type {
  AppliedPromotion,
  Promotion,
  SalePromotionSummary,
  SalePromotionSummaryEntry,
} from "@/lib/types/promotion";
import {
  subscribeToShopPromotions,
  promotionApi,
} from "@/lib/services/promotionService";
import {
  findBestPromotionForLine,
  priceCartLines,
  roundMoney,
} from "@/lib/promotions/engine";
import ProductImage from "./ProductImage";
import PaymentModal from "./PaymentModal";
import ReceiptModal from "./ReceiptModal";
import BarcodeScannerModal from "./BarcodeScannerModal";
import NavigationView from "./NavigationView";
import CustomerPickerModal, { SelectedCustomerSummary } from "../customers/CustomerPickerModal";
import BillTransferModal from "./BillTransferModal";
import {
  PosDeviceRecord,
  BillTransferRecord,
} from "@/lib/types/billTransfer";
import {
  getOrCreateLocalDeviceIdentity,
  registerOrHeartbeatDevice,
  subscribeToShopDevices,
  subscribeToShopBillTransfers,
  updateBillTransferStatus,
  claimAndExecuteSafeUsbPrintJob,
  LocalDeviceIdentity,
} from "@/lib/services/billTransferService";
import { ShopUserNav } from "@/components/layout/ShopUserNav";
import { useRBAC } from "@/lib/rbac/useRBAC";
import { ReceiptSettings } from "@/lib/types/receiptSettings";
import { getStoredReceiptSettings, fetchReceiptSettings } from "@/lib/services/receiptSettingsService";

export default function ShopDashboardPOS() {
  const router = useRouter();
  const shopAuth = useShopAuth();
  const { hasPermission, canAccessModule } = useRBAC();

  const canCreateSales = hasPermission("sales:create");
  const canDiscount = hasPermission("sales:discount");
  const canViewMessages = canAccessModule("messages");
  const canViewSalesLedger = canAccessModule("sales_ledger");

  // Shop & Cashier data
  const shop = shopAuth?.shop || {
    shopId: "SHOP-7294",
    shopName: "HM POS Mobile Hub",
    ownerName: "Raskan",
    phone: "+1 (555) 234-8900",
    address: "142 Tech Avenue, Suite 4B",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const user = shopAuth?.user || {
    uid: "usr-cashier-01",
    shopId: shop.shopId,
    username: "raskan",
    displayName: "Raskan",
    email: "cashier@hmpos.local",
    role: "cashier",
    isActive: true,
    createdAt: Date.now(),
  };

  const activeBranchId = shopAuth?.activeBranchId || shopAuth?.user?.primaryBranchId || "main";
  const activeBranchName = shopAuth?.activeBranchName || "Main Store";

  // Shop Tax & Currency settings (Default taxRate = 0%, currency = LKR)
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() =>
    getStoredReceiptSettings(shop.shopId, shop.shopName)
  );

  useEffect(() => {
    if (!shop?.shopId) return;
    const syncSettings = () => {
      const stored = getStoredReceiptSettings(shop.shopId, shop.shopName);
      setReceiptSettings(stored);
      fetchReceiptSettings(shop.shopId, shop.shopName).then(setReceiptSettings);
    };
    syncSettings();
    window.addEventListener("focus", syncSettings);
    return () => window.removeEventListener("focus", syncSettings);
  }, [shop?.shopId, shop?.shopName]);

  const currency = receiptSettings.currency || "LKR";
  const taxRatePct = receiptSettings.taxRate ?? 0;
  const taxLabel = receiptSettings.taxName || "Tax";

  // Live Unread Notifications Count for Shop Header
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  useEffect(() => {
    if (!shop?.shopId) return;
    const unsub = subscribeToShopNotifications(shop.shopId, (items) => {
      const unread = items.filter(
        (n) =>
          !isNotificationArchivedByShop(n, shop.shopId) &&
          !isNotificationReadByShop(n, shop.shopId)
      ).length;
      setUnreadNotificationsCount(unread);
    });
    return () => unsub();
  }, [shop?.shopId]);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  // Clean cart initialized without any mock items
  const [cart, setCart] = useState<CartItem[]>([]);

  // Discount configuration: Group Discount ("group") or Each Product Discount ("item")
  const [discountSetting, setDiscountSetting] = useState<DiscountSetting>({
    type: "fixed",
    value: 0,
    scope: "group",
  });
  const [isDiscountPopoverOpen, setIsDiscountPopoverOpen] = useState(false);
  const [discountInputValue, setDiscountInputValue] = useState<string>("0");
  const [editingItemDiscountId, setEditingItemDiscountId] = useState<string | null>(null);
  const [itemDiscountInput, setItemDiscountInput] = useState<string>("");
  const [itemDiscountMode, setItemDiscountMode] = useState<"percentage" | "fixed">("fixed");

  // Selected quick payment method
  const [selectedQuickPayment, setSelectedQuickPayment] = useState<
    "cash" | "card" | "bank" | "mobile"
  >("cash");
  const [inlineCashTendered, setInlineCashTendered] = useState<string>("");

  // Modals & Navigation Views
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerModalInitialMode, setCustomerModalInitialMode] = useState<"search" | "add">("search");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomerSummary | null>(null);
  const [isBillTransferModalOpen, setIsBillTransferModalOpen] = useState(false);

  // Device Management & Inter-Machine Bill Transfer State
  const [shopDevices, setShopDevices] = useState<PosDeviceRecord[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<BillTransferRecord[]>([]);
  const [transferToast, setTransferToast] = useState<string | null>(null);
  const [localDevice, setLocalDevice] = useState<LocalDeviceIdentity>(() => ({
    deviceId: `DEV-${shop.shopId}-INIT`,
    shopId: shop.shopId,
    friendlyName: "Front Counter",
    deviceRole: "front_counter",
    locationLabel: "Main Checkout Counter",
    usbPrintAgentEnabled: true,
    usbPrinterFriendlyName: "USB Thermal Receipt Printer (80mm)",
    usbAgentPort: 9100,
    usbPaperWidth: "80mm",
    autoPrintIncomingTransfers: true,
    autoAcceptIncomingTransfers: false,
  }));

  useEffect(() => {
    if (!shop?.shopId) return;
    const identity = getOrCreateLocalDeviceIdentity(
      shop.shopId,
      user?.displayName || user?.username || "Cashier"
    );
    setLocalDevice(identity);

    const operator = {
      userId: user?.uid || "cashier",
      displayName: user?.displayName || user?.username || "Cashier",
      role: user?.role || "cashier",
    };

    registerOrHeartbeatDevice(
      shop.shopId,
      activeBranchId,
      activeBranchName,
      operator,
      identity
    ).catch(() => {});

    const hbTimer = setInterval(() => {
      registerOrHeartbeatDevice(
        shop.shopId,
        activeBranchId,
        activeBranchName,
        operator
      ).catch(() => {});
    }, 60 * 1000);

    const unsubDevices = subscribeToShopDevices(shop.shopId, setShopDevices);

    // Check if user clicked "Load to POS" from Settings -> Bill Transfer Logs
    if (typeof window !== "undefined") {
      try {
        const pendingLoadKey = `skyfox_pending_transfer_load_${shop.shopId}`;
        const rawPending = sessionStorage.getItem(pendingLoadKey);
        if (rawPending) {
          sessionStorage.removeItem(pendingLoadKey);
          const parsedTransfer = JSON.parse(rawPending) as BillTransferRecord;
          if (parsedTransfer && Array.isArray(parsedTransfer.cartItems)) {
            setCart(parsedTransfer.cartItems);
            if (parsedTransfer.discountSetting) {
              setDiscountSetting(parsedTransfer.discountSetting);
              setDiscountInputValue(String(parsedTransfer.discountSetting.value || 0));
            }
            if (parsedTransfer.customer) {
              setSelectedCustomer({
                customerId: parsedTransfer.customer.customerId,
                name: parsedTransfer.customer.name,
                phone: parsedTransfer.customer.phone,
                email: parsedTransfer.customer.email,
                pointsBalance: parsedTransfer.customer.pointsBalance || 0,
              });
            }
            setTransferToast(
              `Loaded transferred bill ${parsedTransfer.transferCode} from ${parsedTransfer.sourceDeviceName}`
            );
            setTimeout(() => setTransferToast(null), 4000);
          }
        }
      } catch {}
    }

    return () => {
      clearInterval(hbTimer);
      unsubDevices();
    };
  }, [shop?.shopId, activeBranchId, activeBranchName, user?.uid, user?.displayName, user?.username, user?.role]);

  // Real-time listener for incoming bill transfers targeted at this machine
  useEffect(() => {
    if (!shop?.shopId || !localDevice?.deviceId) return;

    const unsub = subscribeToShopBillTransfers(shop.shopId, (allTransfers) => {
      const myIncoming = allTransfers.filter(
        (t) =>
          t.targetDeviceId === localDevice.deviceId &&
          (t.status === "pending" || t.status === "delivered")
      );
      setIncomingTransfers(myIncoming);

      myIncoming.forEach((trf) => {
        if (trf.status === "pending") {
          updateBillTransferStatus(shop.shopId, trf.id, "delivered").catch(() => {});
        }
      });
    });

    return () => unsub();
  }, [shop?.shopId, localDevice?.deviceId]);

  const handleApproveAndPrintIncomingTransfer = async (trf: BillTransferRecord) => {
    // 1. Load transferred bill items & totals into the receiving machine's cart
    setCart(trf.cartItems || []);
    if (trf.discountSetting) {
      setDiscountSetting(trf.discountSetting);
      setDiscountInputValue(String(trf.discountSetting.value || 0));
    }
    if (trf.preferredPaymentMethod) {
      setSelectedQuickPayment(trf.preferredPaymentMethod);
    }
    if (trf.customer) {
      setSelectedCustomer({
        customerId: trf.customer.customerId,
        name: trf.customer.name,
        phone: trf.customer.phone,
        email: trf.customer.email,
        pointsBalance: trf.customer.pointsBalance || 0,
      });
    }

    // 2. Mark transfer as accepted by receiving user
    await updateBillTransferStatus(shop.shopId, trf.id, "accepted", {
      userId: user?.uid || "cashier",
      displayName: user?.displayName || user?.username || "Cashier",
    });

    // 3. Execute idempotent Safe USB Print Queue job (prevents duplicate prints)
    const jobId = trf.printJobId || `pjob_${shop.shopId}_${trf.id}`;
    await claimAndExecuteSafeUsbPrintJob(
      shop.shopId,
      localDevice.deviceId,
      jobId,
      trf,
      localDevice.usbAgentPort
    ).catch(() => {});

    // 4. Open Printable Receipt Modal so receiving user immediately gets into print
    setPersistedSale(null);
    setReceiptData({
      method: (trf.preferredPaymentMethod || "cash").toUpperCase(),
      tendered: trf.grandTotal,
      change: 0,
    });
    setIsReceiptOpen(true);

    setTransferToast(
      `Approved ${trf.transferCode} from ${trf.sourceDeviceName} • Ready to Print`
    );
    setTimeout(() => setTransferToast(null), 4000);
  };

  const handleAcceptIncomingTransfer = async (trf: BillTransferRecord) => {
    setCart(trf.cartItems || []);
    if (trf.discountSetting) {
      setDiscountSetting(trf.discountSetting);
      setDiscountInputValue(String(trf.discountSetting.value || 0));
    }
    if (trf.preferredPaymentMethod) {
      setSelectedQuickPayment(trf.preferredPaymentMethod);
    }
    if (trf.customer) {
      setSelectedCustomer({
        customerId: trf.customer.customerId,
        name: trf.customer.name,
        phone: trf.customer.phone,
        email: trf.customer.email,
        pointsBalance: trf.customer.pointsBalance || 0,
      });
    }
    await updateBillTransferStatus(shop.shopId, trf.id, "accepted", {
      userId: user?.uid || "cashier",
      displayName: user?.displayName || user?.username || "Cashier",
    });
    if (trf.transferMode === "load_and_checkout") {
      setIsPaymentModalOpen(true);
    }
    setTransferToast(
      `Bill ${trf.transferCode} from ${trf.sourceDeviceName} loaded into cart`
    );
    setTimeout(() => setTransferToast(null), 3500);
  };

  const handleRejectIncomingTransfer = async (trf: BillTransferRecord) => {
    await updateBillTransferStatus(shop.shopId, trf.id, "rejected", {
      userId: user?.uid || "cashier",
      displayName: user?.displayName || user?.username || "Cashier",
    });
  };

  // Global POS Billing Keyboard Shortcuts:
  // - Alt + C or F2: Quick Add Customer directly
  // - Alt + A: Open Customer Search / Attach
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if full-screen modals are open
      if (isPaymentModalOpen || isReceiptOpen || isBarcodeModalOpen) return;

      // Shortcut: Alt + C or F2 -> Quick Add Customer
      if ((e.altKey && (e.key === "c" || e.key === "C")) || e.key === "F2") {
        e.preventDefault();
        setCustomerModalInitialMode("add");
        setIsCustomerPickerOpen(true);
        return;
      }

      // Shortcut: Alt + A -> Search/Attach Customer
      if (e.altKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        setCustomerModalInitialMode("search");
        setIsCustomerPickerOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPaymentModalOpen, isReceiptOpen, isBarcodeModalOpen]);
  const [persistedSale, setPersistedSale] = useState<SaleRecord | null>(null);
  const [isSavingSale, setIsSavingSale] = useState(false);
  const [receiptData, setReceiptData] = useState<{
    method: string;
    tendered: number;
    change: number;
  }>({ method: "Cash", tendered: 0, change: 0 });

  // Status indicators
  const [isOnline, setIsOnline] = useState(true);
  const [currentDateTime, setCurrentDateTime] = useState<string>("");
  const [addedAnimationId, setAddedAnimationId] = useState<string | null>(null);

  // Dynamic Shop Data strictly from Firebase filtered by active shop ID
  const [shopCategories, setShopCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [shopPromotions, setShopPromotions] = useState<Promotion[]>([]);
  const [promoClockMs, setPromoClockMs] = useState<number>(() => Date.now());
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);

  // Real-time shop-scoped promotions listener + 15s schedule tick
  useEffect(() => {
    if (!shop?.shopId) return;
    const unsub = subscribeToShopPromotions(shop.shopId, setShopPromotions);
    const timer = setInterval(() => setPromoClockMs(Date.now()), 15_000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [shop?.shopId]);

  useEffect(() => {
    if (!shop?.shopId) return;
    let isMounted = true;

    async function loadShopCatalog() {
      setIsLoadingCatalog(true);
      try {
        const [cats, firestoreItems] = await Promise.all([
          getCategories(shop.shopId, activeBranchId),
          getProducts(shop.shopId, undefined, undefined, activeBranchId),
        ]);

        if (!isMounted) return;
        setShopCategories(cats);

        const mapped: Product[] = firestoreItems.map((item) => ({
          id: item.id,
          name: item.name,
          specs: [item.brand, item.unit].filter(Boolean).join(" • "),
          price: item.sellingPrice,
          category: item.categoryId || "",
          categoryName: item.categoryName || "",
          subcategoryId: item.subcategoryId,
          barcode: item.barcode || item.sku,
          stock: item.stockQuantity ?? 0,
          imageUrl: item.images && item.images.length > 0 ? item.images[0] : undefined,
          badge: item.brand,
          // Immutable product snapshot fields
          sku: item.sku || item.barcode || "",
          costPrice: item.costPrice ?? 0,
          unit: item.unit || "pcs",
          brand: item.brand || "",
          brandId: item.brandId || "",
          hasVariants: Boolean(item.hasVariants && item.variants && item.variants.length > 0),
          variants: item.variants || [],
        }));
        setProducts(mapped);
      } catch (err) {
        console.error("[DashboardPOS] Error loading shop products from Firebase:", err);
      } finally {
        if (isMounted) setIsLoadingCatalog(false);
      }
    }

    loadShopCatalog();
    return () => {
      isMounted = false;
    };
  }, [shop?.shopId, activeBranchId]);

  // Filtered products strictly from active shop's Firebase catalog
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchesCategory =
        !selectedCategory ||
        selectedCategory === "all" ||
        prod.category === selectedCategory ||
        prod.categoryName?.toLowerCase() === selectedCategory.toLowerCase();

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        prod.name.toLowerCase().includes(q) ||
        prod.specs.toLowerCase().includes(q) ||
        prod.barcode.toLowerCase().includes(q) ||
        (prod.badge && prod.badge.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Live real-time clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentDateTime(
        now.toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);


  // Cart operations (supports both single products and specific product variants)
  const addProductOrVariantToCart = (product: Product, chosenVariant?: ProductVariant) => {
    setAddedAnimationId(product.id);
    setTimeout(() => setAddedAnimationId(null), 300);

    const variantId = chosenVariant?.id || product.variantId;
    const variantLabel = chosenVariant
      ? [chosenVariant.size, chosenVariant.color].filter(Boolean).join(" / ") || chosenVariant.sku
      : product.variant;
    const lineProduct: Product = chosenVariant
      ? {
          ...product,
          price: chosenVariant.sellingPrice,
          costPrice: chosenVariant.costPrice ?? product.costPrice,
          sku: chosenVariant.sku || product.sku,
          barcode: chosenVariant.barcode || product.barcode,
          stock: chosenVariant.stockQuantity ?? product.stock,
          variant: variantLabel,
          variantId,
        }
      : product;

    const targetKey = getCartLineKey(lineProduct.id, variantId);

    setCart((prev) => {
      const existing = prev.find(
        (item) => getCartLineKey(item.product.id, item.variantId) === targetKey
      );
      if (existing) {
        return prev.map((item) =>
          getCartLineKey(item.product.id, item.variantId) === targetKey
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          product: lineProduct,
          quantity: 1,
          ...(variantLabel ? { variant: variantLabel } : {}),
          ...(variantId ? { variantId } : {}),
        },
      ];
    });
  };

  const addToCart = (product: Product) => {
    if (product.variants && product.variants.length > 0 && !product.variantId) {
      setVariantPickerProduct(product);
      return;
    }
    addProductOrVariantToCart(product);
  };

  const updateQuantity = (lineKeyOrProductId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          const itemKey = getCartLineKey(item.product.id, item.variantId);
          if (itemKey === lineKeyOrProductId || item.product.id === lineKeyOrProductId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeItem = (lineKeyOrProductId: string) => {
    setCart((prev) =>
      prev.filter((item) => {
        const itemKey = getCartLineKey(item.product.id, item.variantId);
        return itemKey !== lineKeyOrProductId && item.product.id !== lineKeyOrProductId;
      })
    );
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm("Clear all items from the current bill?")) {
      setCart([]);
      setDiscountSetting((prev) => ({ type: "fixed", value: 0, scope: prev.scope || "group" }));
      setDiscountInputValue("0");
      setEditingItemDiscountId(null);
    }
  };

  // Centralized Promotion Evaluation across all cart lines (no stacking; highest valid discount wins)
  const cartPromotionPricing = useMemo(() => {
    const lines = cart.map((item) => ({
      lineKey: getCartLineKey(item.product.id, item.variantId),
      productId: item.product.id,
      variantId: item.variantId,
      categoryId: item.product.category,
      brandId: item.product.brandId,
      brandName: item.product.brand,
      unitPrice: item.product.price,
      quantity: item.quantity,
      hasManualPrice: item.customPrice !== undefined,
    }));
    return priceCartLines(lines, shopPromotions, promoClockMs, currency);
  }, [cart, shopPromotions, promoClockMs, currency]);

  const getEffectiveUnitPrice = (item: CartItem): number => {
    if (item.customPrice !== undefined) return item.customPrice;
    const key = getCartLineKey(item.product.id, item.variantId);
    const promo = cartPromotionPricing.byLineKey[key];
    return promo ? promo.promoUnitPrice : item.product.price;
  };

  // Helper: compute manual cashier discount amount for a single cart item in "item" scope
  const getItemDiscountAmount = (item: CartItem): number => {
    const gross = getEffectiveUnitPrice(item) * item.quantity;
    if (gross <= 0) return 0;
    const val = Math.max(0, Number(item.itemDiscountValue) || 0);
    if (val <= 0) return 0;
    if (item.itemDiscountType === "percentage") {
      return roundMoney((gross * Math.min(100, val)) / 100);
    }
    return roundMoney(Math.min(gross, val));
  };

  const updateItemDiscount = (
    lineKeyOrProductId: string,
    type: "percentage" | "fixed",
    value: number
  ) => {
    const cleanVal = Math.max(0, Number(value) || 0);
    setCart((prev) =>
      prev.map((item) => {
        const itemKey = getCartLineKey(item.product.id, item.variantId);
        return itemKey === lineKeyOrProductId || item.product.id === lineKeyOrProductId
          ? {
              ...item,
              itemDiscountType: type,
              itemDiscountValue: cleanVal,
            }
          : item;
      })
    );
  };

  // Financial calculations (Subtotal reflects promotional unit prices automatically)
  const originalCatalogSubtotal = useMemo(() => {
    return roundMoney(
      cart.reduce(
        (acc, item) => acc + (item.customPrice ?? item.product.price) * item.quantity,
        0
      )
    );
  }, [cart]);

  const subtotal = useMemo(() => {
    return roundMoney(
      cart.reduce((acc, item) => acc + getEffectiveUnitPrice(item) * item.quantity, 0)
    );
  }, [cart, cartPromotionPricing]);

  const activeDiscountScope = discountSetting.scope || "group";

  const discountAmount = useMemo(() => {
    if (subtotal <= 0) return 0;
    if (activeDiscountScope === "item") {
      const totalItemDiscounts = cart.reduce(
        (acc, item) => acc + getItemDiscountAmount(item),
        0
      );
      return Math.min(subtotal, totalItemDiscounts);
    }
    if (discountSetting.type === "percentage") {
      return (subtotal * Math.min(100, Math.max(0, discountSetting.value))) / 100;
    }
    return Math.min(subtotal, Math.max(0, discountSetting.value));
  }, [subtotal, discountSetting, activeDiscountScope, cart]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = taxRatePct / 100; // Default 0% sales tax unless configured in Settings
  const taxAmount = taxableAmount * taxRate;
  const grandTotal = taxableAmount + taxAmount;

  // Apply discount changes
  const applyDiscount = () => {
    const val = parseFloat(discountInputValue) || 0;
    setDiscountSetting((prev) => ({ ...prev, scope: "group", value: val }));
    setIsDiscountPopoverOpen(false);
  };

  // Payment completed callback: Persists sale with immutable product snapshots to Firebase
  const handleCompleteSale = async (
    method: string,
    tendered: number,
    change: number
  ) => {
    if (!shop?.shopId) {
      alert("Security alert: Active shop session missing. Cannot complete sale.");
      return;
    }
    if (shopAuth?.activeBranchId === "ALL") {
      alert("Please select a specific physical branch before completing a POS sale.");
      return;
    }

    setIsSavingSale(true);
    try {
      // 0. Server-side promotion & price revalidation right before completing checkout
      //    Handles promotions expiring, pausing, or changing while the cart was open.
      let verifiedByLine: Record<string, AppliedPromotion | null> =
        cartPromotionPricing.byLineKey;
      let validationMode: SalePromotionSummary["validation"] =
        cartPromotionPricing.appliedCount > 0 ? "client_only" : "none";
      let validatedAt = Date.now();

      if (shopPromotions.length > 0) {
        try {
          const checkRes = await promotionApi.validateCheckout(
            cart.map((ci) => ({
              lineKey: getCartLineKey(ci.product.id, ci.variantId),
              productId: ci.product.id,
              variantId: ci.variantId,
              quantity: ci.quantity,
              hasManualPrice: ci.customPrice !== undefined,
            }))
          );
          validatedAt = checkRes.serverTime;
          validationMode = "server";
          const serverMap: Record<string, AppliedPromotion | null> = {};
          for (const row of checkRes.lines) {
            serverMap[row.lineKey] = row.promotion;
          }

          // If a promotion expired, activated, or product price changed mid-checkout, refresh & prompt cashier
          const clientDiscount = roundMoney(cartPromotionPricing.totalPromotionDiscount);
          const serverDiscount = roundMoney(checkRes.totalPromotionDiscount);
          if (Math.abs(clientDiscount - serverDiscount) >= 0.01) {
            setPromoClockMs(checkRes.serverTime);
            // Sync any catalog price updates returned by the server
            const serverPriceByLine = new Map(
              checkRes.lines
                .filter((l) => l.productFound)
                .map((l) => [l.lineKey, l.originalUnitPrice])
            );
            if (serverPriceByLine.size > 0) {
              setCart((prev) =>
                prev.map((ci) => {
                  const key = getCartLineKey(ci.product.id, ci.variantId);
                  const freshPrice = serverPriceByLine.get(key);
                  return freshPrice !== undefined && freshPrice !== ci.product.price
                    ? { ...ci, product: { ...ci.product, price: freshPrice } }
                    : ci;
                })
              );
            }
            setIsPaymentModalOpen(false);
            alert(
              `Promotional pricing updated at checkout (was -${currency} ${clientDiscount.toFixed(
                2
              )}, now -${currency} ${serverDiscount.toFixed(
                2
              )}). Totals have been refreshed — please review and confirm payment.`
            );
            return;
          }
          verifiedByLine = serverMap;
        } catch (verifyErr) {
          console.warn("[DashboardPOS] Checkout promo validation fallback:", verifyErr);
        }
      }

      // 1. Build product snapshots + promotion summary for historical reporting accuracy
      const promoSummaryMap = new Map<string, SalePromotionSummaryEntry>();

      const snapshotItems = cart.map((cartItem) => {
        const lineKey = getCartLineKey(cartItem.product.id, cartItem.variantId);
        const appliedPromo =
          cartItem.customPrice !== undefined ? null : verifiedByLine[lineKey] || null;
        const unitPrice =
          cartItem.customPrice ??
          (appliedPromo ? appliedPromo.promoUnitPrice : cartItem.product.price);
        const itemTotal = roundMoney(unitPrice * cartItem.quantity);

        // Calculate manual cashier discount based on selected scope ("item" vs "group")
        let lineDiscount = 0;
        if (activeDiscountScope === "item") {
          lineDiscount = getItemDiscountAmount(cartItem);
        } else {
          const ratio = subtotal > 0 ? itemTotal / subtotal : 0;
          lineDiscount = roundMoney(discountAmount * ratio);
        }
        const lineSubtotal = roundMoney(Math.max(0, itemTotal - lineDiscount));

        if (appliedPromo) {
          const existing = promoSummaryMap.get(appliedPromo.promotionId);
          if (existing) {
            existing.unitsSold += cartItem.quantity;
            existing.discountTotal = roundMoney(
              existing.discountTotal + appliedPromo.discountTotal
            );
            existing.revenue = roundMoney(existing.revenue + lineSubtotal);
          } else {
            promoSummaryMap.set(appliedPromo.promotionId, {
              promotionId: appliedPromo.promotionId,
              promotionName: appliedPromo.promotionName,
              promotionVersion: appliedPromo.promotionVersion,
              discountType: appliedPromo.discountType,
              discountValue: appliedPromo.discountValue,
              unitsSold: cartItem.quantity,
              discountTotal: appliedPromo.discountTotal,
              revenue: lineSubtotal,
            });
          }
        }

        return {
          productId: cartItem.product.id,
          name: cartItem.product.name,
          variant: cartItem.variant || cartItem.product.variant || "",
          variantId: cartItem.variantId || cartItem.product.variantId || "",
          sku: cartItem.product.sku || cartItem.product.barcode || "SKU-GEN",
          barcode: cartItem.product.barcode || "",
          unitPrice,
          ...(appliedPromo
            ? {
                originalUnitPrice: appliedPromo.originalUnitPrice,
                promotion: appliedPromo,
              }
            : {}),
          costPrice: cartItem.product.costPrice ?? 0,
          quantity: cartItem.quantity,
          discount: lineDiscount,
          subtotal: lineSubtotal,
          unit: cartItem.product.unit || "pcs",
          brand: cartItem.product.brand || "",
          categoryName: cartItem.product.categoryName || "",
          imageUrl: cartItem.product.imageUrl || "",
        };
      });

      const promotionSummary: SalePromotionSummary | undefined =
        promoSummaryMap.size > 0
          ? {
              promotions: [...promoSummaryMap.values()],
              totalPromotionDiscount: roundMoney(
                [...promoSummaryMap.values()].reduce(
                  (acc, p) => acc + p.discountTotal,
                  0
                )
              ),
              validation: validationMode,
              validatedAt,
            }
          : undefined;

      // 2. Persist to Firestore via salesService
      const savedSale = await createSaleRecord(shop.shopId, {
        shopId: shop.shopId,
        shopName: shop.shopName,
        branchId: shopAuth?.activeBranchId || "main",
        branchName: activeBranchName,
        cashier: {
          userId: user.uid,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role,
          permissions: ("permissions" in user ? (user.permissions as string[]) : []) || [],
        },
        items: snapshotItems,
        subtotal,
        discountSetting,
        discountAmount: roundMoney(discountAmount),
        taxRate,
        taxAmount: roundMoney(taxAmount),
        grandTotal: roundMoney(grandTotal),
        paymentMethod: method,
        cashReceived: tendered,
        change,
        ...(promotionSummary ? { promotionSummary } : {}),
        // Attach registered customer if selected (walk-in = undefined)
        ...(selectedCustomer
          ? {
              customer: {
                customerId: selectedCustomer.customerId,
                name: selectedCustomer.name,
                phone: selectedCustomer.phone,
                ...(selectedCustomer.email ? { email: selectedCustomer.email } : {}),
              },
            }
          : {}),
      });

      // Optimistically update local product stock immediately
      setProducts((prev) =>
        prev.map((prod) => {
          const soldItem = cart.find((ci) => ci.product.id === prod.id);
          if (!soldItem) return prod;
          return {
            ...prod,
            stock: Math.max(0, prod.stock - soldItem.quantity),
          };
        })
      );

      setPersistedSale(savedSale);
      setReceiptData({ method, tendered, change });
      setIsPaymentModalOpen(false);
      setIsReceiptOpen(true);
    } catch (err: any) {
      console.error("[DashboardPOS] Error saving sale to Firestore:", err);
      alert(err.message || "Failed to record sale in Firebase. Please check connection.");
    } finally {
      setIsSavingSale(false);
    }
  };

  const handleNewSale = () => {
    setCart([]);
    setDiscountSetting({ type: "fixed", value: 0 });
    setDiscountInputValue("0");
    setInlineCashTendered("");
    setSelectedCustomer(null);
    setPersistedSale(null);
    setIsReceiptOpen(false);
  };

  // Category Icon Resolver
  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case "LayoutGrid":
        return <LayoutGrid className="w-4 h-4" />;
      case "Smartphone":
        return <Smartphone className="w-4 h-4" />;
      case "Headphones":
        return <Headphones className="w-4 h-4" />;
      case "Wrench":
        return <Wrench className="w-4 h-4" />;
      case "SimCard":
        return <Radio className="w-4 h-4" />;
      case "Tag":
        return <Tag className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  const cartTotalItemCount = cart.reduce((acc, c) => acc + c.quantity, 0);

  return (
    <div className="flex h-screen w-screen bg-[#07080d] text-zinc-100 font-sans select-none overflow-hidden">
      {/* ── Background Ambient Glows ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[700px] h-[500px] bg-zinc-700/10 rounded-full blur-[180px]" />
        <div className="absolute bottom-0 right-10 w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-[170px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* ── SEPARATE NAVIGATION PAGE VIEW (when menu icon clicked) ── */}
      {isNavOpen && (
        <NavigationView
          onClose={() => setIsNavOpen(false)}
          shopName={shop.shopName}
          shopId={shop.shopId}
          cashierName={user.displayName || user.username}
          cashierRole={user.role}
          activeBranchName={activeBranchName}
          cartCount={cartTotalItemCount}
        />
      )}

      {/* ── MAIN FULL DESKTOP POS INTERFACE ── */}
      <div className="relative z-10 flex flex-col flex-1 h-full overflow-hidden">
        {/* ── TOP APP BAR ── */}
        <header className="relative z-40 h-16 px-4 md:px-6 bg-[#0c0d15]/80 backdrop-blur-xl border-b border-white/[0.07] flex items-center justify-between gap-4 shrink-0">
          {/* Left: Hamburger menu icon + Logo */}
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setIsNavOpen(true)}
              className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-200 hover:text-white transition-all cursor-pointer shadow-sm group"
              title="Open Navigation Hub"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 group-hover:text-zinc-300 transition-colors"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="4.2" height="4.2" rx="0.8" />
                <rect x="9.9" y="3" width="4.2" height="4.2" rx="0.8" />
                <rect x="16.8" y="3" width="4.2" height="4.2" rx="0.8" />
                <rect x="3" y="9.9" width="4.2" height="4.2" rx="0.8" />
                <rect x="9.9" y="9.9" width="4.2" height="4.2" rx="0.8" />
                <rect x="16.8" y="9.9" width="4.2" height="4.2" rx="0.8" />
                <rect x="3" y="16.8" width="4.2" height="4.2" rx="0.8" />
                <rect x="9.9" y="16.8" width="4.2" height="4.2" rx="0.8" />
                <rect x="16.8" y="16.8" width="4.2" height="4.2" rx="0.8" />
              </svg>
            </button>

            {/* Brand Logo */}
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white flex items-center">
                SKYFOX
              </span>
            </div>
          </div>

          {/* Center: Search Bar + Barcode Scanner Trigger */}
          <div className="flex-1 max-w-xl mx-2">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, brand or barcode..."
                className="w-full pl-10 pr-32 py-2 rounded-xl bg-[#141622]/80 border border-white/[0.08] focus:border-zinc-500/60 focus:bg-[#181a28] focus:outline-none text-xs text-zinc-100 placeholder:text-zinc-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setIsBarcodeModalOpen(true)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-zinc-700/40 hover:border-zinc-500/40 border border-white/[0.08] text-[11px] font-medium text-zinc-300 hover:text-zinc-300 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ScanLine className="w-3.5 h-3.5 text-zinc-400" />
                <span>Scan Barcode</span>
              </button>
            </div>
          </div>

          {/* Right: Date Time, Online Status, Branch, Cashier */}
          <div className="flex items-center gap-2.5">
            {/* Shop Messages & Admin Updates Shortcut */}
            {canViewMessages && (
              <button
                type="button"
                onClick={() => router.push("/shop/notifications")}
                className="relative w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
                title="Messages & System Updates"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-mono font-bold flex items-center justify-center shadow-lg shadow-emerald-500/40">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Sales Ledger Shortcut */}
            {canViewSalesLedger && (
              <button
                type="button"
                onClick={() => router.push("/shop/ledger")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 text-xs font-semibold text-orange-300 transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
                title="View Sales Ledger & Past Invoices"
              >
                <BookOpen className="w-3.5 h-3.5 text-orange-400" />
                <span className="hidden sm:inline">Sales Ledger</span>
              </button>
            )}

            {/* Live Date Time */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 font-mono">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>{currentDateTime || "Syncing clock…"}</span>
            </div>

            {/* Online / Offline status toggle */}
            <button
              type="button"
              onClick={() => setIsOnline(!isOnline)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              title="Click to toggle network status simulation"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnline
                    ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"
                    : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
                }`}
              />
              <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
            </button>

            {/* Premium Account Dropdown */}
            <ShopUserNav theme="dark" />
          </div>
        </header>

        {/* ── POS WORKSPACE: LEFT PRODUCTS + RIGHT BILLING PANEL ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── LEFT AREA: CATEGORIES + PRODUCTS GRID ── */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#07080d]/40 overflow-hidden">
            {/* Category Filter Pills (Dynamically loaded from active shop in Firebase) */}
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2.5 overflow-x-auto no-scrollbar shrink-0 bg-[#090a12]/50">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === "all" || !selectedCategory
                    ? "bg-zinc-700/40 border border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                    : "bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-zinc-400" />
                <span>All Products</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-zinc-300">
                  {products.length}
                </span>
              </button>

              {shopCategories.map((cat) => {
                const isActive = selectedCategory === cat.id;
                const count = products.filter((p) => p.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? "bg-zinc-700/40 border border-zinc-500/60 text-white shadow-lg shadow-zinc-900/10"
                        : "bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cat.color || "#6366f1" }}
                    />
                    <span>{cat.name}</span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-white/10 text-zinc-400">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Product Grid Area strictly from Firebase */}
            <div className="flex-1 p-5 overflow-y-auto">
              {isLoadingCatalog ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs py-20 gap-2">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p>Loading shop products from Firebase...</p>
                </div>
              ) : products.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs py-20 text-center max-w-sm mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-600 mb-3">
                    <LayoutGrid className="w-6 h-6 text-zinc-500" />
                  </div>
                  <p className="font-semibold text-zinc-300 text-sm">No Products in Shop Catalog</p>
                  <p className="text-zinc-500 mt-1 text-xs mb-4">
                    This shop currently has no products stored in Firebase. Add categories and products to start billing.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/shop/products")}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    Manage Products
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs py-20">
                  <Search className="w-8 h-8 mb-2 text-zinc-600" />
                  <p className="font-semibold text-zinc-400">No matching products found</p>
                  <p className="text-zinc-600 mt-1">Try a different search query or select "All Products".</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                  {filteredProducts.map((prod) => {
                    const isJustAdded = addedAnimationId === prod.id;
                    const cardPromo =
                      shopPromotions.length > 0
                        ? findBestPromotionForLine(
                            {
                              lineKey: prod.id,
                              productId: prod.id,
                              categoryId: prod.category,
                              brandId: prod.brandId,
                              brandName: prod.brand,
                              unitPrice: prod.price,
                              quantity: 1,
                            },
                            shopPromotions,
                            promoClockMs,
                            currency
                          )
                        : null;

                    return (
                      <div
                        key={prod.id}
                        onClick={() => addToCart(prod)}
                        className={`group relative p-2 rounded-xl bg-[#11131d]/70 hover:bg-[#151724]/90 backdrop-blur-xl border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between h-[116px] shadow-sm hover:shadow-xl hover:shadow-zinc-900/20 ${
                          cardPromo
                            ? "border-emerald-500/30 hover:border-emerald-400/50"
                            : "border-white/[0.07] hover:border-zinc-500/40"
                        } ${isJustAdded ? "ring-2 ring-zinc-400 scale-[0.98]" : ""}`}
                      >
                        {/* Top Badges */}
                        <div className="flex justify-between items-start w-full leading-none gap-1">
                          {cardPromo ? (
                            <span
                              className="text-[7px] font-mono font-bold px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 truncate max-w-[75%]"
                              title={`${cardPromo.promotionName}: ${cardPromo.discountLabel}`}
                            >
                              {cardPromo.discountLabel}
                            </span>
                          ) : prod.badge ? (
                            <span className="text-[7px] font-mono font-bold px-1 py-0.5 rounded bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">
                              {prod.badge}
                            </span>
                          ) : (
                            <span className="text-[7px] font-mono text-zinc-500">
                              #{prod.barcode.slice(-4)}
                            </span>
                          )}
                          <span className="text-[7px] font-mono text-zinc-500 shrink-0">
                            {prod.stock} stk
                          </span>
                        </div>

                        {/* Centered Firebase Product Image */}
                        <div className="flex-1 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-150 py-1">
                          <ProductImage imageUrl={prod.imageUrl} name={prod.name} className="w-12 h-12 rounded-xl shrink-0" />
                        </div>

                        {/* Product Title, Specs & Price */}
                        <div className="flex items-end justify-between leading-none mt-0.5">
                          <div className="min-w-0 pr-1">
                            <h3 className="text-[9px] font-bold text-zinc-100 truncate group-hover:text-zinc-300 transition-colors leading-tight">
                              {prod.name}
                            </h3>
                            {cardPromo ? (
                              <div className="flex items-baseline gap-1 mt-0.5 font-mono">
                                <span className="text-[9.5px] font-black text-emerald-300">
                                  {currency} {cardPromo.promoUnitPrice.toLocaleString()}
                                </span>
                                <span className="text-[7.5px] text-zinc-500 line-through">
                                  {prod.price.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <div className="text-[9.5px] font-black text-white mt-0.5 font-mono">
                                {currency} {prod.price.toLocaleString()}
                              </div>
                            )}
                          </div>

                          {/* Plus Add Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(prod);
                            }}
                            className="w-5 h-5 rounded-md bg-white/[0.06] group-hover:bg-zinc-600 text-zinc-300 group-hover:text-white border border-white/[0.1] group-hover:border-zinc-500 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-sm"
                            title="Add to bill"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT AREA: CURRENT BILLING PANEL ── */}
          <aside className="w-[360px] lg:w-[410px] bg-[#0c0d16]/90 backdrop-blur-2xl border-l border-white/[0.07] flex flex-col shrink-0">
            {/* Header: Cart title + Clear All */}
            <div className="p-4 border-b border-white/[0.07] flex items-center justify-between shrink-0 bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-zinc-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">Current Bill</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-500/15 border border-zinc-500/30 text-zinc-300 font-bold">
                  {cartTotalItemCount}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsBillTransferModalOpen(true)}
                  className="w-7 h-7 rounded-lg text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center transition-colors cursor-pointer"
                  title={`Bill Transfer (${localDevice.friendlyName})`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
                </button>

                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Real-Time Incoming Transferred Bills Banner (Targeted at this machine) */}
            {incomingTransfers.length > 0 && (
              <div className="px-3.5 pt-3 space-y-2 shrink-0">
                {incomingTransfers.slice(0, 2).map((trf) => (
                  <div
                    key={trf.id}
                    className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/40 shadow-lg space-y-2 animate-in fade-in duration-150"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>Incoming Bill {trf.transferCode}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-indigo-200">
                          from {trf.sourceDeviceName}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-black text-emerald-300">
                        {trf.currency} {Number(trf.grandTotal || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                      <span className="truncate">
                        {trf.itemCount} {trf.itemCount === 1 ? "item" : "items"} • Sent by{" "}
                        {trf.senderDisplayName}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRejectIncomingTransfer(trf)}
                          className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 text-[10px] text-zinc-300 hover:text-rose-200 cursor-pointer"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAcceptIncomingTransfer(trf)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold text-white cursor-pointer"
                        >
                          Accept Bill
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scrollable Bill Items List */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-2">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs text-center p-6 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-600 mb-1">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <div className="font-semibold text-zinc-300">Cart is empty</div>
                  <div className="text-zinc-500 max-w-xs text-[11px]">
                    Tap products from the grid or scan a barcode to begin billing.
                  </div>
                </div>
              ) : (
                cart.map((item) => {
                  const lineKey = getCartLineKey(item.product.id, item.variantId);
                  const appliedPromo =
                    item.customPrice !== undefined
                      ? null
                      : cartPromotionPricing.byLineKey[lineKey] || null;
                  const originalGross = item.product.price * item.quantity;
                  const effectiveUnit = getEffectiveUnitPrice(item);
                  const grossLineTotal = roundMoney(effectiveUnit * item.quantity);
                  const itemDiscAmt =
                    activeDiscountScope === "item" ? getItemDiscountAmount(item) : 0;
                  const netLineTotal = roundMoney(Math.max(0, grossLineTotal - itemDiscAmt));
                  const isEditingThisItemDiscount = editingItemDiscountId === lineKey;

                  return (
                    <div
                      key={lineKey}
                      className="p-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.06] transition-all flex flex-col gap-2 group"
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Product Thumbnail with Firebase Image */}
                        <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                          <ProductImage imageUrl={item.product.imageUrl} name={item.product.name} className="w-full h-full rounded-lg" />
                        </div>

                        {/* Info & Quantity controls */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-zinc-200 truncate">
                            {item.product.name}
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate">
                            {item.variant
                              ? `${item.variant}${item.product.specs ? ` • ${item.product.specs}` : ""}`
                              : item.product.specs}
                          </div>

                          {/* Applied Promotion Info (Original vs Promo Price, Discount Label & Promotion Name) */}
                          {appliedPromo && (
                            <div className="mt-1 space-y-0.5">
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9.5px] text-emerald-300 font-medium max-w-full">
                                <Tag className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{appliedPromo.promotionName}</span>
                                <span className="font-mono font-bold shrink-0">
                                  ({appliedPromo.discountLabel})
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-zinc-400">
                                <span className="line-through text-zinc-500 mr-1.5">
                                  {currency} {appliedPromo.originalUnitPrice.toLocaleString()}
                                </span>
                                <span className="text-emerald-300 font-semibold">
                                  {currency} {appliedPromo.promoUnitPrice.toLocaleString()}
                                </span>
                                <span className="text-zinc-500 ml-1">
                                  (-{currency} {appliedPromo.discountTotal.toLocaleString()})
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Quantity Stepper + Per-Product Discount Pill */}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateQuantity(lineKey, -1)}
                                className="w-5 h-5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-zinc-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-mono font-bold text-white px-1">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(lineKey, 1)}
                                className="w-5 h-5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-zinc-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            {canDiscount && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeDiscountScope !== "item") {
                                    setDiscountSetting((prev) => ({
                                      ...prev,
                                      scope: "item",
                                    }));
                                  }
                                  if (isEditingThisItemDiscount) {
                                    setEditingItemDiscountId(null);
                                  } else {
                                    setEditingItemDiscountId(lineKey);
                                    setItemDiscountMode(item.itemDiscountType || "fixed");
                                    setItemDiscountInput(
                                      item.itemDiscountValue ? String(item.itemDiscountValue) : ""
                                    );
                                  }
                                }}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono flex items-center gap-1 border transition-colors cursor-pointer ${
                                  activeDiscountScope === "item" && itemDiscAmt > 0
                                    ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 font-semibold"
                                    : "bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-400 hover:text-zinc-200"
                                }`}
                                title="Set individual discount for this product"
                              >
                                <Tag className="w-2.5 h-2.5" />
                                <span>
                                  {activeDiscountScope === "item" && itemDiscAmt > 0
                                    ? item.itemDiscountType === "percentage"
                                      ? `-${item.itemDiscountValue}%`
                                      : `-${currency} ${itemDiscAmt.toFixed(0)}`
                                    : "+Item Disc"}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Line Total & Remove */}
                        <div className="text-right shrink-0 flex flex-col items-end justify-between h-full">
                          <button
                            type="button"
                            onClick={() => removeItem(lineKey)}
                            className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                            title="Remove item"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="mt-1">
                            {(appliedPromo ||
                              (activeDiscountScope === "item" && itemDiscAmt > 0)) && (
                              <div className="text-[10px] font-mono text-zinc-500 line-through">
                                {currency}{" "}
                                {(appliedPromo ? originalGross : grossLineTotal).toLocaleString(
                                  undefined,
                                  { minimumFractionDigits: 0 }
                                )}
                              </div>
                            )}
                            <div className="text-xs font-black text-white font-mono">
                              {currency} {netLineTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Inline Per-Product Discount Editor */}
                      {isEditingThisItemDiscount && activeDiscountScope === "item" && (
                        <div className="pt-2 border-t border-white/[0.06] flex items-center gap-1.5 animate-in fade-in duration-150">
                          <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setItemDiscountMode("fixed");
                                updateItemDiscount(
                                  lineKey,
                                  "fixed",
                                  parseFloat(itemDiscountInput) || 0
                                );
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                itemDiscountMode === "fixed"
                                  ? "bg-emerald-600 text-white"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              {currency}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setItemDiscountMode("percentage");
                                updateItemDiscount(
                                  lineKey,
                                  "percentage",
                                  parseFloat(itemDiscountInput) || 0
                                );
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                itemDiscountMode === "percentage"
                                  ? "bg-emerald-600 text-white"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              %
                            </button>
                          </div>

                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={itemDiscountInput}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setItemDiscountInput(raw);
                              updateItemDiscount(
                                lineKey,
                                itemDiscountMode,
                                parseFloat(raw) || 0
                              );
                            }}
                            placeholder={
                              itemDiscountMode === "percentage"
                                ? "Discount %..."
                                : `Discount (${currency})...`
                            }
                            className="flex-1 px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                          />

                          {itemDiscAmt > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setItemDiscountInput("");
                                updateItemDiscount(lineKey, itemDiscountMode, 0);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-[10px] text-rose-300 font-semibold cursor-pointer"
                            >
                              Clear
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setEditingItemDiscountId(null)}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Billing Financial Summary */}
            <div className="p-4 border-t border-white/[0.07] bg-[#0e0f19]/70 space-y-2.5 shrink-0">
              {cartPromotionPricing.totalPromotionDiscount > 0 && (
                <>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Original Price</span>
                    <span className="font-mono line-through">
                      {currency} {originalCatalogSubtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-300">
                    <span>
                      Promotions ({cartPromotionPricing.appliedCount}{" "}
                      {cartPromotionPricing.appliedCount === 1 ? "line" : "lines"})
                    </span>
                    <span className="font-mono font-semibold">
                      -{currency} {cartPromotionPricing.totalPromotionDiscount.toFixed(2)}
                    </span>
                  </div>
                </>
              )}

              {/* Subtotal */}
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Subtotal</span>
                <span className="font-mono text-zinc-200">{currency} {subtotal.toFixed(2)}</span>
              </div>

              {/* Discount Row with Scope Switcher (Group Discount vs Each Product Discount) */}
              <div className="relative">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsDiscountPopoverOpen(!isDiscountPopoverOpen)}
                      className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <Tag className="w-3.5 h-3.5 text-zinc-400" />
                      <span>
                        {activeDiscountScope === "item"
                          ? "Each Product Discount"
                          : `Group Discount${
                              discountSetting.value > 0
                                ? discountSetting.type === "percentage"
                                  ? ` (${discountSetting.value}%)`
                                  : ` (${currency} ${discountSetting.value})`
                                : ""
                            }`}
                      </span>
                      <span className="text-[10px] text-indigo-400 underline ml-0.5">
                        {discountAmount > 0 ? "Edit" : "+Add"}
                      </span>
                    </button>

                    {/* Quick Scope Toggle Pill: Group vs Each Product */}
                    <div className="inline-flex items-center p-0.5 rounded-lg bg-black/40 border border-white/[0.08] text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountSetting((prev) => ({ ...prev, scope: "group" }));
                          setEditingItemDiscountId(null);
                        }}
                        className={`px-1.5 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                          activeDiscountScope === "group"
                            ? "bg-white/15 text-white"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                        title="Apply a single group discount to the whole bill"
                      >
                        Group
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDiscountSetting((prev) => ({ ...prev, scope: "item" }))
                        }
                        className={`px-1.5 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                          activeDiscountScope === "item"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                        title="Apply individual discounts to each product"
                      >
                        Each Product
                      </button>
                    </div>
                  </div>

                  <span className="font-mono text-emerald-400">
                    -{discountAmount > 0 ? `${currency} ${discountAmount.toFixed(2)}` : `${currency} 0.00`}
                  </span>
                </div>

                {/* Centered Modal for Choosing Group Discount vs Each Product Discount */}
                {isDiscountPopoverOpen && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
                    onClick={() => setIsDiscountPopoverOpen(false)}
                  >
                    <div
                      className="w-full max-w-md rounded-2xl bg-[#10121c] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.9)] p-5 space-y-4 text-zinc-100 animate-in zoom-in-95 duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                            <Tag className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">Apply Bill Discount</h3>
                            <p className="text-[11px] text-zinc-400">
                              Choose between Group Discount or Each Product Discount
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsDiscountPopoverOpen(false)}
                          className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Top Scope Switcher: Group Discount vs Each Product Discount */}
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/50 border border-white/10">
                        <button
                          type="button"
                          onClick={() =>
                            setDiscountSetting((prev) => ({ ...prev, scope: "group" }))
                          }
                          className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeDiscountScope === "group"
                              ? "bg-indigo-600 text-white shadow"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Group Discount
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDiscountSetting((prev) => ({ ...prev, scope: "item" }))
                          }
                          className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeDiscountScope === "item"
                              ? "bg-emerald-600 text-white shadow"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Each Product Discount
                        </button>
                      </div>

                      {activeDiscountScope === "group" ? (
                        <div className="space-y-3.5">
                          {/* Mode Toggle: Percentage vs Fixed */}
                          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
                            <button
                              type="button"
                              onClick={() =>
                                setDiscountSetting((prev) => ({ ...prev, type: "percentage" }))
                              }
                              className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                                discountSetting.type === "percentage"
                                  ? "bg-zinc-700 text-white"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              <Percent className="w-3.5 h-3.5" />
                              <span>Percent (%)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDiscountSetting((prev) => ({ ...prev, type: "fixed" }))
                              }
                              className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                                discountSetting.type === "fixed"
                                  ? "bg-zinc-700 text-white"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Fixed ({currency})</span>
                            </button>
                          </div>

                          {/* Presets */}
                          <div className="flex gap-2">
                            {discountSetting.type === "percentage"
                              ? [5, 10, 15, 20].map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => {
                                      setDiscountInputValue(pct.toString());
                                      setDiscountSetting((prev) => ({
                                        ...prev,
                                        scope: "group",
                                        value: pct,
                                      }));
                                    }}
                                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.07] text-xs font-mono text-zinc-200 transition-colors cursor-pointer"
                                  >
                                    {pct}%
                                  </button>
                                ))
                              : [50, 100, 250, 500].map((fxd) => (
                                  <button
                                    key={fxd}
                                    type="button"
                                    onClick={() => {
                                      setDiscountInputValue(fxd.toString());
                                      setDiscountSetting((prev) => ({
                                        ...prev,
                                        scope: "group",
                                        value: fxd,
                                      }));
                                    }}
                                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.07] text-xs font-mono text-zinc-200 transition-colors cursor-pointer"
                                  >
                                    {currency} {fxd}
                                  </button>
                                ))}
                          </div>

                          {/* Custom Input */}
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="any"
                              value={discountInputValue}
                              onChange={(e) => setDiscountInputValue(e.target.value)}
                              placeholder="Enter custom group discount..."
                              className="flex-1 px-3.5 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={applyDiscount}
                              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-colors cursor-pointer"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Each Product Discount List inside Centered Modal */
                        <div className="space-y-3">
                          {cart.length === 0 ? (
                            <p className="text-xs text-zinc-400 text-center py-6">
                              Add products to the bill to set individual product discounts.
                            </p>
                          ) : (
                            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                              {cart.map((item) => {
                                const mode = item.itemDiscountType || "fixed";
                                const val = item.itemDiscountValue ?? 0;
                                return (
                                  <div
                                    key={item.product.id}
                                    className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-2"
                                  >
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-semibold text-white truncate pr-2">
                                        {item.quantity}× {item.product.name}
                                      </span>
                                      <span className="font-mono text-zinc-400 shrink-0">
                                        {currency}{" "}
                                        {((item.customPrice ?? item.product.price) * item.quantity).toFixed(0)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="flex bg-black/60 p-0.5 rounded-lg border border-white/10">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateItemDiscount(item.product.id, "fixed", val)
                                          }
                                          className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer ${
                                            mode === "fixed"
                                              ? "bg-emerald-600 text-white"
                                              : "text-zinc-400"
                                          }`}
                                        >
                                          {currency}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateItemDiscount(item.product.id, "percentage", val)
                                          }
                                          className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer ${
                                            mode === "percentage"
                                              ? "bg-emerald-600 text-white"
                                              : "text-zinc-400"
                                          }`}
                                        >
                                          %
                                        </button>
                                      </div>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={val || ""}
                                        onChange={(e) =>
                                          updateItemDiscount(
                                            item.product.id,
                                            mode,
                                            parseFloat(e.target.value) || 0
                                          )
                                        }
                                        placeholder={
                                          mode === "percentage" ? "0%" : `${currency} 0`
                                        }
                                        className="flex-1 px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setIsDiscountPopoverOpen(false)}
                            className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tax */}
              <div className="flex justify-between text-xs text-zinc-400">
                <span>{taxLabel} ({taxRatePct}%)</span>
                <span className="font-mono text-zinc-200">{currency} {taxAmount.toFixed(2)}</span>
              </div>

              {/* Grand Total Row */}
              <div className="pt-2 border-t border-white/[0.07] flex justify-between items-baseline">
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  Total
                </span>
                <div className="text-2xl font-black text-white font-mono tracking-tight">
                  {currency} {grandTotal.toFixed(2)}
                </div>
              </div>

              {/* Customer Attach Section */}
              <div className="pt-1">
                {selectedCustomer ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs font-mono transition-all">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-200 text-xs flex-shrink-0">
                        {selectedCustomer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-zinc-100 truncate">{selectedCustomer.name}</p>
                          {selectedCustomer.pointsBalance > 0 && (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-300 bg-amber-950/60 px-1 py-0.2 rounded border border-amber-600/30">
                              <Star className="w-2.5 h-2.5 fill-amber-400" />
                              {selectedCustomer.pointsBalance}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 truncate">{selectedCustomer.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerModalInitialMode("search");
                          setIsCustomerPickerOpen(true);
                        }}
                        className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-medium transition-colors cursor-pointer"
                        title="Change Customer (Alt+A)"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomer(null);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-950/50 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                        title="Remove customer from bill"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerModalInitialMode("search");
                      setIsCustomerPickerOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer group"
                    title="Attach customer to bill (Shortcut: Alt+A or Alt+C)"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <User className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 flex-shrink-0" />
                      <span className="truncate">Walk-in Guest — Attach Customer</span>
                    </div>
                    <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-zinc-500 bg-white/[0.04] border border-white/[0.08] rounded group-hover:text-zinc-300">
                      Alt+A
                    </kbd>
                  </button>
                )}
              </div>

              {/* Quick Payment Method Selector (Sleek Segmented Pill Bar) */}
              <div className="pt-1 space-y-2">
                <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/40 border border-white/[0.07]">
                  {[
                    { id: "cash", label: "Cash", icon: Banknote, dot: "text-emerald-400" },
                    { id: "card", label: "Card", icon: CreditCard, dot: "text-sky-400" },
                    { id: "bank", label: "Transfer", icon: Building2, dot: "text-amber-400" },
                    { id: "mobile", label: "QR Pay", icon: Smartphone, dot: "text-purple-400" },
                  ].map((pm) => {
                    const Icon = pm.icon;
                    const isSelected = selectedQuickPayment === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setSelectedQuickPayment(pm.id as any)}
                        className={`py-1.5 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-white/[0.1] border border-white/[0.12] text-white shadow-sm"
                            : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                        }`}
                        title={pm.label}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? pm.dot : "text-zinc-500"}`} />
                        <span className="text-[10px] font-semibold leading-tight truncate">
                          {pm.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Minimalist Inline Cash Balance Strip (Visible when Cash is selected & cart has items) */}
                {selectedQuickPayment === "cash" && cart.length > 0 && (() => {
                  const activeCashVal =
                    inlineCashTendered !== ""
                      ? parseFloat(inlineCashTendered) || 0
                      : grandTotal;
                  const inlineDiff = activeCashVal - grandTotal;
                  const inlineChange = Math.max(0, inlineDiff);
                  const inlineShort = Math.max(0, -inlineDiff);
                  const isInlineSufficient = activeCashVal >= grandTotal - 0.001;
                  const roundedNote = Math.ceil(grandTotal / 100) * 100;

                  return (
                    <div className="p-2.5 rounded-xl bg-white/[0.025] border border-white/[0.08] space-y-2 animate-in fade-in duration-150">
                      <div className="grid grid-cols-2 gap-2 items-center">
                        {/* Left: Cash Received Inline Input */}
                        <div className="pr-2 border-r border-white/[0.07]">
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span>Cash Received</span>
                            {inlineCashTendered !== "" && (
                              <button
                                type="button"
                                onClick={() => setInlineCashTendered("")}
                                className="text-[9px] text-emerald-400 hover:underline cursor-pointer"
                              >
                                Exact
                              </button>
                            )}
                          </div>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-zinc-500">{currency}</span>
                            <input
                              type="number"
                              step="any"
                              value={inlineCashTendered}
                              placeholder={grandTotal.toFixed(2)}
                              onChange={(e) => setInlineCashTendered(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && isInlineSufficient && canCreateSales) {
                                  e.preventDefault();
                                  handleCompleteSale("cash", activeCashVal, inlineChange);
                                }
                              }}
                              className="w-full bg-transparent font-mono text-xs font-bold text-white placeholder-zinc-500 focus:outline-none border-b border-dashed border-white/20 focus:border-emerald-400 pb-0.5"
                            />
                          </div>
                        </div>

                        {/* Right: Live Cash Balance / Change Due */}
                        <div className="pl-1 flex flex-col justify-between text-right">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider ${
                              isInlineSufficient ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {isInlineSufficient ? "Cash Balance" : "Shortfall"}
                          </span>
                          <div
                            className={`text-xs sm:text-sm font-black font-mono tracking-tight mt-0.5 ${
                              isInlineSufficient ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {isInlineSufficient
                              ? `${currency} ${inlineChange.toFixed(2)}`
                              : `-${currency} ${inlineShort.toFixed(2)}`}
                          </div>
                        </div>
                      </div>

                      {/* Micro Denomination Chips */}
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
                        <button
                          type="button"
                          onClick={() => setInlineCashTendered(grandTotal.toFixed(2))}
                          className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-[10px] font-mono text-zinc-300 shrink-0 cursor-pointer"
                        >
                          Exact
                        </button>
                        {roundedNote > grandTotal && (
                          <button
                            type="button"
                            onClick={() => setInlineCashTendered(roundedNote.toString())}
                            className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-[10px] font-mono text-zinc-300 shrink-0 cursor-pointer"
                          >
                            {roundedNote}
                          </button>
                        )}
                        {[1000, 2000, 5000]
                          .filter((n) => n >= grandTotal && n !== roundedNote)
                          .slice(0, 3)
                          .map((note) => (
                            <button
                              key={note}
                              type="button"
                              onClick={() => setInlineCashTendered(note.toString())}
                              className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-[10px] font-mono text-zinc-300 shrink-0 cursor-pointer"
                            >
                              {note.toLocaleString()}
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Compact Bill Transfer Icon Button + Big Pay Now Button */}
              <div className="pt-1 flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsBillTransferModalOpen(true)}
                    className="w-12 h-[52px] shrink-0 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/35 text-indigo-300 hover:text-white flex items-center justify-center transition-all cursor-pointer group shadow-sm"
                    title="Transfer bill to another machine"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-indigo-400 group-hover:rotate-180 transition-transform duration-300" />
                  </button>
                )}

                <button
                  type="button"
                  disabled={cart.length === 0 || !canCreateSales}
                  onClick={() => setIsPaymentModalOpen(true)}
                  className={`flex-1 py-3.5 px-4 rounded-xl active:scale-[0.99] disabled:pointer-events-none text-white font-bold flex items-center justify-between transition-all cursor-pointer group ${
                    cart.length === 0 || !canCreateSales
                      ? "bg-gradient-to-r from-zinc-700 via-zinc-600 to-zinc-600 shadow-lg shadow-zinc-900/20 opacity-35"
                      : "bg-gradient-to-r from-[#ea4815] via-[#f95721] to-[#ff6229] hover:from-[#f95721] hover:via-[#ff6229] hover:to-[#ff7340] shadow-lg shadow-orange-600/30 hover:shadow-orange-500/50"
                  }`}
                  title={!canCreateSales ? "Your account does not have permission to process sales" : "Proceed to Payment"}
                >
                  <span className="text-sm tracking-wide">
                    {!canCreateSales ? "Checkout Restricted" : "Pay Now"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-black">
                      {currency} {grandTotal.toFixed(2)}
                    </span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── MODALS ── */}
      {/* 1. Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        onScanItem={addToCart}
        products={products}
      />

      {/* 2. Payment Checkout Modal (Cash / Card) */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onCompleteSale={handleCompleteSale}
        cart={cart}
        subtotal={subtotal}
        discountSetting={discountSetting}
        discountAmount={discountAmount}
        taxAmount={taxAmount}
        grandTotal={grandTotal}
        initialMethod={selectedQuickPayment}
        initialCashTendered={inlineCashTendered || undefined}
        currency={currency}
      />

      {/* 3. Printable Receipt & Completion Modal */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        onNewSale={handleNewSale}
        persistedSale={persistedSale}
        customer={
          selectedCustomer
            ? {
                customerId: selectedCustomer.customerId,
                name: selectedCustomer.name,
                phone: selectedCustomer.phone,
                email: selectedCustomer.email,
              }
            : null
        }
        cart={cart}
        subtotal={subtotal}
        discountSetting={discountSetting}
        discountAmount={discountAmount}
        taxAmount={taxAmount}
        grandTotal={grandTotal}
        paymentMethod={receiptData.method}
        cashTendered={receiptData.tendered}
        changeDue={receiptData.change}
        cashierName={user.displayName || user.username}
        shopName={shop.shopName}
        shopId={shop.shopId}
        branchName={activeBranchName}
      />

      {/* 4. Asynchronous Cloud Ledger Syncing Overlay */}
      {isSavingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="p-6 rounded-2xl bg-[#10121a] border border-white/10 shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-12 h-12 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin flex items-center justify-center" />
            <div>
              <h3 className="text-sm font-bold text-white">Finalizing Sale</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Persisting product snapshots & syncing cloud audit ledger...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. Customer Picker Modal */}
      {isCustomerPickerOpen && shop?.shopId && (
        <CustomerPickerModal
          shopId={shop.shopId}
          selectedCustomerId={selectedCustomer?.customerId ?? null}
          initialMode={customerModalInitialMode}
          currentUser={{
            userId: shopAuth?.user?.uid || "cashier",
            username: shopAuth?.user?.username || "Cashier",
            role: shopAuth?.user?.role || "cashier",
            displayName: shopAuth?.user?.displayName,
          }}
          onSelect={(customer) => setSelectedCustomer(customer)}
          onClose={() => setIsCustomerPickerOpen(false)}
        />
      )}

      {/* 6. Inter-Machine Bill Transfer & Device Management Modal */}
      <BillTransferModal
        isOpen={isBillTransferModalOpen}
        onClose={() => setIsBillTransferModalOpen(false)}
        shopId={shop.shopId}
        shopName={shop.shopName}
        branchId={activeBranchId}
        branchName={activeBranchName}
        currentUser={{
          userId: user.uid,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role,
        }}
        localDevice={localDevice}
        onLocalDeviceUpdated={(updated) => {
          setLocalDevice({
            deviceId: updated.id,
            shopId: updated.shopId,
            friendlyName: updated.friendlyName,
            deviceRole: updated.deviceRole,
            locationLabel: updated.locationLabel || "Main Counter",
            usbPrintAgentEnabled: updated.usbPrintAgentEnabled,
            usbPrinterFriendlyName:
              updated.usbPrinterFriendlyName || "USB Thermal Receipt Printer (80mm)",
            usbAgentPort: updated.usbAgentPort || 9100,
            usbPaperWidth: updated.usbPaperWidth || "80mm",
            autoPrintIncomingTransfers: updated.autoPrintIncomingTransfers ?? true,
            autoAcceptIncomingTransfers: updated.autoAcceptIncomingTransfers ?? false,
          });
        }}
        devices={shopDevices}
        cart={cart}
        subtotal={subtotal}
        discountSetting={discountSetting}
        discountAmount={discountAmount}
        taxLabel={taxLabel}
        taxRatePct={taxRatePct}
        taxAmount={taxAmount}
        grandTotal={grandTotal}
        currency={currency}
        preferredPaymentMethod={selectedQuickPayment}
        selectedCustomer={
          selectedCustomer
            ? {
                customerId: selectedCustomer.customerId,
                name: selectedCustomer.name,
                phone: selectedCustomer.phone,
                email: selectedCustomer.email,
                pointsBalance: selectedCustomer.pointsBalance,
              }
            : null
        }
        onTransferSuccess={(transfer, clearLocalCart) => {
          if (clearLocalCart) {
            setCart([]);
            setDiscountSetting({ type: "fixed", value: 0 });
            setDiscountInputValue("0");
            setInlineCashTendered("");
            setSelectedCustomer(null);
          }
          setTransferToast(
            `Transferred ${transfer.transferCode} to ${transfer.targetDeviceName}`
          );
          setTimeout(() => setTransferToast(null), 4000);
        }}
      />

      {/* 7. Animated Incoming Transferred Bill Notification Popup on Receiving Machine */}
      {incomingTransfers.length > 0 && (() => {
        const activeIncoming = incomingTransfers[0];
        return (
          <div className="fixed bottom-5 right-5 z-50 w-full max-w-sm animate-in slide-in-from-bottom-8 zoom-in-95 fade-in duration-300">
            <div className="relative rounded-2xl bg-[#0d101b]/95 backdrop-blur-2xl border border-indigo-500/50 shadow-[0_20px_60px_rgba(79,70,229,0.35)] overflow-hidden p-4 space-y-3">
              {/* Top Animated Glow Strip */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-emerald-400 to-indigo-500 animate-pulse" />

              {/* Header: Computer Icon + Sender Info */}
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5">
                  <div className="relative w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
                    <Monitor className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0d101b] animate-ping" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0d101b]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">
                        New Bill Received
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 font-bold">
                        {activeIncoming.transferCode}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 mt-0.5">
                      From <strong>{activeIncoming.sourceDeviceName}</strong> •{" "}
                      {activeIncoming.senderDisplayName}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRejectIncomingTransfer(activeIncoming)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 cursor-pointer"
                  title="Decline Transfer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Animated Bill Paper Preview Card */}
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 border-b border-dashed border-white/10 pb-1.5">
                  <span>
                    {activeIncoming.itemCount}{" "}
                    {activeIncoming.itemCount === 1 ? "ITEM" : "ITEMS"}
                  </span>
                  <span>
                    {activeIncoming.customer
                      ? activeIncoming.customer.name
                      : "Walk-in Guest"}
                  </span>
                </div>

                <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                  {activeIncoming.cartItems.slice(0, 4).map((ci, idx) => (
                    <div
                      key={`${ci.product.id}_${idx}`}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="text-zinc-200 truncate pr-2">
                        {ci.quantity}× {ci.product.name}
                      </span>
                      <span className="font-mono text-zinc-300 shrink-0">
                        {activeIncoming.currency}{" "}
                        {((ci.customPrice ?? ci.product.price) * ci.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {activeIncoming.cartItems.length > 4 && (
                    <div className="text-[10px] text-zinc-400 italic">
                      +{activeIncoming.cartItems.length - 4} more items...
                    </div>
                  )}
                </div>

                <div className="pt-1.5 border-t border-dashed border-white/10 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-300 uppercase">
                    Bill Total
                  </span>
                  <span className="text-sm font-black font-mono text-emerald-400">
                    {activeIncoming.currency}{" "}
                    {Number(activeIncoming.grandTotal || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Approve & Print / Load to Cart Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleAcceptIncomingTransfer(activeIncoming)}
                  className="py-2 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-200 cursor-pointer transition-colors"
                >
                  Load to Cart
                </button>
                <button
                  type="button"
                  onClick={() => handleApproveAndPrintIncomingTransfer(activeIncoming)}
                  className="py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Approve & Print</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 8. Product Variant Selector Modal */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#10121a] border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white">
                  Select Variant — {variantPickerProduct.name}
                </h3>
                <p className="text-[10px] text-zinc-400">
                  Choose a variant to add to the current bill
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVariantPickerProduct(null)}
                className="p-1 rounded-lg bg-white/5 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 max-h-72 overflow-y-auto space-y-2">
              {(variantPickerProduct.variants || []).map((v) => {
                const vLabel =
                  [v.size, v.color].filter(Boolean).join(" / ") || v.sku;
                const vPromo = findBestPromotionForLine(
                  {
                    lineKey: `${variantPickerProduct.id}__${v.id}`,
                    productId: variantPickerProduct.id,
                    variantId: v.id,
                    categoryId: variantPickerProduct.category,
                    brandId: variantPickerProduct.brandId,
                    brandName: variantPickerProduct.brand,
                    unitPrice: v.sellingPrice,
                    quantity: 1,
                  },
                  shopPromotions,
                  promoClockMs,
                  currency
                );
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      addProductOrVariantToCart(variantPickerProduct, v);
                      setVariantPickerProduct(null);
                    }}
                    className="w-full p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 flex items-center justify-between text-left cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{vLabel}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        SKU: {v.sku} • {v.stockQuantity} in stock
                      </div>
                      {vPromo && (
                        <div className="text-[10px] text-emerald-300 mt-0.5">
                          {vPromo.promotionName} ({vPromo.discountLabel})
                        </div>
                      )}
                    </div>
                    <div className="text-right font-mono text-xs">
                      {vPromo ? (
                        <>
                          <div className="text-[10px] text-zinc-500 line-through">
                            {currency} {v.sellingPrice.toLocaleString()}
                          </div>
                          <div className="font-bold text-emerald-300">
                            {currency} {vPromo.promoUnitPrice.toLocaleString()}
                          </div>
                        </>
                      ) : (
                        <div className="font-bold text-white">
                          {currency} {v.sellingPrice.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 9. Real-Time Bill Transfer Notification Toast */}
      {transferToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[#111422]/95 border border-indigo-500/40 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 backdrop-blur animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{transferToast}</span>
        </div>
      )}
    </div>
  );
}
