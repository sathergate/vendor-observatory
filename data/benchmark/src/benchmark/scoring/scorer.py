"""Benchmark scoring — Spark SQL version.

Port of packages/worker/src/scorer.ts, rewritten to use Spark SQL instead of pg queries.
Same formula: ai_readiness = mention_rate * 0.4 + install_rate * 0.4 + config_rate * 0.2
"""

from __future__ import annotations

from pyspark.sql import SparkSession


def compute_scores(spark: SparkSession, catalog: str, schema: str, run_id: str) -> None:
    """Compute vendor_scores for a benchmark run and write to the gold table.

    Aggregates observations → mention/install/config rates per run×vendor.
    Writes results to `{catalog}.{schema}.vendor_scores_computed`.
    """
    spark.sql(f"""
        MERGE INTO {catalog}.{schema}.vendor_scores_computed AS target
        USING (
            WITH sessions AS (
                SELECT DISTINCT wq.id AS queue_id, rt.session_id
                FROM {catalog}.{schema}.worker_queue wq
                JOIN {catalog}.{schema}.raw_transcripts rt
                    ON rt.transcript_path = wq.transcript_path
                WHERE wq.run_id = '{run_id}'
                    AND wq.status = 'completed'
            ),
            session_count AS (
                SELECT COUNT(DISTINCT session_id) AS total FROM sessions
            ),
            mention_counts AS (
                SELECT
                    o.vendor_canonical_id,
                    COUNT(DISTINCT o.session_id) AS mention_sessions,
                    COUNT(DISTINCT CASE WHEN o.mention_type = 'installed' THEN o.session_id END) AS install_sessions,
                    COUNT(DISTINCT CASE WHEN o.mention_type IN ('configured', 'implemented') THEN o.session_id END) AS config_sessions
                FROM {catalog}.{schema}.observations o
                JOIN sessions s ON s.session_id = o.session_id
                GROUP BY o.vendor_canonical_id
            )
            SELECT
                '{run_id}' AS run_id,
                mc.vendor_canonical_id,
                ROUND(mc.mention_sessions * 100.0 / sc.total, 1) AS mention_rate,
                ROUND(mc.install_sessions * 100.0 / sc.total, 1) AS install_rate,
                ROUND(mc.config_sessions * 100.0 / sc.total, 1) AS config_rate,
                LEAST(100, ROUND(
                    mc.mention_sessions * 100.0 / sc.total * 0.4
                    + mc.install_sessions * 100.0 / sc.total * 0.4
                    + mc.config_sessions * 100.0 / sc.total * 0.2
                )) AS ai_readiness,
                sc.total AS session_count
            FROM mention_counts mc
            CROSS JOIN session_count sc
            WHERE sc.total > 0
        ) AS source
        ON target.run_id = source.run_id AND target.vendor_canonical_id = source.vendor_canonical_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)


def compute_vendor_scores_daily(spark: SparkSession, catalog: str, schema: str, run_date: str) -> None:
    """Compute vendor_scores_daily for a given date.

    Aggregates across all runs on that date into a single time-series row per vendor.
    Writes results to `{catalog}.{schema}.vendor_scores_computed_daily`.
    """
    spark.sql(f"""
        MERGE INTO {catalog}.{schema}.vendor_scores_computed_daily AS target
        USING (
            SELECT
                '{run_date}' AS run_date,
                vs.vendor_canonical_id,
                ROUND(AVG(vs.mention_rate), 1) AS mention_rate,
                ROUND(AVG(vs.install_rate), 1) AS install_rate,
                ROUND(AVG(vs.config_rate), 1) AS config_rate,
                LEAST(100, ROUND(AVG(vs.ai_readiness))) AS ai_readiness
            FROM {catalog}.{schema}.vendor_scores_computed vs
            JOIN {catalog}.{schema}.benchmark_runs br ON br.id = vs.run_id
            WHERE br.run_date = '{run_date}'
            GROUP BY vs.vendor_canonical_id
        ) AS source
        ON target.run_date = source.run_date AND target.vendor_canonical_id = source.vendor_canonical_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)
