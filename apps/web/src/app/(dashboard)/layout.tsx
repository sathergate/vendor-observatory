import { redirect } from "next/navigation";
import { VendorProvider } from "@/context/VendorContext";
import { Sidebar } from "@/components/Sidebar";
import { AuthHeader } from "@/components/AuthHeader";
import { getCurrentUser, hasActivePayment } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (user) {
    const paid = await hasActivePayment(user.id, user.email);
    if (!paid) {
      redirect("/plans");
    }
  }

  return (
    <VendorProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto min-w-0">
          <div className="fixed top-0 right-0 z-30 p-6">
            <AuthHeader />
          </div>
          <div className="max-w-[1280px] mx-auto px-8 pt-6">
            {children}
          </div>
        </main>
      </div>
    </VendorProvider>
  );
}
