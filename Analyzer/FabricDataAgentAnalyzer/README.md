# Power BI Semantic Readiness Remediation Agent

This guide helps end users run the readiness analyzer and remediate findings with natural language.

## Fabric Data Agent Analyzer (v3.2.1)

[FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb) (formerly `SemanticModel_DataAgent_Readiness.ipynb`) assesses a **Fabric data agent and every connected source** (up to five), not just a semantic model. Most agents use a Power BI semantic model, so that path gets the most depth.

### What's new in v3.2.1 (2026-11-09)

- **Semantic-model best practices now run in every mode.** When the agent uses a Power BI semantic model, the analyzer scores the 28 `SM-*` rules from the [semantic model best practices](https://learn.microsoft.com/en-us/fabric/data-science/semantic-model-best-practices) (AI Data Schema, Verified Answers, AI Instructions, agent-to-schema alignment, descriptions, naming, star schema, and more). Previously a `GIT_EXPORT` run outside Fabric reported all of them as `NOT_EVALUATED`. Without `sempy` the notebook now reads the model definition and the Prep for AI configuration over REST (`SEMANTIC_REST_FALLBACK = True`; run `az login` first; needs read and write permission on the model). `SM-002` (Best Practice Analyzer), `SM-003` (Memory Analyzer) and `SM-020` (measure dependencies) still need a Fabric notebook and stay `NOT_EVALUATED` with the reason.
- **Corrected scores in Fabric notebooks.** Semantic Link names some columns `Hidden`, `Key`, `Measure Hidden` and `Measure Description`. The analyzer read other names, so hidden columns and measures counted as visible and measure descriptions read as empty (for example, "70 objects missing descriptions" on a model whose visible objects were all described). The frames are now normalized. Re-run earlier semantic-model results.

### What's new in v3.2.0 (documentation snapshot 2026-11-06)

Aligned with the updated Microsoft Learn articles on [data source routing](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-routing), [schema object descriptions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-schema-object-descriptions), [Build agent with AI](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-creator-agent-overview), [example queries](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-example-queries), [topics](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-topics), the [runtime](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-runtime), and the publishing, consumption, and governance articles (MCP server, Microsoft 365 Copilot, Copilot Studio, service principals, Purview audit, code interpreter). The new checks are **advisory** (`INFO` severity): they are listed in the reports but never change readiness, coverage, or release gates. The only scored changes are the capability fixes listed below.

- **Routing (`DA-027` … `DA-029`, multi-source agents only):** checks each source for the routing signals in the order the docs recommend (focused schema selection, a short source description, example queries), flags similar source names or descriptions, and flags routing rules in agent instructions that name a removed or renamed source or that exceed 10 lines.
- **Schema object descriptions (`SQL-021`, `SQL-005`):** unscored detail rows for table descriptions that don't state what the table represents, its level of detail, or its purpose, for column descriptions that don't define meaning, format, unit, or values, and for abbreviated column names without a description. Recommendations point to **Setup → Schema object descriptions** or the SDK `update_description` (preview runtime) and to data-source instructions (standard runtime).
- **Example queries (`EXQ-002` … `EXQ-005`):** guiding comments in queries, the 100-examples-per-source limit, conflicts between similarly worded questions that use different tables or aggregation, and question-to-query intent alignment (counts, averages, totals, vague questions). Examples that fail schema validation are reported as not sent to the agent.
- **Capability fixes (scored):** example queries are recognized for SQL database, mirrored database, and Graph sources; Ontology is feature-detected because the docs disagree (`KL-17`); Graph and Ontology get no schema-selection result (`DA-011` is N/A) because they don't support it. The code interpreter counts as a preview feature in `DA-013`, and `DA-007` accepts a *Handling common topics* section.
- **Topics (`SQL-022`):** unscored rows for the 1,000,000-character limit, missing Markdown headings, and text repeated between topics and data-source instructions.
- **Build agent with AI (`DA-030`, `DA-031`):** the source router reports whether the agent is eligible (every source must be SQL or Eventhouse; any other source type blocks it) and lists it as a way to draft instructions, descriptions, and example queries. Accepted updates **replace** existing configuration blocks during the preview, so back up the configuration first. It doesn't manage schema selection, the data agent description, Prep for AI, ontology, graph, or unstructured data.
- **Publishing and governance (`DA-032` … `DA-039`):** the published runtime (`DA-039`: published or not, standard or preview, draft vs published, preview accepted or not; also in the report header and JSON `agent.published_runtime`), source capacity in the same region as the agent (read through the Fabric REST API when run in Fabric, otherwise a manual attestation), a specific publishing description (it becomes the MCP tool description and the Microsoft 365 Copilot `description_for_model`), code interpreter detection, direct instructions placed correctly, English-only content, consumption channels and data boundary, and the user feedback loop. Recommendations for `DA-015` … `DA-017`, `DA-020`, and `DA-025` now cover Copilot Studio Maker authentication, service principal callers, Purview audit, and co-publishers.
- **Watch list:** new `KL-14` … `KL-21` entries, including the 25-row answer cap (1,000 rows on the preview runtime), the 100-example limit, English-only content, and the same-region capacity requirement.

### How it works for end users

1. **Source router (runs first).** The notebook detects which data sources the agent uses and **skips the checks for source types it doesn't use** (`SHORT_CIRCUIT_UNUSED_SOURCES = True`). It then **loads the matching best practices** with Microsoft Learn links. For a semantic model it also detects the storage mode (Import, DirectQuery, Direct Lake) and the agent runtime, and adds the guidance that fits.
2. **Checks run** for those sources only.
3. **What to fix first.** A short list (`MAX_ACTION_ITEMS`, default 10), worst first. Each item shows the priority (Fix first / Next / Later), what is wrong, where, how to fix it, and a documentation link. It leads the HTML and Markdown reports.
4. **Best-practice checklist.** The loaded best practices are scored as Met, Partly met, Not met, Confirm yourself, or Not evaluated.

### Source families covered

| Source family | Sources | Rule IDs |
|---|---|---|
| Common agent checks | Scope, instructions, routing, schema selection, runtime, preview risk, read-only contract, publishing, governance, advisory routing and Build agent with AI checks | `DA-001` … `DA-039`, `EXQ-001` … `EXQ-005` |
| SQL | Lakehouse, Warehouse, Fabric SQL Database, Mirrored Database | `SQL-*`, `LH-*`, `WH-*`, `SQLDB-*`, `MIR-*` |
| KQL | Eventhouse KQL Database | `KQL-*` |
| Semantic | Power BI semantic model (all v2.2.2 checks, stable IDs) | `SM-000` … `SM-027` |
| Preview | Graph Model, Fabric Ontology, Azure AI Search | `GRAPH-*`, `ONT-*`, `AIS-*` |
| Cross-source | Routing, metric/time/key consistency | `XSR-*` |

- **Collection modes:** `LIVE_SDK` (fabric-data-agent-sdk, preview), `GIT_EXPORT` (data agent Git item definition), and `MANUAL_MANIFEST` (JSON/YAML). Leave `DATA_AGENT_NAME_OR_ID` blank and set `dataset` + `workspace` to run the v2.x standalone semantic-model analysis.
- **Read-only by default.** Live smoke tests, example-query execution, and SDK evaluation are opt-in (`RUN_LIVE_QUERY_TESTS`, `RUN_EVALUATION`).
- **Statuses:** `PASS · WARN · FAIL · MANUAL · NOT_APPLICABLE · NOT_EVALUATED · UNKNOWN`. Readiness and evaluation coverage are reported separately, and blocker-based release gates override the average.
- **Exports** (in `OUTPUT_ROOT`): an HTML report, a Markdown report, a findings CSV, and a JSON evidence bundle. The bundle's `findings[]` has one row per rule/object, with `rule_id`, `severity`, `status`, `source_name`, `object_path`, `evidence`, `recommendation`, and `docs_url`. The bundle also carries `source_route`, `action_items[]`, and `best_practices[]`.

## Run the analyzer in Fabric

1. Import [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb) into a Fabric workspace and attach a lakehouse if reports should persist in OneLake.
2. Set `WORKSPACE_ID_OR_NAME`, `DATA_AGENT_NAME_OR_ID`, and `DATA_AGENT_STAGE` in the parameters cell. Keep query, performance, and evaluation flags disabled for a metadata-only analysis.
3. Run all cells. Reports are written beneath `OUTPUT_ROOT` when `EXPORT_REPORTS = True`.

### Scheduled and pipeline runs

The dependency cell uses `%pip`. Fabric disables inline installation by default for scheduled and pipeline runs. Enable it for the run by passing notebook parameter `_inlineInstallationEnabled` as Boolean `true`, as documented in [Fabric inline installation](https://learn.microsoft.com/en-us/fabric/data-engineering/library-management#inline-installation).

For the Notebook background-jobs API, include this entry in the top-level `parameters` array, alongside the analyzer's target parameters:

```json
{
  "parameters": [
    {
      "name": "_inlineInstallationEnabled",
      "value": true,
      "type": "Boolean"
    }
  ]
}
```

If startup fails with `%pip magic command is disabled`, verify this run parameter before troubleshooting agent or semantic-model collection. Enabling dependency installation does not enable live queries, performance tests, or evaluation.

## 30-second start

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

## What this agent does

1. Connects to a semantic model in one of three modes:
- Power BI Desktop
- Fabric workspace semantic model
- PBIP semantic model folder

2. Runs readiness analysis and generates structured findings.

3. Builds a remediation queue sorted by severity.

4. Applies remediations one-by-one or in bulk for safe fixes.

5. Re-runs validation and reports deltas.

## Included files in this folder

- [PowerBI_Semantic_Readiness_Remediation_Agent.agent.md](PowerBI_Semantic_Readiness_Remediation_Agent.agent.md)
- [PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md](PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md)
- [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb)
- [FabricDataAgentAnalyzer_SemanticModel_TE2.cs](FabricDataAgentAnalyzer_SemanticModel_TE2.cs) (Tabular Editor 2 script for the semantic-model checks)

## Prerequisites

### Required for full automation (analyze plus remediate)

1. Visual Studio Code with GitHub Copilot Chat.
2. Power BI Modeling MCP tools available in your Copilot environment.
3. Access to one model source:
- Open PBIX in Power BI Desktop, or
- Semantic model in Fabric workspace, or
- PBIP definition folder.
4. Permissions:
- Read/Build access to analyze
- Write-level access to apply remediation changes

### Required for analyzer only (no automatic remediation)

1. Access to [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb)
2. Fabric notebook runtime (`semantic-link-labs`, `fabric-data-agent-sdk`, `httpx`, and `pyyaml` are installed by the first code cell). `GIT_EXPORT` and `MANUAL_MANIFEST` modes also run in plain Python for static analysis.

## Do I need the Power BI Modeling MCP server extension?

Short answer: Yes for automatic remediation.

- If MCP tools are available, the agent can create, rename, and update semantic model objects.
- If MCP tools are not available, the agent can still analyze and produce a remediation plan, but cannot apply changes automatically.

## Quick start

### Step 1: Start with a connection command

Power BI Desktop:
- Connect to 'ContosoSalesData.pbix' in Power BI Desktop

Fabric workspace:
- Connect to semantic model 'Sales Semantic Model' in Fabric Workspace 'Sales Analytics'

PBIP folder:
- Open semantic model from PBIP folder 'C:\Projects\SalesModel\SalesModel.SemanticModel\definition'

### Step 2: Run analysis

- Run semantic AI readiness analyzer, parse the report, and show a remediation queue.

### Step 3: Apply remediations

- Remediate next issue.
- Remediate all safe issues.
- Remediate only rule MEASURE_NAMING.
- Show dry-run changes for R004 and R005 before applying.

### Step 4: Validate

- Re-run analyzer and show what changed.

## Recommended end-user command templates

### Full workflow in one command

Connect to semantic model 'Sales Semantic Model' in Fabric Workspace 'Sales Analytics', run semantic AI readiness analyzer, remediate all safe issues using Power BI Modeling MCP server, then re-run analyzer and show deltas.

### Safe iterative workflow

1. Connect to 'ContosoSalesData.pbix' in Power BI Desktop.
2. Run semantic AI readiness analyzer and show remediation queue.
3. Show dry-run changes for the next two items.
4. Apply one remediation at a time.
5. Re-run analyzer after each batch.

## Typical remediation categories

1. Naming consistency
- Rename technical names to business-friendly names.

2. Measure coverage
- Add canonical measures such as Total Sales, Total Cost, Gross Margin, Margin %, Return Rate %, Discount Rate %.

3. Descriptions and metadata quality
- Add missing descriptions and synonyms.

4. Model design findings
- Star schema and date-table simplification are often manual or approval-based.

## Safety and approval model

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

## Dependency and health checks

Before production use, validate:

1. Connectivity
- Agent can connect and list model objects.

2. Read operations
- Agent can list tables, columns, measures, relationships.

3. Write operations
- Agent can perform one controlled test update in a development model.

4. Validation loop
- Agent can re-run analysis and report delta changes.

## Troubleshooting

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

## Best practices for end users

1. Start in a dev or test workspace.
2. Run dry-run first for medium and high severity items.
3. Apply safe fixes in batch, then validate.
4. Apply higher-impact changes one-by-one with approval.
5. Keep a before/after summary for each remediation session.

## Suggested workflow for teams

1. Analyst runs analyzer and generates queue.
2. Model owner reviews dry-run plan.
3. Agent applies approved fixes.
4. Agent re-runs analyzer and publishes delta report.
5. Team promotes to production after validation.

## Related resources in this folder

- [PowerBI_Semantic_Readiness_Remediation_Agent.agent.md](PowerBI_Semantic_Readiness_Remediation_Agent.agent.md)
- [PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md](PowerBI_Semantic_Readiness_Remediation_Agent_Quickstart.prompt.md)
- [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer.ipynb)
