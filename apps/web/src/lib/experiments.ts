import { cookies } from "next/headers";

export type ExperimentVariant = "control" | "treatment";

export interface ExperimentAssignment {
  variant: ExperimentVariant;
  experimentId: string;
}

/**
 * Deterministic A/B assignment based on a cookie.
 * Sets a cookie if none exists. Returns the same variant for the same user.
 */
export async function getExperimentAssignment(experimentId: string): Promise<ExperimentAssignment> {
  const cookieStore = await cookies();
  const cookieName = `exp_${experimentId}`;
  const existing = cookieStore.get(cookieName)?.value;

  if (existing === "control" || existing === "treatment") {
    return { variant: existing, experimentId };
  }

  // Assign randomly, 50/50
  const variant: ExperimentVariant = Math.random() < 0.5 ? "control" : "treatment";
  cookieStore.set(cookieName, variant, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return { variant, experimentId };
}
