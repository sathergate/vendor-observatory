"""Load vendor taxonomy from Delta — kept outside DLT transformation files
so that DataFrame.collect() doesn't trigger DLT warnings.

Returns a plain Python object (not a broadcast variable) because serverless
DLT garbage-collects broadcast variables before executors can read them.
The taxonomy is small enough to serialize with UDF closures directly.
"""

from __future__ import annotations

from pyspark.sql import SparkSession

from benchmark.extraction.types import VendorTaxonomy, VendorEntry


def load_taxonomy() -> VendorTaxonomy:
    """Load vendor taxonomy from Delta table."""
    spark = SparkSession.builder.getOrCreate()
    catalog = spark.conf.get("spark.databricks.benchmark.catalog", "benchmarks")
    schema = spark.conf.get("spark.databricks.benchmark.schema", "dev")
    rows = spark.sql(f"SELECT * FROM {catalog}.{schema}.vendors").collect()
    return VendorTaxonomy(vendors=[
        VendorEntry(
            canonical_id=r["canonical_id"],
            display_name=r["display_name"],
            synonyms=r["synonyms"] or [],
            category=r["category"] or "",
            website=r["website"] if "website" in r else "",
        )
        for r in rows
    ])
