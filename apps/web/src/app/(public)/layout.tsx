import { DashboardButton } from "@/components/DashboardButton";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <a href="/" className="text-white font-semibold text-lg tracking-tight">
          Vendor Observatory
        </a>
        <DashboardButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
