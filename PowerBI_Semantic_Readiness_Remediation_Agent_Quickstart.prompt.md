# Power BI Semantic Readiness Remediation Agent - Quickstart

Use this prompt in Copilot Chat to run the full workflow with natural language.

## Get started
First, connect to a Power BI semantic model. The model can live in Power BI Desktop, Fabric workspace, or PBIP files.

For Power BI Desktop:
- Connect to '[File Name]' in Power BI Desktop

For Semantic Model in Fabric Workspace:
- Connect to semantic model '[Semantic Model Name]' in Fabric Workspace '[Workspace Name]'

For Power BI Project files:
- Open semantic model from PBIP folder '[Path to the definition/ TMDL folder in the PBIP]'

### Connection examples
- Connect to 'Sales Model.pbix' in Power BI Desktop
- Connect to semantic model 'Sales Semantic Model' in Fabric Workspace 'Sales Analytics'
- Open semantic model from PBIP folder 'C:\Projects\SalesModel\SalesModel.SemanticModel\definition'

## Prompt Template
I want you to act as the Power BI Semantic Readiness Remediation Agent.

Connection:
- Mode: <desktop|fabric>
- Workspace: <workspace name or id>
- Semantic model: <model name>

Task:
1. Run the semantic AI readiness analyzer.
2. Parse the structured JSON output.
3. Build a remediation queue sorted by severity.
4. Ask me whether to:
   - remediate one-by-one, or
   - remediate all safe fixes.
5. Apply selected remediations through Power BI Modeling MCP server.
6. Re-run analyzer and report deltas.

Execution preferences:
- Dry run first: <yes|no>
- Auto-apply low-risk fixes: <yes|no>
- Stop on first error: <yes|no>

## Follow-up Commands
- Remediate next issue.
- Remediate all safe issues.
- Remediate only rule <RULE_NAME>.
- Re-run analyzer and show what changed.
- Export remaining manual actions.

## Example
I want you to act as the Power BI Semantic Readiness Remediation Agent.
Mode: fabric
Workspace: Sales Analytics
Semantic model: Sales Semantic Model
Dry run first: yes
Auto-apply low-risk fixes: yes
Stop on first error: no
Run analyzer, then remediate all medium and low findings.
