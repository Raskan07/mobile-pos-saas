/**
 * nav-config.ts
 *
 * Navigation configuration for sidebar.
 */

import {
  Store,
  BarChart2,
  CreditCard,
  Settings,
  LayoutDashboard,
  Plus,
  Users,
  ShieldCheck,
  MapPin,
  TrendingUp,
  PieChart,
  Activity,
  FileText,
  Wallet,
  Receipt,
  RefreshCw,
  DollarSign,
  SlidersHorizontal,
  Bell,
  Lock,
  Globe,
  Palette,
} from "lucide-react";
import { LucideIcon } from "lucide-react";

export interface NavSubItem {
  label: string;
  href: string;
  icon: LucideIcon;
  actionId?: string; // Optional custom action trigger
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  subItems: NavSubItem[];
}

export const NAV_CONFIG: NavSection[] = [
  {
    id: "shops",
    label: "Shops",
    icon: Store,
    subItems: [
      { label: "Overview", href: "/sa-9x8f2k/shops", icon: LayoutDashboard },
      { label: "Shop Map", href: "/sa-9x8f2k/map", icon: MapPin },
      { label: "Add Shop", href: "/sa-9x8f2k/shops?action=add-shop", icon: Plus, actionId: "add-shop" },
      { label: "Staff", href: "/sa-9x8f2k/staff", icon: Users },
      { label: "Roles", href: "/sa-9x8f2k/staff", icon: ShieldCheck },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart2,
    subItems: [
      { label: "Overview", href: "/sa-9x8f2k/analytics", icon: TrendingUp },
      { label: "Sales Report", href: "/sa-9x8f2k/analytics/sales", icon: PieChart },
      { label: "Live Activity", href: "/sa-9x8f2k/analytics/live", icon: Activity },
      { label: "Exports", href: "/sa-9x8f2k/analytics/exports", icon: FileText },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    subItems: [
      { label: "Wallet", href: "/sa-9x8f2k/payments/wallet", icon: Wallet },
      { label: "Transactions", href: "/sa-9x8f2k/payments/transactions", icon: Receipt },
      { label: "Refunds", href: "/sa-9x8f2k/payments/refunds", icon: RefreshCw },
      { label: "Payouts", href: "/sa-9x8f2k/payments/payouts", icon: DollarSign },
      { label: "Subscriptions", href: "/sa-9x8f2k/subscriptions", icon: CreditCard },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    subItems: [
      { label: "General", href: "/sa-9x8f2k/settings", icon: SlidersHorizontal },
      { label: "Notifications", href: "/sa-9x8f2k/settings/notifications", icon: Bell },
      { label: "Security", href: "/sa-9x8f2k/settings/security", icon: Lock },
      { label: "Localization", href: "/sa-9x8f2k/settings/locale", icon: Globe },
      { label: "Appearance", href: "/sa-9x8f2k/settings/appearance", icon: Palette },
    ],
  },
];
