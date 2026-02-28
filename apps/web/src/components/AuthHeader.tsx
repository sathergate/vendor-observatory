"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVendor } from "@/context/VendorContext";
import { VENDOR_META, vendorDisplayName } from "@/lib/vendor-taxonomy";

interface User {
  id: string;
  email: string;
}

/** Group vendors by category for the dropdown */
function useVendorsByCategory() {
  return useMemo(() => {
    const groups: Record<string, { id: string; name: string }[]> = {};
    for (const [id, meta] of Object.entries(VENDOR_META)) {
      const cat = meta.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ id, name: meta.name });
    }
    // Sort vendors within each category alphabetically
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, []);
}

/** Format category ID for display */
function categoryLabel(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuthHeader() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { selectedVendor, setSelectedVendor } = useVendor();
  const vendorsByCategory = useVendorsByCategory();

  useEffect(() => {
    function fetchUser() {
      fetch("/api/auth/me")
        .then((r) => (r.ok ? r.json() : { user: null }))
        .then((data) => {
          setUser(data.user);
          // Auto-set vendor for accounts with a server-assigned vendor (e.g. test account)
          if (data.vendor) {
            setSelectedVendor(data.vendor);
          }
        })
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    }

    fetchUser();

    window.addEventListener("auth-change", fetchUser);
    return () => window.removeEventListener("auth-change", fetchUser);
  }, [setSelectedVendor]);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition-colors"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-medium hover:bg-blue-500 transition-colors"
        aria-label="Account menu"
      >
        {user.email[0].toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-sm text-gray-400">Signed in as</p>
            <p className="text-sm font-medium text-gray-100 truncate">{user.email}</p>
          </div>

          {/* Vendor selection */}
          <div className="px-4 py-3 border-b border-gray-700">
            <label
              htmlFor="vendor-select"
              className="block text-xs font-medium text-gray-400 mb-1.5"
            >
              Your vendor
            </label>
            <select
              id="vendor-select"
              value={selectedVendor ?? ""}
              onChange={(e) => setSelectedVendor(e.target.value || null)}
              className="w-full bg-gray-900 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a vendor...</option>
              {Object.entries(vendorsByCategory)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, vendors]) => (
                  <optgroup key={cat} label={categoryLabel(cat)}>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            {selectedVendor && (
              <p className="text-xs text-gray-500 mt-1">
                Viewing profile for {vendorDisplayName(selectedVendor)}
              </p>
            )}
          </div>

          <div className="p-2">
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-md transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
