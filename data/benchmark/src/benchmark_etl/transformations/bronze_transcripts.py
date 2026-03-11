"""Bronze layer: Auto Loader reads JSONL transcript files from UC Volumes.

Dispatches to the correct parser (Claude Code / Codex CLI / Cursor) based on file path.
Outputs structured raw_transcripts rows.
"""

from __future__ import annotations

import json

import dlt
from pyspark.sql.functions import col, udf, input_file_name, current_timestamp
from pyspark.sql.types import ArrayType, StringType, StructField, StructType, IntegerType

from benchmark.parsers.claude_code import parse_claude_code_jsonl
from benchmark.parsers.codex_cli import parse_codex_cli_jsonl
from benchmark.parsers.cursor_agent import parse_cursor_agent_jsonl

# Schema for the parsed session output
_session_schema = StructType([
    StructField("session_id", StringType(), False),
    StructField("platform", StringType(), False),
    StructField("model_id", StringType(), True),
    StructField("cwd", StringType(), True),
    StructField("started_at", StringType(), True),
    StructField("turn_count", IntegerType(), True),
    StructField("raw_turns_json", StringType(), True),
])


def _parse_transcript(content: str, file_path: str) -> list[tuple]:
    """Parse a JSONL transcript and return session tuples."""
    # Determine parser from file path
    if "/codex" in file_path.lower() or "codex_cli" in file_path.lower():
        sessions = parse_codex_cli_jsonl(content, file_path)
    elif "/cursor" in file_path.lower() or "cursor" in file_path.lower():
        sessions = parse_cursor_agent_jsonl(content, file_path)
    else:
        sessions = parse_claude_code_jsonl(content, file_path)

    results = []
    for s in sessions:
        turns_json = json.dumps([
            {
                "role": t.role,
                "text_content": t.text_content,
                "tool_uses": [{"tool_name": tu.tool_name, "input": tu.input, "id": tu.id} for tu in t.tool_uses],
                "tool_results": [{"tool_use_id": tr.tool_use_id, "content": tr.content, "is_error": tr.is_error} for tr in t.tool_results],
                "timestamp": t.timestamp,
            }
            for t in s.turns
        ])
        results.append((
            s.id,
            s.platform,
            s.model_id,
            s.cwd,
            s.started_at,
            len(s.turns),
            turns_json,
        ))
    return results


@dlt.table(
    name="raw_transcripts",
    comment="Bronze: parsed transcript sessions from JSONL files in UC Volumes",
)
def raw_transcripts():
    # Read raw JSONL files using Auto Loader
    raw_df = (
        dlt.read_stream("transcript_files")
        if False  # Placeholder — actual Auto Loader config is in pipeline YAML
        else _read_with_autoloader()
    )
    return raw_df


def _read_with_autoloader():
    """Configure Auto Loader to read JSONL files from UC Volumes."""
    from pyspark.sql import SparkSession

    spark = SparkSession.builder.getOrCreate()
    catalog = spark.conf.get("spark.databricks.benchmark.catalog", "benchmarks")
    schema = spark.conf.get("spark.databricks.benchmark.schema", "dev")

    volumes_schema = spark.conf.get("spark.databricks.benchmark.volumes_schema", "default")
    volumes_path = f"/Volumes/{catalog}/{volumes_schema}/transcripts/"

    # Use cloudFiles Auto Loader for incremental ingestion
    raw = (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "text")
        .option("cloudFiles.inferColumnTypes", "false")
        .option("wholetext", "true")
        .load(volumes_path)
    )

    parse_udf = udf(_parse_transcript_udf, ArrayType(_session_schema))

    return (
        raw.withColumn("file_path", input_file_name())
        .withColumn("sessions", parse_udf(col("value"), col("file_path")))
        .selectExpr("explode(sessions) as session")
        .select(
            col("session.session_id").alias("session_id"),
            col("session.platform").alias("platform"),
            col("session.model_id").alias("model_id"),
            col("session.cwd").alias("cwd"),
            col("session.started_at").alias("started_at"),
            col("session.turn_count").alias("turn_count"),
            col("session.raw_turns_json").alias("raw_turns_json"),
            input_file_name().alias("transcript_path"),
            current_timestamp().alias("ingested_at"),
        )
    )


def _parse_transcript_udf(content: str, file_path: str):
    """UDF wrapper for parsing transcripts."""
    return _parse_transcript(content, file_path)
