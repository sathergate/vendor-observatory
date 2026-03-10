"""Create a benchmark run — populates worker_queue with prompt×agent pairs.

Run via: databricks bundle run create_benchmark_run
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from pyspark.sql import SparkSession


def main() -> None:
    spark = SparkSession.builder.getOrCreate()

    catalog = spark.conf.get("spark.databricks.benchmark.catalog", "benchmarks")
    schema = spark.conf.get("spark.databricks.benchmark.schema", "dev")
    budget_usd = float(spark.conf.get("spark.databricks.benchmark.budget_usd", "30.0"))
    assistants_raw = spark.conf.get("spark.databricks.benchmark.assistants", "claude_code,codex_cli,cursor")
    category_filter = spark.conf.get("spark.databricks.benchmark.category", "")

    assistants = [a.strip() for a in assistants_raw.split(",") if a.strip()]
    run_date = date.today().isoformat()
    run_id = str(uuid.uuid4())

    # Check budget — cumulative cost for rolling 30-day window
    budget_check = spark.sql(f"""
        SELECT COALESCE(SUM(total_cost_usd), 0) AS total_cost
        FROM {catalog}.{schema}.benchmark_runs
        WHERE run_date >= DATE_SUB(CURRENT_DATE(), 30)
    """).collect()

    cumulative_cost = budget_check[0]["total_cost"] if budget_check else 0
    if cumulative_cost >= budget_usd:
        print(f"Budget exceeded: ${cumulative_cost:.2f} >= ${budget_usd:.2f} in last 30 days. Skipping run.")
        return

    # Read active prompts
    prompt_query = f"SELECT * FROM {catalog}.{schema}.prompts WHERE is_active = TRUE"
    if category_filter:
        prompt_query += f" AND category = '{category_filter}'"
    prompts_df = spark.sql(prompt_query)
    prompts = prompts_df.collect()

    if not prompts:
        print("No active prompts found. Skipping run.")
        return

    total_pairs = len(prompts) * len(assistants)
    now = datetime.now(timezone.utc).isoformat()

    # Create benchmark_runs row
    _ensure_tables(spark, catalog, schema)

    spark.sql(f"""
        INSERT INTO {catalog}.{schema}.benchmark_runs
        VALUES (
            '{run_id}', 'daily', '{run_date}', {budget_usd},
            ARRAY({','.join(f"'{a}'" for a in assistants)}),
            {"'" + category_filter + "'" if category_filter else 'NULL'},
            {total_pairs}, 0, 0, 0.0,
            '{now}', NULL
        )
    """)

    # Generate all prompt × agent pairs → insert into worker_queue as pending
    queue_values = []
    for prompt in prompts:
        for agent in assistants:
            task_id = str(uuid.uuid4())
            # Escape single quotes in text
            prompt_text = (prompt["text"] or "").replace("'", "''")
            prompt_metadata = (prompt["metadata"] or "{}").replace("'", "''")
            queue_values.append(
                f"('{task_id}', '{run_id}', '{prompt['id']}', '{agent}', "
                f"'{prompt_text}', '{prompt.get('template', '')}', '{prompt.get('category', '')}', "
                f"'{prompt_metadata}', 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
            )

    # Insert in batches of 100
    batch_size = 100
    for i in range(0, len(queue_values), batch_size):
        batch = queue_values[i : i + batch_size]
        spark.sql(f"""
            INSERT INTO {catalog}.{schema}.worker_queue
            (id, run_id, prompt_id, agent, prompt_text, prompt_template, prompt_category,
             prompt_metadata_json, status, claimed_at, completed_at, worker_id, transcript_path,
             cost_usd, duration_ms, exit_code, error)
            VALUES {', '.join(batch)}
        """)

    print(f"Created benchmark run {run_id}: {total_pairs} pairs ({len(prompts)} prompts × {len(assistants)} agents)")


def _ensure_tables(spark: SparkSession, catalog: str, schema: str) -> None:
    """Ensure run management tables exist."""
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {catalog}.{schema}.benchmark_runs (
            id STRING NOT NULL,
            run_type STRING,
            run_date DATE,
            budget_usd DOUBLE,
            assistants ARRAY<STRING>,
            category STRING,
            total_pairs INT,
            successful INT,
            failed INT,
            total_cost_usd DOUBLE,
            started_at STRING,
            completed_at STRING
        )
        USING DELTA
    """)

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {catalog}.{schema}.worker_queue (
            id STRING NOT NULL,
            run_id STRING,
            prompt_id STRING,
            agent STRING,
            prompt_text STRING,
            prompt_template STRING,
            prompt_category STRING,
            prompt_metadata_json STRING,
            status STRING,
            claimed_at STRING,
            completed_at STRING,
            worker_id STRING,
            transcript_path STRING,
            cost_usd DOUBLE,
            duration_ms LONG,
            exit_code INT,
            error STRING
        )
        USING DELTA
    """)


if __name__ == "__main__":
    main()
