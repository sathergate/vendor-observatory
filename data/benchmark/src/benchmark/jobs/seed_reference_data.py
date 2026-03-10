"""Seed reference data into Delta tables.

Loads vendors.yaml, package_map.json, and prompts.json into Unity Catalog tables.
Run via: databricks bundle run seed_reference_data
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import yaml
from pyspark.sql import SparkSession
from pyspark.sql.types import ArrayType, StringType, StructField, StructType, BooleanType


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="benchmarks")
    parser.add_argument("--schema", default="dev")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    spark = SparkSession.builder.getOrCreate()

    catalog = args.catalog
    schema = args.schema

    fixtures_dir = Path(__file__).resolve().parents[3] / "fixtures"

    _seed_vendors(spark, catalog, schema, fixtures_dir)
    _seed_package_map(spark, catalog, schema, fixtures_dir)
    _seed_prompts(spark, catalog, schema, fixtures_dir)

    print(f"Reference data seeded into {catalog}.{schema}")


def _seed_vendors(spark: SparkSession, catalog: str, schema: str, fixtures_dir: Path) -> None:
    """Load vendors from taxonomy YAML into Delta table."""
    vendors_path = fixtures_dir / "vendors.yaml"
    if not vendors_path.exists():
        # Fall back to repo root taxonomy
        vendors_path = Path(__file__).resolve().parents[5] / "taxonomy" / "vendors.yaml"

    with open(vendors_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    vendors = data.get("vendors", [])

    vendor_schema = StructType([
        StructField("canonical_id", StringType(), False),
        StructField("display_name", StringType(), False),
        StructField("synonyms", ArrayType(StringType()), True),
        StructField("category", StringType(), True),
        StructField("website", StringType(), True),
    ])

    rows = [
        (
            v["canonical_id"],
            v["display_name"],
            v.get("synonyms", []),
            v.get("category", ""),
            v.get("website", ""),
        )
        for v in vendors
    ]

    df = spark.createDataFrame(rows, schema=vendor_schema)

    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {catalog}.{schema}.vendors (
            canonical_id STRING NOT NULL,
            display_name STRING NOT NULL,
            synonyms ARRAY<STRING>,
            category STRING,
            website STRING
        )
        USING DELTA
    """)

    table = f"{catalog}.{schema}.vendors"
    df.createOrReplaceTempView("vendors_staging")
    spark.sql(f"""
        MERGE INTO {table} AS target
        USING vendors_staging AS source
        ON target.canonical_id = source.canonical_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)
    print(f"  vendors: {len(rows)} rows")


def _seed_package_map(spark: SparkSession, catalog: str, schema: str, fixtures_dir: Path) -> None:
    """Load package map from JSON into Delta table."""
    pkg_path = fixtures_dir / "package_map.json"

    if pkg_path.exists():
        with open(pkg_path, encoding="utf-8") as f:
            pkg_map = json.load(f)
    else:
        # Fall back to inline map from extraction module
        from benchmark.extraction.package_map import PACKAGE_TO_VENDOR

        pkg_map = PACKAGE_TO_VENDOR

    pkg_schema = StructType([
        StructField("package_name", StringType(), False),
        StructField("vendor_canonical_id", StringType(), False),
    ])

    rows = [(k, v) for k, v in pkg_map.items()]
    df = spark.createDataFrame(rows, schema=pkg_schema)

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {catalog}.{schema}.package_map (
            package_name STRING NOT NULL,
            vendor_canonical_id STRING NOT NULL
        )
        USING DELTA
    """)

    table = f"{catalog}.{schema}.package_map"
    df.createOrReplaceTempView("package_map_staging")
    spark.sql(f"""
        MERGE INTO {table} AS target
        USING package_map_staging AS source
        ON target.package_name = source.package_name
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)
    print(f"  package_map: {len(rows)} rows")


def _seed_prompts(spark: SparkSession, catalog: str, schema: str, fixtures_dir: Path) -> None:
    """Load prompts from JSON into Delta table."""
    prompts_path = fixtures_dir / "prompts.json"
    if not prompts_path.exists():
        print("  prompts: skipped (no prompts.json fixture)")
        return

    with open(prompts_path, encoding="utf-8") as f:
        prompts = json.load(f)

    prompt_schema = StructType([
        StructField("id", StringType(), False),
        StructField("kind", StringType(), True),
        StructField("category", StringType(), True),
        StructField("template", StringType(), True),
        StructField("text", StringType(), True),
        StructField("metadata", StringType(), True),
        StructField("is_active", BooleanType(), True),
    ])

    rows = [
        (
            p["id"],
            p.get("kind", "benchmark"),
            p.get("category", ""),
            p.get("template", ""),
            p.get("text", ""),
            json.dumps(p.get("metadata", {})),
            p.get("is_active", True),
        )
        for p in prompts
    ]

    df = spark.createDataFrame(rows, schema=prompt_schema)

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {catalog}.{schema}.prompts (
            id STRING NOT NULL,
            kind STRING,
            category STRING,
            template STRING,
            text STRING,
            metadata STRING,
            is_active BOOLEAN
        )
        USING DELTA
    """)

    table = f"{catalog}.{schema}.prompts"
    df.createOrReplaceTempView("prompts_staging")
    spark.sql(f"""
        MERGE INTO {table} AS target
        USING prompts_staging AS source
        ON target.id = source.id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)
    print(f"  prompts: {len(rows)} rows")


if __name__ == "__main__":
    main()
