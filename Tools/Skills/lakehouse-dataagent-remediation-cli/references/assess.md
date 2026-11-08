<!-- Mode reference for the `lakehouse-dataagent-remediation-cli` skill. Loaded on demand from `skills/lakehouse-dataagent-remediation-cli/SKILL.md` when the request matches the `assess` mode. -->

# Assess — read-only evidence for a lakehouse data agent

Nothing in this mode writes to Fabric. Output: a run folder with the agent backup, Analyzer evidence, and a profile of the lakehouse tables the agent selects.

## Run folder

Create `_remediation/<agent-name>/<UTC yyyyMMddTHHmmssZ>/` and keep everything for this task there:

```
before/            # decoded agent definition (backup, exactly as exported)
evidence/          # Analyzer JSON, profile.json, comments.json
remediation-plan.md  (written by `plan`)
after/             # written by `verify`
```

Reuse it across modes; do not create a second run folder for the same task.

## 1. Resolve targets

List and filter, never guess. Use `GET /v1/workspaces/{ws}/items?type=DataAgent` and `?type=Lakehouse`.

> **Gotcha:** `GET /v1/workspaces/{ws}/lakehouses[/{id}]` returns `404 CapacityNotActive` when the workspace capacity is paused, while `GET .../items` still lists items. On `CapacityNotActive` stop and report it; do not resume capacity.

## 2. Export the agent definition (backup)

`POST /v1/workspaces/{ws}/items/{agentId}/getDefinition` is a long-running operation: poll `Location` (honor `Retry-After`), then `GET {Location}/result`. Decode every part (`payloadType` `InlineBase64`) into `before/` keeping the path, for example `Files/Config/draft/lakehouse-tables-<name>/datasource.json`.

Parts you will meet (paths are capitalized `Files/Config/...`):

| Part | Holds |
|---|---|
| `Files/Config/data_agent.json` | schema version only |
| `Files/Config/draft/stage_config.json` | `aiInstructions` (agent instructions), `experimental.enableExperimentalFeatures` |
| `Files/Config/draft/<type>-<name>/datasource.json` | `userDescription` (source description), `dataSourceInstructions`, `elements[]` tree with `is_selected` and `description` per schema/table/column |
| `Files/Config/draft/<type>-<name>/fewshots.json` | `{ "$schema": "1.0.0", "fewShots": [{ "id", "question", "query" }] }`; absent when there are no examples |
| `Files/Config/published/...` | the published copy of the same files; read-only for this skill |
| `Files/Config/publish_info.json`, `.platform` | publish description, item metadata |

Lakehouse sources have `type` `lakehouse_tables` (folder prefix `lakehouse-tables-`). Table nodes are `lakehouse_tables.table`, columns `lakehouse_tables.column`. Selection exists only at table level; column-level selection is not supported in the definition.

Runtime signal: `stage_config.experimental.enableExperimentalFeatures = true` marks the **preview runtime**, the same signal the Analyzer reports. Schema object descriptions are available only on the preview runtime. Record the runtime; the `plan` mode depends on it.

## 3. Analyzer evidence (preferred starting point)

1. If the user already has Analyzer output, read `readiness_<agent>_evidence.json`: `findings[]` (with `rule_id`, `status`, `severity`, `object_path`, `evidence`, `recommendation`), `action_items[]`, `scorecard`.
2. Otherwise run the Analyzer notebook (`Analyzer/FabricDataAgentAnalyzer`) in `GIT_EXPORT` mode with `GIT_EXPORT_ROOT` pointing at the exported `Files/Config` folder, query/performance/evaluation flags `False`. It is static: it reads configuration only and cannot judge answer quality.
3. Keep the pre-remediation `scorecard` and the list of `(rule_id, status, object_path)` for `verify`.

Lakehouse-relevant rules and the fix each one calls for are in [best-practices-map.md](best-practices-map.md).

## 4. Profile the selected tables (read-only)

