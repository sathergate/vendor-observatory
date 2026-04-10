import { cookies } from "next/headers";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "$99 / month",
    features: [
      "1 answer engine (Claude Code, Cursor, or Codex CLI)",
      "Up to 50 scenarios analyzed",
      "Weekly scorecard updates",
      "Email alerts on significant changes",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$399 / month",
    highlight: true,
    features: [
      "3 answer engines (Claude Code, Cursor, Codex CLI)",
      "Up to 100 scenarios analyzed",
      "Daily scorecard updates",
      "Email alerts on significant changes",
      "Competitor tracking",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Request a call",
    features: [
      "All answer engines",
      "Unlimited scenarios",
      "Custom benchmarking",
      "Dedicated support & SLAs",
    ],
  },
];

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; jobId?: string }>;
}) {
  const { email = "", jobId = "" } = await searchParams;
  const cookieStore = await cookies();
  const isLoggedIn =
    !!cookieStore.get("session_token")?.value ||
    !!cookieStore.get("authjs.session-token")?.value ||
    !!cookieStore.get("__Secure-authjs.session-token")?.value;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-center mb-2 text-primary">Choose a plan</h1>
      <p className="text-[14px] text-secondary text-center mb-10">
        Unlock full signal data and ongoing monitoring.
      </p>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-surface border rounded-[6px] p-6 flex flex-col ${
              plan.highlight
                ? "border-accent ring-2 ring-accent"
                : "border-border"
            }`}
          >
            {plan.highlight && (
              <span className="section-header text-accent mb-2">
                Frequently chosen
              </span>
            )}
            <h2 className="text-xl font-bold mb-1 text-primary">{plan.name}</h2>
            <p className="text-2xl font-bold text-primary font-data mb-4">{plan.price}</p>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="text-[13px] text-secondary flex items-start gap-2">
                  <span className="text-signal-strong mt-0.5">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
            {plan.id === "enterprise" ? (
              <a
                href="mailto:sales@vendor-observatory.com"
                className="block w-full text-center py-2.5 bg-raised hover:bg-border-subtle rounded-[6px] font-medium text-[14px] text-secondary transition-colors"
              >
                Contact us
              </a>
            ) : (
              <a
                href={isLoggedIn ? `/payment?plan=${plan.id}${jobId ? `&jobId=${jobId}` : ""}` : `/signup?email=${encodeURIComponent(email)}&plan=${plan.id}${jobId ? `&jobId=${jobId}` : ""}`}
                className={`block w-full text-center py-2.5 rounded-[6px] font-medium text-[14px] transition-colors ${
                  plan.highlight
                    ? "bg-accent hover:bg-accent/90"
                    : "bg-raised hover:bg-border-subtle text-secondary"
                }`}
              >
                Get started
              </a>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
