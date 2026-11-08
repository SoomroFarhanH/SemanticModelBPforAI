<!-- Mode reference for the `dataagent-cli` skill. Loaded on demand from `skills/dataagent-cli/SKILL.md` when the request matches the `authoring` mode. -->

# Authoring — create and configure the agent draft

Preconditions: an approved spec or remediation plan (`planning.md`), or an explicit, narrow instruction from the user for a small edit. Everything here writes the **draft** stage only. Publishing is `management.md`.

Order: **1 backup → 2 build changes → 3 validate → 4 write → 5 readback**. A failed step stops the run and reports the exact error.

Read once before writing: [definition-format.md](definition-format.md), [context-playbook.md](context-playbook.md), the reference for each source type involved (listed in SKILL.md), and [routing.md](routing.md) when there is more than one source.

## Helper functions (Python, standard library + `pyodbc` only for SQL profiling)

```python
import base64, json, re, subprocess, time, urllib.request, urllib.error, uuid
BASE = "https://api.fabric.microsoft.com/v1"
SKILL = "dataagent-cli"

def token(resource="https://api.fabric.microsoft.com"):
    return subprocess.check_output(["az", "account", "get-access-token", "--resource", resource,
                                    "--query", "accessToken", "-o", "tsv"], text=True).strip()   # Windows: "az.cmd"

def request(method, url, body=None):
    h = {"Authorization": "Bearer " + token(), "Content-Type": "application/json", "x-ms-fabric-skill": SKILL}
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read(); p = json.loads(raw) if raw else {}
            return r.status, {k.lower(): v for k, v in r.headers.items()}, (p or {})
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url}: HTTP {e.code}: {e.read().decode('utf-8', 'replace')}") from e

def lro(status, headers, payload, result=True):
    if status != 202: return payload
    loc, wait = headers["location"], int(headers.get("retry-after", "3"))
    while True:
        time.sleep(min(max(wait, 2), 10))
        _, h, p = request("GET", loc)
        if p.get("status") == "Succeeded":
            return request("GET", loc.rstrip("/") + "/result")[2] if result else p
        if p.get("status") in ("Failed", "Cancelled"): raise RuntimeError(json.dumps(p))
        wait = int(h.get("retry-after", "3"))

b64 = lambda t: base64.b64encode((t if isinstance(t, str) else json.dumps(t, indent=2)).encode()).decode()

def get_definition(ws, item):
    out = lro(*request("POST", f"{BASE}/workspaces/{ws}/items/{item}/getDefinition"))
    return {p["path"]: base64.b64decode(p["payload"]).decode() for p in out["definition"]["parts"]}

def to_parts(files):                                   # {path: text} -> API parts
    return [{"path": p, "payload": b64(t), "payloadType": "InlineBase64"} for p, t in files.items()]

def update_definition(ws, item, files):                # FULL replace: pass every part
    return lro(*request("POST", f"{BASE}/workspaces/{ws}/items/{item}/updateDefinition",
                        {"definition": {"parts": to_parts(files)}}), result=False)

def only_select(sql):                                  # read-only lint for SQL examples
    body = re.sub(r"--[^\n]*|/\*.*?\*/", " ", sql, flags=re.S).strip().lower()
    banned = r"\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|into)\b"
    return bool(re.match(r"^(select|with)\b", body)) and not re.search(banned, body) and ";" not in body.rstrip("; ")
```

On Windows call `az.cmd`. Honor `Retry-After` on 429 and re-acquire the token inside long polls. Never log tokens.

## A. Create a new agent

Two routes; choose per source.

**Route 1 — REST definition (verified for lakehouse sources).** Build the parts yourself and create the item with them:

```python
# SQL source: build the element tree from the SQL endpoint's metadata (cur = pyodbc cursor on the endpoint)
cur.execute("SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA='dbo' ORDER BY TABLE_NAME, ORDINAL_POSITION")
tables = {}
for t, c, d in cur.fetchall(): tables.setdefault(t, []).append((c, d))
node = lambda **k: {"id": str(uuid.uuid4()), "description": None, "children": [], **k}
table_nodes = [node(is_selected=(t in SELECTED), display_name=t, type="lakehouse_tables.table",
                    children=[node(is_selected=True, display_name=c, type="lakehouse_tables.column", data_type=d)
                              for c, d in cols]) for t, cols in tables.items()]
datasource = {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/dataSource/1.0.0/schema.json",
  "artifactId": LAKEHOUSE_ID, "workspaceId": WS, "dataSourceInstructions": None, "displayName": LAKEHOUSE_NAME,
  "type": "lakehouse_tables", "userDescription": None, "metadata": None,
  "elements": [node(is_selected=False, display_name="Schemas", type="schema_grouping", children=[
      node(is_selected=False, display_name="dbo", type="lakehouse_tables.schema", children=[
          node(is_selected=False, display_name="Tables", type="table_grouping", children=table_nodes)])])]}

folder = "lakehouse-tables-" + LAKEHOUSE_NAME
stage = {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/stageConfiguration/1.0.0/schema.json",
         "aiInstructions": None, "experimental": {"enableExperimentalFeatures": False}}   # standard runtime unless decided otherwise
files = {"Files/Config/data_agent.json": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/dataAgent/2.1.0/schema.json"},
         "Files/Config/publish_info.json": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/publishInfo/1.0.0/schema.json", "description": ""},
         ".platform": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
                       "metadata": {"type": "DataAgent", "displayName": NAME}, "config": {"version": "2.0", "logicalId": "00000000-0000-0000-0000-000000000000"}}}
for s in ("draft", "published"):                       # creation requires the published stage parts as well
    files[f"Files/Config/{s}/stage_config.json"] = stage
    files[f"Files/Config/{s}/{folder}/datasource.json"] = datasource
item = lro(*request("POST", f"{BASE}/workspaces/{WS}/items",
                    {"displayName": NAME, "type": "DataAgent", "definition": {"parts": to_parts({p: (t if isinstance(t, str) else json.dumps(t, indent=2)) for p, t in files.items()})}}))
```

