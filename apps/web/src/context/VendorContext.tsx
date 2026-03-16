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
  const [selectedVendor, setSelectedVendorState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    // Always fetch /me to get admin status
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.isAdmin) setAdmin(true);
        if (!stored) {
          const vendorId = data?.subscription?.vendorCanonicalId;
          if (vendorId) {
            setSelectedVendorState(vendorId);
            localStorage.setItem(STORAGE_KEY, vendorId);
          }
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));

    if (stored) {
      setSelectedVendorState(stored);
    }
  }, []);

  const setSelectedVendor = useCallback((vendorId: string | null) => {
    setSelectedVendorState(vendorId);
    if (vendorId) {
      localStorage.setItem(STORAGE_KEY, vendorId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  if (!hydrated) return <>{children}</>;

  return (
    <VendorContext.Provider value={{ selectedVendor, setSelectedVendor, isAdmin: admin }}>
      {children}
    </VendorContext.Provider>
  );
}

export function useVendor() {
  return useContext(VendorContext);
}
