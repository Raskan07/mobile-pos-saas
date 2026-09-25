"use client";

/**
 * lib/context/LoadingContext.tsx
 *
 * Global Loading Overlay Context and Controller.
 * Features:
 *  - Reference-counted request tracking (handles concurrent async calls seamlessly)
 *  - React Hook (`useLoading`)
 *  - Global Imperative Functions (`showGlobalLoading`, `hideGlobalLoading`, `withGlobalLoading`)
 *  - Auto dismiss on route transitions
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface LoadingContextValue {
  isLoading: boolean;
  message: string | null;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  withLoading: <T>(
    operation: Promise<T> | (() => Promise<T>),
    message?: string
  ) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

const GLOBAL_SHOW_EVENT = "app:show-loading";
const GLOBAL_HIDE_EVENT = "app:hide-loading";

/**
 * Global helper to trigger loading overlay from anywhere (even outside React components)
 */
export function showGlobalLoading(message?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(GLOBAL_SHOW_EVENT, { detail: { message } })
    );
  }
}

/**
 * Global helper to hide loading overlay
 */
export function hideGlobalLoading() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GLOBAL_HIDE_EVENT));
  }
}

/**
 * Wrap an async function or promise with automatic global loading
 */
export async function withGlobalLoading<T>(
  operation: Promise<T> | (() => Promise<T>),
  message?: string
): Promise<T> {
  showGlobalLoading(message);
  try {
    if (typeof operation === "function") {
      return await operation();
    }
    return await operation;
  } finally {
    hideGlobalLoading();
  }
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Request counter to avoid race conditions with multiple concurrent operations
  const activeRequestsRef = useRef(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const showLoading = useCallback((msg?: string) => {
    activeRequestsRef.current += 1;
    if (msg !== undefined) {
      setMessage(msg || null);
    }
    setIsLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);
    if (activeRequestsRef.current === 0) {
      setIsLoading(false);
      setMessage(null);
    }
  }, []);

  const withLoading = useCallback(
    async <T,>(
      operation: Promise<T> | (() => Promise<T>),
      msg?: string
    ): Promise<T> => {
      showLoading(msg);
      try {
        if (typeof operation === "function") {
          return await operation();
        }
        return await operation;
      } finally {
        hideLoading();
      }
    },
    [showLoading, hideLoading]
  );

  // Listen to global window events
  useEffect(() => {
    const handleShow = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>;
      showLoading(customEvent.detail?.message);
    };

    const handleHide = () => {
      hideLoading();
    };

    window.addEventListener(GLOBAL_SHOW_EVENT, handleShow);
    window.addEventListener(GLOBAL_HIDE_EVENT, handleHide);

    return () => {
      window.removeEventListener(GLOBAL_SHOW_EVENT, handleShow);
      window.removeEventListener(GLOBAL_HIDE_EVENT, handleHide);
    };
  }, [showLoading, hideLoading]);

  // Reset loading on page route completion with a smooth transition delay
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      // Keep loading briefly during initial DOM and component mounting
      const timer = setTimeout(() => {
        activeRequestsRef.current = 0;
        setIsLoading(false);
        setMessage(null);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        message,
        showLoading,
        hideLoading,
        withLoading,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

/**
 * Hook to consume the loading state and helper functions
 */
export function useLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
}
