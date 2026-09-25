"use client";

/**
 * app/shop/page.tsx
 *
 * SpaceFox-inspired futuristic minimalist authentication experience for Skyfox POS.
 * Features:
 *   - Dark celestial orb cosmic background
 *   - Centered Skyfox transparent PNG logo
 *   - Minimalist glassmorphism input field & vibrant orange pill action button
 *   - Buttery GSAP slide transition from Step 1 (Shop ID) to Step 2 (Credentials)
 *   - Mac / iPhone Dynamic Island floating bottom notification for "Shop not found"
 *   - Bottom futuristic step timeline tracker (01 Shop ID, 02 Credentials, 03 Terminal)
 *   - Smooth cinematic exit transition on successful login into /shop/dashboard
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import gsap from "gsap";
import {
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  verifyShopExists,
  authenticateShopUser,
  normalizeShopId,
  getShopUsersRef,
  createShopUserNested,
} from "@/lib/services/shopAuthService";
import { useShopAuth } from "@/lib/context/ShopAuthContext";
import { Shop } from "@/lib/types/shop";
import { ShopUser } from "@/lib/types/user";
import { getDocs } from "firebase/firestore";

export default function SpaceFoxShopAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialShopId = (searchParams.get("shopId") || "").trim().toUpperCase();

  const { login } = useShopAuth();

  // Multi-step state: 1 = Enter Shop ID, 2 = Enter Username & Password
  const [step, setStep] = useState<1 | 2>(1);
  const [shopId, setShopId] = useState(initialShopId);
  const [verifiedShop, setVerifiedShop] = useState<Shop | null>(null);

  // Step 2 inputs
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status & loading
  const [isVerifyingShop, setIsVerifyingShop] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Apple/Mac floating bottom notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Existing staff accounts for quick-fill in step 2
  const [existingStaff, setExistingStaff] = useState<ShopUser[]>([]);
  const [isSeedingStaff, setIsSeedingStaff] = useState(false);

  // Animation DOM refs
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  // Helper to trigger macOS/iPhone floating pill notification
  const showFloatingToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);

    setTimeout(() => {
      if (toastRef.current) {
        gsap.fromTo(
          toastRef.current,
          { y: 35, opacity: 0, scale: 0.92 },
          { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }
        );
      }
    }, 10);

    toastTimeoutRef.current = setTimeout(() => {
      if (toastRef.current) {
        gsap.to(toastRef.current, {
          y: 20,
          opacity: 0,
          scale: 0.95,
          duration: 0.35,
          ease: "power2.in",
          onComplete: () => setToastMessage(null),
        });
      } else {
        setToastMessage(null);
      }
    }, 3800);
  };

  // Entrance logo & container subtle reveal
  useEffect(() => {
    if (logoRef.current) {
      gsap.fromTo(
        logoRef.current,
        { opacity: 0, y: -15 },
        { opacity: 1, y: 0, duration: 1, ease: "power3.out" }
      );
    }
    if (stepContainerRef.current) {
      gsap.fromTo(
        stepContainerRef.current,
        { opacity: 0, scale: 0.97, y: 15 },
        { opacity: 1, scale: 1, y: 0, duration: 0.9, delay: 0.2, ease: "power3.out" }
      );
    }
  }, []);

  // Auto-verify if shopId is provided in URL query parameter
  useEffect(() => {
    async function checkInitialId() {
      if (initialShopId) {
        setIsVerifyingShop(true);
        try {
          const shop = await verifyShopExists(initialShopId);
          if (shop) {
            setVerifiedShop(shop);
            setShopId(shop.shopId);
            setStep(2);
            fetchShopStaff(shop.shopId);
          } else {
            showFloatingToast("Shop not found");
          }
        } catch {
          showFloatingToast("Connection error");
        } finally {
          setIsVerifyingShop(false);
        }
      }
    }
    checkInitialId();
  }, [initialShopId]);

  // Fetch staff nested under shops/{shopId}/users
  const fetchShopStaff = async (id: string) => {
    try {
      const usersRef = getShopUsersRef(id);
      const snap = await getDocs(usersRef);
      const list: ShopUser[] = snap.docs.map((d) => d.data() as ShopUser);
      setExistingStaff(list);
      if (list.length > 0) {
        setUsername(list[0].username || "admin");
        setPassword(list[0].password || "shop123456");
      }
    } catch (e) {
      console.warn("Could not load nested staff:", e);
    }
  };

  // STEP 1: Handle Shop ID verification
  const handleVerifyShopId = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = normalizeShopId(shopId);

    if (!cleanId) {
      showFloatingToast("Please enter a Shop ID");
      return;
    }

    setIsVerifyingShop(true);

    try {
      const shop = await verifyShopExists(cleanId);
      if (!shop) {
        showFloatingToast("Shop not found");
        setIsVerifyingShop(false);
        return;
      }

      setVerifiedShop(shop);
      fetchShopStaff(shop.shopId);

      // Smooth GSAP transition to Step 2
      if (stepContainerRef.current) {
        gsap.to(stepContainerRef.current, {
          opacity: 0,
          x: -25,
          duration: 0.28,
          ease: "power2.in",
          onComplete: () => {
            setStep(2);
            gsap.fromTo(
              stepContainerRef.current,
              { opacity: 0, x: 25 },
              { opacity: 1, x: 0, duration: 0.38, ease: "power2.out" }
            );
          },
        });
      } else {
        setStep(2);
      }
    } catch (err) {
      console.error("Shop verification error:", err);
      showFloatingToast("Shop verification failed");
    } finally {
      setIsVerifyingShop(false);
    }
  };

  // Return to Step 1
  const handleBackToStep1 = () => {
    if (stepContainerRef.current) {
      gsap.to(stepContainerRef.current, {
        opacity: 0,
        x: 25,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          setStep(1);
          gsap.fromTo(
            stepContainerRef.current,
            { opacity: 0, x: -25 },
            { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }
          );
        },
      });
    } else {
      setStep(1);
    }
  };

  // STEP 2: Handle Credentials & Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedShop) return;

    if (!username.trim() || !password) {
      showFloatingToast("Enter username & password");
      return;
    }

    setIsLoggingIn(true);

    try {
      const { user, session } = await authenticateShopUser(
        verifiedShop.shopId,
        username.trim(),
        password
      );

      login(session, verifiedShop, user);

      // Smooth cinematic exit transition: subtle fade + slight scale
      setIsExiting(true);
      if (pageContainerRef.current) {
        gsap.to(pageContainerRef.current, {
          scale: 0.985,
          opacity: 0,
          duration: 0.65,
          ease: "power2.inOut",
          onComplete: () => {
            router.push("/shop/dashboard");
          },
        });
      } else {
        router.push("/shop/dashboard");
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      showFloatingToast(err.message || "Invalid credentials");
      setIsLoggingIn(false);
    }
  };

  // Quick helper to seed demo staff if empty
  const handleSeedDemoAccount = async () => {
    if (!verifiedShop) return;
    setIsSeedingStaff(true);
    try {
      const demo = await createShopUserNested({
        shopId: verifiedShop.shopId,
        username: "admin",
        password: "shop123456",
        displayName: `${verifiedShop.shopName} Admin`,
        role: "admin",
      });
      setExistingStaff([demo]);
      setUsername("admin");
      setPassword("shop123456");
      showFloatingToast("Created admin / shop123456");
    } catch {
      showFloatingToast("Failed to create admin");
    } finally {
      setIsSeedingStaff(false);
    }
  };

  return (
    <div
      ref={pageContainerRef}
      className="relative min-h-screen w-full bg-[#050508] text-white font-sans overflow-hidden flex flex-col justify-between select-none"
    >
      {/* ── Cosmic Celestial Background Image ── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Image
          src="/assets/spacefox_bg.jpg"
          alt="SpaceFox Celestial Orb"
          fill
          priority
          className="object-cover object-center opacity-85 scale-[1.02] filter brightness-90 contrast-110"
        />
        {/* Cinematic Vignette & Depth Mask */}
        <div className="absolute inset-0 bg-radial from-transparent via-[#060609]/60 to-[#040407]/95" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050508]/80 via-transparent to-[#050508]/90" />
      </div>

      {/* ── Top Ambient Bar with Centered Transparent Logo ── */}
      <header className="relative z-10 w-full pt-10 sm:pt-14 pb-4 flex flex-col items-center justify-center">
        <div
          ref={logoRef}
          className="relative group cursor-pointer flex flex-col items-center"
          onClick={() => {
            if (step === 2) handleBackToStep1();
          }}
        >
          {/* Subtle soft orange cosmic aura behind logo */}
          <div className="absolute -inset-4 bg-gradient-to-r from-orange-600/10 via-amber-500/15 to-orange-600/10 rounded-full blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <div className="relative h-11 sm:h-14 w-auto max-w-[280px]">
            <Image
              src="/assets/logo.png"
              alt="Skyfox POS"
              width={240}
              height={80}
              priority
              className="h-full w-auto object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]"
            />
          </div>

          <div className="mt-2 text-[10px] uppercase font-mono tracking-[0.35em] text-zinc-400 font-light opacity-80">
            {step === 1 ? "STOREFRONT AUTHENTICATION" : verifiedShop?.shopName || "STORE LOGIN"}
          </div>
        </div>
      </header>

      {/* ── Centered SpaceFox Minimalist Hub ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-6 sm:py-10">
        <div className="w-full max-w-[340px] sm:max-w-[370px]">
          <div ref={stepContainerRef} className="space-y-5">
            {/* ═══════════════════════════════════════════
                STEP 1: ENTER SHOP ID
            ═══════════════════════════════════════════ */}
            {step === 1 && (
              <form onSubmit={handleVerifyShopId} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 tracking-wider">
                    <span>Shop ID</span>
                    <span className="text-[10px] text-zinc-400">e.g. SHP-7492</span>
                  </div>

                  {/* Single Beautiful Minimalist Glassmorphism Input Field */}
                  <div className="relative group">
                    <input
                      type="text"
                      value={shopId}
                      onChange={(e) => setShopId(e.target.value.toUpperCase())}
                      placeholder="Enter Shop ID"
                      disabled={isVerifyingShop}
                      autoFocus
                      className="w-full h-12 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/[0.1] focus:border-orange-500/60 text-white font-mono text-xs tracking-wider uppercase placeholder:normal-case placeholder:font-sans placeholder:text-zinc-400 backdrop-blur-xl shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-all duration-200"
                    />

                    {shopId.trim() && (
                      <button
                        type="button"
                        onClick={() => setShopId("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Clean Vibrant Orange Pill Continue Button */}
                <button
                  type="submit"
                  disabled={isVerifyingShop || !shopId.trim()}
                  className="w-full h-12 rounded-full bg-gradient-to-r from-[#ea4815] via-[#f95721] to-[#ff6229] hover:from-[#f95721] hover:to-[#ff6c36] text-white font-bold text-xs uppercase tracking-[0.2em] shadow-[0_4px_25px_rgba(234,72,21,0.4)] hover:shadow-[0_6px_35px_rgba(234,72,21,0.6)] active:scale-[0.985] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  {isVerifyingShop ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Verifying…</span>
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ═══════════════════════════════════════════
                STEP 2: USERNAME & PASSWORD (SAME STYLE)
            ═══════════════════════════════════════════ */}
            {step === 2 && verifiedShop && (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Locked Shop ID Tag */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-md">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono text-xs text-orange-400 font-bold">
                      {verifiedShop.shopId}
                    </span>
                    <span className="text-[11px] text-zinc-400 truncate">
                      {verifiedShop.shopName}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleBackToStep1}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Change</span>
                  </button>
                </div>

                {/* Username Input */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-zinc-400 tracking-wider">
                    Username
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    disabled={isLoggingIn || isExiting}
                    autoFocus
                    required
                    className="w-full h-12 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/[0.1] focus:border-orange-500/60 text-white font-mono text-xs tracking-wider placeholder:normal-case placeholder:font-sans placeholder:text-zinc-400 backdrop-blur-xl shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-all duration-200"
                  />
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-zinc-400 tracking-wider">
                    Password
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={isLoggingIn || isExiting}
                      required
                      className="w-full h-12 pl-4 pr-11 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/[0.1] focus:border-orange-500/60 text-white font-mono text-xs tracking-widest placeholder:text-zinc-400 backdrop-blur-xl shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Sign In Pill Button */}
                <button
                  type="submit"
                  disabled={isLoggingIn || isExiting || !username.trim() || !password}
                  className="w-full h-12 mt-1 rounded-full bg-gradient-to-r from-[#ea4815] via-[#f95721] to-[#ff6229] hover:from-[#f95721] hover:to-[#ff6c36] text-white font-bold text-xs uppercase tracking-[0.2em] shadow-[0_4px_25px_rgba(234,72,21,0.4)] hover:shadow-[0_6px_35px_rgba(234,72,21,0.6)] active:scale-[0.985] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  {isLoggingIn || isExiting ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Authenticating…</span>
                    </>
                  ) : (
                    <>
                      <span>Enter Terminal</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>

                {/* Staff helper for newly enrolled shops */}
                {existingStaff.length === 0 && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={handleSeedDemoAccount}
                      disabled={isSeedingStaff}
                      className="text-[11px] font-mono text-zinc-400 hover:text-orange-400 transition-colors inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-orange-400" />
                      <span>Initialize Admin (admin / shop123456)</span>
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </main>

      {/* ── SpaceFox Bottom Step Progress Bar ── */}
      <footer className="relative z-10 w-full max-w-4xl mx-auto px-6 pb-8 pt-4">
        <div className="flex items-center justify-between text-[11px] font-mono tracking-widest text-zinc-400 mb-2">
          <div
            className={`flex items-center gap-1.5 transition-colors ${
              step >= 1 ? "text-zinc-200 font-semibold" : "text-zinc-400"
            }`}
          >
            <span className="text-orange-400 font-bold">01</span>
            <span>Shop ID</span>
          </div>

          <div
            className={`flex items-center gap-1.5 transition-colors ${
              step >= 2 ? "text-zinc-200 font-semibold" : "text-zinc-400"
            }`}
          >
            <span className={step >= 2 ? "text-orange-400 font-bold" : "text-zinc-400"}>02</span>
            <span>Credentials</span>
          </div>

          <div
            className={`flex items-center gap-1.5 transition-colors ${
              isExiting ? "text-emerald-400 font-semibold" : "text-zinc-400"
            }`}
          >
            <span className={isExiting ? "text-emerald-400 font-bold" : "text-zinc-400"}>03</span>
            <span>Terminal</span>
          </div>
        </div>

        {/* Minimalist Progress Line with Glowing Orange Indicator */}
        <div className="relative w-full h-[2px] bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-orange-600 via-orange-500 to-[#ff6229] transition-all duration-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)]"
            style={{
              width: step === 1 ? "33.3%" : isExiting ? "100%" : "66.6%",
            }}
          />
        </div>
      </footer>

      {/* ── Apple / Mac Dynamic Island Bottom Floating Notification ── */}
      {toastMessage && (
        <div
          ref={toastRef}
          className="fixed bottom-9 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="px-4 py-2.5 rounded-full bg-[#16161b]/95 border border-white/[0.12] backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(249,115,22,0.15)] flex items-center gap-2.5 text-xs text-zinc-200 font-medium">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
