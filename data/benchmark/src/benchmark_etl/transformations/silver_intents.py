"""Silver layer: Classify developer intent from prompt text."""

from __future__ import annotations

import json

import dlt
from pyspark.sql.functions import col, udf, current_timestamp
from pyspark.sql.types import DoubleType, StringType, StructField, StructType

from benchmark.extraction.intent_classifier import classify_intent

_intent_schema = StructType([
    StructField("intent", StringType(), True),
    StructField("confidence", DoubleType(), True),
    StructField("sub_intent", StringType(), True),
    StructField("classifier", StringType(), True),
])


@udf(returnType=_intent_schema)
def classify_intent_udf(raw_turns_json: str) -> tuple | None:
    """Extract the first user message and classify its intent."""
    try:
        turns_data = json.loads(raw_turns_json)
    except (json.JSONDecodeError, TypeError):
        return None

    # Get the first user message as the prompt
    prompt_text = ""
    for t in turns_data:
        if t.get("role") == "user" and t.get("text_content"):
            prompt_text = t["text_content"]
            break

    if not prompt_text:
        return ("unknown", 0.0, None, "rule")

    result = classify_intent(prompt_text)
    return (result.intent, result.confidence, result.sub_intent, result.classifier)


@dlt.table(
    name="prompt_intents",
    comment="Silver: developer intent classification for benchmark prompts",
)
def prompt_intents():
    raw = dlt.read("raw_transcripts")

    return (
        raw.withColumn("intent_result", classify_intent_udf(col("raw_turns_json")))
        .select(
            col("session_id"),
            col("intent_result.intent").alias("intent"),
            col("intent_result.confidence").alias("confidence"),
            col("intent_result.sub_intent").alias("sub_intent"),
            col("intent_result.classifier").alias("classifier"),
            current_timestamp().alias("classified_at"),
        )
    )
