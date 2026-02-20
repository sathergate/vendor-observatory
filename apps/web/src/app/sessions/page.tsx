import Link from "next/link";
import { getSessionList } from "@/lib/db";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PlatformBadge } from "@/components/PlatformBadge";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const sessions = await getSessionList(100);

  return (
    <div>
      <Breadcrumb items={[{ label: "Sessions" }]} />
      <h1 className="text-2xl font-bold mb-6">Sessions</h1>

      {sessions.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400">Session</th>
                <th className="text-left px-4 py-3 text-gray-400">Platform</th>
                <th className="text-left px-4 py-3 text-gray-400">Model</th>
                <th className="text-left px-4 py-3 text-gray-400">Date</th>
                <th className="text-right px-4 py-3 text-gray-400">Turns</th>
                <th className="text-right px-4 py-3 text-gray-400">Observations</th>
                <th className="text-left px-4 py-3 text-gray-400">Vendors</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-4 py-2">
                    <Link href={`/sessions/${s.id}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                      {s.id.slice(0, 12)}...
                    </Link>
                  </td>
                  <td className="px-4 py-2"><PlatformBadge platform={s.source_platform} /></td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{s.model_id ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-gray-400">{new Date(s.started_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">{s.turn_count}</td>
                  <td className="px-4 py-2 text-right text-blue-400">{s.observation_count}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs max-w-xs truncate">{s.vendors ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p>No sessions yet.</p>
        </div>
      )}
    </div>
  );
}
