/**
 * Databricks HTTP API client — plain fetch() wrapper.
 *
 * Communicates with Databricks via:
 * - Files API (/api/2.0/fs/files) for transcript upload to UC Volumes
 * - Jobs API (/api/2.1/jobs/run-now) for triggering pipeline after uploads
 *
 * Auth via DATABRICKS_HOST + DATABRICKS_TOKEN env vars.
 * No additional npm packages required.
 */

export interface DatabricksConfig {
  host: string;
  token: string;
  catalog: string;
  schema: string;
  volumesSchema: string;
  warehouseId: string;
}

export function loadDatabricksConfig(): DatabricksConfig {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const catalog = process.env.DATABRICKS_CATALOG ?? "benchmarks";
  const schema = process.env.DATABRICKS_SCHEMA ?? "prod";
  const volumesSchema = process.env.DATABRICKS_VOLUMES_SCHEMA ?? "default";
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID ?? "";

  if (!host || !token) {
    throw new Error("DATABRICKS_HOST and DATABRICKS_TOKEN must be set");
  }

  return { host: host.replace(/\/$/, ""), token, catalog, schema, volumesSchema, warehouseId };
}

// ── Files API: Upload transcript to UC Volumes ──────────────────────

/**
 * Upload a transcript JSONL file to UC Volumes.
 * Path: /Volumes/{catalog}/{schema}/transcripts/{run_date}/{agent}/{prompt_id}.jsonl
 */
export async function uploadTranscript(
  config: DatabricksConfig,
  filePath: string,
  content: string,
): Promise<void> {
  const url = `${config.host}/api/2.0/fs/files${filePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/octet-stream",
    },
    body: content,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Databricks Files API error (${res.status}): ${text}`);
  }
}

// ── Jobs API: Trigger pipeline refresh ──────────────────────────────

/**
 * Trigger a Databricks job run (e.g., process_transcripts after uploads complete).
 */
export async function triggerJob(
  config: DatabricksConfig,
  jobId: string | number,
): Promise<string> {
  const url = `${config.host}/api/2.1/jobs/run-now`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job_id: Number(jobId) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Databricks Jobs API error (${res.status}): ${text}`);
  }

  const data = await res.json() as { run_id: number };
  return String(data.run_id);
}
