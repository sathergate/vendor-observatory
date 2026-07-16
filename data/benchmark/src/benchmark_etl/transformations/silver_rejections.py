"""Silver layer: Extract vendor rejections from raw transcripts."""

from __future__ import annotations

import json

import dlt
from pyspark.sql.functions import col, udf, explode, current_timestamp
from pyspark.sql.types import ArrayType, StringType, StructField, StructType

from benchmark.extraction.rejection_extractor import extract_vendor_rejections
from benchmark.extraction.types import VendorTaxonomy
from benchmark.parsers.types import ParsedTurn, ToolUseRecord, ToolResultRecord
from taxonomy_loader import load_taxonomy

_rejection_schema = StructType([
    StructField("vendor_canonical_id", StringType(), False),
    StructField("rejection_reason", StringType(), True),
    StructField("chosen_alternative", StringType(), True),
])


def _extract_rejections_from_session(raw_turns_json: str, taxonomy: VendorTaxonomy) -> list[tuple]:
    try:
        turns_data = json.loads(raw_turns_json)
    except (json.JSONDecodeError, TypeError):
        return []

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

    rejections = extract_vendor_rejections(turns, taxonomy)
    return [(r.vendor_canonical_id, r.rejection_reason, r.chosen_alternative) for r in rejections]


_taxonomy = load_taxonomy()


@dlt.table(
    name="vendor_rejections",
    comment="Silver: vendor rejections extracted from transcript turns",
)
def vendor_rejections():
    @udf(returnType=ArrayType(_rejection_schema))
    def extract_rejections_udf(raw_turns_json):
        return _extract_rejections_from_session(raw_turns_json, _taxonomy)

    raw = dlt.read("raw_transcripts")

    return (
        raw.withColumn("rejections", extract_rejections_udf(col("raw_turns_json")))
        .withColumn("rejection", explode(col("rejections")))
        .select(
            col("session_id"),
            col("rejection.vendor_canonical_id").alias("vendor_canonical_id"),
            col("rejection.rejection_reason").alias("rejection_reason"),
            col("rejection.chosen_alternative").alias("chosen_alternative"),
            current_timestamp().alias("extracted_at"),
        )
    )
