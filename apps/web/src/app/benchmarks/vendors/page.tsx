import Link from "next/link";
import { getAllVendorNames } from "@/lib/db";
import { vendorDisplayName, vendorCategory, VENDOR_META } from "../vendor-taxonomy";
import { CATEGORY_META } from "../categories";

export const dynamic = "force-dynamic";

export default function VendorIndexPage() {
  const vendors = getAllVendorNames();

  // Group vendors: those with recommendations first, then those only mentioned
  const recommended = vendors.filter((v) => v.totalRecommendations > 0);
  const mentionedOnly = vendors.filter((v) => v.totalRecommendations === 0 && v.totalMentions > 0);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/benchmarks" className="hover:text-blue-400 transition-colors">
            Benchmarks
          </Link>
          <span>/</span>
          <span className="text-gray-200">Vendor Intel</span>
        </div>
        <h1 className="text-2xl font-bold">Vendor Intelligence</h1>
        <p className="text-gray-400 mt-1">
          Per-vendor scorecards showing recommendation rates, constraint coverage,
          competitive dynamics, and actionable improvement recommendations
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Vendors Tracked</p>
          <p className="text-2xl font-bold mt-1">{vendors.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Primary Recommendations</p>
          <p className="text-2xl font-bold mt-1">{recommended.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Mentioned Only</p>
          <p className="text-2xl font-bold mt-1">{mentionedOnly.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Avg Win Rate</p>
          <p className="text-2xl font-bold mt-1">
            {recommended.length > 0
              ? `${Math.round(
                  (recommended.reduce((sum, v) => sum + v.winRate, 0) / recommended.length) * 100
                )}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* Recommended vendors */}
      {recommended.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Primary Recommendations
            <span className="text-sm font-normal text-gray-500 ml-2">
              Vendors chosen as the top recommendation in at least one scenario
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {recommended.map((v) => {
              const catMeta = v.topCategory ? CATEGORY_META[v.topCategory] : null;
              return (
                <Link
                  key={v.vendor}
                  href={`/benchmarks/vendors/${encodeURIComponent(v.vendor)}`}
                  className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 hover:ring-1 hover:ring-gray-600 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition-colors">
                        {vendorDisplayName(v.vendor)}
                      </h3>
                      {VENDOR_META[v.vendor]?.website && (
                        <p className="text-xs text-gray-500">{VENDOR_META[v.vendor].website}</p>
                      )}
                    </div>
                    <span className="text-2xl font-bold text-blue-400">
                      {v.totalRecommendations}
                    </span>
                  </div>

                  {catMeta && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xs">{catMeta.icon}</span>
                      <span className="text-xs text-gray-400">{catMeta.label}</span>
                    </div>
                  )}

                  <div className="space-y-1.5 mt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Win rate</span>
                      <span className="text-gray-300">{Math.round(v.winRate * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${Math.round(v.winRate * 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Implementation rate</span>
                      <span className="text-gray-300">{Math.round(v.implementationRate * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          v.implementationRate > 0.5 ? "bg-green-500" : v.implementationRate > 0.2 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.max(4, Math.round(v.implementationRate * 100))}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Total mentions</span>
                      <span className="text-gray-400">{v.totalMentions}</span>
                    </div>

                    {v.platforms.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {v.platforms.map((p) => (
                          <span
                            key={p}
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              p === "claude_code"
                                ? "bg-blue-900/50 text-blue-300"
                                : p === "codex_cli"
                                ? "bg-green-900/50 text-green-300"
                                : "bg-purple-900/50 text-purple-300"
                            }`}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Mentioned-only vendors */}
      {mentionedOnly.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Mentioned but Not Recommended
            <span className="text-sm font-normal text-gray-500 ml-2">
              Vendors appearing in responses but never selected as the primary recommendation
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mentionedOnly.map((v) => {
              const catMeta = v.topCategory ? CATEGORY_META[v.topCategory] : null;
              return (
                <Link
                  key={v.vendor}
                  href={`/benchmarks/vendors/${encodeURIComponent(v.vendor)}`}
                  className="bg-gray-800/50 border border-dashed border-gray-700 rounded-lg p-4 hover:border-gray-500 hover:bg-gray-800/70 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-300 group-hover:text-blue-400 transition-colors">
                      {vendorDisplayName(v.vendor)}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {v.totalMentions} mention{v.totalMentions !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {catMeta && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs">{catMeta.icon}</span>
                      <span className="text-xs text-gray-500">{catMeta.label}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {vendors.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="text-lg">No vendor data yet</p>
          <p className="text-sm mt-2">
            Run benchmark sessions to generate vendor intelligence data
          </p>
        </div>
      )}
    </div>
  );
}
