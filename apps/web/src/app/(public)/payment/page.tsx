export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan = "starter" } = await searchParams;

  const planLabel: Record<string, string> = {
    starter: "Starter — $99 / month",
    growth: "Growth — $399 / month",
    enterprise: "Enterprise",
  };

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-6 text-center">Complete your setup</h1>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-400">Selected plan</p>
        <p className="text-lg font-semibold">{planLabel[plan] ?? plan}</p>
      </div>

      {/* TODO: Replace this placeholder with a Stripe Payment Element.
          See https://docs.stripe.com/payments/payment-element for integration guide. */}
      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 mb-6 text-center">
        <p className="text-gray-400 text-sm">
          Payment form placeholder — Stripe integration pending.
        </p>
      </div>

      <a
        href="/"
        className="block w-full text-center py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
      >
        Complete Setup &rarr;
      </a>
    </div>
  );
}