Use the lakehouse **SQL analytics endpoint** (T-SQL, SELECT only) for profiling; use Spark only for comments (see below). Connection string: `GET /v1/workspaces/{ws}/lakehouses/{id}` → `properties.sqlEndpointProperties.connectionString`, and wait for `provisioningStatus = Success`. Database name = lakehouse name.

Authentication from Python (token audience `https://database.windows.net`):

```python
import struct, subprocess, pyodbc
tok = subprocess.check_output(["az", "account", "get-access-token", "--resource", "https://database.windows.net",
                               "--query", "accessToken", "-o", "tsv"], text=True).strip().encode("utf-16-le")
blob = struct.pack(f"<I{len(tok)}s", len(tok), tok)
cn = pyodbc.connect(f"Driver={{ODBC Driver 18 for SQL Server}};Server={SERVER};Database={LAKEHOUSE};Encrypt=yes",
                    attrs_before={1256: blob}, timeout=60)   # 1256 = SQL_COPT_SS_ACCESS_TOKEN
```

(`sqlcmd -G` works as an alternative; see COMMON-CLI.md.) On Windows call `az.cmd` from `subprocess`.

Profile **only the tables selected in the agent** (`is_selected = true`) plus the ones flagged by `DA-011` / `SQL-008` as candidates to deselect:

| Goal | Query pattern (T-SQL) |
|---|---|
| Columns and types | `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' ORDER BY TABLE_NAME, ORDINAL_POSITION` |
| Row count / grain | `SELECT COUNT(*) AS n FROM dbo.<t>`; key candidate: `COUNT(*) = COUNT(DISTINCT <col>)` |
| Null rate | `SELECT AVG(CASE WHEN <col> IS NULL THEN 1.0 ELSE 0 END) FROM dbo.<t>` |
| Low-cardinality values (codes, flags, status) | `SELECT TOP 25 <col>, COUNT(*) AS n FROM dbo.<t> GROUP BY <col> ORDER BY n DESC` — only when `COUNT(DISTINCT <col>) <= 25` |
| Date range | `SELECT MIN(<col>), MAX(<col>) FROM dbo.<t>` |
| Numeric range / unit hint | `SELECT MIN(<col>), MAX(<col>), AVG(CAST(<col> AS float)) FROM dbo.<t>` |
| Join candidates | same column name and compatible type in two tables; confirm with `SELECT COUNT(*) FROM <a> x LEFT JOIN <b> y ON y.<k> = x.<k> WHERE y.<k> IS NULL` (orphan count) |
| Fan-out check | row count of `<fact> JOIN <dim>` equals row count of `<fact>` |

Cost control: for tables above roughly 10 million rows, profile from `SELECT TOP 1000000 ...` and say that the profile is a sample. The SQL endpoint does not support `TABLESAMPLE`. Never profile with `SELECT *` output into the chat; write summaries to `evidence/profile.json`.

Also detect, by name pattern, objects that should not be selected: `stg_`, `staging`, `raw`, `bronze`, `tmp`, `temp`, `bak`, `_archive`, `_old`, `audit`, and near-duplicate base names.

## 5. Existing lakehouse comments (optional, for the `COMMENT` scope)

Only when the user wants source-level comments in scope. Through a Lakehouse Livy session (see `spark-cli` consumption) capture current comments so they can be restored:

```python
spark.sql("DESCRIBE TABLE EXTENDED <table>").toPandas()   # table 'Comment' row + per-column 'comment'
```

Save to `evidence/comments.json`. Livy path: `POST /v1/workspaces/{ws}/lakehouses/{lh}/livyapi/versions/2023-12-01/sessions`; reuse an idle session, wait for `idle`, delete the session when done.

## Output of `assess`

A short summary for the user: runtime, number of sources (routing applies only when more than one), selected objects, Analyzer score and the top failing rules, tables lacking descriptions, objects suspected as noise, and any `CapacityNotActive` or permission blockers. Then move to `plan`.
