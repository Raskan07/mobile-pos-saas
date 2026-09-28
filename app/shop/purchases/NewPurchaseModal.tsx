"use client";

/**
 * app/shop/purchases/NewPurchaseModal.tsx
 *
 * Modal for creating a new supplier purchase order.
 * Features:
 * - Supplier selection with auto-filled phone/details or ad-hoc manual entry
 * - Product selection that automatically populates Unit Cost (from product/variant costPrice) and Quantity
 * - Interactive Installment Schedule: user can choose and modify each installment's due date (<input type="date">)
 *   and amount independently, add/remove installments, or evenly rebalance
 * - Decoupled initial status setup (Order vs Stock vs Payment)
 * - Flexible payment models: Unpaid Credit, Full Payment, Partial Upfront, Cheque, and Custom Installments
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Package,
  Plus,
  Trash2,
  Calendar,
  Building2,
  CreditCard,
  Banknote,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  DollarSign,
  Truck,
  ArrowRight,
  RotateCcw,
  Check,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { getSuppliers, getProducts } from "@/lib/services/catalogService";
import { createPurchase } from "@/lib/services/purchaseService";
import { Supplier, ProductItem, ProductVariant } from "@/lib/types/catalog";
import {
  CreatePurchaseInput,
  CreatePurchaseItemInput,
  CreatePurchaseInstallmentInput,
  PaymentMethod,
} from "@/lib/types/purchase";

interface NewPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewPurchaseModal({
  isOpen,
  onClose,
  onCreated,
}: NewPurchaseModalProps) {
  const { shop, user } = useShopAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Supplier state
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [customSupplierName, setCustomSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [receiveStockNow, setReceiveStockNow] = useState(false);

  // Line items state
  const [items, setItems] = useState<
    (CreatePurchaseItemInput & { tempId: string; unit?: string })[]
  >([]);

  // Selected product picker state (for choosing product & variant)
  const [pickerProductId, setPickerProductId] = useState("");
  const [pickerVariantId, setPickerVariantId] = useState("");

  // Payment Setup state
  const [paymentType, setPaymentType] = useState<
    "UNPAID" | "FULL" | "PARTIAL" | "CHEQUE"
  >("UNPAID");
  const [upfrontAmount, setUpfrontAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");

  // Cheque fields
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Interactive Installment plan state
  const [enableInstallments, setEnableInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState<number>(2);
  const [installments, setInstallments] = useState<
    CreatePurchaseInstallmentInput[]
  >([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Load suppliers and catalog items
  useEffect(() => {
    if (!isOpen || !shop?.shopId) return;

    setLoadingCatalog(true);
    setErrorMsg("");

    Promise.all([getSuppliers(shop.shopId), getProducts(shop.shopId)])
      .then(([sups, prods]) => {
        setSuppliers(sups);
        setCatalogProducts(prods);
      })
      .catch((err) => {
        console.error("[NewPurchaseModal] Catalog loading error:", err);
      })
      .finally(() => {
        setLoadingCatalog(false);
      });
  }, [isOpen, shop?.shopId]);

  // Financial calculations
  const subtotal = items.reduce(
    (sum, i) => sum + i.orderedQuantity * i.unitCost,
    0
  );
  const grandTotal = Math.max(0, subtotal + shippingCost - discountAmount);

  // Remaining balance after upfront payment
  const remainingBalance = Math.max(
    0,
    grandTotal - (paymentType === "PARTIAL" || paymentType === "CHEQUE" ? upfrontAmount : 0)
  );

  // ---------------------------------------------------------------------------
  // 1. Line Item Selection with Automatic Unit Cost and Quantity
  // ---------------------------------------------------------------------------
  const handleAddItemFromPicker = (productId: string, variantId?: string) => {
    if (!productId) return;
    const prod = catalogProducts.find((p) => p.id === productId);
    if (!prod) return;

    let variant: ProductVariant | undefined;
    if (variantId && prod.variants) {
      variant = prod.variants.find((v) => v.id === variantId);
    }

    // Automatically get unit cost from product or variant costPrice
    const unitCost =
      variant && typeof variant.costPrice === "number" && variant.costPrice > 0
        ? variant.costPrice
        : typeof prod.costPrice === "number"
        ? prod.costPrice
        : 0;

    // Check if item already exists
    const matchIndex = items.findIndex(
      (i) =>
        i.productId === productId &&
        (!variantId || i.variantId === variantId)
    );

    if (matchIndex >= 0) {
      // Increment existing item quantity automatically
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === matchIndex
            ? { ...item, orderedQuantity: item.orderedQuantity + 1 }
            : item
        )
      );
    } else {
      // Add new item with automatically populated cost and default quantity 1
      const newItem: CreatePurchaseItemInput & { tempId: string; unit?: string } = {
        tempId: `item_${Date.now()}_${Math.random()}`,
        productId: prod.id,
        variantId: variant?.id || "",
        sku: variant?.sku || prod.sku,
        name: prod.name,
        variantName: variant ? [variant.size, variant.color].filter(Boolean).join(" - ") || variant.sku : "",
        barcode: variant?.barcode || prod.barcode || "",
        orderedQuantity: 1, // Default quantity automatically set
        unitCost,          // Unit cost automatically retrieved from catalog
        unit: prod.unit || "pcs",
      };
      setItems((prev) => [...prev, newItem]);
    }

    // Reset picker
    setPickerProductId("");
    setPickerVariantId("");
  };

  const handleRemoveItem = (tempId: string) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleUpdateItem = (
    tempId: string,
    field: "orderedQuantity" | "unitCost",
    value: number
  ) => {
    setItems((prev) =>
      prev.map((i) =>
        i.tempId === tempId ? { ...i, [field]: Math.max(0, value) } : i
      )
    );
  };

  // ---------------------------------------------------------------------------
  // 2. Interactive Installment Schedule (User Can Modify Due Dates and Amounts)
  // ---------------------------------------------------------------------------
  const generateDefaultInstallments = useCallback(
    (count: number, balance: number) => {
      const num = Math.max(1, count);
      const perInstallment = Math.round((balance / num) * 100) / 100;
      const generated: CreatePurchaseInstallmentInput[] = [];

      const now = new Date();
      for (let i = 1; i <= num; i++) {
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + i * 30); // default 30-day interval

        const amt =
          i === num
            ? Math.max(0, balance - perInstallment * (num - 1))
            : perInstallment;

        generated.push({
          installmentNumber: i,
          dueDate: dueDate.getTime(),
          amountDue: amt,
          notes: `Installment ${i} of ${num}`,
        });
      }
      return generated;
    },
    []
  );

  // Initialize installments when first toggled on
  useEffect(() => {
    if (enableInstallments && installments.length === 0 && remainingBalance > 0) {
      setInstallments(generateDefaultInstallments(installmentCount, remainingBalance));
    }
  }, [enableInstallments, installments.length, remainingBalance, installmentCount, generateDefaultInstallments]);

  // Handler: User modifies an installment's due date
  const handleUpdateInstallmentDate = (index: number, dateString: string) => {
    if (!dateString) return;
    const parsedTime = new Date(`${dateString}T00:00:00`).getTime();
    setInstallments((prev) =>
      prev.map((inst, i) =>
        i === index ? { ...inst, dueDate: parsedTime } : inst
      )
    );
  };

  // Handler: User modifies an installment's amount
  const handleUpdateInstallmentAmount = (index: number, amount: number) => {
    setInstallments((prev) =>
      prev.map((inst, i) =>
        i === index ? { ...inst, amountDue: Math.max(0, amount) } : inst
      )
    );
  };

  // Handler: User adds another installment
  const handleAddInstallment = () => {
    const nextNumber = installments.length + 1;
    const lastDate =
      installments.length > 0
        ? new Date(installments[installments.length - 1].dueDate)
        : new Date();
    lastDate.setDate(lastDate.getDate() + 30);

    setInstallments((prev) => [
      ...prev,
      {
        installmentNumber: nextNumber,
        dueDate: lastDate.getTime(),
        amountDue: 0,
        notes: `Installment ${nextNumber}`,
      },
    ]);
    setInstallmentCount(nextNumber);
  };

  // Handler: User removes an installment
  const handleRemoveInstallment = (index: number) => {
    setInstallments((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      // Renumber
      return filtered.map((inst, idx) => ({
        ...inst,
        installmentNumber: idx + 1,
        notes: `Installment ${idx + 1}`,
      }));
    });
    setInstallmentCount((c) => Math.max(1, c - 1));
  };

  // Handler: Evenly rebalance installments to match remaining balance
  const handleRebalanceInstallments = () => {
    if (installments.length === 0) return;
    setInstallments(generateDefaultInstallments(installments.length, remainingBalance));
  };

  // Total amount currently scheduled across installments
  const totalScheduledInstallments = installments.reduce(
    (sum, i) => sum + i.amountDue,
    0
  );
  const installmentDifference = remainingBalance - totalScheduledInstallments;

  // ---------------------------------------------------------------------------
  // 3. Form Submission
  // ---------------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !user) return;

    setErrorMsg("");

    let supplierName = customSupplierName.trim();
    let supplierId = selectedSupplierId;
    let resolvedPhone = supplierPhone;

    if (selectedSupplierId) {
      const found = suppliers.find((s) => s.id === selectedSupplierId);
      if (found) {
        supplierName = found.name;
        resolvedPhone = found.phone || supplierPhone;
      }
    }

    if (!supplierName) {
      setErrorMsg("Please select or specify a supplier name.");
      return;
    }

    if (items.length === 0) {
      setErrorMsg("Please add at least one line item to this purchase order.");
      return;
    }

    // Determine initial payment
    let initialPayment: CreatePurchaseInput["initialPayment"] | undefined;
    if (paymentType === "FULL") {
      initialPayment = {
        amount: grandTotal,
        paymentMethod,
        reference: paymentReference,
        notes: "Full payment at purchase creation",
      };
    } else if (paymentType === "PARTIAL" && upfrontAmount > 0) {
      initialPayment = {
        amount: upfrontAmount,
        paymentMethod,
        reference: paymentReference,
        notes: "Partial upfront deposit",
      };
    } else if (paymentType === "CHEQUE") {
      if (!chequeNumber.trim() || !bankName.trim()) {
        setErrorMsg("Please provide both Cheque Number and Bank Name.");
        return;
      }
      initialPayment = {
        amount: upfrontAmount > 0 ? upfrontAmount : grandTotal,
        paymentMethod: "CHEQUE",
        reference: paymentReference || `Cheque #${chequeNumber}`,
        notes: `Cheque issued for ${bankName}`,
        cheque: {
          chequeNumber: chequeNumber.trim(),
          bankName: bankName.trim(),
          chequeDate: new Date(chequeDate).getTime(),
        },
      };
    }

    const payload: CreatePurchaseInput = {
      supplierId: supplierId || `adhoc_${Date.now()}`,
      supplierName,
      supplierPhone: resolvedPhone,
      supplierInvoiceNumber: supplierInvoiceNumber.trim(),
      ...(expectedDeliveryDate && !isNaN(new Date(expectedDeliveryDate).getTime())
        ? { expectedDeliveryDate: new Date(expectedDeliveryDate).getTime() }
        : {}),
      items: items.map(({ tempId, unit, ...rest }) => rest),
      shippingCost,
      discountAmount,
      notes,
      receiveStockNow,
      ...(initialPayment ? { initialPayment } : {}),
      ...(enableInstallments && installments.length > 0 ? { installments } : {}),
    };

    setIsSubmitting(true);

    try {
      await createPurchase(
        shop.shopId,
        payload,
        {
          userId: user.uid,
          username: user.username,
          role: user.role,
          displayName: user.displayName || user.username,
        }
      );

      onCreated();
      onClose();
    } catch (err: unknown) {
      console.error("[NewPurchaseModal] Creation error:", err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to create purchase order. Please check your network."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedPickerProduct = catalogProducts.find((p) => p.id === pickerProductId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl my-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl text-zinc-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header (Clean, sleek gray secondary styling) */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-300">
              <Package className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Record Supplier Purchase
              </h2>
              <span className="text-[11px] text-zinc-500 font-mono">
                {shop?.shopName || "POS Store"} • Real-world purchase & stock entry
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-5 text-xs font-sans"
        >
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* 1. SUPPLIER & REFERENCE                            */}
          {/* ══════════════════════════════════════════════════ */}
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Supplier & Reference
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Supplier Selector */}
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Select Existing Supplier
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => {
                    const supId = e.target.value;
                    setSelectedSupplierId(supId);
                    if (supId) {
                      setCustomSupplierName("");
                      const found = suppliers.find((s) => s.id === supId);
                      if (found) {
                        setSupplierPhone(found.phone || "");
                      }
                    }
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                >
                  <option value="">— Or specify new supplier below —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Or Ad-hoc Supplier */}
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Or Supplier Name (Manual Entry)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Hardware Supplies"
                  value={customSupplierName}
                  onChange={(e) => {
                    setCustomSupplierName(e.target.value);
                    if (e.target.value) setSelectedSupplierId("");
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>

              {/* Supplier Phone */}
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Supplier Contact / Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. 077 123 4567"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              {/* Supplier Invoice / Bill # */}
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Supplier Invoice / Bill # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SUP-INV-9821"
                  value={supplierInvoiceNumber}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>
            </div>

            {/* Delivery Date & Stock Now Toggle */}
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400">Expected Delivery:</span>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                />
              </div>

              {/* Immediate Stock Receipt Toggle */}
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={receiveStockNow}
                  onChange={(e) => setReceiveStockNow(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                />
                <span className="font-medium">
                  Goods already received (increment catalog stock immediately)
                </span>
              </label>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════ */}
          {/* 2. LINE ITEMS (AUTOMATIC UNIT COST & QUANTITY)     */}
          {/* ══════════════════════════════════════════════════ */}
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Purchase Order Line Items ({items.length})
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                Unit Cost & QTY auto-load upon product selection
              </span>
            </div>

            {/* Product Picker Toolbar */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Product Select */}
              <div className="flex-1 min-w-[200px]">
                <select
                  value={pickerProductId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setPickerProductId(pid);
                    setPickerVariantId("");
                    if (pid) {
                      const p = catalogProducts.find((item) => item.id === pid);
                      // If no variants, add immediately with auto-populated cost and QTY!
                      if (p && (!p.hasVariants || !p.variants || p.variants.length === 0)) {
                        handleAddItemFromPicker(pid);
                      }
                    }
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                >
                  <option value="">+ Choose Product to Add (Auto-fetches Unit Cost & QTY)...</option>
                  {catalogProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (#{p.sku}) — Cost: LKR {p.costPrice || 0} | In Stock: {p.stockQuantity || 0} {p.unit || "pcs"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Variant Select if product has variants */}
              {selectedPickerProduct?.hasVariants &&
                selectedPickerProduct.variants &&
                selectedPickerProduct.variants.length > 0 && (
                  <div className="min-w-[160px]">
                    <select
                      value={pickerVariantId}
                      onChange={(e) => setPickerVariantId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                    >
                      <option value="">Select Variant...</option>
                      {selectedPickerProduct.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {[v.size, v.color].filter(Boolean).join(" - ") || v.sku} (Cost: LKR {v.costPrice || selectedPickerProduct.costPrice || 0})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {/* Add Button if variant required */}
              {selectedPickerProduct?.hasVariants && (
                <button
                  type="button"
                  onClick={() => handleAddItemFromPicker(pickerProductId, pickerVariantId)}
                  disabled={!pickerProductId}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium font-mono text-xs cursor-pointer flex-shrink-0 disabled:opacity-50"
                >
                  Add Item
                </button>
              )}
            </div>

            {/* Items Table */}
            {items.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg font-mono">
                No items added yet. Choose a product above to auto-populate unit cost and quantity.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.tempId}
                    className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-zinc-200 truncate">
                          {item.name}
                        </span>
                        {item.variantName && (
                          <span className="text-[10px] text-zinc-400 px-1.5 py-0.2 rounded bg-zinc-800 font-mono">
                            {item.variantName}
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500 font-mono">
                          #{item.sku}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Auto-cost from catalog: LKR {item.unitCost.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {/* Qty Input (Auto-initialized to 1, user can modify) */}
                      <div>
                        <span className="text-[9.5px] text-zinc-500 block mb-0.5">
                          QTY
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={item.orderedQuantity}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.tempId,
                              "orderedQuantity",
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-16 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs font-mono text-zinc-200 text-center focus:border-zinc-600"
                        />
                      </div>

                      {/* Unit Cost Input (Auto-retrieved from product, user can modify) */}
                      <div>
                        <span className="text-[9.5px] text-zinc-500 block mb-0.5">
                          Unit Cost (LKR)
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitCost}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.tempId,
                              "unitCost",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-24 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs font-mono text-zinc-200 text-right focus:border-zinc-600"
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="text-right min-w-[70px]">
                        <span className="text-[9.5px] text-zinc-500 block mb-0.5">
                          Subtotal
                        </span>
                        <span className="font-mono font-bold text-zinc-200">
                          {(item.orderedQuantity * item.unitCost).toFixed(2)}
                        </span>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.tempId)}
                        className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                        title="Remove Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Additional Cost Adjustments (Shipping & Discount) */}
            <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
              <div>
                <span className="text-[10px] text-zinc-500 block">Subtotal</span>
                <span className="font-mono text-xs text-zinc-300">
                  LKR {subtotal.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Shipping</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingCost || ""}
                  onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs font-mono text-right text-zinc-200"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount || ""}
                  onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs font-mono text-right text-zinc-200"
                />
              </div>
              <div className="bg-zinc-900/80 p-1.5 rounded-lg border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block font-semibold">
                  Grand Total
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  LKR {grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════ */}
          {/* 3. PAYMENT & INTERACTIVE INSTALLMENT TERMS         */}
          {/* ══════════════════════════════════════════════════ */}
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Payment & Settlement Terms
            </span>

            {/* Payment Type Selection */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "UNPAID", label: "Credit (Unpaid)" },
                { id: "FULL", label: "Full Payment" },
                { id: "PARTIAL", label: "Partial Deposit" },
                { id: "CHEQUE", label: "Cheque Payment" },
              ].map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setPaymentType(t.id as any)}
                  className={`py-2 px-2 rounded-lg text-xs font-medium text-center transition-colors cursor-pointer border ${
                    paymentType === t.id
                      ? "bg-zinc-800 text-white border-zinc-700 shadow"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800/60"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Payment Details when not UNPAID */}
            {paymentType !== "UNPAID" && (
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Amount */}
                  <div>
                    <label className="text-[10.5px] text-zinc-400 block mb-1">
                      {paymentType === "FULL" ? "Total Paid" : "Paid Amount (LKR)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentType === "FULL" ? grandTotal : upfrontAmount}
                      disabled={paymentType === "FULL"}
                      onChange={(e) => setUpfrontAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 font-mono"
                    />
                  </div>

                  {/* Method */}
                  <div>
                    <label className="text-[10.5px] text-zinc-400 block mb-1">
                      Payment Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      disabled={paymentType === "CHEQUE"}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 font-mono"
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CARD">Card</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>

                  {/* Reference */}
                  <div>
                    <label className="text-[10.5px] text-zinc-400 block mb-1">
                      Reference / Slip #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TX-9821 or Bank Slip"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>

                {/* Cheque Specific Fields */}
                {paymentType === "CHEQUE" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
                    <div>
                      <label className="text-[10.5px] text-zinc-400 block mb-1">
                        Cheque Number *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 000492"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] text-zinc-400 block mb-1">
                        Bank Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Commercial Bank"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] text-zinc-400 block mb-1">
                        Cheque Date (Post-dated)
                      </label>
                      <input
                        type="date"
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Interactive Installment Schedule Section ── */}
            <div className="pt-2 border-t border-zinc-800/80">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableInstallments}
                  onChange={(e) => setEnableInstallments(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-0"
                />
                <span className="font-medium">
                  Set up remaining balance in customizable scheduled installments
                </span>
              </label>

              {enableInstallments && (
                <div className="mt-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  {/* Controls Header */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400">Installments:</span>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={installmentCount}
                        onChange={(e) => {
                          const cnt = Math.max(1, parseInt(e.target.value) || 1);
                          setInstallmentCount(cnt);
                          setInstallments(generateDefaultInstallments(cnt, remainingBalance));
                        }}
                        className="w-14 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 text-center"
                      />
                      <button
                        type="button"
                        onClick={handleRebalanceInstallments}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10.5px] font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        title="Evenly rebalance installment amounts"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Evenly Split</span>
                      </button>
                    </div>

                    {/* Balance Check Indicator */}
                    <div className="flex items-center gap-1.5 text-[10.5px] font-mono">
                      <span className="text-zinc-500">
                        Remaining: LKR {remainingBalance.toFixed(2)} | Scheduled: LKR {totalScheduledInstallments.toFixed(2)}
                      </span>
                      {Math.abs(installmentDifference) < 0.01 ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <Check className="w-3 h-3" /> Matched
                        </span>
                      ) : (
                        <span className="text-amber-400 font-bold">
                          ({installmentDifference > 0 ? `LKR ${installmentDifference.toFixed(2)} unallocated` : `LKR ${Math.abs(installmentDifference).toFixed(2)} excess`})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Installments Rows: User Can Modify Due Date & Amount */}
                  <div className="space-y-2">
                    {installments.map((inst, index) => {
                      // Format timestamp to YYYY-MM-DD for date input
                      const dateValue = new Date(inst.dueDate).toISOString().slice(0, 10);

                      return (
                        <div
                          key={inst.installmentNumber}
                          className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px] font-bold flex items-center justify-center">
                              #{inst.installmentNumber}
                            </span>
                            <span className="text-xs font-semibold text-zinc-300 font-mono">
                              Installment {inst.installmentNumber}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 flex-1 justify-end">
                            {/* User interactive due date picker */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-zinc-500">Due Date:</span>
                              <input
                                type="date"
                                value={dateValue}
                                onChange={(e) =>
                                  handleUpdateInstallmentDate(index, e.target.value)
                                }
                                className="bg-zinc-950 border border-zinc-700/80 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-500 cursor-pointer"
                              />
                            </div>

                            {/* User interactive amount input */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-zinc-500">Amount:</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={inst.amountDue}
                                onChange={(e) =>
                                  handleUpdateInstallmentAmount(
                                    index,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-24 bg-zinc-950 border border-zinc-700/80 rounded px-2 py-1 text-xs font-mono text-right text-zinc-100 focus:outline-none focus:border-zinc-500"
                              />
                            </div>

                            {/* Delete installment */}
                            {installments.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveInstallment(index)}
                                className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                                title="Remove Installment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Installment Button */}
                  <div className="pt-1 flex justify-start">
                    <button
                      type="button"
                      onClick={handleAddInstallment}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono border border-zinc-800 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Installment</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">
              Purchase Notes & Terms (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Agreed 30-day payment term, supplier invoice attached."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-bold shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Creating Purchase..." : "Confirm & Create PO"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
