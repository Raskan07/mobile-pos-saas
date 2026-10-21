"use client";

/**
 * app/shop/ledger/page.tsx
 *
 * Sales Ledger & Invoice Historical Records
 *
 * Features:
 * 1. Single sales collection filtered strictly by authenticated shopId.
 * 2. Custom date range picker with instant filtered results.
 * 3. Export filtered sales and return history reports to PDF and XML.
 * 4. Tab switcher between "Sales Invoices" and "Return History".
 * 5. Quick action icon buttons (Edit, Delete/Void, Reprint, View) with hover tooltips.
 * 6. Non-destructive customer returns linked to original sales with restock logic.
 * 7. Minimal dark gray aesthetic.
 */

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  RotateCcw,
  Eye,
  X,
  CheckCircle2,
  AlertCircle,
  Banknote,
  CreditCard,
  Building2,
  Smartphone,
  ShieldCheck,
  Printer,
  Pencil,
  Trash2,
  Download,
  FileText,
  FileCode,
  FileSpreadsheet,
  Calendar,
  Lock,
  Package,
  BookOpen,
  ArrowRightLeft,
  Plus,
  Minus,
  ShoppingBag,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { useRBAC } from "@/lib/rbac/useRBAC";
import {
  subscribeToSalesByShop,
  processSaleReturn,
  processSaleExchange,
  updateSaleRecord,
  deleteSaleRecord,
  voidSaleRecord,
} from "@/lib/services/salesService";
import { getProducts } from "@/lib/services/catalogService";
import {
  SaleRecord,
  SaleReturnRecord,
  SaleExchangeRecord,
  SaleStatus,
  ProcessReturnItemInput,
  ProcessExchangeItemInput,
} from "@/lib/types/sale";
import { ProductItem } from "@/lib/types/catalog";
import ReceiptModal from "../dashboard/ReceiptModal";
import { downloadSalesPdf } from "@/lib/exporters/salesPdfExporter";
import { downloadSalesXml } from "@/lib/exporters/salesXmlExporter";
import { downloadSalesExcel } from "@/lib/exporters/salesExcelExporter";
import { downloadReturnsPdf } from "@/lib/exporters/returnsPdfExporter";
import { downloadReturnsXml } from "@/lib/exporters/returnsXmlExporter";
import { downloadReturnsExcel } from "@/lib/exporters/returnsExcelExporter";
import { downloadExchangesPdf } from "@/lib/exporters/exchangesPdfExporter";
import { downloadExchangesXml } from "@/lib/exporters/exchangesXmlExporter";
import { downloadExchangesExcel } from "@/lib/exporters/exchangesExcelExporter";

