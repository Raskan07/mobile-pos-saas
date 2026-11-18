"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Plus,
  Edit3,
  Power,
  Users,
  ArrowRightLeft,
  Package,
  BarChart3,
  DatabaseZap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Star,
  Globe,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { ShopUserNav } from "@/components/layout/ShopUserNav";
import {
  Branch,
  BranchMigrationReport,
  BranchPermissionKey,
  BranchStockRecord,
  BranchTransfer,
  BranchTransferStatus,
  CreateBranchInput,
} from "@/lib/types/branch";
import { ShopUser, UserRole } from "@/lib/types/user";
import { ProductItem } from "@/lib/types/catalog";
import { SaleRecord } from "@/lib/types/sale";
import {
  createBranch,
  updateBranch,
  toggleBranchStatus,
  subscribeToBranchStock,
  subscribeToBranchTransfers,
  createBranchTransfer,
  updateBranchTransferStatus,
  assignEmployeeToBranches,
  assignProductToBranches,
  upsertBranchStock,
  migrateShopToMultiBranch,
} from "@/lib/services/branchService";
import {
  subscribeToAllShopAccounts,
  createShopUserNested,
} from "@/lib/services/shopAuthService";
import { DEFAULT_BRANCH_PERMISSIONS_BY_ROLE } from "@/lib/rbac/permissions";
import { getProducts } from "@/lib/services/catalogService";
import { getSalesByShop } from "@/lib/services/salesService";

type TabId = "branches" | "comparison" | "staff" | "transfers" | "catalog";

const BRANCH_ROLE_OPTIONS: { value: UserRole; label: string; desc: string }[] = [
  { value: "manager", label: "Branch Manager", desc: "Manage branch inventory, sales, transfers & staff" },
  { value: "cashier", label: "Cashier", desc: "POS terminal sales, invoicing & customer checkout" },
  { value: "technician", label: "Technician", desc: "Branch repair jobs, parts & service tickets" },
  { value: "partner", label: "Partner", desc: "Branch & business reports and operational oversight" },
  { value: "admin", label: "Business Admin", desc: "Full access across all branches and settings" },
];

const ALL_BRANCH_PERMISSION_KEYS: { key: BranchPermissionKey; label: string }[] = [
  { key: "sales.view", label: "View Sales" },
  { key: "sales.create", label: "Create POS Sales" },
  { key: "sales.refund", label: "Process Refunds" },
  { key: "inventory.view", label: "View Inventory" },
  { key: "inventory.update", label: "Update Stock" },
  { key: "inventory.transfer", label: "Transfer Stock" },
  { key: "expenses.manage", label: "Manage Expenses" },
  { key: "employees.manage", label: "Manage Staff" },
  { key: "reports.view_branch", label: "Branch Reports" },
  { key: "reports.view_all_branches", label: "All-Branches Reports" },
  { key: "branches.view", label: "View Branches" },
  { key: "branches.create", label: "Create Branches" },
  { key: "branches.update", label: "Edit Branches" },
];

