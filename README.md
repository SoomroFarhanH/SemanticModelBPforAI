# Power BI Semantic Readiness Remediation Agent

This guide helps end users run the Semantic AI Readiness Analyzer and remediate findings with natural language.

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
- [SemanticModel_DataAgent_Readiness_Automated.ipynb](SemanticModel_DataAgent_Readiness_Automated.ipynb)

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

1. Access to [SemanticModel_DataAgent_Readiness_Automated.ipynb](SemanticModel_DataAgent_Readiness_Automated.ipynb)
2. Fabric notebook runtime with semantic-link-labs package available

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
- [SemanticModel_DataAgent_Readiness_Automated.ipynb](SemanticModel_DataAgent_Readiness_Automated.ipynb)
