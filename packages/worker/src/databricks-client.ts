/**
 * Databricks HTTP API client — plain fetch() wrapper.
 *
 * Communicates with Databricks via:
 * - SQL Statements API (/api/2.0/sql/statements) for queue polling and updates
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
  warehouseId: string;
}

export interface QueueTask {
  id: string;
  run_id: string;
  prompt_id: string;
  agent: string;
  prompt_text: string;
  prompt_template: string;
  prompt_category: string;
  prompt_metadata_json: string;
}

export function loadDatabricksConfig(): DatabricksConfig {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const catalog = process.env.DATABRICKS_CATALOG ?? "benchmarks";
  const schema = process.env.DATABRICKS_SCHEMA ?? "dev";
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID ?? "";

  if (!host || !token) {
    throw new Error("DATABRICKS_HOST and DATABRICKS_TOKEN must be set");
  }

  return { host: host.replace(/\/$/, ""), token, catalog, schema, warehouseId };
}

// ── SQL Statements API ──────────────────────────────────────────────

async function executeSql(
  config: DatabricksConfig,
  statement: string,
): Promise<{ columns: string[]; rows: string[][] }> {
  const url = `${config.host}/api/2.0/sql/statements`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      warehouse_id: config.warehouseId,
      statement,
      wait_timeout: "30s",
      on_wait_timeout: "CANCEL",
      catalog: config.catalog,
      schema: config.schema,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Databricks SQL error (${res.status}): ${text}`);
  }

  const data = await res.json() as {
    status: { state: string };
    manifest?: { schema?: { columns?: Array<{ name: string }> } };
    result?: { data_array?: string[][] };
  };

  if (data.status.state !== "SUCCEEDED") {
    throw new Error(`SQL statement state: ${data.status.state}`);
  }

  const columns = data.manifest?.schema?.columns?.map(c => c.name) ?? [];
  const rows = data.result?.data_array ?? [];
  return { columns, rows };
}

function rowsToObjects(columns: string[], rows: string[][]): Record<string, string>[] {
  return rows.map(row => {
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

// ── Queue Operations ────────────────────────────────────────────────

/**
 * Claim one pending task from the worker_queue.
 * Uses UPDATE ... WHERE to atomically claim.
 */
export async function claimTask(
  config: DatabricksConfig,
  workerId: string,
): Promise<QueueTask | null> {
  const { catalog, schema } = config;

  // First find a pending task
  const { columns, rows } = await executeSql(config, `
    SELECT id, run_id, prompt_id, agent, prompt_text, prompt_template, prompt_category, prompt_metadata_json
    FROM ${catalog}.${schema}.worker_queue
    WHERE status = 'pending'
    ORDER BY id
    LIMIT 1
  `);

  if (rows.length === 0) return null;

  const task = rowsToObjects(columns, rows)[0];

  // Claim it
  const now = new Date().toISOString();
  await executeSql(config, `
    UPDATE ${catalog}.${schema}.worker_queue
    SET status = 'claimed', claimed_at = '${now}', worker_id = '${workerId}'
    WHERE id = '${task.id}' AND status = 'pending'
  `);

  return {
    id: task.id,
    run_id: task.run_id,
    prompt_id: task.prompt_id,
    agent: task.agent,
    prompt_text: task.prompt_text,
    prompt_template: task.prompt_template,
    prompt_category: task.prompt_category,
    prompt_metadata_json: task.prompt_metadata_json,
  };
}

/**
 * Update a task's status after completion or failure.
 */
export async function updateTask(
  config: DatabricksConfig,
  taskId: string,
  update: {
    status: "running" | "completed" | "failed";
    transcript_path?: string;
    cost_usd?: number;
    duration_ms?: number;
    exit_code?: number;
    error?: string;
  },
): Promise<void> {
  const { catalog, schema } = config;
  const now = new Date().toISOString();

  const sets = [`status = '${update.status}'`];
  if (update.status === "completed" || update.status === "failed") {
    sets.push(`completed_at = '${now}'`);
  }
  if (update.transcript_path) {
    sets.push(`transcript_path = '${update.transcript_path}'`);
  }
  if (update.cost_usd !== undefined) {
    sets.push(`cost_usd = ${update.cost_usd}`);
  }
  if (update.duration_ms !== undefined) {
    sets.push(`duration_ms = ${update.duration_ms}`);
  }
  if (update.exit_code !== undefined) {
    sets.push(`exit_code = ${update.exit_code}`);
  }
  if (update.error) {
    const escaped = update.error.replace(/'/g, "''").slice(0, 1000);
    sets.push(`error = '${escaped}'`);
  }

  await executeSql(config, `
    UPDATE ${catalog}.${schema}.worker_queue
    SET ${sets.join(", ")}
    WHERE id = '${taskId}'
  `);
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
