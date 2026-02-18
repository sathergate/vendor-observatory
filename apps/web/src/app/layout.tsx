import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vendor Observatory",
  description: "Passive observation of AI coding assistant vendor recommendations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-900 text-gray-100 min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto min-w-0">
            <div className="max-w-7xl mx-auto p-6 pt-16 lg:pt-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
