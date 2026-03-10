import { DashboardButton } from "@/components/DashboardButton";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base text-primary">
      <header className="border-b border-border-subtle px-6 py-4 flex items-center justify-between">
        <a href="/" className="font-mono text-[13px] text-primary tracking-tight hover:text-accent transition-colors">
          vendor-observatory
        </a>
        <DashboardButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
