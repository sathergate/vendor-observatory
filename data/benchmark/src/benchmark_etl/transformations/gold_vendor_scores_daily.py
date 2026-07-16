"""Gold layer: Daily time-series vendor scores."""

from __future__ import annotations

import dlt
from pyspark.sql.functions import col, avg, least, lit
from pyspark.sql import functions as F


@dlt.table(
    name="vendor_scores_daily",
    comment="Gold: daily time-series vendor scores aggregated across runs",
)
def vendor_scores_daily():
    from pyspark.sql import SparkSession

    spark = SparkSession.builder.getOrCreate()
    catalog = spark.conf.get("spark.databricks.benchmark.catalog", "benchmarks")
    schema = spark.conf.get("spark.databricks.benchmark.schema", "dev")

    vendor_scores = dlt.read("vendor_scores")
    benchmark_runs = spark.table(f"{catalog}.{schema}.benchmark_runs")

    return (
        vendor_scores.join(benchmark_runs.select(col("id").alias("run_id"), "run_date"), "run_id")
        .groupBy("run_date", "vendor_canonical_id")
        .agg(
            F.round(avg("mention_rate"), 1).alias("mention_rate"),
            F.round(avg("install_rate"), 1).alias("install_rate"),
            F.round(avg("config_rate"), 1).alias("config_rate"),
            least(lit(100), F.round(avg("ai_readiness"))).alias("ai_readiness"),
        )
    )
