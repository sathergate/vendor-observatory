"""Transform benchmarks.prod tables into webapp-compatible adapter tables.

Reads from benchmarks.prod (raw_transcripts, observations, response_context, worker_queue)
and writes reshaped data into benchmarks.sync with CDF enabled for synced table replication.

Run via: databricks bundle run adapt_for_webapp
"""

from __future__ import annotations

import argparse
import json

from pyspark.sql import SparkSession


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="benchmarks")
    parser.add_argument("--source-schema", default="prod")
    parser.add_argument("--target-schema", default="sync")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    spark = SparkSession.builder.getOrCreate()

    catalog = args.catalog
    src = f"{catalog}.{args.source_schema}"
    tgt = f"{catalog}.{args.target_schema}"

    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {tgt}")

    # Build session_id → prompt lookup once, reuse across tables
    session_prompt_df = spark.sql(f"""
        SELECT DISTINCT
            wq.prompt_id,
            wq.prompt_category,
            wq.prompt_metadata_json,
            rt.session_id
        FROM {src}.worker_queue wq
        JOIN {src}.raw_transcripts rt ON rt.transcript_path = wq.transcript_path
        WHERE wq.status = 'completed'
    """)
    session_prompt_df.createOrReplaceTempView("session_prompt_lookup")

    _sync_sessions(spark, src, tgt)
    _sync_observations(spark, src, tgt)
    _sync_response_context(spark, src, tgt)
    _sync_prompt_metadata(spark, tgt)

    print(f"Adapter tables synced: {src} → {tgt}")


def _ensure_table(spark: SparkSession, table: str, ddl: str) -> None:
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {table} (
            {ddl}
        )
        USING DELTA
        TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
    """)


def _sync_sessions(spark: SparkSession, src: str, tgt: str) -> None:
    table = f"{tgt}.sessions"
    _ensure_table(spark, table, """
        id STRING NOT NULL,
        source_platform STRING,
        model_id STRING,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        cwd STRING,
        git_branch STRING,
        turn_count INT,
        file_path STRING,
        is_benchmark BOOLEAN
    """)

    spark.sql(f"""
        SELECT
            rt.session_id AS id,
            rt.platform AS source_platform,
            rt.model_id,
            rt.started_at,
            CAST(NULL AS TIMESTAMP) AS ended_at,
            rt.cwd,
            CAST(NULL AS STRING) AS git_branch,
            rt.turn_count,
            rt.transcript_path AS file_path,
            TRUE AS is_benchmark
        FROM {src}.raw_transcripts rt
    """).createOrReplaceTempView("sessions_staging")

    spark.sql(f"""
        MERGE INTO {table} AS target
        USING sessions_staging AS source
        ON target.id = source.id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)

    count = spark.sql(f"SELECT COUNT(*) AS n FROM {table}").collect()[0]["n"]
    print(f"  sessions: {count} rows")


