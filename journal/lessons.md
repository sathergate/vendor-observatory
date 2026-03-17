# Lessons Learned

## Databricks SDK doesn't always match the REST API

The `databricks-sdk` Python package lags behind the REST API. The `SyncedDatabaseTable` dataclass doesn't have `database_project` or `database_branch` fields even though the REST API error message references them. When you hit SDK gaps, use `w.api_client.do("POST", "/api/2.0/...", body={...})` to call the REST API directly.

However, even the raw API approach didn't work here — the field names we tried (`database_project`, `database_branch`, `database_project_name`, `database_branch_name`) were all silently ignored. The API returned the same "must specify" error regardless. This suggests either the field names are different from what's documented, or the workspace/API version doesn't support them yet. Manual setup via the UI was the pragmatic path.

## Delta MERGE requires source-side deduplication

When doing `MERGE INTO ... USING staging ON (composite_key)`, if the staging data has duplicate rows for the same composite key, Spark throws `DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE`. This happens even on the first run when the target table is empty.

Two sources of duplication hit us:
1. **JOIN fan-out**: A session can map to multiple prompts in the lookup table, so `LEFT JOIN session_prompt_lookup` multiplied observation rows. Fix: aggregate the lookup to one row per session before joining.
2. **Source data duplicates**: The `observations` table itself had duplicate `(session_id, vendor_canonical_id, mention_type)` tuples. Fix: wrap the staging query in a `GROUP BY` on the composite PK with `ANY_VALUE()` for non-key columns.

Always deduplicate your staging data on the MERGE key before merging.

## Databricks job environment dependencies need version pins

The default `databricks-sdk` installed in Databricks serverless environments can be quite old. If you need recent API features (like the `database` service), you must explicitly pin the version in the job's environment dependencies: `databricks-sdk>=0.60`.

## replace_all on SQL table names needs care with string types

When bulk-replacing table names in TypeScript SQL queries, `replace_all` doesn't distinguish between regular strings (`"..."`) and template literals (`` `...` ``). If the original code uses regular strings, replacing `FROM sessions` with `FROM ${T_SESSIONS}` creates broken code — the `${...}` syntax only works in template literals. Always verify and convert to backtick strings after bulk replacement.

## Lakebase synced tables append _synced suffix

When Databricks creates synced tables in Lakebase Postgres, the resulting table names get a `_synced` suffix (e.g., `sessions` becomes `sessions_synced`). Plan for this when wiring up the consuming application.

## uv over pip

Use `uv build --wheel --out-dir dist` instead of `pip install build && python -m build`. Faster and preferred in this project.