export default function BranchesManagementPage() {
  const { shop, user, branches, activeBranchId, switchBranch } = useShopAuth();

  const [activeTab, setActiveTab] = useState<TabId>("branches");
  const [branchStocks, setBranchStocks] = useState<BranchStockRecord[]>([]);
  const [transfers, setTransfers] = useState<BranchTransfer[]>([]);
  const [staffList, setStaffList] = useState<ShopUser[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [dateRange, setDateRange] = useState<"today" | "7d" | "30d" | "all">("30d");
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Branch create / edit modal
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState<CreateBranchInput>({
    name: "",
    code: "",
    address: "",
    phone: "",
    email: "",
    managerName: "",
    isDefault: false,
  });
  const [isSavingBranch, setIsSavingBranch] = useState(false);

  // Optional initial user creation inside Create Branch modal
  const [createBranchUserOnCreate, setCreateBranchUserOnCreate] = useState(true);
  const [initUserDisplayName, setInitUserDisplayName] = useState("");
  const [initUsername, setInitUsername] = useState("");
  const [initPassword, setInitPassword] = useState("shop123456");
  const [initRole, setInitRole] = useState<UserRole>("manager");

  // Create Role-Based Branch User modal
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("shop123456");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("cashier");
  const [newUserPrimaryBranch, setNewUserPrimaryBranch] = useState<string>("");
  const [newUserAssignedBranches, setNewUserAssignedBranches] = useState<string[]>([]);
  const [newUserAllAccess, setNewUserAllAccess] = useState<boolean>(false);
  const [newUserBranchPerms, setNewUserBranchPerms] = useState<BranchPermissionKey[]>(
    DEFAULT_BRANCH_PERMISSIONS_BY_ROLE.cashier
  );
  const [isCreatingBranchUser, setIsCreatingBranchUser] = useState(false);
  const [heldBranchUserUid, setHeldBranchUserUid] = useState<string | null>(null);

  // Staff assignment modal
  const [staffModalUser, setStaffModalUser] = useState<ShopUser | null>(null);
  const [staffPrimaryBranch, setStaffPrimaryBranch] = useState<string>("");
  const [staffAssignedBranches, setStaffAssignedBranches] = useState<string[]>([]);
  const [staffAllAccess, setStaffAllAccess] = useState<boolean>(false);
  const [isSavingStaff, setIsSavingStaff] = useState(false);

  // Transfer modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string>("");
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferProductId, setTransferProductId] = useState<string>("");
  const [transferQty, setTransferQty] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  // Catalog branch assignment & stock modal
  const [catalogModalProduct, setCatalogModalProduct] = useState<ProductItem | null>(null);
  const [catalogSelectedBranches, setCatalogSelectedBranches] = useState<string[]>([]);
  const [catalogAssignAll, setCatalogAssignAll] = useState<boolean>(true);
  const [stockEditBranchId, setStockEditBranchId] = useState<string>("");
  const [stockEditQty, setStockEditQty] = useState<number>(0);
  const [stockEditDamaged, setStockEditDamaged] = useState<number>(0);
  const [stockEditMin, setStockEditMin] = useState<number>(5);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);

  // Migration
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState<BranchMigrationReport | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showFeedback = (type: "success" | "error", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  useEffect(() => {
    if (!shop?.shopId) return;
    setIsLoadingData(true);

    const unsubStocks = subscribeToBranchStock(shop.shopId, null, (records) => {
      setBranchStocks(records);
    });
    const unsubTransfers = subscribeToBranchTransfers(shop.shopId, (rows) => {
      setTransfers(rows);
    });
    const unsubStaff = subscribeToAllShopAccounts(shop.shopId, (users) => {
      setStaffList(users);
    });

    Promise.all([getProducts(shop.shopId), getSalesByShop(shop.shopId)])
      .then(([prodList, salesList]) => {
        setProducts(prodList);
        setSales(salesList);
      })
      .catch((err) => console.error("Failed loading branch overview data:", err))
      .finally(() => setIsLoadingData(false));

    return () => {
      unsubStocks();
      unsubTransfers();
      unsubStaff();
    };
  }, [shop?.shopId]);

  const activeBranches = useMemo(
    () => branches.filter((b) => b.status === "active"),
    [branches]
  );
  const inactiveBranches = useMemo(
    () => branches.filter((b) => b.status !== "active"),
    [branches]
  );

  const filteredSales = useMemo(() => {
    const now = Date.now();
    const startCutoff =
      dateRange === "today"
        ? new Date().setHours(0, 0, 0, 0)
        : dateRange === "7d"
        ? now - 7 * 86400000
        : dateRange === "30d"
        ? now - 30 * 86400000
        : 0;
    return sales.filter((s) => s.status !== "voided" && s.createdAt >= startCutoff);
  }, [sales, dateRange]);

  const consolidatedMetrics = useMemo(() => {
    const totalRevenue = filteredSales.reduce((acc, s) => acc + (s.grandTotal || s.total || 0), 0);
    const totalSalesCount = filteredSales.length;
    const totalStockUnits = branchStocks.reduce((acc, r) => acc + (r.stockQuantity || 0), 0);
    const lowStockCount = branchStocks.filter((r) => r.stockQuantity <= r.minStockLevel).length;
    return { totalRevenue, totalSalesCount, totalStockUnits, lowStockCount };
  }, [filteredSales, branchStocks]);

  const branchComparisonRows = useMemo(() => {
    return branches.map((b) => {
      const bSales = filteredSales.filter(
        (s) => (s.branchId || "main") === b.branchId
      );
      const revenue = bSales.reduce((acc, s) => acc + (s.grandTotal || s.total || 0), 0);
      const bStocks = branchStocks.filter((st) => st.branchId === b.branchId);
      const stockUnits = bStocks.reduce((acc, st) => acc + (st.stockQuantity || 0), 0);
      const damagedUnits = bStocks.reduce((acc, st) => acc + (st.damagedStock || 0), 0);
      const lowStock = bStocks.filter((st) => st.stockQuantity <= st.minStockLevel).length;
      const staffCount = staffList.filter(
        (u) =>
          u.allBranchesAccess ||
          u.primaryBranchId === b.branchId ||
          u.branchId === b.branchId ||
          (u.assignedBranchIds || []).includes(b.branchId)
      ).length;
      return {
        branch: b,
        salesCount: bSales.length,
        revenue,
        stockUnits,
        damagedUnits,
        lowStock,
        staffCount,
      };
    });
  }, [branches, filteredSales, branchStocks, staffList]);

  const openCreateBranchModal = () => {
    setEditingBranch(null);
    setBranchForm({
      name: "",
      code: "",
      address: "",
      phone: "",
      email: "",
      managerName: "",
      isDefault: branches.length === 0,
    });
    setCreateBranchUserOnCreate(false);
    setInitUserDisplayName("");
    setInitUsername("");
    setInitPassword("shop123456");
    setInitRole("manager");
    setBranchModalOpen(true);
  };

  const openCreateBranchUserModal = (preselectBranchId?: string) => {
    const primary = preselectBranchId || activeBranches[0]?.branchId || branches[0]?.branchId || "main";
    setNewUserDisplayName("");
    setNewUserUsername("");
    setNewUserPassword("shop123456");
    setNewUserPhone("");
    setNewUserRole("cashier");
    setNewUserPrimaryBranch(primary);
    setNewUserAssignedBranches([primary]);
    setNewUserAllAccess(false);
    setNewUserBranchPerms(DEFAULT_BRANCH_PERMISSIONS_BY_ROLE.cashier);
    setCreateUserModalOpen(true);
  };

  const handleCreateBranchUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !newUserUsername.trim()) return;
    setIsCreatingBranchUser(true);
    try {
      const targetBranch = branches.find((b) => b.branchId === newUserPrimaryBranch);
      const assigned = Array.from(new Set([newUserPrimaryBranch, ...newUserAssignedBranches]));
      const created = await createShopUserNested({
        shopId: shop.shopId,
        username: newUserUsername.trim(),
        password: newUserPassword.trim() || "shop123456",
        displayName: newUserDisplayName.trim() || newUserUsername.trim(),
        phone: newUserPhone.trim(),
        role: newUserRole,
        branchId: newUserPrimaryBranch,
        branchName: targetBranch?.name || newUserPrimaryBranch,
        primaryBranchId: newUserPrimaryBranch,
        assignedBranchIds: assigned,
        allBranchesAccess: newUserAllAccess || newUserRole === "admin",
        branchPermissions: newUserBranchPerms,
      });
      showFeedback(
        "success",
        `Created ${created.role} account @${created.username} assigned to ${targetBranch?.name || newUserPrimaryBranch}.`
      );
      setCreateUserModalOpen(false);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to create branch user.");
    } finally {
      setIsCreatingBranchUser(false);
    }
  };

  const openEditBranchModal = (b: Branch) => {
    setEditingBranch(b);
    setBranchForm({
      name: b.name,
      code: b.code,
      address: b.address || "",
      phone: b.phone || "",
      email: b.email || "",
      managerName: b.managerName || "",
      isDefault: b.isDefault,
    });
    setBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !user?.uid || !branchForm.name.trim()) return;
    setIsSavingBranch(true);
    try {
      if (editingBranch) {
        await updateBranch(shop.shopId, editingBranch.branchId, branchForm);
        showFeedback("success", `Updated branch "${branchForm.name}".`);
      } else {
        const createdBranch = await createBranch(shop.shopId, user.uid, branchForm);
        if (createBranchUserOnCreate && initUsername.trim()) {
          const roleKey = initRole.toLowerCase();
          await createShopUserNested({
            shopId: shop.shopId,
            username: initUsername.trim(),
            password: initPassword.trim() || "shop123456",
            displayName: initUserDisplayName.trim() || branchForm.managerName || initUsername.trim(),
            phone: branchForm.phone || "",
            role: initRole,
            branchId: createdBranch.branchId,
            branchName: createdBranch.name,
            primaryBranchId: createdBranch.branchId,
            assignedBranchIds: [createdBranch.branchId],
            allBranchesAccess: roleKey === "admin",
            branchPermissions:
              DEFAULT_BRANCH_PERMISSIONS_BY_ROLE[roleKey] ||
              DEFAULT_BRANCH_PERMISSIONS_BY_ROLE.cashier,
          });
          showFeedback(
            "success",
            `Created branch "${createdBranch.name}" and assigned ${initRole} @${initUsername.trim().toLowerCase()}.`
          );
        } else {
          showFeedback("success", `Created branch "${createdBranch.name}".`);
        }
      }
      setBranchModalOpen(false);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to save branch.");
    } finally {
      setIsSavingBranch(false);
    }
  };

  const handleToggleBranchStatus = async (b: Branch) => {
    if (!shop?.shopId) return;
    if (b.isDefault && b.status === "active") {
      showFeedback("error", "Cannot deactivate the default branch. Set another branch as default first.");
      return;
    }
    const nextStatus = b.status === "active" ? "inactive" : "active";
    try {
      await toggleBranchStatus(shop.shopId, b.branchId, nextStatus);
      showFeedback("success", `${b.name} is now ${nextStatus}.`);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const openStaffModal = (u: ShopUser) => {
    setStaffModalUser(u);
    const primary = u.primaryBranchId || u.branchId || branches[0]?.branchId || "main";
    const assigned =
      u.assignedBranchIds && u.assignedBranchIds.length > 0
        ? u.assignedBranchIds
        : [primary];
    setStaffPrimaryBranch(primary);
    setStaffAssignedBranches(Array.from(new Set([primary, ...assigned])));
    setStaffAllAccess(Boolean(u.allBranchesAccess || u.role === "admin"));
  };

  const handleSaveStaffBranches = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !staffModalUser) return;
    setIsSavingStaff(true);
    try {
      const primaryObj = branches.find((b) => b.branchId === staffPrimaryBranch);
      await assignEmployeeToBranches(
        shop.shopId,
        staffModalUser.uid,
        staffPrimaryBranch,
        primaryObj?.name || staffPrimaryBranch,
        staffAssignedBranches,
        staffAllAccess
      );
      showFeedback("success", `Updated branch access for ${staffModalUser.displayName}.`);
      setStaffModalUser(null);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to assign branches.");
    } finally {
      setIsSavingStaff(false);
    }
  };

  const openTransferModal = () => {
    const first = activeBranches[0]?.branchId || "";
    const second = activeBranches[1]?.branchId || activeBranches[0]?.branchId || "";
    setTransferFrom(first);
    setTransferTo(second);
    setTransferProductId(products[0]?.id || "");
    setTransferQty(1);
    setTransferNotes("");
    setTransferModalOpen(true);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !user?.uid) return;
    if (!transferFrom || !transferTo || transferFrom === transferTo) {
      showFeedback("error", "Source and destination branches must be different.");
      return;
    }
    const product = products.find((p) => p.id === transferProductId);
    if (!product || transferQty <= 0) {
      showFeedback("error", "Select a valid product and quantity.");
      return;
    }
    setIsSavingTransfer(true);
    try {
      await createBranchTransfer(
        shop.shopId,
        { uid: user.uid, name: user.displayName || user.username },
        {
          fromBranchId: transferFrom,
          fromBranchName: branchNameById(transferFrom),
          toBranchId: transferTo,
          toBranchName: branchNameById(transferTo),
          items: [
            {
              productId: product.id,
              productName: product.name,
              sku: product.sku,
              quantity: transferQty,
            },
          ],
          notes: transferNotes,
        }
      );
      showFeedback("success", "Stock transfer request created.");
      setTransferModalOpen(false);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to create transfer.");
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const handleTransferStatus = async (transferId: string, nextStatus: BranchTransferStatus) => {
    if (!shop?.shopId || !user?.uid) return;
    try {
      await updateBranchTransferStatus(shop.shopId, transferId, nextStatus, user.uid);
      showFeedback("success", `Transfer marked as ${nextStatus}.`);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to update transfer.");
    }
  };

  const openCatalogModal = (prod: ProductItem) => {
    setCatalogModalProduct(prod);
    const defaultBranchId = activeBranches[0]?.branchId || "main";
    setStockEditBranchId(defaultBranchId);
    const existing = branchStocks.find(
      (s) => s.branchId === defaultBranchId && s.productId === prod.id
    );
    setStockEditQty(existing?.stockQuantity ?? prod.stockQuantity ?? 0);
    setStockEditDamaged(existing?.damagedStock ?? 0);
    setStockEditMin(existing?.minStockLevel ?? prod.minStockLevel ?? 5);
    setCatalogAssignAll(true);
    setCatalogSelectedBranches(activeBranches.map((b) => b.branchId));
  };

  const handleSaveCatalogBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.shopId || !user?.uid || !catalogModalProduct) return;
    setIsSavingCatalog(true);
    try {
      await assignProductToBranches(
        shop.shopId,
        catalogModalProduct,
        catalogSelectedBranches,
        catalogAssignAll,
        user.uid
      );
      if (stockEditBranchId) {
        await upsertBranchStock(
          shop.shopId,
          stockEditBranchId,
          catalogModalProduct.id,
          user.uid,
          {
            stockQuantity: Number(stockEditQty) || 0,
            damagedStock: Number(stockEditDamaged) || 0,
            minStockLevel: Number(stockEditMin) || 0,
          },
          { name: catalogModalProduct.name, sku: catalogModalProduct.sku }
        );
      }
      showFeedback("success", `Updated branch stock & assignment for ${catalogModalProduct.name}.`);
      setCatalogModalProduct(null);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to update branch catalog.");
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleRunMigration = async () => {
    if (!shop?.shopId || !user?.uid) return;
    setIsMigrating(true);
    try {
      const report = await migrateShopToMultiBranch(shop.shopId, user.uid);
      setMigrationReport(report);
      showFeedback("success", "Multi-branch data migration completed.");
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Migration failed.");
    } finally {
      setIsMigrating(false);
    }
  };

  const branchNameById = (id: string) =>
    branches.find((b) => b.branchId === id)?.name || id;

  return (
    <div className="min-h-screen bg-[#09080d] text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#09080d]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/shop/dashboard"
              className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-zinc-300 transition-colors"
              title="Back to Main Menu"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <h1 className="text-base sm:text-lg font-semibold text-white truncate">
                  Branch Management
                </h1>
              </div>
              <p className="text-xs text-zinc-400 truncate">
                {shop?.shopName || "Skyfox POS"} · Multi-Branch Control Center
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCreateBranchModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Branch</span>
            </button>
            <ShopUserNav />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {feedback && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-zinc-400">Total Branches</p>
            <p className="text-2xl font-bold text-white mt-1">{branches.length}</p>
            <p className="text-[11px] text-emerald-400 mt-1">
              {activeBranches.length} active · {inactiveBranches.length} inactive
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-zinc-400">Consolidated Sales ({dateRange})</p>
            <p className="text-2xl font-bold text-white mt-1">
              LKR {consolidatedMetrics.totalRevenue.toLocaleString()}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {consolidatedMetrics.totalSalesCount} invoices across shop
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-zinc-400">Total Branch Stock</p>
            <p className="text-2xl font-bold text-white mt-1">
              {consolidatedMetrics.totalStockUnits.toLocaleString()} pcs
            </p>
            <p className="text-[11px] text-amber-400 mt-1">
              {consolidatedMetrics.lowStockCount} low-stock entries
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <p className="text-xs text-zinc-400">Pending Transfers</p>
            <p className="text-2xl font-bold text-white mt-1">
              {transfers.filter((t) => t.status !== "received" && t.status !== "cancelled").length}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {transfers.length} total transfer records
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-white/[0.08]">
          {[
            { id: "branches", label: "Branches", icon: Building2 },
            { id: "comparison", label: "Performance & Reports", icon: BarChart3 },
            { id: "staff", label: "Staff Assignment", icon: Users },
            { id: "transfers", label: "Stock Transfers", icon: ArrowRightLeft },
            { id: "catalog", label: "Catalog & Migration", icon: Package },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? "bg-white/10 text-white border border-white/15"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Branches */}
        {activeTab === "branches" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((b) => {
              const isCurrent = activeBranchId === b.branchId;
              const branchUsers = staffList.filter(
                (u) =>
                  u.allBranchesAccess ||
                  u.role === "admin" ||
                  u.primaryBranchId === b.branchId ||
                  u.branchId === b.branchId ||
                  (u.assignedBranchIds || []).includes(b.branchId)
              );
              return (
                <div
                  key={b.branchId}
                  className={`p-5 rounded-2xl border transition-colors ${
                    isCurrent
                      ? "bg-emerald-500/[0.06] border-emerald-500/35"
                      : "bg-white/[0.03] border-white/[0.08]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white truncate">{b.name}</h3>
                        {b.isDefault && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
                            <Star className="w-2.5 h-2.5" /> Default
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                        ID: {b.branchId} · Code: {b.code}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        b.status === "active"
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-zinc-400">
                    <p className="truncate">{b.address || "No address recorded"}</p>
                    <p>{b.phone || "No phone"}</p>
                    {b.managerName && <p>Manager: {b.managerName}</p>}
                  </div>

                  {/* Assigned Role-Based Users for this Branch */}
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-zinc-400 font-medium">
                        Assigned Users ({branchUsers.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => openCreateBranchUserModal(b.branchId)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium cursor-pointer"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>Add User</span>
                      </button>
                    </div>
                    {branchUsers.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">No users assigned yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {branchUsers.slice(0, 5).map((u) => (
                          <span
                            key={u.uid}
                            className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[10px] font-mono text-zinc-300"
                          >
                            @{u.username}{" "}
                            <span className="text-zinc-500 uppercase">{u.role}</span>
                          </span>
                        ))}
                        {branchUsers.length > 5 && (
                          <span className="px-1.5 py-0.5 text-[10px] text-zinc-500">
                            +{branchUsers.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={b.status !== "active"}
                      onClick={() => switchBranch(b.branchId, b.name)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                        isCurrent
                          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                          : "bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200"
                      }`}
                    >
                      {isCurrent ? "Active Branch" : "Switch Here"}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditBranchModal(b)}
                        className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 cursor-pointer"
                        title="Edit Branch"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleBranchStatus(b)}
                        className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 cursor-pointer"
                        title={b.status === "active" ? "Deactivate Branch" : "Activate Branch"}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Performance & Consolidated Comparison */}
        {activeTab === "comparison" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">
                Branch Performance Comparison
              </h2>
              <div className="flex items-center gap-1.5">
                {(["today", "7d", "30d", "all"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDateRange(r)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                      dateRange === r
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {r === "today" ? "Today" : r === "all" ? "All Time" : r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/[0.08] text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Branch</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Sales</th>
                    <th className="px-4 py-3 font-medium text-right">Revenue (LKR)</th>
                    <th className="px-4 py-3 font-medium text-right">Stock Units</th>
                    <th className="px-4 py-3 font-medium text-right">Low Stock</th>
                    <th className="px-4 py-3 font-medium text-right">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {branchComparisonRows.map((row) => (
                    <tr key={row.branch.branchId} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-medium text-white">
                        {row.branch.name}
                        <span className="ml-2 text-[10px] font-mono text-zinc-500">
                          {row.branch.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-300">{row.branch.status}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.salesCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-300">
                        {row.revenue.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{row.stockUnits}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-300">
                        {row.lowStock}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{row.staffCount}</td>
                    </tr>
                  ))}
                  <tr className="bg-white/[0.04] font-semibold text-white">
                    <td className="px-4 py-3 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-violet-400" />
                      Consolidated Business Total
                    </td>
                    <td className="px-4 py-3 text-zinc-400">—</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {consolidatedMetrics.totalSalesCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-300">
                      {consolidatedMetrics.totalRevenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {consolidatedMetrics.totalStockUnits}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-300">
                      {consolidatedMetrics.lowStockCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{staffList.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Staff Assignment */}
        {activeTab === "staff" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Branch Role-Based Users & Assignments
                </h2>
                <p className="text-xs text-zinc-400">
                  Create role-based users for specific branches or manage existing branch assignments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCreateBranchUserModal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Branch User</span>
              </button>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee (Hold Name for Password)</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Primary Branch</th>
                  <th className="px-4 py-3 font-medium">Authorized Branches</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {staffList.map((u) => {
                  const primary = u.primaryBranchId || u.branchId || "main";
                  const assigned = u.assignedBranchIds || [primary];
                  const isHolding = heldBranchUserUid === u.uid;
                  const holdHandlers = {
                    onMouseDown: () => setHeldBranchUserUid(u.uid),
                    onMouseUp: () => setHeldBranchUserUid(null),
                    onMouseLeave: () => {
                      if (heldBranchUserUid === u.uid) setHeldBranchUserUid(null);
                    },
                    onTouchStart: () => setHeldBranchUserUid(u.uid),
                    onTouchEnd: () => setHeldBranchUserUid(null),
                    onTouchCancel: () => setHeldBranchUserUid(null),
                  };
                  return (
                    <tr key={u.uid} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div
                          {...holdHandlers}
                          title="Press and hold name or username to view password"
                          className="inline-flex flex-col cursor-pointer select-none"
                        >
                          <p className="font-medium text-white underline decoration-dotted decoration-zinc-600 underline-offset-4">
                            {u.displayName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-emerald-400 font-mono">
                              @{u.username}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                isHolding
                                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-semibold"
                                  : "bg-white/[0.04] border-white/10 text-zinc-400"
                              }`}
                            >
                              {isHolding
                                ? `Password: ${u.password || "Not stored"}`
                                : "•••••• (Hold)"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-300">{u.role}</td>
                      <td className="px-4 py-3 text-zinc-200">{branchNameById(primary)}</td>
                      <td className="px-4 py-3">
                        {u.allBranchesAccess || u.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30 text-[10px]">
                            <ShieldCheck className="w-3 h-3" /> All Branches
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {assigned.map((bid) => (
                              <span
                                key={bid}
                                className="px-2 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[10px]"
                              >
                                {branchNameById(bid)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openStaffModal(u)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 cursor-pointer"
                        >
                          Assign Branches
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Tab 4: Stock Transfers */}
        {activeTab === "transfers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Branch-to-Branch Stock Transfers</h2>
              <button
                type="button"
                onClick={openTransferModal}
                disabled={activeBranches.length < 2 || products.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-semibold text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Transfer
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/[0.08] text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Requested By</th>
                    <th className="px-4 py-3 font-medium text-right">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        No branch transfers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-white">
                          {branchNameById(t.fromBranchId)} → {branchNameById(t.toBranchId)}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">
                          {t.items.map((it) => `${it.productName} (${it.quantity})`).join(", ")}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] capitalize bg-white/[0.06] text-zinc-200 border border-white/10">
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{t.createdByName || t.createdBy}</td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          {t.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => handleTransferStatus(t.id, "approved")}
                              className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                          {t.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => handleTransferStatus(t.id, "dispatched")}
                              className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 cursor-pointer"
                            >
                              Dispatch
                            </button>
                          )}
                          {t.status === "dispatched" && (
                            <button
                              type="button"
                              onClick={() => handleTransferStatus(t.id, "received")}
                              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
                            >
                              Mark Received
                            </button>
                          )}
                          {(t.status === "pending" || t.status === "approved") && (
                            <button
                              type="button"
                              onClick={() => handleTransferStatus(t.id, "cancelled")}
                              className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: Shared Catalog & Data Migration */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            {/* Migration Card */}
            <div className="p-5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <DatabaseZap className="w-4 h-4" />
                  <span>Idempotent Multi-Branch Data Migration</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Safely creates the default branch if missing, backfills legacy records without a{" "}
                  <code className="text-zinc-200">branchId</code>, and seeds branch stock records without overwriting existing data.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunMigration}
                disabled={isMigrating}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isMigrating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isMigrating ? "Migrating..." : "Run Migration"}</span>
              </button>
            </div>

            {migrationReport && (
              <div className="p-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] text-xs space-y-2">
                <p className="font-semibold text-emerald-300">
                  Migration Report · Default Branch: {migrationReport.defaultBranchId}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-zinc-300">
                  {Object.entries(migrationReport.collectionsBackfilled).map(([col, count]) => (
                    <div key={col} className="p-2 rounded-lg bg-black/30 border border-white/5">
                      <p className="text-[10px] text-zinc-400">{col}</p>
                      <p className="font-mono font-semibold">{count} updated</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shared Product Catalog Branch Assignment */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
              <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white">
                  Shared Business Product Catalog ({products.length})
                </h3>
                {isLoadingData && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
              </div>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/[0.08] text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium text-right">Base Price</th>
                    <th className="px-4 py-3 font-medium text-right">Branch Stock Entries</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {products.slice(0, 50).map((prod) => {
                    const pStocks = branchStocks.filter((s) => s.productId === prod.id);
                    const totalBranchQty = pStocks.reduce((acc, s) => acc + (s.stockQuantity || 0), 0);
                    return (
                      <tr key={prod.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-white">{prod.name}</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">{prod.sku}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          LKR {(prod.sellingPrice || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">
                          {pStocks.length} branches ({totalBranchQty} pcs)
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openCatalogModal(prod)}
                            className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 cursor-pointer"
                          >
                            Manage Branch Stock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Branch Create/Edit Modal */}
      {branchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBranch}
            className="w-full max-w-md rounded-2xl bg-[#111018] border border-white/10 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {editingBranch ? "Edit Branch" : "Create New Branch"}
              </h3>
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Branch Name *</label>
                <input
                  required
                  value={branchForm.name}
                  onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Colombo Main"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Branch Code</label>
                  <input
                    value={branchForm.code}
                    onChange={(e) => setBranchForm((p) => ({ ...p, code: e.target.value }))}
                    placeholder="e.g. CMB"
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Phone</label>
                  <input
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="011-2345678"
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Address</label>
                <input
                  value={branchForm.address}
                  onChange={(e) => setBranchForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Street, City"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={branchForm.email}
                    onChange={(e) => setBranchForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Manager Name</label>
                  <input
                    value={branchForm.managerName}
                    onChange={(e) => setBranchForm((p) => ({ ...p, managerName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-zinc-300 pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(branchForm.isDefault)}
                  onChange={(e) => setBranchForm((p) => ({ ...p, isDefault: e.target.checked }))}
                />
                <span>Set as default shop branch</span>
              </label>

              {/* Optional inline creation of a Role-Based User for the new branch */}
              {!editingBranch && (
                <div className="pt-3 mt-2 border-t border-white/[0.08] space-y-3">
                  <label className="flex items-center gap-2 text-emerald-300 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createBranchUserOnCreate}
                      onChange={(e) => setCreateBranchUserOnCreate(e.target.checked)}
                    />
                    <span>Create access-role user for this branch now</span>
                  </label>

                  {createBranchUserOnCreate && (
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-zinc-400 mb-1">User Display Name</label>
                          <input
                            value={initUserDisplayName}
                            onChange={(e) => setInitUserDisplayName(e.target.value)}
                            placeholder="e.g. Branch Manager"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-400 mb-1">Access Role</label>
                          <select
                            value={initRole}
                            onChange={(e) => setInitRole(e.target.value as UserRole)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white"
                          >
                            {BRANCH_ROLE_OPTIONS.map((r) => (
                              <option key={r.value} value={r.value} className="bg-[#111018]">
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-zinc-400 mb-1">Username *</label>
                          <input
                            required={createBranchUserOnCreate}
                            value={initUsername}
                            onChange={(e) => setInitUsername(e.target.value.toLowerCase())}
                            placeholder="e.g. colombo_cashier"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-400 mb-1">Password *</label>
                          <input
                            required={createBranchUserOnCreate}
                            value={initPassword}
                            onChange={(e) => setInitPassword(e.target.value)}
                            placeholder="shop123456"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="px-3 py-2 rounded-xl bg-white/[0.05] text-xs text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingBranch}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold text-xs cursor-pointer disabled:opacity-50"
              >
                {isSavingBranch ? "Saving..." : editingBranch ? "Save Changes" : "Create Branch"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Branch Assignment Modal */}
      {createUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateBranchUser}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#111018] border border-white/10 p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  Create Role-Based Branch User
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateUserModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">Display Name *</label>
                <input
                  required
                  value={newUserDisplayName}
                  onChange={(e) => setNewUserDisplayName(e.target.value)}
                  placeholder="e.g. Kasun Perera"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Username *</label>
                <input
                  required
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value.toLowerCase())}
                  placeholder="e.g. kasun_cmb"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Password *</label>
                <input
                  required
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Phone</label>
                <input
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  placeholder="077-1234567"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">Access Role *</label>
                <select
                  value={newUserRole}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    setNewUserRole(nextRole);
                    setNewUserAllAccess(nextRole === "admin");
                    setNewUserBranchPerms(
                      DEFAULT_BRANCH_PERMISSIONS_BY_ROLE[nextRole.toLowerCase()] ||
                        DEFAULT_BRANCH_PERMISSIONS_BY_ROLE.cashier
                    );
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                >
                  {BRANCH_ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value} className="bg-[#111018]">
                      {r.label} ({r.value})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {BRANCH_ROLE_OPTIONS.find((r) => r.value === newUserRole)?.desc}
                </p>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Primary Branch *</label>
                <select
                  value={newUserPrimaryBranch}
                  onChange={(e) => {
                    const bid = e.target.value;
                    setNewUserPrimaryBranch(bid);
                    setNewUserAssignedBranches((prev) => Array.from(new Set([bid, ...prev])));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                >
                  {branches.map((b) => (
                    <option key={b.branchId} value={b.branchId} className="bg-[#111018]">
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-zinc-400">Authorized Branches for Login</label>
              <div className="max-h-28 overflow-y-auto grid grid-cols-2 gap-1.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                {branches.map((b) => {
                  const checked = newUserAssignedBranches.includes(b.branchId);
                  return (
                    <label key={b.branchId} className="flex items-center gap-2 text-zinc-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={b.branchId === newUserPrimaryBranch}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewUserAssignedBranches((p) => [...p, b.branchId]);
                          } else {
                            setNewUserAssignedBranches((p) =>
                              p.filter((id) => id !== b.branchId)
                            );
                          }
                        }}
                      />
                      <span className="truncate">
                        {b.name} ({b.code})
                      </span>
                    </label>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-zinc-300 pt-1">
                <input
                  type="checkbox"
                  checked={newUserAllAccess}
                  onChange={(e) => setNewUserAllAccess(e.target.checked)}
                />
                <span>Allow access to all branches (Consolidated view)</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block text-zinc-400">Branch Permissions</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                {ALL_BRANCH_PERMISSION_KEYS.map((perm) => {
                  const checked = newUserBranchPerms.includes(perm.key);
                  return (
                    <label key={perm.key} className="flex items-center gap-1.5 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewUserBranchPerms((p) => [...p, perm.key]);
                          } else {
                            setNewUserBranchPerms((p) => p.filter((k) => k !== perm.key));
                          }
                        }}
                      />
                      <span className="truncate text-[11px]">{perm.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateUserModalOpen(false)}
                className="px-3 py-2 rounded-xl bg-white/[0.05] text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingBranchUser}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold cursor-pointer disabled:opacity-50"
              >
                {isCreatingBranchUser ? "Creating..." : "Create Branch User"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Branch Assignment Modal */}
      {staffModalUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStaffBranches}
            className="w-full max-w-md rounded-2xl bg-[#111018] border border-white/10 p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Assign Branches · {staffModalUser.displayName}
              </h3>
              <button
                type="button"
                onClick={() => setStaffModalUser(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Primary Branch</label>
              <select
                value={staffPrimaryBranch}
                onChange={(e) => {
                  const val = e.target.value;
                  setStaffPrimaryBranch(val);
                  setStaffAssignedBranches((prev) => Array.from(new Set([val, ...prev])));
                }}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
              >
                {branches.map((b) => (
                  <option key={b.branchId} value={b.branchId} className="bg-[#111018]">
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-zinc-400">Authorized Branches</label>
              <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-white/[0.02] border border-white/10">
                {branches.map((b) => {
                  const checked = staffAssignedBranches.includes(b.branchId);
                  return (
                    <label key={b.branchId} className="flex items-center gap-2 text-zinc-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={b.branchId === staffPrimaryBranch}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setStaffAssignedBranches((p) => [...p, b.branchId]);
                          } else {
                            setStaffAssignedBranches((p) => p.filter((id) => id !== b.branchId));
                          }
                        }}
                      />
                      <span>
                        {b.name} ({b.code})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-zinc-200">
              <input
                type="checkbox"
                checked={staffAllAccess}
                onChange={(e) => setStaffAllAccess(e.target.checked)}
              />
              <span>Grant All-Branches Access (Consolidated View)</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStaffModalUser(null)}
                className="px-3 py-2 rounded-xl bg-white/[0.05] text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingStaff}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold cursor-pointer disabled:opacity-50"
              >
                {isSavingStaff ? "Saving..." : "Save Access"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transfer Modal */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTransfer}
            className="w-full max-w-md rounded-2xl bg-[#111018] border border-white/10 p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">New Stock Transfer</h3>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">From Branch</label>
                <select
                  value={transferFrom}
                  onChange={(e) => setTransferFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                >
                  {activeBranches.map((b) => (
                    <option key={b.branchId} value={b.branchId} className="bg-[#111018]">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">To Branch</label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                >
                  {activeBranches.map((b) => (
                    <option key={b.branchId} value={b.branchId} className="bg-[#111018]">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Product</label>
              <select
                value={transferProductId}
                onChange={(e) => setTransferProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#111018]">
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                value={transferQty}
                onChange={(e) => setTransferQty(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Notes</label>
              <input
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Optional reason or reference"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="px-3 py-2 rounded-xl bg-white/[0.05] text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingTransfer}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold cursor-pointer disabled:opacity-50"
              >
                {isSavingTransfer ? "Creating..." : "Create Transfer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Catalog Branch Stock Modal */}
      {catalogModalProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCatalogBranch}
            className="w-full max-w-md rounded-2xl bg-[#111018] border border-white/10 p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white truncate">
                Branch Stock · {catalogModalProduct.name}
              </h3>
              <button
                type="button"
                onClick={() => setCatalogModalProduct(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="flex items-center gap-2 text-zinc-200">
              <input
                type="checkbox"
                checked={catalogAssignAll}
                onChange={(e) => setCatalogAssignAll(e.target.checked)}
              />
              <span>Assign product to all active branches</span>
            </label>

            {!catalogAssignAll && (
              <div className="max-h-32 overflow-y-auto space-y-1 p-2 rounded-xl bg-white/[0.02] border border-white/10">
                {activeBranches.map((b) => (
                  <label key={b.branchId} className="flex items-center gap-2 text-zinc-300">
                    <input
                      type="checkbox"
                      checked={catalogSelectedBranches.includes(b.branchId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCatalogSelectedBranches((p) => [...p, b.branchId]);
                        } else {
                          setCatalogSelectedBranches((p) => p.filter((id) => id !== b.branchId));
                        }
                      }}
                    />
                    <span>{b.name}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-white/[0.06] space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">Edit Stock for Branch</label>
                <select
                  value={stockEditBranchId}
                  onChange={(e) => {
                    const bid = e.target.value;
                    setStockEditBranchId(bid);
                    const rec = branchStocks.find(
                      (s) => s.branchId === bid && s.productId === catalogModalProduct.id
                    );
                    setStockEditQty(rec?.stockQuantity ?? 0);
                    setStockEditDamaged(rec?.damagedStock ?? 0);
                    setStockEditMin(rec?.minStockLevel ?? 5);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                >
                  {activeBranches.map((b) => (
                    <option key={b.branchId} value={b.branchId} className="bg-[#111018]">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-zinc-400 mb-1">Available</label>
                  <input
                    type="number"
                    min={0}
                    value={stockEditQty}
                    onChange={(e) => setStockEditQty(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Damaged</label>
                  <input
                    type="number"
                    min={0}
                    value={stockEditDamaged}
                    onChange={(e) => setStockEditDamaged(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Min Alert</label>
                  <input
                    type="number"
                    min={0}
                    value={stockEditMin}
                    onChange={(e) => setStockEditMin(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCatalogModalProduct(null)}
                className="px-3 py-2 rounded-xl bg-white/[0.05] text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingCatalog}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold cursor-pointer disabled:opacity-50"
              >
                {isSavingCatalog ? "Saving..." : "Save Stock"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
