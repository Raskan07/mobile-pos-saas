"use client";

/**
 * components/settings/UserProfileWorkspace.tsx
 *
 * GitHub-inspired User Profile workspace under Settings:
 * - Left sidebar: large avatar (Firebase Storage upload), name, @username, bio,
 *   inline "Edit profile" form, quick stats, details and achievements.
 * - Overview tab: pinned notes, a GitHub-style sales contribution graph
 *   (each square = sales billed by this user that day; click a square to see that day's sales),
 *   year selector, streak stats and monthly sales activity timeline.
 * - Sales tab: searchable ledger of every invoice billed under this user.
 * - Notes tab: quick scratchpad + pinnable, color-tagged personal notes (saved to Firestore).
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BookOpen,
  Receipt,
  StickyNote,
  Camera,
  Check,
  Loader2,
  Plus,
  Pin,
  Trash2,
  Search,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  CalendarDays,
  X,
  Edit3,
  Trophy,
  Flame,
  Zap,
  Gem,
  Star,
  ShoppingBag,
  ChevronRight,
  Users,
  Info,
} from "lucide-react";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { UserPersonalNote } from "@/lib/types/user";
import { SaleRecord } from "@/lib/types/sale";
import { subscribeToSalesByShop } from "@/lib/services/salesService";
import {
  uploadUserProfileImage,
  updateUserProfileDetails,
  fetchUserProfileDetails,
} from "@/lib/services/userService";

interface UserProfileWorkspaceProps {
  onBack?: () => void;
  showToast?: (msg: string) => void;
  currency?: string;
}

type ProfileTab = "overview" | "sales" | "notes";
type YearSelection = "last" | number;

interface DayBucket {
  count: number;
  revenue: number;
  items: number;
  sales: SaleRecord[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GitHub dark contribution palette
const LEVEL_CLASSES = [
  "bg-[#161b22] border-white/[0.04]",
  "bg-[#0e4429] border-transparent",
  "bg-[#006d32] border-transparent",
  "bg-[#26a641] border-transparent",
  "bg-[#39d353] border-transparent",
];

const NOTE_COLORS: Record<string, string> = {
  zinc: "bg-zinc-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  sky: "bg-sky-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
};

function dayKey(input: number | Date): string {
  const d = new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function saleTotal(s: SaleRecord): number {
  return Number(s.grandTotal ?? s.total ?? 0) || 0;
}

function saleItems(s: SaleRecord): number {
  return Number(s.itemCount ?? s.items?.reduce((acc, i) => acc + (i.quantity || 0), 0) ?? 0) || 0;
}

function isCountedSale(s: SaleRecord): boolean {
  const st = (s.status || "").toLowerCase();
  return st !== "voided" && st !== "refunded";
}

export default function UserProfileWorkspace({
  showToast,
  currency = "LKR",
}: UserProfileWorkspaceProps) {
  const { shop, user, activeBranchName, updateCurrentUser } = useShopAuth();

  const currentShopId = shop?.shopId || user?.shopId || "DEFAULT";
  const currentUserId = user?.uid || "staff_default";
  const localCacheKey = `skyfox_user_profile_${currentShopId}_${currentUserId}`;

  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  // ── Profile state ──
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || "");
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [draft, setDraft] = useState({ displayName: "", username: "", email: "", phone: "", jobTitle: "", bio: "" });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Notes state ──
  const [scratchpad, setScratchpad] = useState(user?.scratchpadNote || "");
  const [notes, setNotes] = useState<UserPersonalNote[]>(user?.personalNotes || []);
  const [isSavingScratchpad, setIsSavingScratchpad] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteColor, setNoteColor] = useState("emerald");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [isNoteFormOpen, setIsNoteFormOpen] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");

  // ── Sales state ──
  const [allShopSales, setAllShopSales] = useState<SaleRecord[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [salesSearch, setSalesSearch] = useState("");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // ── Contribution graph state ──
  const [selectedYear, setSelectedYear] = useState<YearSelection>("last");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  const notify = (msg: string) => showToast?.(msg);

  // ── Hydrate profile (session → localStorage → Firestore) ──
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || user.username || "");
    setUsername(user.username || "");
    setEmail(user.email || "");
    setPhone(user.phone || "");
    setJobTitle(user.jobTitle || "");
    setBio(user.bio || "");
    if (user.avatarUrl) setAvatarUrl(user.avatarUrl);
    if (user.scratchpadNote !== undefined) setScratchpad(user.scratchpadNote);
    if (user.personalNotes) setNotes(user.personalNotes);

    try {
      const raw = localStorage.getItem(localCacheKey);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.displayName) setDisplayName(c.displayName);
        if (c.username) setUsername(c.username);
        if (c.email !== undefined) setEmail(c.email);
        if (c.phone !== undefined) setPhone(c.phone);
        if (c.jobTitle !== undefined) setJobTitle(c.jobTitle);
        if (c.bio !== undefined) setBio(c.bio);
        if (c.avatarUrl !== undefined) setAvatarUrl(c.avatarUrl);
        if (c.scratchpadNote !== undefined) setScratchpad(c.scratchpadNote);
        if (Array.isArray(c.personalNotes)) setNotes(c.personalNotes);
      }
    } catch {
      // ignore storage errors
    }

    fetchUserProfileDetails(currentShopId, currentUserId).then((remote) => {
      if (!remote) return;
      if (remote.displayName) setDisplayName(remote.displayName);
      if (remote.username) setUsername(remote.username);
      if (remote.email !== undefined) setEmail(remote.email);
      if (remote.phone !== undefined) setPhone(remote.phone);
      if (remote.jobTitle !== undefined) setJobTitle(remote.jobTitle);
      if (remote.bio !== undefined) setBio(remote.bio);
      if (remote.avatarUrl !== undefined) setAvatarUrl(remote.avatarUrl);
      if (remote.scratchpadNote !== undefined) setScratchpad(remote.scratchpadNote);
      if (Array.isArray(remote.personalNotes)) setNotes(remote.personalNotes);
      updateCurrentUser({
        ...(remote.displayName ? { displayName: remote.displayName } : {}),
        ...(remote.avatarUrl !== undefined ? { avatarUrl: remote.avatarUrl } : {}),
        ...(remote.jobTitle !== undefined ? { jobTitle: remote.jobTitle } : {}),
        ...(remote.bio !== undefined ? { bio: remote.bio } : {}),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId, currentUserId]);

  // ── Real-time shop sales ──
  useEffect(() => {
    if (!shop?.shopId) {
      setIsLoadingSales(false);
      return;
    }
    setIsLoadingSales(true);
    const unsub = subscribeToSalesByShop(
      shop.shopId,
      (sales) => {
        setAllShopSales(sales);
        setIsLoadingSales(false);
      },
      () => setIsLoadingSales(false)
    );
    return () => unsub();
  }, [shop?.shopId]);

  // ── Sales billed under this user ──
  const userSales = useMemo(() => {
    if (!user) return [];
    const uid = (user.uid || "").toLowerCase().trim();
    const uname = (user.username || "").toLowerCase().trim();
    const dname = (displayName || user.displayName || "").toLowerCase().trim();
    return allShopSales.filter((s) => {
      const cId = (s.cashierId || "").toLowerCase().trim();
      const cName = (s.cashierName || "").toLowerCase().trim();
      if (uid && cId === uid) return true;
      if (uname && (cName === uname || cId === uname)) return true;
      if (dname && cName === dname) return true;
      return false;
    });
  }, [allShopSales, user, displayName]);

  const countedSales = useMemo(() => userSales.filter(isCountedSale), [userSales]);

  // ── Day buckets ──
  const salesByDay = useMemo(() => {
    const map = new Map<string, DayBucket>();
    for (const s of countedSales) {
      const k = dayKey(s.createdAt);
      const b = map.get(k) || { count: 0, revenue: 0, items: 0, sales: [] };
      b.count += 1;
      b.revenue += saleTotal(s);
      b.items += saleItems(s);
      b.sales.push(s);
      map.set(k, b);
    }
    return map;
  }, [countedSales]);

  // ── Year options ──
  const yearOptions = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const s of countedSales) years.add(new Date(s.createdAt).getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [countedSales]);

  // ── Contribution grid (weeks × 7 days) ──
  const graph = useMemo(() => {
    const today = startOfDay(new Date());
    let rangeStart: Date;
    let rangeEnd: Date;
    if (selectedYear === "last") {
      rangeEnd = today;
      rangeStart = new Date(today.getTime() - 364 * DAY_MS);
    } else {
      rangeStart = new Date(selectedYear, 0, 1);
      rangeEnd = new Date(selectedYear, 11, 31);
    }
    // align grid start to Sunday
    const gridStart = new Date(rangeStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const weeks: (Date | null)[][] = [];
    const cursor = new Date(gridStart);
    while (cursor <= rangeEnd) {
      const week: (Date | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor);
        week.push(d >= rangeStart && d <= rangeEnd ? d : null);
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    let total = 0;
    let revenue = 0;
    let max = 0;
    let activeDays = 0;
    let bestDay: { key: string; count: number; revenue: number } | null = null;
    for (const week of weeks) {
      for (const d of week) {
        if (!d) continue;
        const b = salesByDay.get(dayKey(d));
        if (!b) continue;
        total += b.count;
        revenue += b.revenue;
        activeDays += 1;
        if (b.count > max) max = b.count;
        if (!bestDay || b.revenue > bestDay.revenue) {
          bestDay = { key: dayKey(d), count: b.count, revenue: b.revenue };
        }
      }
    }

    // Month labels (placed at first week containing the 1st..7th of a month)
    const monthLabels: (string | null)[] = weeks.map(() => null);
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstValid = week.find((d) => d !== null);
      if (!firstValid) return;
      const m = firstValid.getMonth();
      if (m !== lastMonth) {
        if (wi === 0 || firstValid.getDate() <= 7) {
          monthLabels[wi] = MONTHS[m];
        }
        lastMonth = m;
      }
    });

    return { weeks, total, revenue, max, activeDays, bestDay, monthLabels };
  }, [selectedYear, salesByDay]);

  const levelFor = (count: number) => {
    if (count <= 0 || graph.max <= 0) return 0;
    return Math.min(4, Math.max(1, Math.ceil((count / graph.max) * 4)));
  };

  // ── Streaks (all-time) ──
  const streaks = useMemo(() => {
    const today = startOfDay(new Date());
    let current = 0;
    const cursor = new Date(today);
    // allow today to be empty (streak continues from yesterday)
    if (!salesByDay.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (salesByDay.has(dayKey(cursor))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const keys = Array.from(salesByDay.keys()).sort();
    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const k of keys) {
      const [y, m, d] = k.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      if (prev && Math.round((dt.getTime() - prev.getTime()) / DAY_MS) === 1) run += 1;
      else run = 1;
      if (run > longest) longest = run;
      prev = dt;
    }
    return { current, longest };
  }, [salesByDay]);

  // ── All-time KPIs ──
  const totals = useMemo(() => {
    let revenue = 0;
    let items = 0;
    let biggest = 0;
    const customers = new Set<string>();
    for (const s of countedSales) {
      const t = saleTotal(s);
      revenue += t;
      items += saleItems(s);
      if (t > biggest) biggest = t;
      const c = s.customer?.phone || s.customer?.name;
      if (c) customers.add(c.toLowerCase());
    }
    return { revenue, items, biggest, customers: customers.size, invoices: countedSales.length };
  }, [countedSales]);

  // ── Achievements ──
  const achievements = useMemo(
    () => [
      { id: "first", label: "First Sale", desc: "Billed your first invoice", icon: Star, earned: totals.invoices >= 1, tone: "from-amber-300 to-orange-500" },
      { id: "fifty", label: "Half Century", desc: "50 invoices billed", icon: Trophy, earned: totals.invoices >= 50, tone: "from-sky-300 to-indigo-500" },
      { id: "century", label: "Centurion", desc: "100 invoices billed", icon: Zap, earned: totals.invoices >= 100, tone: "from-violet-300 to-fuchsia-500" },
      { id: "streak", label: "On Fire", desc: "7-day selling streak", icon: Flame, earned: streaks.longest >= 7, tone: "from-rose-300 to-red-500" },
      { id: "bigticket", label: "Big Ticket", desc: `Single sale ≥ ${currency} 100,000`, icon: Gem, earned: totals.biggest >= 100000, tone: "from-emerald-300 to-teal-500" },
    ],
    [totals, streaks.longest, currency]
  );

  // ── Monthly activity timeline (last 3 months with sales in range) ──
  const activityTimeline = useMemo(() => {
    const byMonth = new Map<string, { label: string; count: number; revenue: number; days: Set<string>; products: Map<string, number> }>();
    for (const s of countedSales) {
      const d = new Date(s.createdAt);
      if (selectedYear !== "last" && d.getFullYear() !== selectedYear) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry =
        byMonth.get(k) ||
        { label: `${["January","February","March","April","May","June","July","August","September","October","November","December"][d.getMonth()]} ${d.getFullYear()}`, count: 0, revenue: 0, days: new Set<string>(), products: new Map<string, number>() };
      entry.count += 1;
      entry.revenue += saleTotal(s);
      entry.days.add(dayKey(d));
      for (const it of s.items || []) {
        entry.products.set(it.name, (entry.products.get(it.name) || 0) + (it.quantity || 0));
      }
      byMonth.set(k, entry);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 3)
      .map(([key, v]) => ({
        key,
        ...v,
        topProducts: Array.from(v.products.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4),
      }));
  }, [countedSales, selectedYear]);

  // ── Ledger search ──
  const filteredLedger = useMemo(() => {
    const q = salesSearch.toLowerCase().trim();
    if (!q) return userSales;
    return userSales.filter(
      (s) =>
        s.invoiceNumber?.toLowerCase().includes(q) ||
        s.customer?.name?.toLowerCase().includes(q) ||
        s.customer?.phone?.toLowerCase().includes(q) ||
        s.items?.some((it) => it.name?.toLowerCase().includes(q) || it.sku?.toLowerCase().includes(q))
    );
  }, [userSales, salesSearch]);

  const sortedNotes = useMemo(() => {
    const q = noteSearch.toLowerCase().trim();
    return [...notes]
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, noteSearch]);

  const pinnedNotes = useMemo(() => {
    const pinned = notes.filter((n) => n.pinned);
    return (pinned.length > 0 ? pinned : [...notes].sort((a, b) => b.updatedAt - a.updatedAt)).slice(0, 4);
  }, [notes]);

  const userInitial = (displayName || username || "U").trim().charAt(0).toUpperCase() || "U";
  const fmtMoney = (n: number) => `${currency} ${Math.round(n).toLocaleString()}`;
  const fmtDayLong = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  };
  const fmtDayShort = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  // ── Persistence ──
  const persistUserUpdates = async (updates: Partial<{
    displayName: string; username: string; email: string; phone: string; jobTitle: string;
    bio: string; avatarUrl: string; scratchpadNote: string; personalNotes: UserPersonalNote[];
  }>) => {
    try {
      const existing = JSON.parse(localStorage.getItem(localCacheKey) || "{}");
      localStorage.setItem(localCacheKey, JSON.stringify({ ...existing, ...updates, updatedAt: Date.now() }));
    } catch {
      // ignore quota errors
    }
    updateCurrentUser(updates);
    await updateUserProfileDetails(currentShopId, currentUserId, updates);
  };

  const readFileAsCompressedDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 360;
          let w = img.width;
          let h = img.height;
          if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = reject;
        img.src = ev.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("Please select an image smaller than 5MB");
      return;
    }
    setIsUploadingImage(true);
    try {
      const url = await uploadUserProfileImage(currentShopId, currentUserId, file);
      setAvatarUrl(url);
      await persistUserUpdates({ avatarUrl: url });
      notify("Profile picture updated");
    } catch (err) {
      console.warn("[UserProfile] Storage upload failed, using compressed fallback:", err);
      try {
        const dataUrl = await readFileAsCompressedDataUrl(file);
        setAvatarUrl(dataUrl);
        await persistUserUpdates({ avatarUrl: dataUrl });
        notify("Profile picture saved");
      } catch {
        notify("Could not process image file");
      }
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUrl("");
    await persistUserUpdates({ avatarUrl: "" });
    notify("Profile picture removed");
  };

  const openEditProfile = () => {
    setDraft({ displayName, username, email, phone, jobTitle, bio });
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    const next = {
      displayName: draft.displayName.trim() || draft.username.trim() || "Staff",
      username: draft.username.trim() || username || "staff",
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      jobTitle: draft.jobTitle.trim(),
      bio: draft.bio.trim(),
    };
    setDisplayName(next.displayName);
    setUsername(next.username);
    setEmail(next.email);
    setPhone(next.phone);
    setJobTitle(next.jobTitle);
    setBio(next.bio);
    setIsEditingProfile(false);
    try {
      await persistUserUpdates(next);
      notify("Profile updated");
    } catch {
      notify("Profile saved locally");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ── Notes handlers ──
  const resetNoteForm = () => {
    setNoteTitle("");
    setNoteContent("");
    setNoteColor("emerald");
    setEditingNoteId(null);
    setIsNoteFormOpen(false);
  };

  const handleSaveNote = async () => {
    if (!noteTitle.trim() && !noteContent.trim()) return;
    const now = Date.now();
    const updated: UserPersonalNote[] = editingNoteId
      ? notes.map((n) =>
          n.id === editingNoteId
            ? { ...n, title: noteTitle.trim() || "Untitled note", content: noteContent.trim(), color: noteColor, updatedAt: now }
            : n
        )
      : [
          {
            id: `note_${now}_${Math.random().toString(36).substring(2, 6)}`,
            title: noteTitle.trim() || "Quick note",
            content: noteContent.trim(),
            color: noteColor,
            pinned: false,
            createdAt: now,
            updatedAt: now,
          },
          ...notes,
        ];
    const wasEditing = Boolean(editingNoteId);
    setNotes(updated);
    resetNoteForm();
    await persistUserUpdates({ personalNotes: updated });
    notify(wasEditing ? "Note updated" : "Note saved");
  };

  const handleTogglePin = async (id: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n));
    setNotes(updated);
    await persistUserUpdates({ personalNotes: updated });
  };

  const handleDeleteNote = async (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    await persistUserUpdates({ personalNotes: updated });
    notify("Note deleted");
  };

  const handleEditNote = (n: UserPersonalNote) => {
    setEditingNoteId(n.id);
    setNoteTitle(n.title);
    setNoteContent(n.content);
    setNoteColor(n.color || "emerald");
    setIsNoteFormOpen(true);
    setActiveTab("notes");
  };

  const handleSaveScratchpad = async () => {
    setIsSavingScratchpad(true);
    try {
      await persistUserUpdates({ scratchpadNote: scratchpad });
      notify("Scratchpad saved");
    } finally {
      setIsSavingScratchpad(false);
    }
  };

  const selectedBucket = selectedDay ? salesByDay.get(selectedDay) : undefined;
  const hoveredBucket = hoveredDay ? salesByDay.get(hoveredDay) : undefined;

  // ── Reusable sale row ──
  const renderSaleRow = (sale: SaleRecord) => {
    const expanded = expandedSaleId === sale.saleId;
    const voided = !isCountedSale(sale);
    return (
      <div key={sale.saleId} className="border-b border-[#21262d] last:border-b-0">
        <button
          type="button"
          onClick={() => setExpandedSaleId(expanded ? null : sale.saleId)}
          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#161b22] transition-colors cursor-pointer"
        >
          <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
          <Receipt className="w-4 h-4 text-zinc-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-[#4493f8] font-mono">{sale.invoiceNumber}</span>
              <span className="px-1.5 py-px rounded-full border border-[#30363d] text-[10px] text-zinc-400 uppercase font-mono">
                {sale.paymentMethod}
              </span>
              {voided && (
                <span className="px-1.5 py-px rounded-full border border-rose-500/40 text-[10px] text-rose-300 uppercase font-mono">
                  {sale.status}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">
              {sale.customer?.name || "Walk-in customer"} · {saleItems(sale)} item{saleItems(sale) === 1 ? "" : "s"} ·{" "}
              {new Date(sale.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <span className={`text-[13px] font-mono font-semibold shrink-0 ${voided ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
            {fmtMoney(saleTotal(sale))}
          </span>
        </button>
        {expanded && (
          <div className="px-4 pb-3 pl-14">
            <div className="rounded-md border border-[#30363d] bg-[#0d1117] divide-y divide-[#21262d]">
              {(sale.items || []).map((it, idx) => (
                <div key={idx} className="px-3 py-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-300 truncate">
                    {it.name}
                    {it.variant ? <span className="text-zinc-500"> · {it.variant}</span> : null}
                    <span className="text-zinc-500 font-mono"> ×{it.quantity}</span>
                  </span>
                  <span className="font-mono text-zinc-300 shrink-0">{fmtMoney(Number(it.subtotal ?? it.unitPrice * it.quantity))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const TABS: { id: ProfileTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: "overview", label: "Overview", icon: BookOpen },
    { id: "sales", label: "Sales", icon: Receipt, count: userSales.length },
    { id: "notes", label: "Notes", icon: StickyNote, count: notes.length },
  ];

  return (
    <div className="flex-1 w-full bg-[#0d1117] text-[#e6edf3] min-h-screen">
      {/* ── Top tab bar (GitHub style) ── */}
      <div className="sticky top-0 z-30 bg-[#0d1117]/95 backdrop-blur border-b border-[#30363d]">
        <div className="max-w-[1280px] mx-auto pl-16 pr-4 sm:pr-6 flex items-end gap-1 h-14">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`relative flex items-center gap-2 px-3 pb-3 pt-2 text-sm cursor-pointer transition-colors ${
                  active ? "text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span className="px-1.5 min-w-[20px] text-center rounded-full bg-[#30363d] text-[11px] font-medium text-zinc-200">
                    {t.count}
                  </span>
                )}
                {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-[#f78166]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-8">
        {/* ───────────────── LEFT SIDEBAR ───────────────── */}
        <aside className="w-full md:w-[296px] shrink-0">
          {/* Avatar */}
          <div className="relative w-[220px] md:w-full max-w-[296px] mx-auto md:mx-0 group">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            <div className="aspect-square rounded-full overflow-hidden border border-[#30363d] bg-gradient-to-br from-[#1f6feb]/30 via-[#161b22] to-[#238636]/30 flex items-center justify-center shadow-[0_0_0_1px_rgba(240,246,252,0.04)]">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName || username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-7xl font-bold text-white/90 select-none">{userInitial}</span>
              )}
              {isUploadingImage && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                </div>
              )}
            </div>
            {/* Camera bubble (like GitHub's status emoji) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              title="Change profile picture"
              className="absolute bottom-[8%] right-[6%] w-10 h-10 rounded-full bg-[#21262d] border border-[#30363d] hover:border-zinc-400 flex items-center justify-center text-zinc-300 hover:text-white shadow-lg cursor-pointer transition-colors"
            >
              <Camera className="w-[18px] h-[18px]" />
            </button>
            {avatarUrl && !isUploadingImage && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                title="Remove profile picture"
                className="absolute top-[6%] right-[8%] w-7 h-7 rounded-full bg-[#21262d] border border-[#30363d] text-zinc-400 hover:text-rose-400 hover:border-rose-500/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Identity or inline edit form */}
          {!isEditingProfile ? (
            <>
              <div className="mt-4">
                <h1 className="text-2xl font-semibold leading-tight text-white">{displayName || username || "Staff member"}</h1>
                <p className="text-xl font-light text-zinc-400 leading-tight">{username || "staff"}</p>
              </div>

              {bio && <p className="mt-4 text-sm text-zinc-200 whitespace-pre-wrap">{bio}</p>}

              <button
                type="button"
                onClick={openEditProfile}
                className="mt-4 w-full py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] hover:border-zinc-500 text-sm font-medium text-zinc-100 transition-colors cursor-pointer"
              >
                Edit profile
              </button>

              <div className="mt-4 flex items-center gap-1.5 text-sm text-zinc-400">
                <Users className="w-4 h-4" />
                <span><b className="text-zinc-100 font-semibold">{totals.invoices}</b> invoices</span>
                <span>·</span>
                <span><b className="text-zinc-100 font-semibold">{totals.customers}</b> customers</span>
              </div>

              <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
                <li className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span className="truncate">
                    {jobTitle || <span className="capitalize">{user?.role || "Staff"}</span>}
                    {shop?.shopName ? <span className="text-zinc-500"> @ {shop.shopName}</span> : null}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span className="truncate">{activeBranchName || "Main Branch"}</span>
                </li>
                {email && (
                  <li className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span className="truncate">{email}</span>
                  </li>
                )}
                {phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span className="truncate">{phone}</span>
                  </li>
                )}
                {user?.createdAt ? (
                  <li className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span>Joined {new Date(user.createdAt).toLocaleDateString([], { month: "short", year: "numeric" })}</span>
                  </li>
                ) : null}
              </ul>
            </>
          ) : (
            <form onSubmit={handleSaveProfile} className="mt-4 space-y-3 text-sm">
              {(
                [
                  { key: "displayName", label: "Name", placeholder: "Full name" },
                  { key: "username", label: "Username", placeholder: "username" },
                  { key: "jobTitle", label: "Position", placeholder: "e.g. Senior Sales Executive" },
                  { key: "email", label: "Email", placeholder: "you@shop.lk" },
                  { key: "phone", label: "Phone", placeholder: "+94 77 123 4567" },
                ] as const
              ).map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={draft[f.key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/30 focus:outline-none text-sm text-white placeholder-zinc-600"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-zinc-200 mb-1">Bio</label>
                <textarea
                  rows={3}
                  value={draft.bio}
                  onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
                  placeholder="Add a short bio"
                  className="w-full px-3 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/30 focus:outline-none text-sm text-white placeholder-zinc-600 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-3 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm text-zinc-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Achievements */}
          <div className="mt-6 pt-6 border-t border-[#21262d]">
            <h2 className="text-base font-semibold text-white mb-3">Achievements</h2>
            <div className="flex flex-wrap gap-2.5">
              {achievements.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.id}
                    title={`${a.label} — ${a.desc}${a.earned ? "" : " (locked)"}`}
                    className={`w-14 h-14 rounded-full flex items-center justify-center border transition-transform hover:scale-110 ${
                      a.earned
                        ? `bg-gradient-to-br ${a.tone} border-white/20 shadow-lg`
                        : "bg-[#161b22] border-[#30363d] opacity-40 grayscale"
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${a.earned ? "text-white drop-shadow" : "text-zinc-500"}`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick stats */}
          <div className="mt-6 pt-6 border-t border-[#21262d] space-y-2 text-sm">
            <h2 className="text-base font-semibold text-white mb-3">Highlights</h2>
            <div className="flex justify-between"><span className="text-zinc-400">Lifetime revenue</span><span className="font-mono text-zinc-100">{fmtMoney(totals.revenue)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Units sold</span><span className="font-mono text-zinc-100">{totals.items.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Biggest sale</span><span className="font-mono text-zinc-100">{fmtMoney(totals.biggest)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Avg. ticket</span><span className="font-mono text-zinc-100">{fmtMoney(totals.invoices ? totals.revenue / totals.invoices : 0)}</span></div>
          </div>
        </aside>

        {/* ───────────────── MAIN COLUMN ───────────────── */}
        <main className="flex-1 min-w-0">
          {/* ═══════════ OVERVIEW ═══════════ */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              {/* Info banner */}
              <div className="rounded-md border border-[#1f6feb]/40 bg-[#121d2f] px-4 py-3 flex items-start gap-3">
                <Info className="w-4 h-4 text-[#4493f8] mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-white">This is your staff profile</p>
                  <p className="text-zinc-300">
                    Every invoice you bill at the POS lands on your sales graph below. Click any square to see what you sold that day.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("sales")}
                  className="hidden sm:block px-3 py-1 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-xs font-medium text-zinc-100 cursor-pointer shrink-0"
                >
                  View all sales
                </button>
              </div>

              {/* Pinned notes */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base text-white">Pinned</h2>
                  <button type="button" onClick={() => setActiveTab("notes")} className="text-xs text-[#4493f8] hover:underline cursor-pointer">
                    Customize your pins
                  </button>
                </div>
                {pinnedNotes.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => { setActiveTab("notes"); setIsNoteFormOpen(true); }}
                    className="w-full rounded-md border border-dashed border-[#30363d] hover:border-zinc-500 p-6 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                    Pin a note — shift handovers, IMEI reminders, customer follow-ups
                  </button>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {pinnedNotes.map((n) => (
                      <div key={n.id} className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 flex flex-col gap-2 min-h-[112px]">
                        <div className="flex items-center gap-2">
                          <StickyNote className="w-4 h-4 text-zinc-500 shrink-0" />
                          <button type="button" onClick={() => handleEditNote(n)} className="text-sm font-semibold text-[#4493f8] hover:underline truncate cursor-pointer">
                            {n.title}
                          </button>
                          <span className="px-1.5 py-px rounded-full border border-[#30363d] text-[11px] text-zinc-400 shrink-0">
                            {n.pinned ? "Pinned" : "Recent"}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2 flex-1">{n.content || "No details"}</p>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <span className={`w-3 h-3 rounded-full ${NOTE_COLORS[n.color || "emerald"] || NOTE_COLORS.emerald}`} />
                          <span>Updated {fmtDayShort(dayKey(n.updatedAt))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Contribution graph */}
              <section className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base text-white">
                      {isLoadingSales ? (
                        <span className="inline-flex items-center gap-2 text-zinc-400">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading sales…
                        </span>
                      ) : (
                        <>
                          {graph.total.toLocaleString()} sale{graph.total === 1 ? "" : "s"}{" "}
                          {selectedYear === "last" ? "in the last year" : `in ${selectedYear}`}
                        </>
                      )}
                    </h2>
                    <span className="text-xs text-zinc-400 hidden sm:inline">
                      {fmtMoney(graph.revenue)} · {graph.activeDays} active day{graph.activeDays === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="rounded-md border border-[#30363d] p-4">
                    <div className="overflow-x-auto pb-1">
                      <div className="inline-flex flex-col min-w-max">
                        {/* Month labels */}
                        <div className="flex gap-[3px] pl-8 mb-1 h-4">
                          {graph.monthLabels.map((m, i) => (
                            <div key={i} className="w-[11px] text-[11px] text-zinc-300 overflow-visible whitespace-nowrap">
                              {m || ""}
                            </div>
                          ))}
                        </div>
                        <div className="flex">
                          {/* Weekday labels */}
                          <div className="w-8 flex flex-col gap-[3px] text-[11px] text-zinc-300 pr-1">
                            {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                              <div key={i} className="h-[11px] leading-[11px]">{d}</div>
                            ))}
                          </div>
                          {/* Grid */}
                          <div className="flex gap-[3px]" onMouseLeave={() => setHoveredDay(null)}>
                            {graph.weeks.map((week, wi) => (
                              <div key={wi} className="flex flex-col gap-[3px]">
                                {week.map((d, di) => {
                                  if (!d) return <div key={di} className="w-[11px] h-[11px]" />;
                                  const k = dayKey(d);
                                  const b = salesByDay.get(k);
                                  const lvl = levelFor(b?.count || 0);
                                  const isSel = selectedDay === k;
                                  return (
                                    <button
                                      key={di}
                                      type="button"
                                      onMouseEnter={() => setHoveredDay(k)}
                                      onClick={() => setSelectedDay(isSel ? null : k)}
                                      title={`${b?.count || "No"} sale${b?.count === 1 ? "" : "s"} on ${fmtDayShort(k)}${b ? ` · ${fmtMoney(b.revenue)}` : ""}`}
                                      className={`w-[11px] h-[11px] rounded-[2px] border cursor-pointer transition-all hover:ring-1 hover:ring-white/50 ${LEVEL_CLASSES[lvl]} ${
                                        isSel ? "ring-2 ring-[#f0f6fc] ring-offset-1 ring-offset-[#0d1117]" : ""
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
                      <span className="truncate">
                        {hoveredDay ? (
                          <>
                            <b className="text-zinc-100">{hoveredBucket?.count || "No"} sale{hoveredBucket?.count === 1 ? "" : "s"}</b>
                            {hoveredBucket ? ` · ${fmtMoney(hoveredBucket.revenue)}` : ""} on {fmtDayShort(hoveredDay)}
                          </>
                        ) : (
                          "Each square is one day of invoices billed by you"
                        )}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="mr-1">Less</span>
                        {LEVEL_CLASSES.map((c, i) => (
                          <span key={i} className={`w-[11px] h-[11px] rounded-[2px] border ${c}`} />
                        ))}
                        <span className="ml-1">More</span>
                      </div>
                    </div>
                  </div>

                  {/* Streak cards */}
                  <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 rounded-md border border-[#30363d] divide-x divide-y lg:divide-y-0 divide-[#30363d] overflow-hidden">
                    {[
                      { label: "Current streak", value: `${streaks.current} day${streaks.current === 1 ? "" : "s"}`, icon: Flame, tone: "text-orange-400" },
                      { label: "Longest streak", value: `${streaks.longest} day${streaks.longest === 1 ? "" : "s"}`, icon: Trophy, tone: "text-amber-300" },
                      {
                        label: "Best day",
                        value: graph.bestDay ? fmtMoney(graph.bestDay.revenue) : "—",
                        sub: graph.bestDay ? fmtDayShort(graph.bestDay.key) : undefined,
                        icon: Zap,
                        tone: "text-[#39d353]",
                        onClick: graph.bestDay ? () => setSelectedDay(graph.bestDay!.key) : undefined,
                      },
                      { label: "Revenue in range", value: fmtMoney(graph.revenue), icon: ShoppingBag, tone: "text-[#4493f8]" },
                    ].map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.label}
                          type="button"
                          onClick={s.onClick}
                          disabled={!s.onClick}
                          className="p-3.5 text-left bg-[#0d1117] enabled:hover:bg-[#161b22] enabled:cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Icon className={`w-3.5 h-3.5 ${s.tone}`} />
                            {s.label}
                          </div>
                          <div className="mt-1 text-base font-semibold text-white font-mono truncate">{s.value}</div>
                          {"sub" in s && s.sub ? <div className="text-[11px] text-zinc-500">{s.sub}</div> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Year selector */}
                <div className="hidden lg:flex flex-col gap-1 w-[110px] shrink-0 pt-8">
                  <button
                    type="button"
                    onClick={() => { setSelectedYear("last"); setSelectedDay(null); }}
                    className={`px-3 py-2 rounded-md text-left text-xs cursor-pointer transition-colors ${
                      selectedYear === "last" ? "bg-[#1f6feb] text-white font-semibold" : "text-zinc-400 hover:bg-[#161b22] hover:text-zinc-200"
                    }`}
                  >
                    Last year
                  </button>
                  {yearOptions.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => { setSelectedYear(y); setSelectedDay(null); }}
                      className={`px-3 py-2 rounded-md text-left text-xs cursor-pointer transition-colors ${
                        selectedYear === y ? "bg-[#1f6feb] text-white font-semibold" : "text-zinc-400 hover:bg-[#161b22] hover:text-zinc-200"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </section>

              {/* Mobile year selector */}
              <div className="lg:hidden -mt-4 flex gap-1 overflow-x-auto">
                {(["last", ...yearOptions] as YearSelection[]).map((y) => (
                  <button
                    key={String(y)}
                    type="button"
                    onClick={() => { setSelectedYear(y); setSelectedDay(null); }}
                    className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap cursor-pointer ${
                      selectedYear === y ? "bg-[#1f6feb] text-white font-semibold" : "text-zinc-400 bg-[#161b22]"
                    }`}
                  >
                    {y === "last" ? "Last year" : y}
                  </button>
                ))}
              </div>

              {/* Selected day OR contribution activity */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base text-white">{selectedDay ? "Sales on this day" : "Sales activity"}</h2>
                  {selectedDay && (
                    <button
                      type="button"
                      onClick={() => setSelectedDay(null)}
                      className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" /> Clear selection
                    </button>
                  )}
                </div>

                {selectedDay ? (
                  <div className="rounded-md border border-[#30363d] overflow-hidden">
                    <div className="px-4 py-3 bg-[#161b22] border-b border-[#30363d] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-[2px] ${LEVEL_CLASSES[levelFor(selectedBucket?.count || 0)]}`} />
                        <span className="text-sm font-semibold text-white">{fmtDayLong(selectedDay)}</span>
                      </div>
                      {selectedBucket && (
                        <div className="flex items-center gap-3 text-xs text-zinc-400">
                          <span><b className="text-zinc-100">{selectedBucket.count}</b> invoice{selectedBucket.count === 1 ? "" : "s"}</span>
                          <span><b className="text-zinc-100">{selectedBucket.items}</b> units</span>
                          <span className="font-mono text-[#39d353] font-semibold">{fmtMoney(selectedBucket.revenue)}</span>
                        </div>
                      )}
                    </div>
                    {selectedBucket ? (
                      <div>{[...selectedBucket.sales].sort((a, b) => b.createdAt - a.createdAt).map(renderSaleRow)}</div>
                    ) : (
                      <div className="px-4 py-10 text-center text-sm text-zinc-500">No sales billed by you on this day.</div>
                    )}
                  </div>
                ) : activityTimeline.length === 0 ? (
                  <div className="rounded-md border border-[#30363d] px-4 py-10 text-center text-sm text-zinc-500">
                    {isLoadingSales ? "Loading activity…" : "No sales activity yet. Invoices you bill at the POS will appear here."}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {activityTimeline.map((m) => {
                      const maxQty = m.topProducts[0]?.[1] || 1;
                      return (
                        <div key={m.key}>
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-xs font-semibold text-zinc-200">{m.label}</span>
                            <span className="flex-1 h-px bg-[#21262d]" />
                          </div>
                          <div className="relative pl-8">
                            <span className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-[#21262d]" />
                            <span className="absolute left-0 top-0 w-6 h-6 rounded-full bg-[#21262d] border-2 border-[#0d1117] flex items-center justify-center">
                              <Receipt className="w-3 h-3 text-zinc-400" />
                            </span>
                            <p className="text-sm text-zinc-200 pt-0.5">
                              Billed <b>{m.count}</b> sale{m.count === 1 ? "" : "s"} across <b>{m.days.size}</b> day{m.days.size === 1 ? "" : "s"}
                              <span className="text-zinc-400"> · </span>
                              <span className="font-mono text-[#39d353]">{fmtMoney(m.revenue)}</span>
                            </p>
                            <div className="mt-2.5 space-y-1.5">
                              {m.topProducts.map(([name, qty]) => (
                                <div key={name} className="flex items-center gap-3 text-xs">
                                  <span className="w-44 sm:w-60 truncate text-[#4493f8]">{name}</span>
                                  <span className="text-zinc-500 font-mono w-12 shrink-0">{qty} unit{qty === 1 ? "" : "s"}</span>
                                  <span className="flex-1 h-2 rounded-full bg-[#161b22] overflow-hidden max-w-[180px]">
                                    <span className="block h-full rounded-full bg-[#26a641]" style={{ width: `${Math.max(6, (qty / maxQty) * 100)}%` }} />
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setActiveTab("sales")}
                      className="w-full py-2 rounded-md border border-[#30363d] text-xs font-medium text-[#4493f8] hover:bg-[#161b22] cursor-pointer"
                    >
                      Show all sales
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ═══════════ SALES ═══════════ */}
          {activeTab === "sales" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={salesSearch}
                    onChange={(e) => setSalesSearch(e.target.value)}
                    placeholder="Find an invoice, customer or product…"
                    className="w-full pl-9 pr-3 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/30 focus:outline-none text-sm text-white placeholder-zinc-500"
                  />
                </div>
                <div className="text-xs text-zinc-400 shrink-0">
                  <b className="text-zinc-100">{filteredLedger.length}</b> of {userSales.length} invoices
                </div>
              </div>

              <div className="rounded-md border border-[#30363d] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> Sales billed by {displayName || username}</span>
                  <span className="font-mono text-zinc-200">{fmtMoney(totals.revenue)}</span>
                </div>
                {isLoadingSales ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading sales…
                  </div>
                ) : filteredLedger.length === 0 ? (
                  <div className="py-12 text-center text-sm text-zinc-500">No invoices match your search.</div>
                ) : (
                  <div>{filteredLedger.slice(0, 100).map(renderSaleRow)}</div>
                )}
              </div>
              {filteredLedger.length > 100 && (
                <p className="text-xs text-zinc-500 text-center">Showing the latest 100 invoices. Refine your search to find older ones.</p>
              )}
            </div>
          )}

          {/* ═══════════ NOTES ═══════════ */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              {/* Scratchpad */}
              <div className="rounded-md border border-[#30363d] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-zinc-400" /> Scratchpad
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveScratchpad}
                    disabled={isSavingScratchpad}
                    className="px-2.5 py-1 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-xs text-zinc-100 cursor-pointer disabled:opacity-60 flex items-center gap-1"
                  >
                    {isSavingScratchpad ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={scratchpad}
                  onChange={(e) => setScratchpad(e.target.value)}
                  placeholder="Quick numbers, cash drawer notes, pending callbacks…"
                  className="w-full px-4 py-3 bg-[#0d1117] text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none resize-none font-mono"
                />
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={noteSearch}
                    onChange={(e) => setNoteSearch(e.target.value)}
                    placeholder="Find a note…"
                    className="w-full pl-9 pr-3 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/30 focus:outline-none text-sm text-white placeholder-zinc-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { if (isNoteFormOpen) resetNoteForm(); else setIsNoteFormOpen(true); }}
                  className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" /> New
                </button>
              </div>

              {/* Note form */}
              {isNoteFormOpen && (
                <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 space-y-3">
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Title"
                    autoFocus
                    className="w-full px-3 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/30 focus:outline-none text-sm font-semibold text-white placeholder-zinc-600"
                  />
                  <textarea
                    rows={4}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Write your note…"
                    className="w-full px-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/30 focus:outline-none text-sm text-zinc-200 placeholder-zinc-600 resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {Object.entries(NOTE_COLORS).map(([id, cls]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setNoteColor(id)}
                          className={`w-4 h-4 rounded-full ${cls} cursor-pointer transition-all ${
                            noteColor === id ? "ring-2 ring-offset-2 ring-offset-[#0d1117] ring-white/70" : "opacity-50 hover:opacity-100"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={resetNoteForm} className="px-3 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm text-zinc-200 cursor-pointer">
                        Cancel
                      </button>
                      <button type="button" onClick={handleSaveNote} className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium cursor-pointer">
                        {editingNoteId ? "Update note" : "Save note"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes list */}
              <div className="rounded-md border border-[#30363d] overflow-hidden">
                {sortedNotes.length === 0 ? (
                  <div className="py-12 text-center text-sm text-zinc-500">
                    {notes.length === 0 ? "You haven't saved any notes yet." : "No notes match your search."}
                  </div>
                ) : (
                  sortedNotes.map((n) => (
                    <div key={n.id} className="px-4 py-4 border-b border-[#21262d] last:border-b-0 flex items-start gap-3 group hover:bg-[#161b22]/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => handleEditNote(n)} className="text-[15px] font-semibold text-[#4493f8] hover:underline truncate cursor-pointer">
                            {n.title}
                          </button>
                          {n.pinned && (
                            <span className="px-1.5 py-px rounded-full border border-[#30363d] text-[11px] text-zinc-400">Pinned</span>
                          )}
                        </div>
                        {n.content && <p className="mt-1 text-sm text-zinc-400 whitespace-pre-wrap break-words line-clamp-3">{n.content}</p>}
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className={`w-3 h-3 rounded-full ${NOTE_COLORS[n.color || "emerald"] || NOTE_COLORS.emerald}`} />
                          <span>Updated {fmtDayShort(dayKey(n.updatedAt))}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(n.id)}
                          title={n.pinned ? "Unpin" : "Pin to profile"}
                          className={`px-2 py-1 rounded-md border text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                            n.pinned ? "border-amber-500/40 text-amber-300 bg-amber-500/10" : "border-[#30363d] text-zinc-300 bg-[#21262d] hover:bg-[#30363d]"
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          {n.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditNote(n)}
                          title="Edit"
                          className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-[#21262d] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(n.id)}
                          title="Delete"
                          className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

