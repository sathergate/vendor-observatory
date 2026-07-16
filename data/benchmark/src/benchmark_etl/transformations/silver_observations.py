"""Silver layer: Extract vendor mentions from raw transcripts.

Applies extract_vendor_mentions() per turn, explodes to one row per mention.
"""

from __future__ import annotations

import json

import dlt
from pyspark.sql.functions import col, udf, explode, current_timestamp
from pyspark.sql.types import ArrayType, DoubleType, StringType, StructField, StructType

from benchmark.extraction.extractor import extract_vendor_mentions
from benchmark.extraction.types import VendorTaxonomy
from benchmark.parsers.types import ParsedTurn, ToolUseRecord, ToolResultRecord
from taxonomy_loader import load_taxonomy

_mention_schema = StructType([
    StructField("vendor_canonical_id", StringType(), False),
    StructField("vendor_raw", StringType(), True),
    StructField("mention_type", StringType(), True),
    StructField("confidence", DoubleType(), True),
    StructField("context_snippet", StringType(), True),
])


def _extract_mentions_from_session(raw_turns_json: str, taxonomy: VendorTaxonomy) -> list[tuple]:
    """Extract all vendor mentions from a session's turns."""
    try:
        turns_data = json.loads(raw_turns_json)
    except (json.JSONDecodeError, TypeError):
        return []

    all_mentions = []
    user_prompt = None

    for t in turns_data:
        if t.get("role") == "user" and t.get("text_content"):
            user_prompt = t["text_content"][:200]

        turn = ParsedTurn(
            role=t.get("role", "user"),
            text_content=t.get("text_content", ""),
            tool_uses=[
                ToolUseRecord(
                    tool_name=tu.get("tool_name", ""),
                    input=tu.get("input", {}),
                    id=tu.get("id", ""),
                )
                for tu in t.get("tool_uses", [])
            ],
            tool_results=[
                ToolResultRecord(
                    tool_use_id=tr.get("tool_use_id", ""),
                    content=tr.get("content", ""),
                    is_error=tr.get("is_error", False),
                )
                for tr in t.get("tool_results", [])
            ],
            timestamp=t.get("timestamp", ""),
        )

        mentions = extract_vendor_mentions(turn, taxonomy, user_prompt)
        for m in mentions:
            all_mentions.append((
                m.vendor_canonical_id,
                m.vendor_raw,
                m.mention_type,
                m.confidence,
                m.context_snippet[:500] if m.context_snippet else None,
            ))

    return all_mentions


_taxonomy = load_taxonomy()


@dlt.table(
    name="observations",
    comment="Silver: vendor mentions extracted from transcript turns",
)
def observations():
    @udf(returnType=ArrayType(_mention_schema))
    def extract_mentions_udf(raw_turns_json):
        return _extract_mentions_from_session(raw_turns_json, _taxonomy)

    raw = dlt.read("raw_transcripts")

    return (
        raw.withColumn("mentions", extract_mentions_udf(col("raw_turns_json")))
        .withColumn("mention", explode(col("mentions")))
        .select(
            col("session_id"),
            col("mention.vendor_canonical_id").alias("vendor_canonical_id"),
            col("mention.vendor_raw").alias("vendor_raw"),
            col("mention.mention_type").alias("mention_type"),
            col("mention.confidence").alias("confidence"),
            col("mention.context_snippet").alias("context_snippet"),
            current_timestamp().alias("extracted_at"),
        )
    )
