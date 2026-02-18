"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink } from "./NavLink";

const NAV_GROUPS = [
  {
    label: "Benchmarks",
    links: [
      { href: "/benchmarks/vendors", label: "Vendor Intel" },
      { href: "/benchmarks/prompts", label: "Prompt Intel" },
    ],
  },
  {
    label: "Analytics",
    links: [
      { href: "/query", label: "Query" },
      { href: "/search", label: "Search" },
      { href: "/insights", label: "Insights" },
    ],
  },
  {
    label: "Data",
    links: [
      { href: "/vendors", label: "Vendors" },
      { href: "/platforms", label: "Platforms" },
      { href: "/actions", label: "Actions" },
      { href: "/sessions", label: "Sessions" },
    ],
  },
];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation
  const handleLinkClick = () => setOpen(false);

  // Logo is "active" on the home/benchmarks page
  const isHome = pathname === "/" || pathname === "/benchmarks";

  return (
    <>
      {/* Mobile hamburger — visible below lg breakpoint */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-md bg-gray-950 border border-gray-700 text-gray-400 hover:text-white"
        aria-label="Open navigation"
      >
        <div className="space-y-1">
          <div className="w-5 h-0.5 bg-current" />
          <div className="w-5 h-0.5 bg-current" />
          <div className="w-5 h-0.5 bg-current" />
        </div>
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-56 bg-gray-950 border-r border-gray-800
          flex flex-col shrink-0
          transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <Link
              href="/"
              onClick={handleLinkClick}
              className={`text-lg font-bold transition-colors ${
                isHome ? "text-blue-300" : "text-blue-400 hover:text-blue-300"
              }`}
            >
              Vendor Observatory
            </Link>
            <p className="text-xs text-gray-500 mt-1">Revealed Preference</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-300 p-1"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto" onClick={handleLinkClick}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="px-3 pt-2 pb-1">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.links.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
          v0.2.0
        </div>
      </aside>
    </>
  );
}
