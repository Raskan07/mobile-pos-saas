"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  ScanLine,
  ClipboardList,
  Warehouse,
  BarChart3,
  Truck,
  BookOpen,
  BarChart2,
  FileText,
  Receipt,
  LayoutDashboard,
  Users,
  Bell,
  Settings,
  CreditCard,
} from "lucide-react";

interface NavigationViewProps {
  onClose: () => void;
  shopName?: string;
  shopId?: string;
  cashierName?: string;
  cashierRole?: string;
  activeBranchName?: string;
  cartCount?: number;
}

const NAV_ITEMS = [
  { id: "products",       label: "Products",           icon: Package },
  { id: "barcode",        label: "Barcode",            icon: ScanLine },
  { id: "purchases",      label: "Purchase History",   icon: ClipboardList },
  { id: "stock",          label: "Stock Management",   icon: Warehouse },
  { id: "stock_analysis", label: "Stock Analysis",     icon: BarChart3 },
  { id: "supply",         label: "Supply Chain",       icon: Truck },
  { id: "ledger",         label: "Sales Ledger",       icon: BookOpen },
  { id: "analytics",      label: "Sales Analytics",    icon: BarChart2 },
  { id: "financial",      label: "Financial Reports",  icon: FileText },
  { id: "expenditures",   label: "Expenditures",       icon: Receipt },
  { id: "operational",    label: "Operational Summary",icon: LayoutDashboard },
  { id: "customers",      label: "Customers",          icon: Users },
  { id: "notifications",  label: "Notifications",      icon: Bell },
  { id: "settings",       label: "Settings",           icon: Settings },
  { id: "installments",   label: "Installment Sales",  icon: CreditCard },
];

export default function NavigationView({ onClose }: NavigationViewProps) {
  const router = useRouter();

  const handleItemClick = (id: string) => {
    onClose();
    if (id === "products") {
      router.push("/shop/products");
    } else if (id === "barcode") {
      router.push("/shop/barcode");
    } else if (id === "ledger") {
      router.push("/shop/ledger");
    } else if (id === "stock") {
      router.push("/shop/stock");
    } else if (id === "stock_analysis") {
      router.push("/shop/stock/analysis");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#07080d] flex flex-col overflow-y-auto">
      {/* Floating back arrow */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-5 left-5 z-10 w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
        title="Back"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Card Grid */}
      <div className="flex-1 flex items-center justify-center p-6 pt-20">
        <div className="w-full max-w-3xl grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item.id)}
                className="group flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.18] transition-all duration-150 cursor-pointer active:scale-95"
              >
                <Icon className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                <span className="text-[11px] font-medium text-zinc-400 group-hover:text-zinc-100 text-center leading-tight transition-colors">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
