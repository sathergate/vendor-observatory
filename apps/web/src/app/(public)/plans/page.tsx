import { cookies } from "next/headers";
import { EmailAlertSignup } from "@/components/EmailAlertSignup";

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
  const isLoggedIn = !!cookieStore.get("session_token")?.value;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-center mb-2">Choose a plan</h1>
      <p className="text-gray-400 text-center mb-10">
        Unlock full recommendations and ongoing monitoring.
      </p>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-gray-800 border rounded-lg p-6 flex flex-col ${
              plan.highlight
                ? "border-blue-500 ring-2 ring-blue-500"
                : "border-gray-700"
            }`}
          >
            {plan.highlight && (
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                Most popular
              </span>
            )}
            <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
            <p className="text-2xl font-bold text-white mb-4">{plan.price}</p>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="text-sm text-gray-300 flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
            {plan.id === "enterprise" ? (
              <a
                href="mailto:sales@vendor-observatory.com"
                className="block w-full text-center py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Contact us
              </a>
            ) : (
              <a
                href={isLoggedIn ? `/payment?plan=${plan.id}${jobId ? `&jobId=${jobId}` : ""}` : `/signup?email=${encodeURIComponent(email)}&plan=${plan.id}${jobId ? `&jobId=${jobId}` : ""}`}
                className={`block w-full text-center py-2.5 rounded-lg font-medium transition-colors ${
                  plan.highlight
                    ? "bg-blue-600 hover:bg-blue-500"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                Get started
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Email alert signup */}
      <div className="max-w-md mx-auto">
        <p className="text-sm text-gray-400 text-center mb-3">
          Not ready yet? Get notified when your scorecard changes.
        </p>
        <EmailAlertSignup defaultEmail={email} />
      </div>
    </div>
  );
}