def _sync_observations(spark: SparkSession, src: str, tgt: str) -> None:
    table = f"{tgt}.observations"
    _ensure_table(spark, table, """
        session_id STRING NOT NULL,
        vendor_canonical_id STRING NOT NULL,
        vendor_raw STRING,
        mention_type STRING NOT NULL,
        work_category STRING,
        confidence DOUBLE,
        context_snippet STRING,
        user_prompt_snippet STRING,
        timestamp TIMESTAMP
    """)

    # Deduplicate on PK to avoid MERGE conflicts
    spark.sql(f"""
        SELECT
            session_id,
            vendor_canonical_id,
            mention_type,
            ANY_VALUE(vendor_raw) AS vendor_raw,
            ANY_VALUE(work_category) AS work_category,
            MAX(confidence) AS confidence,
            ANY_VALUE(context_snippet) AS context_snippet,
            CAST(NULL AS STRING) AS user_prompt_snippet,
            ANY_VALUE(timestamp) AS timestamp
        FROM (
            SELECT
                o.session_id,
                o.vendor_canonical_id,
                o.vendor_raw,
                o.mention_type,
                spl.prompt_category AS work_category,
                o.confidence,
                o.context_snippet,
                o.extracted_at AS timestamp
            FROM {src}.observations o
            LEFT JOIN (
                SELECT session_id, ANY_VALUE(prompt_category) AS prompt_category
                FROM session_prompt_lookup
                GROUP BY session_id
            ) spl ON spl.session_id = o.session_id
        )
        GROUP BY session_id, vendor_canonical_id, mention_type
    """).createOrReplaceTempView("observations_staging")

    spark.sql(f"""
        MERGE INTO {table} AS target
        USING observations_staging AS source
        ON target.session_id = source.session_id
            AND target.vendor_canonical_id = source.vendor_canonical_id
            AND target.mention_type = source.mention_type
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)

    count = spark.sql(f"SELECT COUNT(*) AS n FROM {table}").collect()[0]["n"]
    print(f"  observations: {count} rows")


def _sync_response_context(spark: SparkSession, src: str, tgt: str) -> None:
    table = f"{tgt}.response_context"
    _ensure_table(spark, table, """
        session_id STRING NOT NULL,
        prompt_id STRING NOT NULL,
        primary_vendor STRING,
        is_implemented BOOLEAN,
        rationale_snippet STRING,
        vendors_mentioned STRING,
        trade_offs_snippet STRING,
        gotchas_snippet STRING,
        constraints_addressed STRING,
        reasoning_chain STRING,
        disqualification_reasons STRING,
        confidence_score DOUBLE,
        extracted_at TIMESTAMP
    """)

    # Deduplicate on PK to avoid MERGE conflicts
    spark.sql(f"""
        SELECT
            session_id,
            prompt_id,
            ANY_VALUE(primary_vendor) AS primary_vendor,
            ANY_VALUE(is_implemented) AS is_implemented,
            ANY_VALUE(rationale_snippet) AS rationale_snippet,
            ANY_VALUE(vendors_mentioned) AS vendors_mentioned,
            CAST(NULL AS STRING) AS trade_offs_snippet,
            CAST(NULL AS STRING) AS gotchas_snippet,
            ANY_VALUE(constraints_addressed) AS constraints_addressed,
            ANY_VALUE(reasoning_chain) AS reasoning_chain,
            CAST(NULL AS STRING) AS disqualification_reasons,
            ANY_VALUE(confidence_score) AS confidence_score,
            ANY_VALUE(extracted_at) AS extracted_at
        FROM (
            SELECT
                rc.session_id,
                spl.prompt_id,
                rc.primary_vendor,
                rc.is_implemented,
                rc.rationale_snippet,
                rc.vendors_mentioned,
                rc.constraints_addressed,
                rc.reasoning_chain,
                rc.confidence_score,
                rc.extracted_at
            FROM {src}.response_context rc
            JOIN (
                SELECT DISTINCT session_id, prompt_id
                FROM session_prompt_lookup
            ) spl ON spl.session_id = rc.session_id
        )
        GROUP BY session_id, prompt_id
    """).createOrReplaceTempView("response_context_staging")

    spark.sql(f"""
        MERGE INTO {table} AS target
        USING response_context_staging AS source
        ON target.session_id = source.session_id
            AND target.prompt_id = source.prompt_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)

    count = spark.sql(f"SELECT COUNT(*) AS n FROM {table}").collect()[0]["n"]
    print(f"  response_context: {count} rows")


def _sync_prompt_metadata(spark: SparkSession, tgt: str) -> None:
    table = f"{tgt}.prompt_metadata"
    _ensure_table(spark, table, """
        prompt_id STRING NOT NULL,
        category STRING,
        content_tags STRING,
        pattern_tags STRING,
        constraints STRING,
        existing_stack STRING,
        failure_mode STRING,
        vendors_named_in_prompt STRING
    """)

    # Parse metadata JSON from worker_queue via the lookup view
    rows = spark.sql("""
        SELECT DISTINCT prompt_id, prompt_category, prompt_metadata_json
        FROM session_prompt_lookup
        WHERE prompt_id IS NOT NULL
    """).collect()

    if not rows:
        print("  prompt_metadata: 0 rows (no data)")
        return

    parsed = []
    for row in rows:
        meta = {}
        if row["prompt_metadata_json"]:
            try:
                meta = json.loads(row["prompt_metadata_json"])
            except (json.JSONDecodeError, TypeError):
                pass

        parsed.append((
            row["prompt_id"],
            row["prompt_category"],
            json.dumps(meta.get("content_tags", [])),
            json.dumps(meta.get("pattern_tags", [])),
            json.dumps(meta.get("constraints", [])),
            json.dumps(meta.get("existing_stack", [])),
            meta.get("failure_mode"),
            json.dumps(meta.get("vendors_named_in_prompt", [])),
        ))

    from pyspark.sql.types import StructType, StructField, StringType

    schema = StructType([
        StructField("prompt_id", StringType(), False),
        StructField("category", StringType(), True),
        StructField("content_tags", StringType(), True),
        StructField("pattern_tags", StringType(), True),
        StructField("constraints", StringType(), True),
        StructField("existing_stack", StringType(), True),
        StructField("failure_mode", StringType(), True),
        StructField("vendors_named_in_prompt", StringType(), True),
    ])

    df = spark.createDataFrame(parsed, schema=schema)
    df.createOrReplaceTempView("prompt_metadata_staging")

    spark.sql(f"""
        MERGE INTO {table} AS target
        USING prompt_metadata_staging AS source
        ON target.prompt_id = source.prompt_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)

    print(f"  prompt_metadata: {len(parsed)} rows")


if __name__ == "__main__":
    main()
