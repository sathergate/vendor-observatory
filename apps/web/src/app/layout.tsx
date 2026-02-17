import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vendor Observatory",
  description: "Passive observation of AI coding assistant vendor recommendations",
};

const navLinks = [
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/benchmarks/vendors", label: "Vendor Intel" },
  { href: "/", label: "Dashboard" },
  { href: "/vendors", label: "Vendors" },
  { href: "/platforms", label: "Platforms" },
  { href: "/actions", label: "Actions" },
  { href: "/sessions", label: "Sessions" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-900 text-gray-100 min-h-screen">
        <div className="flex min-h-screen">
          <aside className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-800">
              <Link href="/" className="text-lg font-bold text-blue-400 hover:text-blue-300">
                Vendor Observatory
              </Link>
              <p className="text-xs text-gray-500 mt-1">Revealed Preference</p>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
              v0.2.0
            </div>
          </aside>
          <main className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto p-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
