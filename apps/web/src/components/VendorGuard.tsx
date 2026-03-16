"use client";

import Link from "next/link";
import { useVendor } from "@/context/VendorContext";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

interface VendorGuardProps {
  vendorId: string;
  children: React.ReactNode;
}

export function VendorGuard({ vendorId, children }: VendorGuardProps) {
  const { selectedVendor, isAdmin } = useVendor();

  // Admins can view any vendor page
  if (isAdmin) return <>{children}</>;

  if (!selectedVendor) {
    return (
      <div className="quiet-signal space-y-3">
        <p className="text-[14px] text-secondary">No vendor selected</p>
        <p className="text-[13px] text-muted italic max-w-[280px] mx-auto">
          Select your vendor from the account menu in the top-right corner to view your profile.
        </p>
      </div>
    );
  }

  if (selectedVendor !== vendorId) {
    return (
      <div className="quiet-signal space-y-3">
        <p className="text-[14px] text-secondary">Access restricted</p>
        <p className="text-[13px] text-muted italic max-w-[280px] mx-auto">
          You can only view the profile for your own vendor ({vendorDisplayName(selectedVendor)}).
        </p>
        <Link
          href={`/benchmarks/vendors/${encodeURIComponent(selectedVendor)}`}
          className="inline-block mt-2 px-4 py-2 text-[14px] bg-accent hover:bg-accent/90 rounded-[6px] font-medium transition-colors"
        >
          Go to your profile
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
