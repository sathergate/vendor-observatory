"""Silver layer: Extract response context from raw transcripts."""

from __future__ import annotations

import json

import dlt
from pyspark.sql.functions import col, udf, current_timestamp
from pyspark.sql.types import ArrayType, BooleanType, DoubleType, StringType, StructField, StructType

from benchmark.extraction.reasoning_extractor import extract_response_context
from benchmark.extraction.types import VendorTaxonomy, VendorEntry
from benchmark.parsers.types import ParsedTurn, ToolUseRecord, ToolResultRecord

_context_schema = StructType([
    StructField("primary_vendor", StringType(), True),
    StructField("is_implemented", BooleanType(), True),
    StructField("rationale_snippet", StringType(), True),
    StructField("vendors_mentioned", StringType(), True),  # JSON array
    StructField("constraints_addressed", StringType(), True),  # JSON array
    StructField("reasoning_chain", StringType(), True),
    StructField("confidence_score", DoubleType(), True),
])


def _extract_context_from_session(raw_turns_json: str, taxonomy: VendorTaxonomy) -> tuple | None:
    try:
        turns_data = json.loads(raw_turns_json)
    except (json.JSONDecodeError, TypeError):
        return None

    turns = []
    for t in turns_data:
        turns.append(ParsedTurn(
            role=t.get("role", "user"),
            text_content=t.get("text_content", ""),
            tool_uses=[
                ToolUseRecord(tool_name=tu.get("tool_name", ""), input=tu.get("input", {}), id=tu.get("id", ""))
                for tu in t.get("tool_uses", [])
            ],
            tool_results=[
                ToolResultRecord(tool_use_id=tr.get("tool_use_id", ""), content=tr.get("content", ""), is_error=tr.get("is_error", False))
                for tr in t.get("tool_results", [])
            ],
            timestamp=t.get("timestamp", ""),
        ))

    ctx = extract_response_context(turns, taxonomy, [])

    vendors_json = json.dumps([{"vendor": v.vendor, "disposition": v.disposition} for v in ctx.vendors_mentioned])
    constraints_json = json.dumps(ctx.constraints_addressed)

    return (
        ctx.primary_vendor,
        ctx.is_implemented,
        ctx.rationale_snippet,
        vendors_json,
        constraints_json,
        ctx.reasoning_chain,
        ctx.confidence_score,
    )


@dlt.table(
    name="response_context",
    comment="Silver: extracted reasoning context from benchmark sessions",
)
def response_context():
    from pyspark.sql import SparkSession

    spark = SparkSession.builder.getOrCreate()
    catalog = spark.conf.get("spark.databricks.benchmark.catalog", "benchmarks")
    schema = spark.conf.get("spark.databricks.benchmark.schema", "dev")
    rows = spark.sql(f"SELECT * FROM {catalog}.{schema}.vendors").collect()
    taxonomy = VendorTaxonomy(vendors=[
        VendorEntry(canonical_id=r["canonical_id"], display_name=r["display_name"], synonyms=r["synonyms"] or [], category=r["category"] or "")
        for r in rows
    ])
    taxonomy_bc = spark.sparkContext.broadcast(taxonomy)

    @udf(returnType=_context_schema)
    def extract_context_udf(raw_turns_json):
        return _extract_context_from_session(raw_turns_json, taxonomy_bc.value)

    raw = dlt.read("raw_transcripts")

    return (
        raw.withColumn("ctx", extract_context_udf(col("raw_turns_json")))
        .select(
            col("session_id"),
            col("ctx.primary_vendor").alias("primary_vendor"),
            col("ctx.is_implemented").alias("is_implemented"),
            col("ctx.rationale_snippet").alias("rationale_snippet"),
            col("ctx.vendors_mentioned").alias("vendors_mentioned"),
            col("ctx.constraints_addressed").alias("constraints_addressed"),
            col("ctx.reasoning_chain").alias("reasoning_chain"),
            col("ctx.confidence_score").alias("confidence_score"),
            current_timestamp().alias("extracted_at"),
        )
    )
