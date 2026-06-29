"use client";

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

interface RefreshContextValue {
  registerRefetch: (fn: () => void) => void;
  triggerRefresh: () => void;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const refetchRef = useRef<(() => void) | null>(null);

  const registerRefetch = useCallback((fn: () => void) => {
    refetchRef.current = fn;
  }, []);

  const triggerRefresh = useCallback(() => {
    refetchRef.current?.();
  }, []);

  return (
    <RefreshContext.Provider value={{ registerRefetch, triggerRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error("useRefresh must be used within RefreshProvider");
  return ctx;
}

export function useRegisterRefresh(refetch: () => void) {
  const { registerRefetch } = useRefresh();
  registerRefetch(refetch);
}