Creation fails with `The import definition must include 'Files/Config/published/stage_config.json' ...` if the published stage is omitted (verified). Creating this way therefore also creates a **published stage identical to the draft**: treat the new agent as published, keep refining only the draft afterwards, and republish deliberately (`management.md`). Prefer the SDK route when you want a draft-only agent.

**Route 2 — SDK (`fabric-data-agent-sdk`, preview; documented).** Resolves each source's schema server-side, so prefer it for semantic models, KQL, warehouses and other sources whose element trees you have not exported:

```python
from fabric.dataagent.client import create_data_agent
agent = create_data_agent(data_agent_name=NAME, workspace_id=WS)
agent.update_settings(ai_instructions=AGENT_INSTRUCTIONS)
agent.add_staging_datasource(artifact_name_or_id=SOURCE_ID, workspace_id_or_name=WS)
ds = agent.get_datasources()[0]
ds.update_description({("Schemas", "dbo", "Tables", "orders"): "One row per order."})   # SQL, preview runtime; path is case-sensitive
ds.add_fewshots({"Question": "SQL"})                                                      # then evaluate_few_shots
```

(Outside Fabric authenticate with `AzureCliCredential` + `SetFabricAnalyticsDefaultTokenCredentialsGlobally`.) After SDK steps, export the definition (`get_definition`) and continue with route B for precise edits. For each source type confirm the result by readback and the Analyzer on first use.

## B. Change an existing agent (or finish a new one)

```python
files = get_definition(WS, AGENT_ID)                       # fresh export; save to before/ (backup) first
DS = f"Files/Config/draft/{folder}/datasource.json"
FS = f"Files/Config/draft/{folder}/fewshots.json"
SC = "Files/Config/draft/stage_config.json"
ds = json.loads(files[DS])
ds["userDescription"] = SOURCE_DESCRIPTION                 # SQL, KQL, graph only (not semantic models)
ds["dataSourceInstructions"] = SOURCE_INSTRUCTIONS         # SQL, KQL, graph only
def walk(nodes):
    for n in nodes:
        yield n; yield from walk(n.get("children") or [])
for n in walk(ds["elements"]):                             # edit in place; keep ids
    if n["type"].endswith(".table") and n["display_name"] in DESELECT: n["is_selected"] = False
    d = DESCRIPTIONS.get(n["display_name"]) if n["type"].endswith((".table", ".column", ".measure")) else None
    if d: n["description"] = d                             # SQL: preview runtime; semantic model: model metadata
files[DS] = json.dumps(ds, indent=2)
files[FS] = json.dumps({"$schema": "1.0.0", "fewShots": [      # validated examples only (step 3)
    {"id": str(uuid.uuid4()), "question": q, "query": s} for q, s in VALIDATED_EXAMPLES]}, indent=2)
sc = json.loads(files[SC]); sc["aiInstructions"] = AGENT_INSTRUCTIONS; files[SC] = json.dumps(sc, indent=2)
update_definition(WS, AGENT_ID, files)                     # complete set of parts; published/ re-sent unchanged
```

Description keys in the sketch use the object name; in a real run key them by (table, column) path to avoid collisions across tables. Apply only the approved plan items.

## C. Validate before writing (step 3)

| Source | Validation |
|---|---|
| SQL | `only_select` lint, then run on the SQL endpoint with `TOP` bounds; reject on any error; literals in the question appear in the query; ≤100 examples; no duplicates/contradictions |
| KQL | run bounded (`| take 10`, short time window) through the Eventhouse query endpoint; reject on error |
| Graph | run bounded GQL (`LIMIT`) in the graph item; reject on error |
| Semantic model | no agent-level examples; verified answers are Prep for AI work |
| Instructions/descriptions | length sane; no secrets or IDs; no routing rule naming an absent source; consistent with the other layers |

Optional extra for SQL: SDK `datasource.evaluate_few_shots(batch_size=20)` (preview).

## D. Readback (step 5, required)

Re-export and check: every approved change present and byte-equal; `published/` parts equal the backup; unplanned parts unchanged; source count ≤ 5. Save to `after/`. A mismatch is a failed apply — report it; do not claim success. Then hand over to `evaluation.md`.

## Pitfalls

- `updateDefinition` replaces everything; a missing part is a deleted part.
- Never edit `data_agent.json`, `.platform`, `publish_info.json` or any `published/` part.
- Do not change `enableExperimentalFeatures` without an explicit decision.
- Agent-level descriptions stop inheriting later source descriptions for those objects.
- Source or semantic-model changes (comments, Prep for AI) are separate items executed by their own skills and approved separately.
