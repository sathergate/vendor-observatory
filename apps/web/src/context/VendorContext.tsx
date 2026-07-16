"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface VendorContextValue {
  selectedVendor: string | null;
  setSelectedVendor: (vendorId: string | null) => void;
  isAdmin: boolean;
}

const VendorContext = createContext<VendorContextValue>({
  selectedVendor: null,
  setSelectedVendor: () => {},
  isAdmin: false,
});

const STORAGE_KEY = "vendor-observatory:selected-vendor";

export function VendorProvider({ children }: { children: React.ReactNode }) {
  const [selectedVendor, setSelectedVendorState] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(STORAGE_KEY);
    },
  );
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    // Always fetch /me to determine admin status
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.isAdmin) {
          setIsAdmin(true);
        }
        if (!stored) {
          const vendorId = data?.subscription?.vendorCanonicalId;
          if (vendorId) {
            setSelectedVendorState(vendorId);
            localStorage.setItem(STORAGE_KEY, vendorId);
          }
        }
      })
      .catch(() => {});
  }, []);

  const setSelectedVendor = useCallback((vendorId: string | null) => {
    setSelectedVendorState(vendorId);
    if (vendorId) {
      localStorage.setItem(STORAGE_KEY, vendorId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <VendorContext.Provider value={{ selectedVendor, setSelectedVendor, isAdmin }}>
      {children}
    </VendorContext.Provider>
  );
}

export function useVendor() {
  return useContext(VendorContext);
}
