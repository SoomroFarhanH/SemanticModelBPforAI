# Fabric Data Agent Analyzer (v3.0.0)

[FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb) assesses a **Fabric data agent and every connected source**, then gives you a scorecard, release gates, and exportable findings. It's **read-only by default**, so it never changes the agent or its sources.

This folder also includes a [natural-language remediation agent](#power-bi-semantic-readiness-remediation-agent) that fixes the semantic-model findings for you.

- [How to use the analyzer](#how-to-use-the-analyzer)
- [What it checks](#what-it-checks)
- [Power BI Semantic Readiness Remediation Agent](#power-bi-semantic-readiness-remediation-agent)

## How to use the analyzer

### Step 1: Import the notebook into Fabric

1. In your Fabric workspace, select **Import → Notebook → From this computer**, then upload [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb).
2. Open the notebook and attach a **default lakehouse**. Exports are written to `/lakehouse/default/Files/DataAgentReadiness` (`OUTPUT_ROOT`).
3. Run the first code cell. It installs `semantic-link-labs`, `fabric-data-agent-sdk` (preview), `httpx`, and `pyyaml`.

> The identity that runs the notebook needs permission to view the agent configuration, plus read access on each source. The notebook's **Prerequisites** cell lists the minimum permission for each source type.

### Step 2: Set the parameters (section 1)

Pick the scenario that matches what you want to assess:

| I want to… | Set |
|---|---|
| Assess a live data agent | `DATA_AGENT_NAME_OR_ID`, `WORKSPACE_ID_OR_NAME`, `COLLECTION_MODE = "LIVE_SDK"`, and `DATA_AGENT_STAGE` (`sandbox` = draft, `production` = published) |
| Review a Git-synced agent definition (PR / CI) | `COLLECTION_MODE = "GIT_EXPORT"`, `GIT_EXPORT_ROOT` = the data agent item folder |
| Assess preview sources, or I have no API access | `COLLECTION_MODE = "MANUAL_MANIFEST"`, `MANUAL_MANIFEST_PATH` = a JSON/YAML manifest (an example is in section 3) |
| Assess one semantic model only (v2.x behavior) | Leave `DATA_AGENT_NAME_OR_ID` blank, then set `dataset` and `workspace` |

Optional switches (all are off by default except where noted):

| Parameter | What it does |
|---|---|
| `SKIP_UNSELECTED_SOURCES` | **On by default.** Skips the deep checks for sources that are connected but have no objects selected. |
| `RUN_LIVE_QUERY_TESTS` | Runs bounded, read-only smoke tests and executes example queries. |
| `RUN_PERFORMANCE_TESTS` | Samples example-query latency. Requires `RUN_LIVE_QUERY_TESTS`. |
| `RUN_FEW_SHOT_EVALUATOR` | Runs the SDK `evaluate_few_shots` (LLM-based, SQL sources only). |
| `RUN_EVALUATION` | Runs end-to-end evaluation against `EVALUATION_DATASET_PATH`. |
| `MANUAL_ATTESTATIONS` | Records manual checks you verified yourself. They count as evaluated with `USER_SUPPLIED` evidence. |
| `PREVIEW_ACCEPTED` / `FAIL_ON_PREVIEW_SOURCE` | Accept preview sources for a release, or treat them as a blocker. |

### Step 3: Run sections 2–4 and read the Source Run Plan

Run the cells down to section 4.1. **Source Run Plan** prints:

- every connected source and whether the agent actually uses it:
  - **✅ in use**: it has selected objects.
  - **⚠️ connected, nothing selected**: the agent can't query it.
  - **❔ unresolved type**: no checks can run on it.
- the source sections to **▶️ RUN** for this agent and the ones you can **⏭️ SKIP**.

If discovery shows warnings or finds no sources, fix the parameters or permissions before you go further.

### Step 4: Run the checks

1. Run section **4.2 Adapter framework** and section **5 Common agent checks**. Always run these.
2. Run only the source sections marked **▶️ RUN**:

   | Section | Source |
   |---|---|
   | §6 | Lakehouse, Warehouse, Fabric SQL Database, Mirrored Database |
   | §7 | Eventhouse KQL Database |
   | §8 + §16.2 | Power BI semantic model |
   | §9 · §10 · §11 | Graph Model · Fabric Ontology · Azure AI Search (preview) |

3. Run sections **12–17**: cross-source routing, example queries, evaluation, security, ALM, and the scorecard.

> 💡 **Run all** is also safe. Sections that don't apply finish instantly and report `NOT_APPLICABLE`.

### Step 5: Review the results

Section 17 shows the readiness score, evaluation coverage, and **release gates**. A blocker fails the release even when the average score is high. It also writes four exports to `OUTPUT_ROOT/<agent>/<timestamp>/`:

| File | Contents |
|---|---|
| `readiness_<agent>_report.html` | Shareable report |
| `readiness_<agent>_report.md` | Markdown report for PRs and wikis |
| `readiness_<agent>_findings.csv` | One row per rule and object |
| `readiness_<agent>_evidence.json` | Evidence bundle (`findings[]` with `rule_id`, `severity`, `status`, `source_name`, `object_path`, `evidence`, `recommendation`, and `docs_url`) |

### Step 6: Fix and re-run

1. Fix the findings, highest severity first. Each finding includes a recommendation and a docs link.
   - **Semantic-model findings (`SM-*`):** use the [remediation agent](#power-bi-semantic-readiness-remediation-agent) below, or [FabricDataAgentAnalyzer_SemanticModel_TE2.cs](FabricDataAgentAnalyzer_SemanticModel_TE2.cs) in Tabular Editor 2.
   - **Unused sources (`DA-011`):** select the objects the agent needs, or remove the source.
2. Re-run the notebook and compare the exports to confirm the fixes.

## What it checks

[FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb) (formerly `SemanticModel_DataAgent_Readiness.ipynb`) assesses a **Fabric data agent and every connected source** (up to five), not just a semantic model:

| Source family | Sources | Rule IDs |
|---|---|---|
| Common agent checks | Scope, instructions, routing, schema selection, runtime, preview risk, read-only contract | `DA-001` … `DA-026`, `EXQ-001` |
| SQL | Lakehouse, Warehouse, Fabric SQL Database, Mirrored Database | `SQL-*`, `LH-*`, `WH-*`, `SQLDB-*`, `MIR-*` |
| KQL | Eventhouse KQL Database | `KQL-*` |
| Semantic | Power BI semantic model (all v2.2.2 checks, stable IDs) | `SM-000` … `SM-027` |
| Preview | Graph Model, Fabric Ontology, Azure AI Search | `GRAPH-*`, `ONT-*`, `AIS-*` |
| Cross-source | Routing, metric/time/key consistency | `XSR-*` |

- **Collection modes:** `LIVE_SDK` (fabric-data-agent-sdk, preview), `GIT_EXPORT` (data agent Git item definition), and `MANUAL_MANIFEST` (JSON/YAML). Leave `DATA_AGENT_NAME_OR_ID` blank and set `dataset` + `workspace` to run the v2.x standalone semantic-model analysis.
- **Read-only by default.** Live smoke tests, example-query execution, and SDK evaluation are opt-in (`RUN_LIVE_QUERY_TESTS`, `RUN_EVALUATION`).
- **Source run plan (section 4.1):** runs right after discovery and shows which sources the agent actually uses and which source sections (§6–§11, §16.2) to run or skip. You don't have to run the whole notebook to find out. Sources that are connected but have no objects selected are flagged, and `SKIP_UNSELECTED_SOURCES = True` (the default) skips their deep checks. Each source section can be skipped on its own. **Run all** is still safe.
- **Statuses:** `PASS · WARN · FAIL · MANUAL · NOT_APPLICABLE · NOT_EVALUATED · UNKNOWN`. Readiness and evaluation coverage are reported separately, and blocker-based release gates override the average.
- **Exports** (in `OUTPUT_ROOT`): an HTML report, a Markdown report, a findings CSV, and a JSON evidence bundle. The bundle's `findings[]` has one row per rule/object, with `rule_id`, `severity`, `status`, `source_name`, `object_path`, `evidence`, `recommendation`, and `docs_url`.

## Power BI Semantic Readiness Remediation Agent

Use this agent in VS Code with GitHub Copilot Chat to fix the semantic-model (SM-*) findings in natural language. It connects to the model, builds a remediation queue, applies fixes, and re-runs validation.

### 30-second start

1. Connect
- Connect to 'ContosoSalesData.pbix' in Power BI Desktop

2. Analyze
- Run semantic AI readiness analyzer, parse the report, and show a remediation queue.

3. Remediate
- Remediate all safe issues.

4. Validate
- Re-run analyzer and show what changed.

Alternate connect one-liners:
- Fabric: Connect to semantic model 'Sales Semantic Model' in Fabric Workspace 'Sales Analytics'
- PBIP: Open semantic model from PBIP folder 'C:\Projects\SalesModel\SalesModel.SemanticModel\definition'

### What this agent does

1. Connects to a semantic model in one of three modes:
- Power BI Desktop
- Fabric workspace semantic model
- PBIP semantic model folder

2. Runs readiness analysis and generates structured findings.

3. Builds a remediation queue sorted by severity.

4. Applies remediations one-by-one or in bulk for safe fixes.

5. Re-runs validation and reports deltas.

### Included files in this folder

- [PowerBI_Semantic_Readiness_Remediation_Agent.agent.md](PowerBI_Semantic_Readiness_Remediation_Agent.agent.md)
- [PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md](PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md)
- [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb)
- [FabricDataAgentAnalyzer_SemanticModel_TE2.cs](FabricDataAgentAnalyzer_SemanticModel_TE2.cs) (Tabular Editor 2 script for the semantic-model checks)

### Prerequisites

#### Required for full automation (analyze plus remediate)

1. Visual Studio Code with GitHub Copilot Chat.
2. Power BI Modeling MCP tools available in your Copilot environment.
3. Access to one model source:
- Open PBIX in Power BI Desktop, or
- Semantic model in Fabric workspace, or
- PBIP definition folder.
4. Permissions:
- Read/Build access to analyze
- Write-level access to apply remediation changes

#### Required for analyzer only (no automatic remediation)

1. Access to [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb)
2. Fabric notebook runtime (`semantic-link-labs`, `fabric-data-agent-sdk`, `httpx`, and `pyyaml` are installed by the first code cell). `GIT_EXPORT` and `MANUAL_MANIFEST` modes also run in plain Python for static analysis.

### Do I need the Power BI Modeling MCP server extension?

Short answer: Yes for automatic remediation.

- If MCP tools are available, the agent can create, rename, and update semantic model objects.
- If MCP tools are not available, the agent can still analyze and produce a remediation plan, but cannot apply changes automatically.

### Quick start

#### Step 1: Start with a connection command

Power BI Desktop:
- Connect to 'ContosoSalesData.pbix' in Power BI Desktop

Fabric workspace:
- Connect to semantic model 'Sales Semantic Model' in Fabric Workspace 'Sales Analytics'

PBIP folder:
- Open semantic model from PBIP folder 'C:\Projects\SalesModel\SalesModel.SemanticModel\definition'

#### Step 2: Run analysis

- Run semantic AI readiness analyzer, parse the report, and show a remediation queue.

#### Step 3: Apply remediations

- Remediate next issue.
- Remediate all safe issues.
- Remediate only rule MEASURE_NAMING.
- Show dry-run changes for R004 and R005 before applying.

#### Step 4: Validate

- Re-run analyzer and show what changed.

### Recommended end-user command templates

#### Full workflow in one command

Connect to semantic model 'Sales Semantic Model' in Fabric Workspace 'Sales Analytics', run semantic AI readiness analyzer, remediate all safe issues using Power BI Modeling MCP server, then re-run analyzer and show deltas.

#### Safe iterative workflow

1. Connect to 'ContosoSalesData.pbix' in Power BI Desktop.
2. Run semantic AI readiness analyzer and show remediation queue.
3. Show dry-run changes for the next two items.
4. Apply one remediation at a time.
5. Re-run analyzer after each batch.

### Typical remediation categories

1. Naming consistency
- Rename technical names to business-friendly names.

2. Measure coverage
- Add canonical measures such as Total Sales, Total Cost, Gross Margin, Margin %, Return Rate %, Discount Rate %.

3. Descriptions and metadata quality
- Add missing descriptions and synonyms.

4. Model design findings
- Star schema and date-table simplification are often manual or approval-based.

### Safety and approval model

Auto-apply by default for low-risk deterministic updates:
- Add missing descriptions
- Add safe measures
- Add synonyms
- Simple naming cleanups

Require explicit approval for potentially business-impacting changes:
- Relationship redesign
- Measure logic changes that affect KPI meaning
- Deleting objects
- Broad rename operations with uncertain downstream impact

### Dependency and health checks

Before production use, validate:

1. Connectivity
- Agent can connect and list model objects.

2. Read operations
- Agent can list tables, columns, measures, relationships.

3. Write operations
- Agent can perform one controlled test update in a development model.

4. Validation loop
- Agent can re-run analysis and report delta changes.

### Troubleshooting

1. Connection not found in Desktop
- Ensure PBIX is open.
- Retry connection discovery.

2. Fabric connection errors
- Verify workspace and model names.
- Confirm tenant and permission scope.

3. Remediation command fails
- Confirm MCP tools are enabled.
- Confirm write permissions to the model.

4. Analyzer works but remediation does not
- This usually means MCP execution is unavailable while read access is available.

### Best practices for end users

1. Start in a dev or test workspace.
2. Run dry-run first for medium and high severity items.
3. Apply safe fixes in batch, then validate.
4. Apply higher-impact changes one-by-one with approval.
5. Keep a before/after summary for each remediation session.

### Suggested workflow for teams

1. Analyst runs analyzer and generates queue.
2. Model owner reviews dry-run plan.
3. Agent applies approved fixes.
4. Agent re-runs analyzer and publishes delta report.
5. Team promotes to production after validation.

### Related resources in this folder

- [PowerBI_Semantic_Readiness_Remediation_Agent.agent.md](PowerBI_Semantic_Readiness_Remediation_Agent.agent.md)
- [PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md](PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md)
- [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb)