export default function ShopSalesLedgerPage() {
  const router = useRouter();
  const { shop, user, activeBranchName, isAuthenticated, isLoading: isAuthLoading } = useShopAuth();
  const { hasPermission, isShopAdmin } = useRBAC();

  // Role permissions
  const canViewSales = hasPermission("sales:view") || isShopAdmin;
  const canProcessReturns = hasPermission("returns:process") || isShopAdmin;

  // Active view tab
  const [activeTab, setActiveTab] = useState<"sales" | "returns" | "exchanges">("sales");

  // Sales data state
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);

  // Return Processing Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnItemsState, setReturnItemsState] = useState<{
    [productId: string]: {
      quantity: number;
      restock: boolean;
      condition: "good" | "damaged" | "defective";
    };
  }>({});
  const [returnRefundMethod, setReturnRefundMethod] = useState<string>("cash");
  const [returnReason, setReturnReason] = useState("");
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState<string | null>(null);

  // Product Exchange Modal State
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [exchangeReturnedItemsState, setExchangeReturnedItemsState] = useState<{
    [productId: string]: {
      quantity: number;
      restock: boolean;
      condition: "good" | "damaged" | "defective";
    };
  }>({});
  const [exchangeReplacementItems, setExchangeReplacementItems] = useState<
    ProcessExchangeItemInput[]
  >([]);
  const [exchangeProductSearch, setExchangeProductSearch] = useState("");
  const [exchangeSettlementMethod, setExchangeSettlementMethod] = useState("cash");
  const [exchangeReason, setExchangeReason] = useState("");
  const [isProcessingExchange, setIsProcessingExchange] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeSuccessMsg, setExchangeSuccessMsg] = useState<string | null>(null);

  // Edit Sale Modal State
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete / Void Sale Modal State
  const [deletingSale, setDeletingSale] = useState<SaleRecord | null>(null);
  const [deleteMode, setDeleteMode] = useState<"delete" | "void">("void");
  const [deleteRestoreStock, setDeleteRestoreStock] = useState(true);
  const [voidReason, setVoidReason] = useState("Voided by manager");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "7days" | "30days" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/shop");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  // Real-time listener strictly scoped to active shopId
  useEffect(() => {
    if (!shop?.shopId || !canViewSales) return;

    setIsLoading(true);

    const unsubscribe = subscribeToSalesByShop(
      shop.shopId,
      (fetchedSales) => {
        setSales(fetchedSales);
        setIsLoading(false);

        // Keep selectedSale state synchronized with live updates
        setSelectedSale((prev) => {
          if (!prev) return null;
          const updated = fetchedSales.find((s) => s.saleId === prev.saleId);
          return updated || prev;
        });
      },
      (err) => {
        console.error("[SalesLedger] Subscription error:", err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [shop?.shopId, canViewSales]);

  // Date boundary calculator
  const dateBoundaries = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOf30Days = startOfToday - 30 * 24 * 60 * 60 * 1000;
    return { startOfToday, startOfYesterday, startOf7Days, startOf30Days };
  }, []);

  // Custom date epochs
  const { customStartEpoch, customEndEpoch } = useMemo(() => {
    let start: number | null = null;
    let end: number | null = null;
    if (customStartDate) {
      const [y, m, d] = customStartDate.split("-").map(Number);
      start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    }
    if (customEndDate) {
      const [y, m, d] = customEndDate.split("-").map(Number);
      end = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    }
    return { customStartEpoch: start, customEndEpoch: end };
  }, [customStartDate, customEndDate]);

  // Filtered sales in memory
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // 1. Date filter (preset or custom)
      if (dateFilter === "custom") {
        if (customStartEpoch && sale.createdAt < customStartEpoch) return false;
        if (customEndEpoch && sale.createdAt > customEndEpoch) return false;
      } else if (dateFilter === "today" && sale.createdAt < dateBoundaries.startOfToday) {
        return false;
      } else if (
        dateFilter === "yesterday" &&
        (sale.createdAt < dateBoundaries.startOfYesterday || sale.createdAt >= dateBoundaries.startOfToday)
      ) {
        return false;
      } else if (dateFilter === "7days" && sale.createdAt < dateBoundaries.startOf7Days) {
        return false;
      } else if (dateFilter === "30days" && sale.createdAt < dateBoundaries.startOf30Days) {
        return false;
      }

      // 2. Status filter
      if (statusFilter !== "all" && sale.status !== statusFilter) {
        return false;
      }

      // 3. Payment method filter
      if (paymentFilter !== "all" && sale.paymentMethod?.toLowerCase() !== paymentFilter.toLowerCase()) {
        return false;
      }

      // 4. Cashier filter
      if (cashierFilter !== "all" && sale.cashierId !== cashierFilter) {
        return false;
      }

      // 5. Search text (invoice, cashier, customer, items, sku)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesInvoice = sale.invoiceNumber.toLowerCase().includes(q);
        const matchesCashier = sale.cashierName.toLowerCase().includes(q);
        const matchesCustomer =
          sale.customer?.name?.toLowerCase().includes(q) || sale.customer?.phone?.includes(q);
        const matchesItems = sale.items.some(
          (it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        );
        if (!matchesInvoice && !matchesCashier && !matchesCustomer && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [
    sales,
    dateFilter,
    customStartEpoch,
    customEndEpoch,
    statusFilter,
    paymentFilter,
    cashierFilter,
    searchQuery,
    dateBoundaries,
  ]);

  // Flattened all return records across all sales for this shop
  const allReturns = useMemo(() => {
    const list: (SaleReturnRecord & {
      originalGrandTotal: number;
      customerName?: string;
    })[] = [];

    sales.forEach((sale) => {
      if (sale.returns && sale.returns.length > 0) {
        sale.returns.forEach((ret) => {
          list.push({
            ...ret,
            originalGrandTotal: sale.grandTotal,
            customerName: sale.customer?.name,
          });
        });
      }
    });

    list.sort((a, b) => b.returnDate - a.returnDate);
    return list;
  }, [sales]);

  // Filtered returns based on current filter state
  const filteredReturns = useMemo(() => {
    return allReturns.filter((ret) => {
      // 1. Date filter
      if (dateFilter === "custom") {
        if (customStartEpoch && ret.returnDate < customStartEpoch) return false;
        if (customEndEpoch && ret.returnDate > customEndEpoch) return false;
      } else if (dateFilter === "today" && ret.returnDate < dateBoundaries.startOfToday) {
        return false;
      } else if (
        dateFilter === "yesterday" &&
        (ret.returnDate < dateBoundaries.startOfYesterday || ret.returnDate >= dateBoundaries.startOfToday)
      ) {
        return false;
      } else if (dateFilter === "7days" && ret.returnDate < dateBoundaries.startOf7Days) {
        return false;
      } else if (dateFilter === "30days" && ret.returnDate < dateBoundaries.startOf30Days) {
        return false;
      }

      // 2. Refund method filter
      if (paymentFilter !== "all" && ret.refundMethod?.toLowerCase() !== paymentFilter.toLowerCase()) {
        return false;
      }

      // 3. Cashier filter
      if (cashierFilter !== "all" && ret.processedBy?.userId !== cashierFilter) {
        return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchId = ret.returnId.toLowerCase().includes(q);
        const matchInv = ret.invoiceNumber.toLowerCase().includes(q);
        const matchReason = ret.reason.toLowerCase().includes(q);
        const matchOp = ret.processedBy?.username?.toLowerCase().includes(q);
        const matchItems = ret.items.some(
          (it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        );
        if (!matchId && !matchInv && !matchReason && !matchOp && !matchItems) return false;
      }

      return true;
    });
  }, [
    allReturns,
    dateFilter,
    customStartEpoch,
    customEndEpoch,
    paymentFilter,
    cashierFilter,
    searchQuery,
    dateBoundaries,
  ]);

  // Flattened all exchange records across all sales for this shop
  const allExchanges = useMemo(() => {
    const list: (SaleExchangeRecord & {
      customerName?: string;
    })[] = [];

    sales.forEach((sale) => {
      if (sale.exchanges && sale.exchanges.length > 0) {
        sale.exchanges.forEach((exc) => {
          list.push({
            ...exc,
            customerName: sale.customer?.name,
          });
        });
      }
    });

    list.sort((a, b) => b.exchangeDate - a.exchangeDate);
    return list;
  }, [sales]);

  // Filtered exchanges based on current filter state
  const filteredExchanges = useMemo(() => {
    return allExchanges.filter((exc) => {
      // 1. Date filter
      if (dateFilter === "custom") {
        if (customStartEpoch && exc.exchangeDate < customStartEpoch) return false;
        if (customEndEpoch && exc.exchangeDate > customEndEpoch) return false;
      } else if (dateFilter === "today" && exc.exchangeDate < dateBoundaries.startOfToday) {
        return false;
      } else if (
        dateFilter === "yesterday" &&
        (exc.exchangeDate < dateBoundaries.startOfYesterday || exc.exchangeDate >= dateBoundaries.startOfToday)
      ) {
        return false;
      } else if (dateFilter === "7days" && exc.exchangeDate < dateBoundaries.startOf7Days) {
        return false;
      } else if (dateFilter === "30days" && exc.exchangeDate < dateBoundaries.startOf30Days) {
        return false;
      }

      // 2. Settlement method filter
      if (paymentFilter !== "all" && exc.settlementMethod?.toLowerCase() !== paymentFilter.toLowerCase()) {
        return false;
      }

      // 3. Cashier/Operator filter
      if (cashierFilter !== "all" && exc.operator?.userId !== cashierFilter) {
        return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchExcId = exc.exchangeId.toLowerCase().includes(q);
        const matchExcInv = exc.exchangeInvoiceNumber.toLowerCase().includes(q);
        const matchOrigInv = exc.originalInvoiceNumber.toLowerCase().includes(q);
        const matchReason = exc.reason.toLowerCase().includes(q);
        const matchOp = exc.operator?.username?.toLowerCase().includes(q);
        const matchRetItems = exc.returnedItems.some(
          (it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        );
        const matchRepItems = exc.replacementItems.some(
          (it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        );
        if (
          !matchExcId &&
          !matchExcInv &&
          !matchOrigInv &&
          !matchReason &&
          !matchOp &&
          !matchRetItems &&
          !matchRepItems
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    allExchanges,
    dateFilter,
    customStartEpoch,
    customEndEpoch,
    paymentFilter,
    cashierFilter,
    searchQuery,
    dateBoundaries,
  ]);

  // Unique operators for filter dropdown (cashiers and staff)
  const uniqueOperators = useMemo(() => {
    const map = new Map<string, string>();
    sales.forEach((s) => {
      if (s.cashierId && s.cashierName) {
        map.set(s.cashierId, s.cashierName);
      }
      if (s.returns) {
        s.returns.forEach((r) => {
          if (r.processedBy?.userId) {
            map.set(
              r.processedBy.userId,
              r.processedBy.displayName || r.processedBy.username || "Operator"
            );
          }
        });
      }
      if (s.exchanges) {
        s.exchanges.forEach((e) => {
          if (e.operator?.userId) {
            map.set(
              e.operator.userId,
              e.operator.displayName || e.operator.username || "Operator"
            );
          }
        });
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sales]);

  // Format currency
  const fmt = (val: number) =>
    `LKR ${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Payment method icon
  const getPaymentIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case "cash":
        return <Banknote className="w-3.5 h-3.5 text-zinc-300" />;
      case "card":
        return <CreditCard className="w-3.5 h-3.5 text-zinc-300" />;
      case "bank-transfer":
      case "bank":
        return <Building2 className="w-3.5 h-3.5 text-zinc-300" />;
      case "mobile-qr":
      case "mobile":
        return <Smartphone className="w-3.5 h-3.5 text-zinc-300" />;
      default:
        return <CreditCard className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  // Status badge styling
  const renderStatusBadge = (status: SaleStatus, hasReturns?: boolean) => {
    switch (status) {
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            <RotateCcw className="w-3 h-3 text-zinc-400" />
            <span>Refunded</span>
          </span>
        );
      case "partially_returned":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            <RotateCcw className="w-3 h-3 text-zinc-400" />
            <span>Partially Returned</span>
          </span>
        );
      case "voided":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-900 text-zinc-500 border border-zinc-800">
            <span>Voided</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            <CheckCircle2 className="w-3 h-3 text-zinc-400" />
            <span>Completed</span>
          </span>
        );
    }
  };

  // Open Return Processing Modal
  const handleOpenReturnModal = (sale: SaleRecord) => {
    const initialItemsState: {
      [productId: string]: {
        quantity: number;
        restock: boolean;
        condition: "good" | "damaged" | "defective";
      };
    } = {};

    sale.items.forEach((item) => {
      initialItemsState[item.productId] = {
        quantity: 0,
        restock: true,
        condition: "good",
      };
    });

    setReturnItemsState(initialItemsState);
    setReturnRefundMethod(sale.paymentMethod || "cash");
    setReturnReason("");
    setReturnError(null);
    setReturnSuccessMsg(null);
    setIsReturnModalOpen(true);
  };

  // Compute remaining returnable / exchangeable quantity for an item (accounting for prior returns and exchanges)
  const getReturnableQty = (sale: SaleRecord, productId: string, totalBought: number) => {
    let processedSoFar = 0;
    if (sale.returns && sale.returns.length > 0) {
      sale.returns.forEach((ret) => {
        ret.items.forEach((it) => {
          if (it.productId === productId) {
            processedSoFar += it.quantity;
          }
        });
      });
    }
    if (sale.exchanges && sale.exchanges.length > 0) {
      sale.exchanges.forEach((exc) => {
        exc.returnedItems.forEach((it) => {
          if (it.productId === productId) {
            processedSoFar += it.quantity;
          }
        });
      });
    }
    return Math.max(0, totalBought - processedSoFar);
  };

  // Execute Return
  const handleConfirmReturn = async () => {
    if (!selectedSale || !shop?.shopId || !user) return;

    setReturnError(null);
    setIsProcessingReturn(true);

    try {
      const itemsToReturn: ProcessReturnItemInput[] = [];

      selectedSale.items.forEach((item) => {
        const itemState = returnItemsState[item.productId];
        if (itemState && itemState.quantity > 0) {
          const lineRefund = (item.subtotal / item.quantity) * itemState.quantity;
          itemsToReturn.push({
            productId: item.productId,
            name: item.name,
            sku: item.sku,
            quantity: itemState.quantity,
            unitPrice: item.unitPrice,
            refundAmount: lineRefund,
            restock: itemState.restock,
            condition: itemState.condition,
          });
        }
      });

      if (itemsToReturn.length === 0) {
        throw new Error("Please select at least 1 item and quantity to return.");
      }

      const { updatedSale } = await processSaleReturn(shop.shopId, {
        saleId: selectedSale.saleId,
        items: itemsToReturn,
        refundMethod: returnRefundMethod,
        reason: returnReason.trim() || "Customer return",
        operator: {
          userId: user.uid,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role || "cashier",
        },
      });

      setSelectedSale(updatedSale);
      setReturnSuccessMsg("Return processed successfully. Stock has been restored.");
      setTimeout(() => {
        setIsReturnModalOpen(false);
        setReturnSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      console.error("[SalesLedger] Return error:", err);
      setReturnError(err.message || "Failed to process return.");
    } finally {
      setIsProcessingReturn(false);
    }
  };

  // Open Product Exchange Modal
  const handleOpenExchangeModal = async (sale: SaleRecord) => {
    const initialItemsState: {
      [productId: string]: {
        quantity: number;
        restock: boolean;
        condition: "good" | "damaged" | "defective";
      };
    } = {};

    sale.items.forEach((item) => {
      initialItemsState[item.productId] = {
        quantity: 0,
        restock: true,
        condition: "good",
      };
    });

    setExchangeReturnedItemsState(initialItemsState);
    setExchangeReplacementItems([]);
    setExchangeProductSearch("");
    setExchangeSettlementMethod(sale.paymentMethod || "cash");
    setExchangeReason("");
    setExchangeError(null);
    setExchangeSuccessMsg(null);
    setIsExchangeModalOpen(true);

    // Fetch catalog products if not loaded yet
    if (shop?.shopId && catalogProducts.length === 0) {
      setIsLoadingCatalog(true);
      try {
        const prods = await getProducts(shop.shopId);
        setCatalogProducts(prods);
      } catch (err) {
        console.error("[SalesLedger] Catalog fetch error for exchange:", err);
      } finally {
        setIsLoadingCatalog(false);
      }
    }
  };

  // Real-time computed credit from returned items in exchange
  const exchangeReturnedCredit = useMemo(() => {
    if (!selectedSale) return 0;
    let sum = 0;
    selectedSale.items.forEach((item) => {
      const state = exchangeReturnedItemsState[item.productId];
      if (state && state.quantity > 0) {
        const lineCredit = (item.subtotal / item.quantity) * state.quantity;
        sum += lineCredit;
      }
    });
    return sum;
  }, [selectedSale, exchangeReturnedItemsState]);

  // Real-time computed total cost of replacement items in exchange
  const exchangeReplacementTotal = useMemo(() => {
    return exchangeReplacementItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
  }, [exchangeReplacementItems]);

  // Price Differential: (Replacement Total - Returned Credit)
  // Positive (> 0): Customer pays difference
  // Negative (< 0): Store refunds difference to customer
  // Zero (=== 0): Even exchange
  const exchangeDifference = exchangeReplacementTotal - exchangeReturnedCredit;

  // Filtered catalog products matching replacement search query
  const matchingCatalogProducts = useMemo(() => {
    if (!exchangeProductSearch.trim()) return [];
    const q = exchangeProductSearch.trim().toLowerCase();
    return catalogProducts
      .filter((p) => {
        const matchesName = p.name?.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q);
        const matchesBarcode = p.barcode?.toLowerCase().includes(q);
        return matchesName || matchesSku || matchesBarcode;
      })
      .slice(0, 6);
  }, [catalogProducts, exchangeProductSearch]);

  // Add a product from catalog to replacement items list
  const handleAddReplacementProduct = (prod: ProductItem) => {
    setExchangeReplacementItems((prev) => {
      const existing = prev.find((it) => it.productId === prod.id);
      if (existing) {
        return prev.map((it) =>
          it.productId === prod.id
            ? {
                ...it,
                quantity: it.quantity + 1,
                subtotal: (it.quantity + 1) * it.unitPrice,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          name: prod.name,
          sku: prod.sku || "",
          quantity: 1,
          unitPrice: prod.sellingPrice || 0,
          subtotal: prod.sellingPrice || 0,
          categoryName: prod.categoryName || "",
        },
      ];
    });
    setExchangeProductSearch("");
  };

  // Adjust quantity of replacement item
  const handleUpdateReplacementQty = (productId: string, delta: number) => {
    setExchangeReplacementItems((prev) => {
      return prev
        .map((it) => {
          if (it.productId === productId) {
            const newQty = it.quantity + delta;
            return newQty > 0
              ? { ...it, quantity: newQty, subtotal: newQty * it.unitPrice }
              : null;
          }
          return it;
        })
        .filter(Boolean) as ProcessExchangeItemInput[];
    });
  };

  // Remove replacement item
  const handleRemoveReplacementItem = (productId: string) => {
    setExchangeReplacementItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  // Execute Product Exchange
  const handleConfirmExchange = async () => {
    if (!selectedSale || !shop?.shopId || !user) return;

    setExchangeError(null);
    setIsProcessingExchange(true);

    try {
      const returnedList: ProcessReturnItemInput[] = [];

      selectedSale.items.forEach((item) => {
        const itemState = exchangeReturnedItemsState[item.productId];
        if (itemState && itemState.quantity > 0) {
          const lineRefund = (item.subtotal / item.quantity) * itemState.quantity;
          returnedList.push({
            productId: item.productId,
            name: item.name,
            sku: item.sku,
            quantity: itemState.quantity,
            unitPrice: item.unitPrice,
            refundAmount: lineRefund,
            restock: itemState.restock,
            condition: itemState.condition,
          });
        }
      });

      if (returnedList.length === 0) {
        throw new Error("Please select at least 1 item and quantity to return for exchange.");
      }

      if (exchangeReplacementItems.length === 0) {
        throw new Error("Please select at least 1 replacement product from the catalog.");
      }

      const { originalSale: updatedSale } = await processSaleExchange(shop.shopId, {
        originalSaleId: selectedSale.saleId,
        returnedItems: returnedList,
        replacementItems: exchangeReplacementItems,
        settlementMethod: exchangeSettlementMethod,
        reason: exchangeReason.trim() || "Product exchange",
        operator: {
          userId: user.uid,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role || "cashier",
        },
      });

      setSelectedSale(updatedSale);
      setExchangeSuccessMsg("Exchange processed successfully! Linked record created.");
      setTimeout(() => {
        setIsExchangeModalOpen(false);
        setExchangeSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      console.error("[SalesLedger] Exchange processing error:", err);
      setExchangeError(err.message || "Failed to process exchange.");
    } finally {
      setIsProcessingExchange(false);
    }
  };

  // Open Edit Sale Modal
  const handleOpenEditModal = (sale: SaleRecord) => {
    setEditingSale(sale);
    setEditCustomerName(sale.customer?.name || "");
    setEditCustomerPhone(sale.customer?.phone || "");
    setEditCustomerEmail(sale.customer?.email || "");
    setEditNotes(sale.notes || "");
    setEditPaymentMethod(sale.paymentMethod || "cash");
    setEditError(null);
  };

  // Execute Edit Sale
  const handleSaveEdit = async () => {
    if (!editingSale || !shop?.shopId) return;

    setIsSavingEdit(true);
    setEditError(null);

    try {
      await updateSaleRecord(shop.shopId, editingSale.saleId, {
        customer: {
          ...(editingSale.customer?.customerId ? { customerId: editingSale.customer.customerId } : {}),
          name: editCustomerName.trim(),
          phone: editCustomerPhone.trim(),
          email: editCustomerEmail.trim(),
        },
        notes: editNotes.trim(),
        paymentMethod: editPaymentMethod,
      });

      setEditingSale(null);
    } catch (err: any) {
      console.error("[SalesLedger] Edit sale error:", err);
      setEditError(err.message || "Failed to update sale record.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Delete / Void Confirmation Modal
  const handleOpenDeleteModal = (sale: SaleRecord) => {
    setDeletingSale(sale);
    setDeleteMode("void");
    setDeleteRestoreStock(true);
    setVoidReason("Voided by operator");
    setDeleteError(null);
  };

  // Execute Delete / Void
  const handleConfirmDelete = async () => {
    if (!deletingSale || !shop?.shopId || !user) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (deleteMode === "void") {
        await voidSaleRecord(
          shop.shopId,
          deletingSale.saleId,
          voidReason,
          {
            userId: user.uid,
            username: user.username,
            role: user.role || "cashier",
          },
          deleteRestoreStock
        );
      } else {
        await deleteSaleRecord(shop.shopId, deletingSale.saleId, {
          restoreStock: deleteRestoreStock,
          operator: {
            userId: user.uid,
            username: user.username,
            role: user.role || "cashier",
          },
        });
      }

      setDeletingSale(null);
    } catch (err: any) {
      console.error("[SalesLedger] Delete/Void error:", err);
      setDeleteError(err.message || "Failed to perform operation.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Export handlers
  const dateRangeLabel = useMemo(() => {
    if (dateFilter === "custom") {
      return `Custom: ${customStartDate || "Start"} to ${customEndDate || "End"}`;
    }
    switch (dateFilter) {
      case "today":
        return "Today";
      case "yesterday":
        return "Yesterday";
      case "7days":
        return "Last 7 Days";
      case "30days":
        return "Last 30 Days";
      default:
        return "All Dates";
    }
  }, [dateFilter, customStartDate, customEndDate]);

  const handleExportPdf = () => {
    if (!shop?.shopId) return;
    const operatorName =
      cashierFilter !== "all"
        ? uniqueOperators.find((o) => o.id === cashierFilter)?.name || cashierFilter
        : undefined;

    if (activeTab === "sales") {
      downloadSalesPdf(filteredSales, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          statusLabel: statusFilter !== "all" ? statusFilter : undefined,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    } else if (activeTab === "returns") {
      downloadReturnsPdf(filteredReturns, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    } else {
      downloadExchangesPdf(filteredExchanges, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    }
  };

  const handleExportXml = () => {
    if (!shop?.shopId) return;
    const operatorName =
      cashierFilter !== "all"
        ? uniqueOperators.find((o) => o.id === cashierFilter)?.name || cashierFilter
        : undefined;

    if (activeTab === "sales") {
      downloadSalesXml(filteredSales, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          statusLabel: statusFilter !== "all" ? statusFilter : undefined,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    } else if (activeTab === "returns") {
      downloadReturnsXml(filteredReturns, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    } else {
      downloadExchangesXml(filteredExchanges, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    }
  };

  const handleExportExcel = () => {
    if (!shop?.shopId) return;
    const operatorName =
      cashierFilter !== "all"
        ? uniqueOperators.find((o) => o.id === cashierFilter)?.name || cashierFilter
        : undefined;

    if (activeTab === "sales") {
      downloadSalesExcel(filteredSales, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          statusLabel: statusFilter !== "all" ? statusFilter : undefined,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    } else if (activeTab === "returns") {
      downloadReturnsExcel(filteredReturns, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    } else {
      downloadExchangesExcel(filteredExchanges, {
        shopName: shop.shopName || "Retail POS",
        shopId: shop.shopId,
        branchName: activeBranchName || "Main Branch",
        filterSummary: {
          dateRangeLabel,
          paymentLabel: paymentFilter !== "all" ? paymentFilter : undefined,
          cashierLabel: operatorName,
          searchTerm: searchQuery.trim() || undefined,
        },
      });
    }
  };

  // Loading Screen
  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#07080d] text-zinc-400">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
      </div>
    );
  }

  // RBAC Restriction Banner
  if (!canViewSales) {
    return (
      <div className="min-h-screen bg-[#07080d] text-zinc-200 flex flex-col">
        <header className="h-14 px-4 md:px-8 bg-[#0c0d15] border-b border-zinc-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/shop/dashboard")}
            className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-2 text-xs font-medium transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
            <span>Back</span>
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">Access Restricted</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Your account role does not have permission to view the sales ledger. Please contact your store administrator.
            </p>
            <button
              type="button"
              onClick={() => router.push("/shop/dashboard")}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              Return to POS Terminal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-200 font-sans select-none flex flex-col">
      {/* ── Top Header Navigation Bar (Minimal) ── */}
      <header className="relative z-10 h-14 px-4 md:px-8 bg-[#0c0d15]/90 backdrop-blur-xl border-b border-zinc-800/80 flex items-center justify-between gap-4 shrink-0">
        <button
          type="button"
          onClick={() => router.push("/shop/dashboard")}
          className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-2 text-xs font-medium transition-all cursor-pointer"
          title="Back to POS Terminal"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
          <span>Back</span>
        </button>

        {/* View Switcher Tabs */}
        <div className="flex items-center p-1 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "sales"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Sales Invoices</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-700/60 text-zinc-300">
              {sales.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("returns")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "returns"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Return History</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-700/60 text-zinc-300">
              {allReturns.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("exchanges")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "exchanges"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Exchange History</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-700/60 text-zinc-300">
              {allExchanges.length}
            </span>
          </button>
        </div>

        {/* Export Report Actions (Excel, PDF & XML) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer shadow-sm"
            title={`Download ${activeTab === "sales" ? "Sales" : activeTab === "returns" ? "Returns" : "Exchanges"} Excel (.xlsx) Report`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Excel Report</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer shadow-sm"
            title={`Download ${activeTab === "sales" ? "Sales" : activeTab === "returns" ? "Returns" : "Exchanges"} Report PDF`}
          >
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">PDF Report</span>
          </button>

          <button
            type="button"
            onClick={handleExportXml}
            className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer shadow-sm"
            title={`Download ${activeTab === "sales" ? "Sales" : activeTab === "returns" ? "Returns" : "Exchanges"} Report XML`}
          >
            <FileCode className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">XML Export</span>
          </button>
        </div>
      </header>

      {/* ── Main Ledger Body ── */}
      <main className="relative z-10 flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4">
        {/* ── Filters & Search Control Bar ── */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === "sales"
                  ? "Search invoice, SKU, product, customer..."
                  : activeTab === "returns"
                  ? "Search return ID, invoice, items, staff..."
                  : "Search exchange #, invoice, items, operator..."
              }
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/40 border border-zinc-800 focus:border-zinc-600 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none transition-all"
            />
          </div>

          {/* Filter Selectors with neutral gray secondary styling */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Status Filter (Sales tab only) */}
            {activeTab === "sales" && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs font-medium text-zinc-300 focus:border-zinc-600 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-zinc-900">All Statuses</option>
                <option value="completed" className="bg-zinc-900">Completed</option>
                <option value="partially_returned" className="bg-zinc-900">Partially Returned</option>
                <option value="refunded" className="bg-zinc-900">Refunded</option>
                <option value="voided" className="bg-zinc-900">Voided</option>
              </select>
            )}

            {/* Date Range Selector */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs font-medium text-zinc-300 focus:border-zinc-600 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-zinc-900">All Dates</option>
              <option value="today" className="bg-zinc-900">Today</option>
              <option value="yesterday" className="bg-zinc-900">Yesterday</option>
              <option value="7days" className="bg-zinc-900">Last 7 Days</option>
              <option value="30days" className="bg-zinc-900">Last 30 Days</option>
              <option value="custom" className="bg-zinc-900">Custom Range...</option>
            </select>

            {/* Custom Date Pickers (Visible when custom is selected) */}
            {dateFilter === "custom" && (
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/50 border border-zinc-800">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                  title="Start Date"
                />
                <span className="text-zinc-500 text-xs">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                  title="End Date"
                />
              </div>
            )}

            {/* Payment Method Selector */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs font-medium text-zinc-300 focus:border-zinc-600 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-zinc-900">
                {activeTab === "sales" ? "All Payments" : "All Refund Methods"}
              </option>
              <option value="cash" className="bg-zinc-900">Cash</option>
              <option value="card" className="bg-zinc-900">Card</option>
              <option value="store-credit" className="bg-zinc-900">Store Credit</option>
              <option value="bank-transfer" className="bg-zinc-900">Bank Wire</option>
              <option value="mobile-qr" className="bg-zinc-900">Mobile / QR</option>
            </select>

            {/* Operator Filter Selector */}
            <select
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs font-medium text-zinc-300 focus:border-zinc-600 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-zinc-900">All Operators</option>
              {uniqueOperators.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900">
                  {c.name}
                </option>
              ))}
            </select>

            <span className="text-xs text-zinc-500 font-mono ml-1">
              {activeTab === "sales" ? `${filteredSales.length} records` : `${filteredReturns.length} returns`}
            </span>
          </div>
        </div>

        {/* ── Table Container ── */}
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden shadow-xl">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <div className="w-7 h-7 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
              <p className="text-xs text-zinc-500">Loading records...</p>
            </div>
          ) : activeTab === "sales" ? (
            /* ─────────────────────────────────────────────────────────────
               TAB 1: SALES INVOICES TABLE
            ───────────────────────────────────────────────────────────── */
            filteredSales.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
                <Package className="w-8 h-8 text-zinc-600 mb-1" />
                <h3 className="text-sm font-semibold text-zinc-300">No Sales Records</h3>
                <p className="text-xs text-zinc-500 max-w-sm">
                  {sales.length === 0
                    ? "No sales transactions recorded yet for this shop."
                    : "No sales match the applied date range or filter criteria."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Operator</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Items Snapshot</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Grand Total</th>
                      <th className="py-3 px-4 text-center">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredSales.map((sale) => (
                      <tr
                        key={sale.saleId}
                        className="hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                        onClick={() => setSelectedSale(sale)}
                      >
                        {/* Invoice Number */}
                        <td className="py-3 px-4 font-mono font-medium text-zinc-100">
                          <div className="flex items-center gap-1.5">
                            <span>{sale.invoiceNumber}</span>
                            {sale.hasReturns && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Ret
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {sale.saleId.slice(0, 14)}…
                          </div>
                        </td>

                        {/* Date & Time */}
                        <td className="py-3 px-4 text-zinc-300">
                          <div>
                            {new Date(sale.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {new Date(sale.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>

                        {/* Operator Details */}
                        <td className="py-3 px-4 text-zinc-300">
                          <div className="font-medium text-zinc-200">{sale.cashierName}</div>
                          <div className="text-[10px] text-zinc-500 capitalize">{sale.cashierRole}</div>
                        </td>

                        {/* Customer Info */}
                        <td className="py-3 px-4 text-zinc-300">
                          {sale.customer?.name ? (
                            <div>
                              <div className="font-medium text-zinc-200">{sale.customer.name}</div>
                              {sale.customer.phone && (
                                <div className="text-[10px] text-zinc-500 font-mono">{sale.customer.phone}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-500 text-[11px]">Walk-in</span>
                          )}
                        </td>

                        {/* Snapshot Items Summary */}
                        <td className="py-3 px-4 text-zinc-300 max-w-xs truncate">
                          <div className="font-medium text-zinc-200 truncate">
                            {sale.items.map((it) => `${it.quantity}x ${it.name}`).join(", ")}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {sale.itemCount} items • {sale.items.length} line{sale.items.length > 1 ? "s" : ""}
                          </div>
                        </td>

                        {/* Payment Method */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 capitalize text-zinc-300">
                            {getPaymentIcon(sale.paymentMethod)}
                            <span>{sale.paymentMethod}</span>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4">
                          {renderStatusBadge(sale.status, sale.hasReturns)}
                        </td>

                        {/* Grand Total */}
                        <td className="py-3 px-4 text-right font-mono font-medium text-zinc-100">
                          {fmt(sale.grandTotal)}
                          {sale.totalRefunded && sale.totalRefunded > 0 ? (
                            <div className="text-[10px] text-zinc-500">
                              Ref: -{fmt(sale.totalRefunded)}
                            </div>
                          ) : null}
                        </td>

                        {/* Quick Action Buttons (Icon only, hover toggles action name) */}
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {/* View */}
                            <div className="relative group/btn">
                              <button
                                type="button"
                                onClick={() => setSelectedSale(sale)}
                                className="w-7 h-7 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center border border-zinc-700/60 transition-colors cursor-pointer"
                                aria-label="View Invoice"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-200 opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-md">
                                View
                              </span>
                            </div>

                            {/* Reprint */}
                            <div className="relative group/btn">
                              <button
                                type="button"
                                onClick={() => setReceiptSale(sale)}
                                className="w-7 h-7 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center border border-zinc-700/60 transition-colors cursor-pointer"
                                aria-label="Reprint Receipt"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-200 opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-md">
                                Reprint
                              </span>
                            </div>

                            {/* Edit */}
                            <div className="relative group/btn">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(sale)}
                                className="w-7 h-7 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center border border-zinc-700/60 transition-colors cursor-pointer"
                                aria-label="Edit Sale"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-200 opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-md">
                                Edit
                              </span>
                            </div>

                            {/* Delete / Void */}
                            <div className="relative group/btn">
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteModal(sale)}
                                className="w-7 h-7 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-rose-300 flex items-center justify-center border border-zinc-700/60 transition-colors cursor-pointer"
                                aria-label="Void or Delete Sale"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-200 opacity-0 group-hover/btn:opacity-100 transition-opacity z-30 shadow-md">
                                Void / Delete
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === "returns" ? (
            /* ─────────────────────────────────────────────────────────────
               TAB 2: RETURN HISTORY TABLE
            ───────────────────────────────────────────────────────────── */
            filteredReturns.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
                <RotateCcw className="w-8 h-8 text-zinc-600 mb-1" />
                <h3 className="text-sm font-semibold text-zinc-300">No Return Records Found</h3>
                <p className="text-xs text-zinc-500 max-w-sm">
                  {allReturns.length === 0
                    ? "No customer returns have been processed yet for this shop."
                    : "No return events match the current search or date range."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Return ID</th>
                      <th className="py-3 px-4">Return Date</th>
                      <th className="py-3 px-4">Original Invoice</th>
                      <th className="py-3 px-4">Processed By</th>
                      <th className="py-3 px-4">Returned Items</th>
                      <th className="py-3 px-4">Refund Method</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4 text-right">Refund Amount</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredReturns.map((ret) => (
                      <tr
                        key={ret.returnId}
                        className="hover:bg-zinc-800/30 transition-colors"
                      >
                        {/* Return ID */}
                        <td className="py-3 px-4 font-mono font-medium text-zinc-200">
                          {ret.returnId}
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-zinc-300">
                          <div>
                            {new Date(ret.returnDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {new Date(ret.returnDate).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>

                        {/* Original Invoice */}
                        <td className="py-3 px-4 font-mono text-zinc-200 font-medium">
                          {ret.invoiceNumber}
                        </td>

                        {/* Processed By */}
                        <td className="py-3 px-4 text-zinc-300">
                          <div className="font-medium text-zinc-200">{ret.processedBy.username}</div>
                          <div className="text-[10px] text-zinc-500 capitalize">{ret.processedBy.role}</div>
                        </td>

                        {/* Items */}
                        <td className="py-3 px-4 text-zinc-300 max-w-xs truncate">
                          <div className="font-medium text-zinc-200 truncate">
                            {ret.items.map((it) => `${it.quantity}x ${it.name}`).join(", ")}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {ret.items.reduce((s, it) => s + it.quantity, 0)} units •{" "}
                            {ret.items.filter((it) => it.restock).length > 0 ? "Restocked" : "Not restocked"}
                          </div>
                        </td>

                        {/* Refund Method */}
                        <td className="py-3 px-4">
                          <span className="capitalize px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[11px]">
                            {ret.refundMethod}
                          </span>
                        </td>

                        {/* Reason */}
                        <td className="py-3 px-4 text-zinc-300 max-w-xs truncate">
                          {ret.reason}
                        </td>

                        {/* Refund Amount */}
                        <td className="py-3 px-4 text-right font-mono font-medium text-zinc-100">
                          {fmt(ret.totalRefundAmount)}
                        </td>

                        {/* Action to view original sale */}
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const sale = sales.find((s) => s.saleId === ret.originalSaleId);
                              if (sale) setSelectedSale(sale);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-zinc-400" />
                            <span>View Sale</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* ─────────────────────────────────────────────────────────────
               TAB 3: EXCHANGE HISTORY TABLE
            ───────────────────────────────────────────────────────────── */
            filteredExchanges.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
                <ArrowRightLeft className="w-8 h-8 text-zinc-600 mb-1" />
                <h3 className="text-sm font-semibold text-zinc-300">No Exchange Records Found</h3>
                <p className="text-xs text-zinc-500 max-w-sm">
                  {allExchanges.length === 0
                    ? "No product exchanges have been processed yet for this shop."
                    : "No exchange events match the current search or date range."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Exchange ID</th>
                      <th className="py-3 px-4">Exchange Date</th>
                      <th className="py-3 px-4">Original Invoice</th>
                      <th className="py-3 px-4">Operator</th>
                      <th className="py-3 px-4">Returned Items</th>
                      <th className="py-3 px-4">Replacement Items</th>
                      <th className="py-3 px-4">Settlement</th>
                      <th className="py-3 px-4 text-right">Differential</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredExchanges.map((exc) => (
                      <tr
                        key={exc.exchangeId}
                        className="hover:bg-zinc-800/30 transition-colors"
                      >
                        {/* Exchange ID */}
                        <td className="py-3 px-4 font-mono font-medium text-zinc-200">
                          {exc.exchangeInvoiceNumber}
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-zinc-300">
                          <div>
                            {new Date(exc.exchangeDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {new Date(exc.exchangeDate).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>

                        {/* Original Invoice */}
                        <td className="py-3 px-4 font-mono text-zinc-200 font-medium">
                          {exc.originalInvoiceNumber}
                        </td>

                        {/* Operator */}
                        <td className="py-3 px-4 text-zinc-300">
                          <div className="font-medium text-zinc-200">{exc.operator.displayName || exc.operator.username}</div>
                          <div className="text-[10px] text-zinc-500 capitalize">{exc.operator.role}</div>
                        </td>

                        {/* Returned Items */}
                        <td className="py-3 px-4 text-zinc-300 max-w-xs">
                          <div className="font-medium text-zinc-200 truncate">
                            {exc.returnedItems.map((it) => `${it.quantity}x ${it.name}`).join(", ")}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            Credit: {fmt(exc.returnedTotal)} •{" "}
                            {exc.returnedItems.filter((it) => it.restock).length > 0 ? "Restocked" : "Not restocked"}
                          </div>
                        </td>

                        {/* Replacement Items */}
                        <td className="py-3 px-4 text-zinc-300 max-w-xs">
                          <div className="font-medium text-zinc-200 truncate">
                            {exc.replacementItems.map((it) => `${it.quantity}x ${it.name}`).join(", ")}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            Cost: {fmt(exc.replacementTotal)}
                          </div>
                        </td>

                        {/* Settlement */}
                        <td className="py-3 px-4">
                          <span
                            className={`capitalize px-2 py-0.5 rounded text-[11px] border font-medium ${
                              exc.settlementType === "customer_paid"
                                ? "bg-amber-950/40 text-amber-300 border-amber-800/40"
                                : exc.settlementType === "store_refunded"
                                ? "bg-sky-950/40 text-sky-300 border-sky-800/40"
                                : "bg-zinc-800 text-zinc-300 border-zinc-700"
                            }`}
                          >
                            {exc.settlementType === "customer_paid"
                              ? `Paid (${exc.settlementMethod})`
                              : exc.settlementType === "store_refunded"
                              ? `Refunded (${exc.settlementMethod})`
                              : "Even Exchange"}
                          </span>
                        </td>

                        {/* Difference Amount */}
                        <td className="py-3 px-4 text-right font-mono font-medium">
                          <span
                            className={
                              exc.difference > 0
                                ? "text-amber-400"
                                : exc.difference < 0
                                ? "text-sky-400"
                                : "text-zinc-300"
                            }
                          >
                            {exc.difference > 0 ? "+" : exc.difference < 0 ? "-" : ""}
                            {fmt(Math.abs(exc.difference))}
                          </span>
                        </td>

                        {/* Action: View Original Sale */}
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const sale = sales.find((s) => s.saleId === exc.originalSaleId);
                              if (sale) setSelectedSale(sale);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-zinc-400" />
                            <span>View Sale</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </main>

      {/* ── Slide-Over / Modal: Full Frozen Snapshot Invoice Detail ── */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-[#0f111a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-zinc-100 text-sm">
                  {selectedSale.invoiceNumber}
                </span>
                {renderStatusBadge(selectedSale.status, selectedSale.hasReturns)}
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Metadata, Line Item Snapshots, Financials & Returns */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5 text-zinc-300">
              {/* Transaction Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-3.5 rounded-xl bg-black/40 border border-zinc-800/80">
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Date & Time</div>
                  <div className="font-medium text-zinc-200 mt-0.5">
                    {new Date(selectedSale.createdAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Operator</div>
                  <div className="font-medium text-zinc-200 mt-0.5">{selectedSale.cashierName}</div>
                  <div className="text-[10px] text-zinc-500 capitalize">{selectedSale.cashierRole}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Customer</div>
                  <div className="font-medium text-zinc-200 mt-0.5">
                    {selectedSale.customer?.name || "Walk-in Guest"}
                  </div>
                  {selectedSale.customer?.phone && (
                    <div className="text-[10px] text-zinc-500 font-mono">{selectedSale.customer.phone}</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-semibold">Payment</div>
                  <div className="flex items-center gap-1 font-medium text-zinc-200 mt-0.5 capitalize">
                    {getPaymentIcon(selectedSale.paymentMethod)}
                    <span>{selectedSale.paymentMethod}</span>
                  </div>
                </div>
              </div>

              {/* Items Snapshot Table */}
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Item Snapshots ({selectedSale.items.length})
                </div>

                <div className="rounded-xl border border-zinc-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-zinc-950/60 text-[10px] uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                        <th className="py-2.5 px-3">Item & Variant</th>
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {selectedSale.items.map((item, idx) => (
                        <tr key={item.productId + idx} className="hover:bg-zinc-800/20">
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-zinc-200">{item.name}</div>
                            {item.variant && (
                              <div className="text-[10px] text-zinc-500">Variant: {item.variant}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                            {item.sku || "N/A"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                            {fmt(item.unitPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-medium text-zinc-200">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-zinc-200">
                            {fmt(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-4 rounded-xl bg-black/40 border border-zinc-800/80 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span className="font-mono">{fmt(selectedSale.subtotal)}</span>
                </div>
                {selectedSale.discountAmount > 0 && (
                  <div className="flex justify-between text-zinc-300">
                    <span>
                      Order Discount{" "}
                      {selectedSale.discountSetting.type === "percentage"
                        ? `(${selectedSale.discountSetting.value}%)`
                        : "(Fixed)"}
                    </span>
                    <span className="font-mono">-{fmt(selectedSale.discountAmount)}</span>
                  </div>
                )}
                {selectedSale.taxAmount > 0 && (
                  <div className="flex justify-between text-zinc-400">
                    <span>Tax ({((selectedSale.taxRate || 0.08) * 100).toFixed(0)}%)</span>
                    <span className="font-mono">{fmt(selectedSale.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-white pt-2 border-t border-zinc-800">
                  <span>Grand Total</span>
                  <span className="font-mono text-zinc-100">{fmt(selectedSale.grandTotal)}</span>
                </div>

                {selectedSale.paymentMethod.toLowerCase() === "cash" && selectedSale.cashReceived !== undefined && (
                  <div className="pt-2 border-t border-dashed border-zinc-800 space-y-1 text-[11px]">
                    <div className="flex justify-between text-zinc-400">
                      <span>Cash Tendered</span>
                      <span className="font-mono">{fmt(selectedSale.cashReceived)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-300">
                      <span>Change Given</span>
                      <span className="font-mono">{fmt(selectedSale.change || 0)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Linked Returns Audit History (if returns exist) */}
              {selectedSale.returns && selectedSale.returns.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Linked Returns ({selectedSale.returns.length})</span>
                    </span>
                    <span className="text-xs font-mono text-zinc-400">
                      Total Refunded: {fmt(selectedSale.totalRefunded || 0)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {selectedSale.returns.map((ret) => (
                      <div
                        key={ret.returnId}
                        className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-zinc-300">{ret.returnId}</span>
                            <span className="text-zinc-500">•</span>
                            <span className="text-zinc-400">
                              {new Date(ret.returnDate).toLocaleString("en-US", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <span className="capitalize px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px]">
                            {ret.refundMethod} Refund
                          </span>
                        </div>

                        {/* Returned Items */}
                        <div className="space-y-1 pt-1 border-t border-zinc-800/60">
                          {ret.items.map((it, i) => (
                            <div key={i} className="flex justify-between text-zinc-400 text-[11px]">
                              <span>
                                {it.quantity}x {it.name} ({it.sku})
                                {it.restock && <span className="ml-1 text-[10px] text-zinc-500">[Restocked]</span>}
                              </span>
                              <span className="font-mono text-zinc-300">{fmt(it.refundAmount)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Return Reason & Operator */}
                        <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-500">
                          <span>Reason: {ret.reason}</span>
                          <span>Operator: @{ret.processedBy.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked Exchanges Audit History (if exchanges exist) */}
              {selectedSale.exchanges && selectedSale.exchanges.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Linked Exchanges ({selectedSale.exchanges.length})</span>
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {selectedSale.exchanges.map((exc) => (
                      <div
                        key={exc.exchangeId}
                        className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-zinc-200">{exc.exchangeInvoiceNumber}</span>
                            <span className="text-zinc-500">•</span>
                            <span className="text-zinc-400">
                              {new Date(exc.exchangeDate).toLocaleString("en-US", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <span
                            className={`capitalize px-2 py-0.5 rounded text-[10px] font-medium border ${
                              exc.settlementType === "customer_paid"
                                ? "bg-amber-950/40 text-amber-300 border-amber-800/40"
                                : exc.settlementType === "store_refunded"
                                ? "bg-sky-950/40 text-sky-300 border-sky-800/40"
                                : "bg-zinc-800 text-zinc-300 border-zinc-700"
                            }`}
                          >
                            {exc.settlementType === "customer_paid"
                              ? `Customer Paid ${fmt(exc.amountSettled)} (${exc.settlementMethod})`
                              : exc.settlementType === "store_refunded"
                              ? `Refunded ${fmt(exc.amountSettled)} (${exc.settlementMethod})`
                              : "Even Exchange"}
                          </span>
                        </div>

                        {/* Returned Items Breakdown */}
                        <div className="pt-1.5 border-t border-zinc-800/60 space-y-1">
                          <div className="text-[10px] uppercase font-semibold text-zinc-500">Returned Items:</div>
                          {exc.returnedItems.map((it, i) => (
                            <div key={i} className="flex justify-between text-zinc-400 text-[11px]">
                              <span>
                                {it.quantity}x {it.name} ({it.sku})
                                {it.restock && <span className="ml-1 text-[10px] text-zinc-500">[Restocked]</span>}
                              </span>
                              <span className="font-mono text-zinc-300">Credit: {fmt(it.refundAmount)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Replacement Items Breakdown */}
                        <div className="pt-1.5 border-t border-zinc-800/60 space-y-1">
                          <div className="text-[10px] uppercase font-semibold text-zinc-500">Replacement Items:</div>
                          {exc.replacementItems.map((it, i) => (
                            <div key={i} className="flex justify-between text-zinc-400 text-[11px]">
                              <span>
                                {it.quantity}x {it.name} ({it.sku})
                              </span>
                              <span className="font-mono text-zinc-300">{fmt(it.subtotal)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Exchange Reason & Operator */}
                        <div className="flex items-center justify-between pt-1.5 text-[10px] text-zinc-500 border-t border-zinc-800/40">
                          <span>Reason: {exc.reason}</span>
                          <span>Operator: @{exc.operator.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-zinc-950/70 border-t border-zinc-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-medium transition-colors cursor-pointer border border-zinc-800"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {/* Process Return Action Button */}
                {canProcessReturns && selectedSale.status !== "refunded" && selectedSale.status !== "voided" && (
                  <button
                    type="button"
                    onClick={() => handleOpenReturnModal(selectedSale)}
                    className="py-2 px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Process Return</span>
                  </button>
                )}

                {/* Process Exchange Action Button */}
                {canProcessReturns && selectedSale.status !== "voided" && (
                  <button
                    type="button"
                    onClick={() => handleOpenExchangeModal(selectedSale)}
                    className="py-2 px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Process Exchange</span>
                  </button>
                )}

                {/* Reprint Customer Receipt */}
                <button
                  type="button"
                  onClick={() => setReceiptSale(selectedSale)}
                  className="py-2 px-4 rounded-xl bg-zinc-200 hover:bg-white text-zinc-900 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5 text-zinc-800" />
                  <span>Reprint Receipt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Process Return Modal ── */}
      {selectedSale && isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-[#11131c] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-zinc-400" />
                  <span>Process Return: {selectedSale.invoiceNumber}</span>
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Select items and quantities to return back to inventory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Error & Success Messages */}
              {returnError && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{returnError}</span>
                </div>
              )}
              {returnSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{returnSuccessMsg}</span>
                </div>
              )}

              {/* Items Return Selector */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Select Items to Return
                </span>

                <div className="space-y-2">
                  {selectedSale.items.map((item) => {
                    const returnable = getReturnableQty(selectedSale, item.productId, item.quantity);
                    const currentSelected = returnItemsState[item.productId]?.quantity || 0;
                    const isRestock = returnItemsState[item.productId]?.restock ?? true;

                    if (returnable <= 0) {
                      return (
                        <div
                          key={item.productId}
                          className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 opacity-60 flex justify-between items-center"
                        >
                          <div>
                            <div className="font-medium text-zinc-300">{item.name}</div>
                            <div className="text-[10px] text-zinc-500">Fully returned already</div>
                          </div>
                          <span className="text-[11px] text-zinc-500 font-mono">0 / {item.quantity}</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.productId}
                        className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-zinc-200">{item.name}</div>
                            <div className="text-[10px] text-zinc-500">
                              Unit Price: {fmt(item.unitPrice)} • Remaining: {returnable} of {item.quantity}
                            </div>
                          </div>

                          {/* Stepper */}
                          <div className="flex items-center gap-1.5 bg-black/40 border border-zinc-800 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => {
                                setReturnItemsState((prev) => ({
                                  ...prev,
                                  [item.productId]: {
                                    ...prev[item.productId],
                                    quantity: Math.max(0, currentSelected - 1),
                                  },
                                }));
                              }}
                              disabled={currentSelected <= 0}
                              className="w-6 h-6 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-mono font-medium text-zinc-200">
                              {currentSelected}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setReturnItemsState((prev) => ({
                                  ...prev,
                                  [item.productId]: {
                                    ...prev[item.productId],
                                    quantity: Math.min(returnable, currentSelected + 1),
                                  },
                                }));
                              }}
                              disabled={currentSelected >= returnable}
                              className="w-6 h-6 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Restock checkbox */}
                        {currentSelected > 0 && (
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[11px] text-zinc-400">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isRestock}
                                onChange={(e) => {
                                  setReturnItemsState((prev) => ({
                                    ...prev,
                                    [item.productId]: {
                                      ...prev[item.productId],
                                      restock: e.target.checked,
                                    },
                                  }));
                                }}
                                className="rounded bg-zinc-950 border-zinc-700 text-zinc-300 focus:ring-0"
                              />
                              <span>Restock back to inventory</span>
                            </label>
                            <span className="font-mono text-zinc-300">
                              Refund: {fmt((item.subtotal / item.quantity) * currentSelected)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Refund Method & Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                    Refund Method
                  </label>
                  <select
                    value={returnRefundMethod}
                    onChange={(e) => setReturnRefundMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-300 focus:border-zinc-600 focus:outline-none cursor-pointer"
                  >
                    <option value="cash" className="bg-zinc-900">Cash</option>
                    <option value="card" className="bg-zinc-900">Card Refund</option>
                    <option value="store-credit" className="bg-zinc-900">Store Credit</option>
                    <option value="original" className="bg-zinc-900">Original Payment Method</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                    Return Reason
                  </label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="e.g. Defective, change of mind"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-300 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-zinc-950/70 border-t border-zinc-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                disabled={isProcessingReturn}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-medium cursor-pointer border border-zinc-800 disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={isProcessingReturn}
                className="py-2 px-5 rounded-xl bg-zinc-200 hover:bg-white text-zinc-900 text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 shadow-sm flex items-center gap-1.5"
              >
                {isProcessingReturn ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-900 border-t-transparent animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Confirm Return</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Exchange Modal ── */}
      {selectedSale && isExchangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-[#11131c] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-zinc-400" />
                  <span>Product Exchange: {selectedSale.invoiceNumber}</span>
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Select returned items and choose replacement products. The system automatically computes the differential.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExchangeModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs">
              {/* Error & Success Messages */}
              {exchangeError && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{exchangeError}</span>
                </div>
              )}
              {exchangeSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{exchangeSuccessMsg}</span>
                </div>
              )}

              {/* ── STEP 1: Select Items to Return ── */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[10px]">1</span>
                    <span>Select Items to Return</span>
                  </span>
                  <span className="font-mono text-xs text-zinc-300 font-medium">
                    Credit: {fmt(exchangeReturnedCredit)}
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedSale.items.map((item) => {
                    const returnable = getReturnableQty(selectedSale, item.productId, item.quantity);
                    const currentSelected = exchangeReturnedItemsState[item.productId]?.quantity || 0;
                    const isRestock = exchangeReturnedItemsState[item.productId]?.restock ?? true;

                    if (returnable <= 0) {
                      return (
                        <div
                          key={item.productId}
                          className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 opacity-60 flex justify-between items-center"
                        >
                          <div>
                            <div className="font-medium text-zinc-300">{item.name}</div>
                            <div className="text-[10px] text-zinc-500">Fully returned/exchanged already</div>
                          </div>
                          <span className="text-[11px] text-zinc-500 font-mono">0 / {item.quantity}</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.productId}
                        className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-zinc-200">{item.name}</div>
                            <div className="text-[10px] text-zinc-500">
                              Unit Price: {fmt(item.unitPrice)} • Returnable: {returnable} of {item.quantity}
                            </div>
                          </div>

                          {/* Stepper */}
                          <div className="flex items-center gap-1.5 bg-black/40 border border-zinc-800 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => {
                                setExchangeReturnedItemsState((prev) => ({
                                  ...prev,
                                  [item.productId]: {
                                    ...prev[item.productId],
                                    quantity: Math.max(0, currentSelected - 1),
                                  },
                                }));
                              }}
                              disabled={currentSelected <= 0}
                              className="w-6 h-6 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-mono font-medium text-zinc-200">
                              {currentSelected}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setExchangeReturnedItemsState((prev) => ({
                                  ...prev,
                                  [item.productId]: {
                                    ...prev[item.productId],
                                    quantity: Math.min(returnable, currentSelected + 1),
                                  },
                                }));
                              }}
                              disabled={currentSelected >= returnable}
                              className="w-6 h-6 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Restock checkbox */}
                        {currentSelected > 0 && (
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[11px] text-zinc-400">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isRestock}
                                onChange={(e) => {
                                  setExchangeReturnedItemsState((prev) => ({
                                    ...prev,
                                    [item.productId]: {
                                      ...prev[item.productId],
                                      restock: e.target.checked,
                                    },
                                  }));
                                }}
                                className="rounded bg-zinc-950 border-zinc-700 text-zinc-300 focus:ring-0"
                              />
                              <span>Restock returned unit back to inventory</span>
                            </label>
                            <span className="font-mono text-zinc-300">
                              Credit: {fmt((item.subtotal / item.quantity) * currentSelected)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── STEP 2: Choose Replacement Items ── */}
              <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[10px]">2</span>
                    <span>Choose Replacement Catalog Items</span>
                  </span>
                  <span className="font-mono text-xs text-zinc-300 font-medium">
                    Total: {fmt(exchangeReplacementTotal)}
                  </span>
                </div>

                {/* Catalog Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={exchangeProductSearch}
                    onChange={(e) => setExchangeProductSearch(e.target.value)}
                    placeholder="Search replacement product by name, SKU, or barcode..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-zinc-800 focus:border-zinc-600 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
                  />
                  {isLoadingCatalog && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>

                {/* Matching Catalog Dropdown Results */}
                {exchangeProductSearch.trim() && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 divide-y divide-zinc-800/80 overflow-hidden shadow-lg max-h-48 overflow-y-auto">
                    {matchingCatalogProducts.length === 0 ? (
                      <div className="p-3 text-center text-zinc-500 text-[11px]">
                        No catalog items match &quot;{exchangeProductSearch}&quot;
                      </div>
                    ) : (
                      matchingCatalogProducts.map((p) => (
                        <div
                          key={p.id}
                          className="p-2.5 px-3 flex items-center justify-between hover:bg-zinc-900/60 transition-colors"
                        >
                          <div>
                            <div className="font-medium text-zinc-200 text-xs">{p.name}</div>
                            <div className="text-[10px] text-zinc-500">
                              SKU: {p.sku || "N/A"} • Stock: {p.stockQuantity ?? 0}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-semibold text-zinc-200">
                              {fmt(p.sellingPrice)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAddReplacementProduct(p)}
                              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer border border-zinc-700 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Selected Replacement Items List */}
                {exchangeReplacementItems.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800 text-center text-zinc-500 text-[11px]">
                    No replacement items selected yet. Search the catalog above to add items.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {exchangeReplacementItems.map((rep) => (
                      <div
                        key={rep.productId}
                        className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-zinc-200 truncate">{rep.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {rep.sku ? `SKU: ${rep.sku} • ` : ""}Unit: {fmt(rep.unitPrice)}
                          </div>
                        </div>

                        {/* Stepper */}
                        <div className="flex items-center gap-1.5 bg-black/40 border border-zinc-800 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateReplacementQty(rep.productId, -1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono font-medium text-zinc-200">
                            {rep.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateReplacementQty(rep.productId, 1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right w-24">
                          <div className="font-mono font-medium text-zinc-200">
                            {fmt(rep.subtotal ?? rep.unitPrice * rep.quantity)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveReplacementItem(rep.productId)}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── STEP 3: Differential & Settlement Calculation ── */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[10px]">3</span>
                  <span>Price Differential & Settlement</span>
                </span>

                {/* Calculation Breakdown Card */}
                <div className="p-4 rounded-xl bg-black/50 border border-zinc-800 space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-400">
                    <span>Total Replacement Items Cost</span>
                    <span className="font-mono">{fmt(exchangeReplacementTotal)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Less: Return Credit from Original Sale</span>
                    <span className="font-mono text-zinc-300">-{fmt(exchangeReturnedCredit)}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-sm font-semibold">
                    <span className="text-zinc-200">
                      {exchangeDifference > 0
                        ? "Customer Pays Balance:"
                        : exchangeDifference < 0
                        ? "Store Refunds Customer:"
                        : "Even Exchange (No Differential):"}
                    </span>
                    <span
                      className={`font-mono text-base ${
                        exchangeDifference > 0
                          ? "text-amber-400"
                          : exchangeDifference < 0
                          ? "text-sky-400"
                          : "text-zinc-200"
                      }`}
                    >
                      {fmt(Math.abs(exchangeDifference))}
                    </span>
                  </div>
                </div>

                {/* Settlement Method & Reason Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                      {exchangeDifference > 0 ? "Payment Method (Customer)" : "Refund / Credit Method"}
                    </label>
                    <select
                      value={exchangeSettlementMethod}
                      onChange={(e) => setExchangeSettlementMethod(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none cursor-pointer"
                    >
                      <option value="cash" className="bg-zinc-900">Cash</option>
                      <option value="card" className="bg-zinc-900">Card</option>
                      <option value="store-credit" className="bg-zinc-900">Store Credit</option>
                      <option value="bank-transfer" className="bg-zinc-900">Bank Transfer</option>
                      <option value="mobile-qr" className="bg-zinc-900">Mobile / QR</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                      Exchange Reason / Notes
                    </label>
                    <input
                      type="text"
                      value={exchangeReason}
                      onChange={(e) => setExchangeReason(e.target.value)}
                      placeholder="e.g. Size swap, defective cover, color upgrade"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-zinc-950/70 border-t border-zinc-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsExchangeModalOpen(false)}
                disabled={isProcessingExchange}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-medium cursor-pointer border border-zinc-800 disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmExchange}
                disabled={
                  isProcessingExchange ||
                  exchangeReturnedCredit <= 0 ||
                  exchangeReplacementItems.length === 0
                }
                className="py-2 px-5 rounded-xl bg-zinc-200 hover:bg-white text-zinc-900 text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 shadow-sm flex items-center gap-1.5"
              >
                {isProcessingExchange ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-900 border-t-transparent animate-spin" />
                    <span>Processing Exchange...</span>
                  </>
                ) : (
                  <span>
                    Confirm Exchange
                    {exchangeDifference !== 0
                      ? ` (${exchangeDifference > 0 ? "Collect " : "Refund "}${fmt(Math.abs(exchangeDifference))})`
                      : " (Even)"}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Sale Modal ── */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#11131c] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-zinc-400" />
                  <span>Edit Invoice: {editingSale.invoiceNumber}</span>
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Update customer information, tender notes, or payment reference.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={editCustomerName}
                  onChange={(e) => setEditCustomerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                    Customer Phone
                  </label>
                  <input
                    type="text"
                    value={editCustomerPhone}
                    onChange={(e) => setEditCustomerPhone(e.target.value)}
                    placeholder="+94 77 123 4567"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none cursor-pointer"
                  >
                    <option value="cash" className="bg-zinc-900">Cash</option>
                    <option value="card" className="bg-zinc-900">Card</option>
                    <option value="bank-transfer" className="bg-zinc-900">Bank Transfer</option>
                    <option value="mobile-qr" className="bg-zinc-900">Mobile / QR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                  Invoice Notes
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Additional order instructions or cashier notes..."
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="p-4 bg-zinc-950/70 border-t border-zinc-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-medium cursor-pointer border border-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="py-2 px-5 rounded-xl bg-zinc-200 hover:bg-white text-zinc-900 text-xs font-semibold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isSavingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete / Void Confirmation Modal ── */}
      {deletingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#11131c] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-100">
                  {deleteMode === "void" ? "Void Sale Transaction" : "Delete Sale Record"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingSale(null)}
                className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              {deleteError && (
                <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="text-zinc-300">
                You are about to action invoice{" "}
                <strong className="text-zinc-100 font-mono">{deletingSale.invoiceNumber}</strong> (Total:{" "}
                <span className="font-mono text-zinc-100">{fmt(deletingSale.grandTotal)}</span>).
              </p>

              {/* Action Mode Choice */}
              <div className="p-1 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDeleteMode("void")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    deleteMode === "void" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Void (Audit Preserved)
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteMode("delete")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    deleteMode === "delete" ? "bg-rose-950/60 text-rose-300 border border-rose-800/40" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Hard Delete
                </button>
              </div>

              {deleteMode === "void" ? (
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                    Void Reason
                  </label>
                  <input
                    type="text"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="e.g. Accidental transaction, cashier test"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-rose-300 text-[11px] leading-relaxed">
                  Warning: Hard deletion permanently removes this transaction from cloud records.
                </div>
              )}

              {/* Restock Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1 text-zinc-300">
                <input
                  type="checkbox"
                  checked={deleteRestoreStock}
                  onChange={(e) => setDeleteRestoreStock(e.target.checked)}
                  className="rounded bg-zinc-950 border-zinc-700 text-zinc-300 focus:ring-0"
                />
                <span>Automatically return sold items back to catalog inventory</span>
              </label>
            </div>

            <div className="p-4 bg-zinc-950/70 border-t border-zinc-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setDeletingSale(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-medium cursor-pointer border border-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="py-2 px-5 rounded-xl bg-zinc-200 hover:bg-white text-zinc-900 text-xs font-semibold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isDeleting ? "Processing..." : deleteMode === "void" ? "Confirm Void" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reprint Customer Receipt Modal ── */}
      {receiptSale && (
        <ReceiptModal
          isOpen={Boolean(receiptSale)}
          onClose={() => setReceiptSale(null)}
          onNewSale={() => setReceiptSale(null)}
          persistedSale={receiptSale}
        />
      )}
    </div>
  );
}
