import { VendorProvider } from "@/context/VendorContext";
import { Sidebar } from "@/components/Sidebar";
import { AuthHeader } from "@/components/AuthHeader";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <VendorProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto min-w-0">
          <div className="fixed top-0 right-0 z-30 p-4 lg:p-6">
            <AuthHeader />
          </div>
          <div className="max-w-7xl mx-auto p-6 pt-16 lg:pt-6">
            {children}
          </div>
        </main>
      </div>
    </VendorProvider>
  );
}
