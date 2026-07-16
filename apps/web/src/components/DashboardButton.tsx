"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const VENDOR_STORAGE_KEY = "vendor-observatory:selected-vendor";

export function DashboardButton() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => setLoggedIn(!!data.user))
      .catch(() => setLoggedIn(false));
  }, []);

  if (loggedIn === null) return null;

  if (!loggedIn) {
    return (
      <Link
        href="/login"
        className="px-4 py-2 text-[14px] font-medium bg-accent hover:bg-accent/90 rounded-[6px] transition-colors"
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
      className="px-4 py-2 text-[14px] font-medium bg-accent hover:bg-accent/90 rounded-[6px] transition-colors"
    >
      Dashboard
    </Link>
  );
}
