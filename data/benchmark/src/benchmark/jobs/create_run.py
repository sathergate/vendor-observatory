"""Create a benchmark run — populates worker_queue with prompt×agent pairs.

Run via: databricks bundle run create_benchmark_run
"""

from __future__ import annotations

import argparse
import uuid
from datetime import date, datetime, timezone

import psycopg2
from pyspark.dbutils import DBUtils
from pyspark.sql import SparkSession


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="benchmarks")
    parser.add_argument("--schema", default="dev")
    parser.add_argument("--budget-usd", type=float, default=30.0)
    parser.add_argument("--assistants", default="claude_code,codex_cli,cursor")
    parser.add_argument("--category", default="")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    spark = SparkSession.builder.getOrCreate()

    catalog = args.catalog
    schema = args.schema
    budget_usd = args.budget_usd
    assistants_raw = args.assistants
    category_filter = args.category

    assistants = [a.strip() for a in assistants_raw.split(",") if a.strip()]
    run_date = date.today().isoformat()
    run_id = str(uuid.uuid4())

    # Ensure Databricks tables exist (benchmark_runs, prompts — NOT worker_queue)
    _ensure_tables(spark, catalog, schema)

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

    # Create benchmark_runs row (stays in Databricks)
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

    # Insert queue rows into PostgreSQL
    dbutils = DBUtils(spark)
    database_url = dbutils.secrets.get(scope="benchmark", key="database_url")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            for prompt in prompts:
                for agent in assistants:
                    task_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO worker_queue
                            (id, run_id, prompt_id, agent, prompt_text, prompt_template,
                             prompt_category, prompt_metadata_json, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                        """,
                        (
                            task_id,
                            run_id,
                            prompt["id"],
                            agent,
                            prompt["text"] or "",
                            prompt["template"] or "",
                            prompt["category"] or "",
                            prompt["metadata"] or "{}",
                        ),
                    )
        conn.commit()
    finally:
        conn.close()

    print(f"Created benchmark run {run_id}: {total_pairs} pairs ({len(prompts)} prompts × {len(assistants)} agents)")


def _ensure_tables(spark: SparkSession, catalog: str, schema: str) -> None:
    """Ensure Databricks run management tables exist."""
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


if __name__ == "__main__":
    main()
