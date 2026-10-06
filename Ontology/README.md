# Fabric IQ Ontology — BudgetAnalysis_Generic

A **Microsoft Fabric IQ ontology** (preview, TMDL / new-experience format) for **budget vs. actual** analysis. It maps the `BudgetAnalysis` Power BI semantic model onto a **generic budgeting vocabulary** (budget lines, accounts, org units, scenarios, calendar), so business users and AI agents can ask questions in plain business language.

The ontology is **live-bound** to the semantic model through DirectQuery. No data is copied: questions are answered from your semantic model and its measures, under each user's own permissions.

| Path | What it is |
|---|---|
| [`BudgetAnalysis_Generic/`](BudgetAnalysis_Generic/) | The ontology item definition (TMDL). |
| [`Deploy-Ontology.ps1`](Deploy-Ontology.ps1) | One-command import: retargets the definition to your workspace and semantic model, validates it, and creates the ontology. |

**Jump to:** [What's inside](#whats-inside) · [Before you start](#before-you-start) · [Step 1 — Prepare the semantic model](#step-1--prepare-the-semantic-model) · [Step 2 — Import the ontology](#step-2--import-the-ontology) · [Step 3 — Check the import](#step-3--check-the-import) · [Use the ontology](#use-the-ontology) · [Troubleshooting](#troubleshooting)

---

## What's inside

| Entity type | Backing table | Key | Properties |
|---|---|---|---|
| **BudgetLine** | `Financials` | `BudgetLineId` | PeriodDate, AccountId, OrgUnitId, ScenarioId, Amount |
| **Account** | `Account` | `AccountId` | AccountName, AccountType (Revenue/Expense), FavorableSign |
| **OrgUnit** | `Department` | `OrgUnitId` | OrgUnitName |
| **Scenario** | `Scenario` | `ScenarioId` | Actual / Budget |
| **CalendarDate** | `Date` | `CalendarDay` | CalendarYear, QuarterNumber, QuarterName, MonthNumber, MonthName, YearMonthNumber, YearMonth, DayOfMonth |

**Relationships** (each backed by a semantic-model relationship)

| Relationship | From → To | Backed by |
|---|---|---|
| Line Posted To Account | BudgetLine → Account | `Financials - Account` |
| Line Owned By OrgUnit | BudgetLine → OrgUnit | `Financials - Department` |
| Line In Scenario | BudgetLine → Scenario | `Financials - Scenario` |
| Line On Date | BudgetLine → CalendarDate | `Financials - Date` |

**Business rules**

| Rule | Summary |
|---|---|
| FavorableVariance | Favorable Variance = (Actual − Budget) × FavorableSign; positive always means favorable. |
| ProfitDefinition | Profit = Revenue − Expense in the same scenario; Margin = Profit / Revenue. |
| ScenarioSeparation | Always split or filter by scenario; never add Actual and Budget together. |
| FiscalPeriodGrain | Amounts are monthly; analyse at period, quarter or year; YTD starts at the first fiscal period. |
| ExpenseUtilization | Actual expenses ÷ budget expenses; above 100% means overspend. |
| ComparableBasis | Compare budget and actual on the same basis, classification, scope and period (IPSAS 24). |
| WhatIfScenarioModelling | How the Revenue Growth, Expense Change and Budget Adjustment what-if inputs are applied. |

**Metrics:** 47 business measures from the semantic model (Actual / Budget amount, variance, favorable variance, revenue, expenses, profit, margin, YTD, MoM, expense budget utilization and what-if scenario measures).

Every entity type and property has a description and business synonyms (for example *cost center*, *GL account*, *plan type*), and each entity type links to the Power BI report.

---

## Before you start

| Requirement | Details |
|---|---|
| **Capacity** | A workspace on a paid **Fabric F2 or higher** capacity (or Power BI Premium P1+ with Fabric enabled). |
| **Tenant settings** (Fabric admin) | **Users can create Fabric items** and **Users can create ontology (preview) items**. For the ontology agent, Copilot in Fabric must be enabled; if your capacity is outside the US / EU, also enable *Data sent to Azure OpenAI can be processed outside your capacity's geographic region*. See [Required tenant settings for ontology](https://learn.microsoft.com/fabric/iq/ontology/overview-tenant-settings). |
| **Permissions** | **Contributor** (or higher) on the workspace, and **Read + Build** on the semantic model. Users who only ask questions need Viewer on the workspace and Read + Build on the semantic model. |
| **Tools** (Option A) | [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and PowerShell 5.1 or 7+. |

---

## Step 1 — Prepare the semantic model

The ontology binds to a semantic model with the following tables and columns (names must match exactly):

| Table | Columns |
|---|---|
| `Financials` | `Date`, `Account Key`, `Department Key`, `Scenario`, `Amount`, **`Financial Entry Key`** (see below) |
| `Account` | `Account Key`, `Account`, `Category`, `Favorable Sign` |
| `Department` | `Department Key`, `Department` |
| `Scenario` | `Scenario` |
| `Date` | `Date`, `Year`, `Quarter Number`, `Quarter`, `Month Number`, `Month`, `Year Month Number`, `Year Month`, `Day` |
| `Revenue Growth`, `Expense Change`, `Budget Adjustment` | What-if parameter tables used by the scenario measures |

1. **Publish the `BudgetAnalysis` semantic model** to your Fabric workspace (from Power BI Desktop: **Home → Publish**).
2. **Add the entry key column.** An ontology entity type needs a single column that uniquely identifies each row. In Power BI Desktop open **Table view**, select the `Financials` table, choose **New column**, paste the formula below, then right-click the column and select **Hide in report view**:

   ```dax
   Financial Entry Key =
   FORMAT ( 'Financials'[Date], "yyyy-MM" ) & "|" & 'Financials'[Account Key] & "|"
       & 'Financials'[Department Key] & "|" & 'Financials'[Scenario]
   ```

3. **Publish again.** Publishing from Desktop uploads the data too; schedule refreshes in the service only if the model's data source is reachable from the service (for a local Excel file that needs an on-premises data gateway).
4. *(Optional)* Check the key is unique by running this DAX query (DAX query view in Desktop, or *Write DAX queries* in the service). `Rows` and `Keys` must be equal:

   ```dax
   EVALUATE ROW ( "Rows", COUNTROWS ( Financials ), "Keys", DISTINCTCOUNT ( Financials[Financial Entry Key] ) )
   ```

> Using a different budget model? Its tables and columns must match the list above, or you can edit the `.tmdl` files (backing tables in `tables/`, column bindings in `entities/`) before importing.

---

## Step 2 — Import the ontology

Pick **one** option.

### Option A — PowerShell script (recommended)

The script finds your workspace, semantic model and report by name, checks that every required table and column exists, points the ontology at your model, creates the item and reads it back.

1. Get the files: **Code → Download ZIP** on GitHub (then extract), or:

   ```powershell
   git clone https://github.com/SoomroFarhanH/SemanticModelBPforAI.git
   cd SemanticModelBPforAI\Ontology
   ```

2. Sign in with the account that has access to the workspace (add `--tenant <tenant-id>` if you have several tenants):

   ```powershell
   az login
   ```

3. Run the import:

   ```powershell
   .\Deploy-Ontology.ps1 -WorkspaceName "<your workspace>" -SemanticModelName "BudgetAnalysis"
   ```

   If Windows blocks the downloaded script, run `Unblock-File .\Deploy-Ontology.ps1` first, or start PowerShell with `-ExecutionPolicy Bypass`.

4. On success the script prints the ontology ID, the link to open it in Fabric, and its MCP endpoint:

   ```text
   Create ontology succeeded: BudgetAnalysis_Generic (<item-id>)
     Parts: 27   Entity types: 5   Rules: 7   Skipped measures: 0
     Open:  https://app.fabric.microsoft.com/groups/<workspace-id>/ontologies/<item-id>
     MCP:   https://api.fabric.microsoft.com/v1/mcp/dataPlane/workspaces/<workspace-id>/items/<item-id>/ontologyEndpoint
   ```

| Parameter | Purpose |
|---|---|
| `-WorkspaceName` | Workspace that holds your semantic model; the ontology is created there. *(required)* |
| `-SemanticModelName` | Your semantic model. *(required)* |
| `-ReportName` | Report to link from each entity type. Defaults to a report with the same name as the model. |
| `-NoReportLinks` | Don't add report links. |
| `-OntologyName` | Name of the new ontology. Default `BudgetAnalysis_Generic`. |
| `-Update` | Overwrite an existing ontology with the same name (for example after you change the model). |
| `-OutputPath <folder>` | Only write the retargeted definition to a folder (used by Option B); nothing is created. |
| `-WhatIf` | Validate and show what would happen without creating anything. |

If a measure in the definition doesn't exist in your model, the script skips it and warns you. If a required table or column is missing, it stops and lists what's missing.

### Option B — Fabric Git integration

Use this if your team manages Fabric items in Git. The definition must point at **your** workspace and model before Fabric syncs it, so retarget it first.

1. **Fork** this repository on GitHub and clone your fork.
2. Write a retargeted copy into a folder that will hold your Fabric items:

   ```powershell
   cd <your fork>\Ontology
   az login
   .\Deploy-Ontology.ps1 -WorkspaceName "<your workspace>" -SemanticModelName "BudgetAnalysis" -OutputPath ..\fabric-items
   ```

3. Commit and push the `fabric-items` folder to your fork.
4. In Fabric, open the target workspace → **Workspace settings → Git integration → GitHub**. Add your GitHub account with a personal access token (fine-grained token with **Contents: Read and write** on the fork), then select the repository, the branch and the folder **`fabric-items`**, and select **Connect and sync**.
5. If the workspace is already connected to Git, use **Source control → Updates → Update all** instead.

> ⚠️ Connecting a workspace that already contains items to a branch makes Fabric ask which side to sync from. Syncing from Git can overwrite or remove workspace items that aren't in the branch. Use a workspace that's already Git-connected, or read [Connect and sync](https://learn.microsoft.com/fabric/cicd/git-integration/git-integration-process#connect-and-sync) first. Connecting a workspace requires the workspace **Admin** role.

### Option C — Fabric REST API

From the `Ontology` folder run the script with `-OutputPath .\out` (or replace the workspace, model and report IDs and names in the `.tmdl` files by hand), then send every file in the item folder as a definition part to [Create Item](https://learn.microsoft.com/rest/api/fabric/core/items/create-item):

```powershell
$ws   = "<workspace-id>"
$root = ".\out\BudgetAnalysis_Generic"
$parts = Get-ChildItem $root -Recurse -File -Force | ForEach-Object {
    @{ path        = $_.FullName.Substring((Resolve-Path $root).Path.Length + 1).Replace('\', '/')
       payload     = [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.FullName))
       payloadType = "InlineBase64" } }
$body = @{ displayName = "BudgetAnalysis_Generic"; type = "Ontology"; definition = @{ parts = $parts } } | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText("$env:TEMP\onto.json", $body, [Text.UTF8Encoding]::new($false))
az rest --method POST --resource "https://api.fabric.microsoft.com" `
  --url "https://api.fabric.microsoft.com/v1/workspaces/$ws/items" `
  --headers "Content-Type=application/json" --body "@$env:TEMP\onto.json"
```

The call returns `202 Accepted` and completes in the background. To change an existing ontology, POST the same parts (without `.platform`) to `/v1/workspaces/{ws}/items/{id}/updateDefinition`.

---

## Step 3 — Check the import

1. Open the workspace in [Fabric](https://app.fabric.microsoft.com) and select the **BudgetAnalysis_Generic** ontology (or use the link printed by the script).
2. In the **Explorer**, confirm the five entity types: BudgetLine, Account, OrgUnit, Scenario, CalendarDate.
3. Open the relationship graph and confirm BudgetLine connects to the other four entity types.
4. Open an entity type (for example **Account**) and review its properties and data binding.
5. Ask a first question with the ontology agent (next section). If it answers with numbers from your model, the import is complete.

Fabric also creates two helper items next to the ontology (a graph model and an eventhouse named `BudgetAnalysis_Generic_graph_…` / `_eh_…`). Leave them in place; they are managed by the ontology.

---

## Use the ontology

### 1. Ontology agent in Fabric (recommended)

1. Open the ontology and select **Ontology agent** on the toolbar. The chat pane opens on the right.
2. Keep the toggle on **Plan** mode. Plan mode only reads and queries; **Act** mode is only needed to change the ontology.
3. Start with one of the suggested prompts (for example, explain the ontology or test it with representative questions), or type `Explain this ontology` / `Test the ontology with five representative questions`.
4. Ask your own questions in business terms. The agent shows the query it ran (DAX for this ontology), the results and a short explanation.

**Example questions**

- What were total actual and budget amounts by account category in 2026, and the favorable variance?
- Which departments overspent their expense budget this year? Show expense budget utilization.
- Show actual vs. budget profit and margin by quarter.
- Which accounts have the largest unfavorable variance year to date?
- Compare actual revenue month over month for Sales & Commercial.
- If revenue grows 10% and expenses drop 5%, what is the scenario profit vs. adjusted budget?

**Tips**

- Mention the measure or concept you want (*favorable variance*, *expense budget utilization*, *year to date*). Rules are guidance and aren't always applied automatically during preview.
- Name the scenario when it matters (*actual*, *budget*); never ask for a total that mixes both.
- Viewers can ask questions; changing the ontology needs Contributor.
- Each conversation lives in your browser session. Refreshing the page starts a new conversation.

See [Use the ontology agent](https://learn.microsoft.com/fabric/iq/ontology/how-to-use-ontology-agent).

### 2. GitHub Copilot in VS Code, or other MCP clients

Each ontology is also an MCP server with the tools `ask_ontology`, `list_ontology_entities` and `list_ontology_rules`.

1. Build the endpoint from the ontology URL (`https://app.fabric.microsoft.com/groups/<workspace-id>/ontologies/<item-id>`), or copy the MCP line printed by the script:
   `https://api.fabric.microsoft.com/v1/mcp/dataPlane/workspaces/<workspace-id>/items/<item-id>/ontologyEndpoint`
2. In VS Code create `.vscode/mcp.json`:

   ```json
   {
     "servers": {
       "budget-ontology": {
         "type": "http",
         "url": "https://api.fabric.microsoft.com/v1/mcp/dataPlane/workspaces/<workspace-id>/items/<item-id>/ontologyEndpoint"
       }
     }
   }
   ```

3. Start the server, sign in when prompted, open Copilot Chat in **Agent** mode, and ask a budget question.

Microsoft Copilot Studio agents can use the same ontology through the **Fabric IQ MCP (Preview)** tool. See [Consume ontology as an MCP server](https://learn.microsoft.com/fabric/iq/ontology/how-to-use-ontology-mcp-server). Service principals aren't supported yet.

### 3. Fabric data agent

In a data agent select **Add sources → Add an ontology** and choose this ontology. See [Use Ontology as context in Fabric data agent](https://learn.microsoft.com/fabric/data-science/data-agent-ontology-sources).

> Current limitations (preview): there is a [known issue](https://support.fabric.microsoft.com/known-issues/?active=true&fixed=true&sort=published&issueId=1987) adding new-experience ontologies to a data agent, and a data agent doesn't use the semantic-model grounding that this ontology carries. For a data agent today, add the **BudgetAnalysis semantic model** directly as its source, and use the ontology agent or MCP for ontology-based questions.

### Graph queries

The graph model created with a semantic-model-based ontology isn't loaded for direct graph (GQL) queries. Use the options above.

---

## Keep it up to date

- **Semantic model changed** (new measures, renamed columns): run the script again with `-Update`.
- **Data refreshed:** nothing to do; the ontology reads the model live.
- **Edited the ontology in Fabric** and want it in Git: use Fabric Git integration (**Source control → Commit**) or `getDefinition` from the REST API.
- A data agent picks up ontology changes within about 10 minutes, or immediately if you refresh the ontology context in the agent.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Could not get a Fabric token` | Run `az login` (add `--tenant <tenant-id>` for the right tenant). |
| `Workspace / Semantic model '…' not found` | Check the exact names and that your account can see them. |
| `Semantic model '…' is missing objects the ontology needs` | Add the listed tables or columns; most often the `Financial Entry Key` column (Step 1). |
| `An ontology named '…' already exists` | Re-run with `-Update`, or choose another `-OntologyName`. |
| Create fails with `InvalidItemType` or a tenant-setting error | Ask your Fabric admin to enable the tenant settings in [Before you start](#before-you-start). |
| `403` / `Forbidden` | You need Contributor on the workspace and Read + Build on the semantic model. |
| **Ontology agent** button missing or disabled | Copilot in Fabric must be enabled for your tenant and capacity region. |
| Agent answers are empty or wrong | Confirm the model is refreshed, `Financial Entry Key` is unique (Step 1, check 4), and the user has Read + Build on the model. |
| Data agent can't add the ontology | Known preview issue; see [Fabric data agent](#3-fabric-data-agent). |
| `GraphNotQueryable` | Expected for semantic-model-based ontologies; use the ontology agent or MCP. |

Ontology is a **preview** feature. The definition format and capabilities can change; check the [Ontology (new) item definition](https://learn.microsoft.com/rest/api/fabric/articles/item-management/definitions/ontology-definition) and [Generate an ontology from semantic models](https://learn.microsoft.com/fabric/iq/ontology/how-to-generate-from-semantic-models) docs for updates.

---

> **Developed by Farhan Soomro** · Free community utility · [MIT License](https://github.com/SoomroFarhanH/SemanticModelBPforAI/blob/main/LICENSE)
>
> ⚠️ **Disclaimer:** Provided "AS IS", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. This is a personal community project. It is not an official Microsoft product and is not supported or endorsed by Microsoft or any employer. Review the code and test it in a non-production environment before use. You use it at your own risk. In no event shall the author be liable for any claim, damages, data loss, service disruption, capacity or licensing cost, or other liability arising from its use. Results are guidance only and should be validated by a qualified person.
