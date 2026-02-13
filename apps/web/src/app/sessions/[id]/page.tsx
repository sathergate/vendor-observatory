import { getSessionDetail } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getSessionDetail(id);
  if (!detail) return notFound();

  const { session, observations, toolActions } = detail;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Session {session.id.slice(0, 12)}...</h1>
      <div className="flex gap-4 text-sm text-gray-400 mb-6">
        <span>{session.source_platform}</span>
        <span>{session.model_id ?? "unknown model"}</span>
        <span>{new Date(session.started_at).toLocaleString()}</span>
        <span>{session.turn_count} turns</span>
      </div>

      {/* Observations */}
      <h2 className="text-lg font-semibold mb-3">Vendor Observations ({observations.length})</h2>
      {observations.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-2 text-gray-400">Vendor</th>
                <th className="text-left px-4 py-2 text-gray-400">Type</th>
                <th className="text-left px-4 py-2 text-gray-400">Category</th>
                <th className="text-right px-4 py-2 text-gray-400">Confidence</th>
                <th className="text-left px-4 py-2 text-gray-400">Context</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((obs, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  <td className="px-4 py-2 font-medium">{obs.vendor_canonical_id}</td>
                  <td className="px-4 py-2">
                    <MentionBadge type={obs.mention_type} />
                  </td>
                  <td className="px-4 py-2 text-gray-400">{obs.work_category ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{(obs.confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 text-xs text-gray-500 max-w-md truncate">{obs.context_snippet ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 mb-8">No vendor observations in this session.</p>
      )}

      {/* Tool Actions */}
      <h2 className="text-lg font-semibold mb-3">Tool Actions ({toolActions.length})</h2>
      {toolActions.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-2 text-gray-400">Tool</th>
                <th className="text-left px-4 py-2 text-gray-400">Command / Path</th>
                <th className="text-left px-4 py-2 text-gray-400">Vendor</th>
                <th className="text-left px-4 py-2 text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {toolActions.slice(0, 50).map((ta, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  <td className="px-4 py-2 text-gray-400">{ta.tool_name}</td>
                  <td className="px-4 py-2 font-mono text-xs max-w-md truncate">{ta.command_or_path ?? "\u2014"}</td>
                  <td className="px-4 py-2">{ta.vendor_canonical_id ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-gray-400">{ta.action_type ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500">No tool actions recorded.</p>
      )}
    </div>
  );
}

function MentionBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    installed: "bg-green-900 text-green-300",
    configured: "bg-yellow-900 text-yellow-300",
    implemented: "bg-purple-900 text-purple-300",
    recommended: "bg-blue-900 text-blue-300",
    compared: "bg-cyan-900 text-cyan-300",
    mentioned: "bg-gray-700 text-gray-300",
    rejected: "bg-red-900 text-red-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${colors[type] ?? "bg-gray-700 text-gray-300"}`}>
      {type}
    </span>
  );
}
