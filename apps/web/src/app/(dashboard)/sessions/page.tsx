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
      <h2 className="section-header mb-6">Sessions</h2>

      {sessions.length > 0 ? (
        <div className="bg-surface rounded-[6px] border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left px-4 h-12">Session</th>
                <th className="th-label text-left px-4 h-12">Platform</th>
                <th className="th-label text-left px-4 h-12">Model</th>
                <th className="th-label text-left px-4 h-12">Date</th>
                <th className="th-label text-right px-4 h-12">Turns</th>
                <th className="th-label text-right px-4 h-12">Detections</th>
                <th className="th-label text-left px-4 h-12">Vendors</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border-subtle hover:bg-raised h-12">
                  <td className="px-4 py-2">
                    <Link href={`/sessions/${s.id}`} className="text-accent hover:text-accent/80 font-mono text-[12px]">
                      {s.id.slice(0, 12)}...
                    </Link>
                  </td>
                  <td className="px-4 py-2"><PlatformBadge platform={s.source_platform} /></td>
                  <td className="px-4 py-2 text-secondary text-[12px]">{s.model_id ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-secondary">{new Date(s.started_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right"><span className="font-data">{Number(s.turn_count).toLocaleString()}</span></td>
                  <td className="px-4 py-2 text-right text-accent"><span className="font-data">{Number(s.observation_count).toLocaleString()}</span></td>
                  <td className="px-4 py-2 text-secondary text-[12px] max-w-xs truncate">{s.vendors ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No organic signal detected in this period.</p>
          <p className="text-muted text-[13px] italic mt-2">No sessions ingested yet.</p>
        </div>
      )}
    </div>
  );
}
