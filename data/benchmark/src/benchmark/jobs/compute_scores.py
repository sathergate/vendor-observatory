"""Compute vendor scores for completed benchmark runs.

Run via: databricks bundle run process_transcripts (Task 2, after DLT refresh)
"""

from __future__ import annotations

import argparse
from datetime import date

from pyspark.sql import SparkSession

from benchmark.scoring.scorer import compute_scores, compute_vendor_scores_daily


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="benchmarks")
    parser.add_argument("--schema", default="dev")
    parser.add_argument("--run-id", default="")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    spark = SparkSession.builder.getOrCreate()

    catalog = args.catalog
    schema = args.schema
    run_id = args.run_id

    _ensure_gold_tables(spark, catalog, schema)

    if run_id:
        # Score a specific run
        compute_scores(spark, catalog, schema, run_id)
        # Also update daily aggregate
        run_date_row = spark.sql(f"""
            SELECT run_date FROM {catalog}.{schema}.benchmark_runs WHERE id = '{run_id}'
        """).collect()
        if run_date_row:
            compute_vendor_scores_daily(spark, catalog, schema, str(run_date_row[0]["run_date"]))
        print(f"Scores computed for run {run_id}")
    else:
        # Score all runs from today that haven't been scored yet
        today = date.today().isoformat()
        unscored = spark.sql(f"""
            SELECT br.id
            FROM {catalog}.{schema}.benchmark_runs br
            WHERE br.run_date = '{today}'
              AND br.id NOT IN (SELECT DISTINCT run_id FROM {catalog}.{schema}.vendor_scores)
        """).collect()

        for row in unscored:
            compute_scores(spark, catalog, schema, row["id"])
            print(f"Scored run {row['id']}")

        if unscored:
            compute_vendor_scores_daily(spark, catalog, schema, today)

        print(f"Scored {len(unscored)} runs for {today}")


def _ensure_gold_tables(spark: SparkSession, catalog: str, schema: str) -> None:
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {catalog}.{schema}.vendor_scores (
            run_id STRING NOT NULL,
            vendor_canonical_id STRING NOT NULL,
            mention_rate DOUBLE,
            install_rate DOUBLE,
            config_rate DOUBLE,
            ai_readiness DOUBLE,
            session_count INT
        )
        USING DELTA
    """)

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {catalog}.{schema}.vendor_scores_daily (
            run_date STRING NOT NULL,
            vendor_canonical_id STRING NOT NULL,
            mention_rate DOUBLE,
            install_rate DOUBLE,
            config_rate DOUBLE,
            ai_readiness DOUBLE
        )
        USING DELTA
    """)


if __name__ == "__main__":
    main()
