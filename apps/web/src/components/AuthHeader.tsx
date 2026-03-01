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

function useVendorsByCategory() {
  return useMemo(() => {
    const groups: Record<string, { id: string; name: string }[]> = {};
    for (const [id, meta] of Object.entries(VENDOR_META)) {
      const cat = meta.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ id, name: meta.name });
    }
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, []);
}

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
        .then((data) => setUser(data.user))
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    }

    fetchUser();

    window.addEventListener("auth-change", fetchUser);
    return () => window.removeEventListener("auth-change", fetchUser);
  }, []);

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
          className="px-3 py-1.5 text-[14px] text-secondary hover:text-primary transition-colors"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="px-3 py-1.5 text-[14px] bg-accent hover:bg-accent/90 text-primary rounded-[6px] font-medium transition-colors"
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
        className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-[14px] font-medium hover:bg-accent/90 transition-colors"
        aria-label="Account menu"
      >
        {user.email[0].toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-surface border border-border rounded-[6px] shadow-xl z-50">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[12px] text-secondary">Signed in as</p>
            <p className="text-[14px] font-medium text-primary truncate">{user.email}</p>
          </div>

          <div className="px-4 py-3 border-b border-border-subtle">
            <label
              htmlFor="vendor-select"
              className="block text-[12px] font-medium text-secondary mb-1.5"
            >
              Your vendor
            </label>
            <select
              id="vendor-select"
              value={selectedVendor ?? ""}
              onChange={(e) => setSelectedVendor(e.target.value || null)}
              className="w-full bg-base border border-border rounded-[6px] px-2.5 py-1.5 text-[14px] text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
              <p className="text-[11px] text-muted mt-1">
                Viewing profile for {vendorDisplayName(selectedVendor)}
              </p>
            )}
          </div>

          <div className="p-2">
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-[14px] text-secondary hover:bg-raised rounded-[6px] transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
