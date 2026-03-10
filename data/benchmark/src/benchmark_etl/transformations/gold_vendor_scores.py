"""Gold layer: Aggregated vendor scores per benchmark run."""

from __future__ import annotations

import dlt
from pyspark.sql.functions import col, countDistinct, lit, round as spark_round, least
from pyspark.sql import functions as F


@dlt.table(
    name="vendor_scores",
    comment="Gold: aggregated vendor mention/install/config rates per benchmark run",
)
def vendor_scores():
    observations = dlt.read("observations")
    raw = dlt.read("raw_transcripts")

    # Count total sessions per run
    session_counts = (
        raw.select("session_id", "transcript_path")
        .withColumn("run_id", F.regexp_extract(col("transcript_path"), r"/(\w{8}-\w{4}-\w{4}-\w{4}-\w{12})/", 1))
        .groupBy("run_id")
        .agg(countDistinct("session_id").alias("total_sessions"))
    )

    # Join observations with run_id
    obs_with_run = (
        observations.join(raw.select("session_id", "transcript_path"), "session_id")
        .withColumn("run_id", F.regexp_extract(col("transcript_path"), r"/(\w{8}-\w{4}-\w{4}-\w{4}-\w{12})/", 1))
    )

    # Aggregate per run × vendor
    mention_agg = (
        obs_with_run.groupBy("run_id", "vendor_canonical_id")
        .agg(
            countDistinct("session_id").alias("mention_sessions"),
            countDistinct(F.when(col("mention_type") == "installed", col("session_id"))).alias("install_sessions"),
            countDistinct(F.when(col("mention_type").isin("configured", "implemented"), col("session_id"))).alias("config_sessions"),
        )
    )

    return (
        mention_agg.join(session_counts, "run_id")
        .select(
            col("run_id"),
            col("vendor_canonical_id"),
            spark_round(col("mention_sessions") * 100.0 / col("total_sessions"), 1).alias("mention_rate"),
            spark_round(col("install_sessions") * 100.0 / col("total_sessions"), 1).alias("install_rate"),
            spark_round(col("config_sessions") * 100.0 / col("total_sessions"), 1).alias("config_rate"),
            least(
                lit(100),
                spark_round(
                    col("mention_sessions") * 100.0 / col("total_sessions") * 0.4
                    + col("install_sessions") * 100.0 / col("total_sessions") * 0.4
                    + col("config_sessions") * 100.0 / col("total_sessions") * 0.2,
                ),
            ).alias("ai_readiness"),
            col("total_sessions").alias("session_count"),
        )
    )
