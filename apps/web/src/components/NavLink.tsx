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
      className={`block px-3 py-2 rounded-[6px] text-[14px] transition-colors ${
        isActive
          ? "bg-raised text-primary font-medium"
          : "text-secondary hover:bg-raised hover:text-primary"
      }`}
    >
      {label}
    </Link>
  );
}
