export interface SavedAnalysis {
  id: string;
  name: string;
  description: string;
  queryType: string;
  queryParams: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export const STARTER_ANALYSES: Omit<SavedAnalysis, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Top Competitors",
    description: "Vendors most frequently winning against your product",
    queryType: "vendorWinRate",
    queryParams: { sort: "wins_desc" },
  },
  {
    name: "Lost Constraints",
    description: "Technical constraints where your product loses most often",
    queryType: "constraintCorrelation",
    queryParams: { sort: "loss_rate_desc" },
  },
  {
    name: "Rejections Trend",
    description: "Rejection rate over time across all vendors",
    queryType: "vendorWinRate",
    queryParams: { view: "timeline", metric: "rejections" },
  },
  {
    name: "Recommendation Funnel",
    description: "Mentioned → Recommended → Installed → Configured conversion",
    queryType: "vendorWinRate",
    queryParams: { view: "funnel" },
  },
];

export function generateAnalysisId(): string {
  return `sa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
