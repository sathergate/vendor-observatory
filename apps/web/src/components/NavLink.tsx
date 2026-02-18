"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  label: string;
  exact?: boolean;
}

export function NavLink({ href, label, exact = false }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`block px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-gray-800 text-white font-medium"
          : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
      }`}
    >
      {label}
    </Link>
  );
}
