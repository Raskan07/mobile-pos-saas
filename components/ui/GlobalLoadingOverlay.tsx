"use client";

/**
 * GlobalLoadingOverlay.tsx
 *
 * Minimalist dark theme Global Loading Overlay with an iOS-style spinner.
 * Features:
 *  - Fully accessible (role="status", aria-live="polite", aria-busy="true")
 *  - Blocks underlying user interaction with backdrop filter blur
 *  - Smooth fade-in and fade-out CSS transitions
 *  - Responsive message container with clean typography
 */

import React, { useEffect, useState } from "react";
import { useLoading } from "@/lib/context/LoadingContext";
import { IOSSpinner } from "./IOSSpinner";

export function GlobalLoadingOverlay() {
  const { isLoading, message } = useLoading();
  const [shouldRender, setShouldRender] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isLoading) {
      setShouldRender(true);
      // Small tick for CSS transition to trigger opacity 0 -> 1
      requestAnimationFrame(() => {
        setVisible(true);
      });
    } else {
      setVisible(false);
      // Wait for fade-out transition duration (220ms) before unmounting
      timeoutId = setTimeout(() => {
        setShouldRender(false);
      }, 240);
    }

    return () => clearTimeout(timeoutId);
  }, [isLoading]);

  if (!shouldRender) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={isLoading}
      aria-label={message || "Loading"}
      className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-auto select-none transition-all duration-200 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        backgroundColor: "rgba(5, 4, 8, 0.65)",
        backdropFilter: "blur(14px) saturate(180%)",
        WebkitBackdropFilter: "blur(14px) saturate(180%)",
      }}
    >
      {/* Minimalist Centered Indicator Card */}
      <div
        className="relative flex flex-col items-center justify-center p-6 rounded-2xl transition-all duration-200 ease-out max-w-xs text-center"
        style={{
          transform: visible ? "scale(1)" : "scale(0.95)",
          background: "rgba(18, 16, 26, 0.88)",
          backdropFilter: "blur(24px) saturate(190%)",
          WebkitBackdropFilter: "blur(24px) saturate(190%)",
          border: "1px solid rgba(255, 255, 255, 0.09)",
          boxShadow:
            "0 20px 50px -10px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* iOS-style Spinner */}
        <IOSSpinner size={34} color="rgba(255, 255, 255, 0.88)" />

        {/* Optional Context Message */}
        {message ? (
          <p className="mt-3.5 text-xs font-medium text-zinc-300 tracking-wide select-none">
            {message}
          </p>
        ) : (
          <span className="sr-only">Loading, please wait...</span>
        )}
      </div>
    </div>
  );
}
