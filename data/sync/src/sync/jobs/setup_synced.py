"""Create synced table definitions to replicate adapter tables into Lakebase Postgres.

One-off job. After the adapter tables exist in benchmarks.sync, this creates
Databricks synced tables (triggered mode) that replicate them into the
Lakebase Postgres database.

Run via: databricks bundle run setup_synced_tables
"""

from __future__ import annotations

import argparse

from databricks.sdk import WorkspaceClient


TABLES = [
    ("sessions", ["id"]),
    ("observations", ["session_id", "vendor_canonical_id", "mention_type"]),
    ("response_context", ["session_id", "prompt_id"]),
    ("prompt_metadata", ["prompt_id"]),
]

DATABASE_PROJECT = "vendor-observatory"
DATABASE_BRANCH = "production"
LOGICAL_DATABASE = "databricks_postgres"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="benchmarks")
    parser.add_argument("--schema", default="sync")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    catalog = args.catalog
    schema = args.schema

    w = WorkspaceClient()

    for table_name, pk_cols in TABLES:
        full_name = f"{catalog}.{schema}.{table_name}"
        print(f"Creating synced table: {full_name} (PK: {pk_cols})")

        # Use raw API because the SDK dataclass doesn't yet have
        # database_project / database_branch fields.
        body = {
            "name": full_name,
            "database_project": DATABASE_PROJECT,
            "database_branch": DATABASE_BRANCH,
            "logical_database_name": LOGICAL_DATABASE,
            "spec": {
                "source_table_full_name": full_name,
                "primary_key_columns": pk_cols,
                "scheduling_policy": "TRIGGERED",
                "create_database_objects_if_missing": True,
            },
        }
        w.api_client.do("POST", "/api/2.0/database/synced_tables", body=body)

        print(f"  done: {full_name}")

    print(f"\nAll {len(TABLES)} synced tables created. Trigger a sync to populate Lakebase Postgres.")


if __name__ == "__main__":
    main()
