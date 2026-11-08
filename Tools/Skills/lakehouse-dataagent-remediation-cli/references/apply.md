<!-- Mode reference for the `lakehouse-dataagent-remediation-cli` skill. Loaded on demand from `skills/lakehouse-dataagent-remediation-cli/SKILL.md` when the request matches the `apply` mode. -->

# Apply — write an approved plan (backup, write, readback)

Precondition: a persisted `remediation-plan.md` the user approved in an earlier reply. Apply exactly the approved `C##` items. If anything in the environment changed since the plan (definition no longer matches `before/`, tables renamed), stop and re-run `assess`/`plan`.

Order: **1 backup → 2 lakehouse comments (if approved) → 3 agent draft definition → 4 readback**. Each step ends with proof; failures stop the run and are reported with the exact error.

## 1. Backup and drift check

Re-export the definition (`getDefinition`, see `assess.md`) and compare it with `before/`. They must be identical except for service-assigned noise; otherwise stop. Keep `before/` untouched; it is the rollback source.

## 2. Lakehouse comments (`SOURCE_COMMENT`, only if approved)

Metadata-only Spark DDL through a Lakehouse Livy session (`spark-cli` consumption describes the session API). Requires write permission on the lakehouse; skip tables where it is denied and report them.

```python
spark.sql("COMMENT ON TABLE fact_ord IS 'One row per customer order. Use ord_dt for the order date.'")
spark.sql("ALTER TABLE fact_ord ALTER COLUMN amt_cents COMMENT 'Order amount in US cents; divide by 100 for dollars.'")
```

- Both statements were verified on a lakehouse; `ALTER TABLE ... CHANGE COLUMN <c> <c> <TYPE> COMMENT '...'` also works. Use schema-qualified names (`dbo.fact_ord`) on schema-enabled lakehouses.
- Escape single quotes by doubling them. Never use `CREATE OR REPLACE`, `DROP`, `INSERT`, `UPDATE`, or `DELETE`.
- Read back with `DESCRIBE TABLE EXTENDED <table>`: the table description is the `Comment` row, columns show in the `comment` column. Store the result in `after/comments.json`.
- Delete the Livy session when finished.
- The agent inherits available source descriptions unless an agent-level description overrides them; the SQL analytics endpoint does not expose the comments, so readback is through Spark only.

## 3. Agent draft definition (`AGENT_DESCRIPTION`, `SOURCE_DESCRIPTION`, `SOURCE_INSTRUCTIONS`, `FEWSHOT`, `SELECTION`, `AGENT_INSTRUCTIONS`)

`POST /v1/workspaces/{ws}/items/{agentId}/updateDefinition` with `{"definition": {"parts": [...]}}` is a long-running operation (poll `Location`; no `/result` body needed). Verified semantics:

- **It replaces the whole definition.** Send every part from the fresh export, with only the approved draft parts changed. A part you omit is deleted (omitting `fewshots.json` removes all examples).
- Change **only** `Files/Config/draft/...`. The `published/` parts must be sent back byte-for-byte as exported; they stayed unchanged in testing.
- Parts: `{"path": "<exact path>", "payload": "<base64 of UTF-8 JSON>", "payloadType": "InlineBase64"}`. Paths keep their capitalization (`Files/Config/...`).
- A new `fewshots.json` in the draft folder `Files/Config/draft/<type>-<name>/fewshots.json` is accepted; each item needs a new `uuid` `id`, `question`, `query`.
- Keep every `elements[].id`. Edit `description` (string; `null` means none) and `is_selected` in place; do not rebuild the tree.

Reference implementation (verified end to end; helper functions `request`, `lro`, `get_definition` follow the patterns in `assess.md`):

```python
import base64, json, uuid, re

def b64(t): return base64.b64encode(t.encode("utf-8")).decode("ascii")

def only_select(sql):
    body = re.sub(r"--[^\n]*|/\*.*?\*/", " ", sql, flags=re.S).strip().lower()
    banned = r"\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|into)\b"
    return bool(re.match(r"^(select|with)\b", body)) and not re.search(banned, body) and ";" not in body.rstrip("; ")

parts = get_definition(ws, agent_id)          # {path: text}, from a fresh export
DS = f"Files/Config/draft/{ds_folder}/datasource.json"
FS = f"Files/Config/draft/{ds_folder}/fewshots.json"
SC = "Files/Config/draft/stage_config.json"

ds = json.loads(parts[DS])
ds["userDescription"] = SOURCE_DESCRIPTION            # C-items approved in the plan
ds["dataSourceInstructions"] = SOURCE_INSTRUCTIONS
tables = ds["elements"][0]["children"][0]["children"][0]["children"]   # Schemas > dbo > Tables > tables
for t in tables:
    if t["display_name"] in DESELECT: t["is_selected"] = False
    if t["display_name"] in TABLE_DESC: t["description"] = TABLE_DESC[t["display_name"]]
    for c in t["children"]:
        d = COLUMN_DESC.get((t["display_name"], c["display_name"]))
        if d: c["description"] = d

fewshots = {"$schema": "1.0.0", "fewShots": []}
for q, sql in EXAMPLES:                               # validated below on the SQL endpoint
    assert only_select(sql), f"Not a read-only query: {q}"
    cur.execute(sql); cur.fetchmany(5)                # raises on invalid SQL -> drop the example
    fewshots["fewShots"].append({"id": str(uuid.uuid4()), "question": q, "query": sql})

parts[DS] = json.dumps(ds, indent=2)
parts[FS] = json.dumps(fewshots, indent=2)
if AGENT_INSTRUCTIONS is not None:
    sc = json.loads(parts[SC]); sc["aiInstructions"] = AGENT_INSTRUCTIONS; parts[SC] = json.dumps(sc, indent=2)

body = {"definition": {"parts": [{"path": p, "payload": b64(t), "payloadType": "InlineBase64"} for p, t in parts.items()]}}
status, headers, payload = request("POST", f"{BASE}/workspaces/{ws}/items/{agent_id}/updateDefinition", body)
lro(status, headers, payload, fetch_result=False)     # raises unless the operation Succeeded
```

Example-query validation rules, in this order: `only_select` lint → run on the SQL endpoint (reject on any error) → question/literal mapping check → duplicates and contradictions against the other examples → at most 100 in total. If the lakehouse tables are not yet visible on the SQL endpoint, wait for the endpoint to sync (`provisioningStatus`), do not write unvalidated examples.

Optional extra check: the SDK `datasource.evaluate_few_shots(batch_size=20)` (SQL sources only, preview) in a Fabric notebook.

## 4. Readback (required)

Re-export the definition and compare against what was sent:
- every approved `C##` value is present and byte-equal;
- `Files/Config/published/...` parts are unchanged from `before/`;
- parts not in the plan are unchanged.
Save the export to `after/`. A mismatch is a failed apply: report it, do not claim success.

## Gotchas

- `updateDefinition` on a draft does not publish. Tell the user the changes are in the draft and that publishing (portal, or SDK `publish_staging(description=...)`) is their decision. This skill does not publish.
- Throttling: honor `Retry-After` on 429; re-acquire the token inside long polls.
- Do not edit `data_agent.json`, `.platform`, or `publish_info.json`.
- Do not flip `enableExperimentalFeatures` unless the plan explicitly says so.
- Descriptions on the agent side stop inheriting later source updates for those objects.
- Do not log or write tokens; the run folder must not contain credentials.
