"use client";

import Link from "next/link";
import { useVendor } from "@/context/VendorContext";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

interface VendorGuardProps {
  vendorId: string;
  children: React.ReactNode;
}

/**
 * Client component that restricts vendor profile access.
 * Users can only view the profile for the vendor they selected
 * in the account popover. Shows a message if no vendor is selected
 * or if they try to view a different vendor's profile.
 */
export function VendorGuard({ vendorId, children }: VendorGuardProps) {
  const { selectedVendor } = useVendor();

  if (!selectedVendor) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center space-y-3">
        <p className="text-lg text-gray-300">No vendor selected</p>
        <p className="text-sm text-gray-400">
          Select your vendor from the account menu in the top-right corner to view your profile.
        </p>
      </div>
    );
  }

  if (selectedVendor !== vendorId) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center space-y-3">
        <p className="text-lg text-gray-300">Access restricted</p>
        <p className="text-sm text-gray-400">
          You can only view the profile for your own vendor ({vendorDisplayName(selectedVendor)}).
        </p>
        <Link
          href={`/benchmarks/vendors/${encodeURIComponent(selectedVendor)}`}
          className="inline-block mt-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition-colors"
        >
          Go to your profile
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
