"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const VENDOR_STORAGE_KEY = "vendor-observatory:selected-vendor";

export function DashboardButton() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => {
        setLoggedIn(!!data.user);
        // Persist server-assigned vendor (e.g. test account) into localStorage
        if (data.vendor) {
          localStorage.setItem(VENDOR_STORAGE_KEY, data.vendor);
        }
      })
      .catch(() => setLoggedIn(false));
  }, []);

  if (loggedIn === null) return null;

  if (!loggedIn) {
    return (
      <Link
        href="/login"
        className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
      >
        Dashboard
      </Link>
    );
  }

  const vendor =
    typeof window !== "undefined"
      ? localStorage.getItem(VENDOR_STORAGE_KEY)
      : null;
  const href = vendor ? `/benchmarks/vendors/${vendor}` : "/overview";

  return (
    <Link
      href={href}
      className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
    >
      Dashboard
    </Link>
  );
}
