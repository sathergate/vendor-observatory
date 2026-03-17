import { getSessionDetail, getSessionTranscript } from "@/lib/db";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PlatformBadge } from "@/components/PlatformBadge";
import { MentionBadge } from "@/components/MentionBadge";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSessionDetail(id);
  if (!detail) return notFound();

  const { session, observations, toolActions } = detail;
  const transcript = await getSessionTranscript(id);

  // Collect vendor names for highlighting in transcript
  const vendorNames = observations.map((o) => vendorDisplayName(o.vendor_canonical_id));

  return (
    <div>
      <Breadcrumb items={[
        { label: "Sessions", href: "/sessions" },
        { label: session.id.slice(0, 8) + "\u2026" },
      ]} />
      <h2 className="section-header mb-2">Session {session.id.slice(0, 12)}...</h2>
      <div className="flex gap-4 text-[13px] text-secondary mb-6">
        <PlatformBadge platform={session.source_platform} />
        <span>{session.model_id ?? "unknown model"}</span>
        <span>{new Date(session.started_at).toLocaleString()}</span>
        <span><span className="font-data">{Number(session.turn_count).toLocaleString()}</span> turns</span>
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <>
          <h3 className="section-header mb-3">Conversation (<span className="font-data">{transcript.length}</span> turns)</h3>
          <div className="space-y-3 mb-8">
            {transcript.map((turn, i) => (
              <div key={i} className="bg-surface rounded-[6px] border border-border-subtle p-4">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                  {turn.role === "user" ? "User" : "Assistant"}
                </div>
                <div className="text-[13px] text-primary whitespace-pre-wrap leading-relaxed">
                  <HighlightedText text={turn.text_content} vendorNames={vendorNames} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Observations */}
      <h3 className="section-header mb-3">Vendor Detections (<span className="font-data">{observations.length}</span>)</h3>
      {observations.length > 0 ? (
        <div className="bg-surface rounded-[6px] border border-border overflow-hidden mb-8">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left px-4 h-12">Vendor</th>
                <th className="th-label text-left px-4 h-12">Type</th>
                <th className="th-label text-left px-4 h-12">Category</th>
                <th className="th-label text-right px-4 h-12">Confidence</th>
                <th className="th-label text-left px-4 h-12">Context</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((obs, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-raised h-12">
                  <td className="px-4 py-2 text-primary font-medium">{vendorDisplayName(obs.vendor_canonical_id)}</td>
                  <td className="px-4 py-2">
                    <MentionBadge type={obs.mention_type} />
                  </td>
                  <td className="px-4 py-2 text-secondary">{obs.work_category ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-right text-secondary"><span className="font-data">{(obs.confidence * 100).toFixed(1)}%</span></td>
                  <td className="px-4 py-2 text-[12px] text-muted max-w-md truncate">{obs.context_snippet ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="quiet-signal mb-8">
          <p className="text-secondary text-[14px]">No vendor detections in this session.</p>
        </div>
      )}

      {/* Tool Actions */}
      <h3 className="section-header mb-3">Tool Actions (<span className="font-data">{toolActions.length}</span>)</h3>
      {toolActions.length > 0 ? (
        <div className="bg-surface rounded-[6px] border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left px-4 h-12">Tool</th>
                <th className="th-label text-left px-4 h-12">Command / Path</th>
                <th className="th-label text-left px-4 h-12">Vendor</th>
                <th className="th-label text-left px-4 h-12">Action</th>
              </tr>
            </thead>
            <tbody>
              {toolActions.slice(0, 50).map((ta, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-raised h-12">
                  <td className="px-4 py-2 text-secondary">{ta.tool_name}</td>
                  <td className="px-4 py-2 font-mono text-[12px] text-primary max-w-md truncate">{ta.command_or_path ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-primary">{ta.vendor_canonical_id ? vendorDisplayName(ta.vendor_canonical_id) : "\u2014"}</td>
                  <td className="px-4 py-2 text-secondary">{ta.action_type ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No tool actions recorded.</p>
        </div>
      )}
    </div>
  );
}

function HighlightedText({ text, vendorNames }: { text: string; vendorNames: string[] }) {
  if (!text || vendorNames.length === 0) return <>{text}</>;

  // Build a single regex matching all vendor names (case-insensitive)
  const uniqueNames = [...new Set(vendorNames)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (uniqueNames.length === 0) return <>{text}</>;

  const escaped = uniqueNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = uniqueNames.some((n) => n.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <span key={i} className="text-accent font-semibold">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}
