import { BENCHMARK_PROMPTS, type BenchmarkPrompt } from "./prompts.js";

/**
 * Select prompts for onboarding benchmarks.
 *
 * Fast tier: 3 prompts from the vendor's detected category
 *   - prefer prompts without vendorsNamedInPrompt (avoids anchoring bias)
 *   - if category has <3 prompts, fill from highest-coverage general prompts
 *
 * Balanced tier: 10 prompts — 5 from detected category + 5 cross-category
 *
 * Comprehensive tier: ~20 prompts — ALL from detected category + ALL cross-category
 *   + fill remaining from other categories for diversity
 */
export function selectOnboardingPrompts(
  category: string | null,
  tier: "fast" | "balanced" | "comprehensive",
): BenchmarkPrompt[] {
  const COMPREHENSIVE_TARGET = 20;
  const count = tier === "fast" ? 3 : tier === "balanced" ? 10 : COMPREHENSIVE_TARGET;
  const categoryCount = tier === "fast" ? 3 : tier === "balanced" ? 5 : Infinity; // comprehensive: take ALL from category

  // Separate prompts by category match
  const categoryPrompts: BenchmarkPrompt[] = [];
  const otherPrompts: BenchmarkPrompt[] = [];

  for (const p of BENCHMARK_PROMPTS) {
    // Skip cross-category prompts for category matching
    if (category && p.category === category) {
      categoryPrompts.push(p);
    } else {
      otherPrompts.push(p);
    }
  }

  // Sort category prompts: prefer those without vendorsNamedInPrompt (less anchoring bias)
  categoryPrompts.sort((a, b) => {
    const aHasVendors = a.metadata.vendorsNamedInPrompt.length > 0 ? 1 : 0;
    const bHasVendors = b.metadata.vendorsNamedInPrompt.length > 0 ? 1 : 0;
    return aHasVendors - bHasVendors;
  });

  // Pick from category
  const selected: BenchmarkPrompt[] = categoryPrompts.slice(0, categoryCount);

  // Fill remaining from other categories
  const remaining = count - selected.length;
  if (remaining > 0) {
    // Prefer cross-category prompts first, then diversity across categories
    const crossCategory = otherPrompts.filter(p => p.category === "cross-category");
    const nonCross = otherPrompts.filter(p => p.category !== "cross-category");

    // Shuffle non-cross-category prompts for diversity
    const shuffled = [...crossCategory, ...shuffleArray(nonCross)];
    selected.push(...shuffled.slice(0, remaining));
  }

  return selected.slice(0, count);
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
