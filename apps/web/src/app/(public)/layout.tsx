import { DashboardButton } from "@/components/DashboardButton";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base text-primary">
      <header className="border-b border-border-subtle px-6 py-4 flex items-center justify-between">
        <a href="/" className="text-primary font-semibold text-[14px] tracking-tight">
          Vendor Observatory
        </a>
        <DashboardButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
