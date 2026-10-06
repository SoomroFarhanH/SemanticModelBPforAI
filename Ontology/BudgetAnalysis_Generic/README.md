# BudgetAnalysis_Generic — Fabric IQ Ontology

A **Microsoft Fabric IQ ontology** (preview, TMDL / new-experience format) for **budget vs. actual** analysis. It is the `BudgetAnalysis` Power BI semantic model mapped onto a **generic budgeting vocabulary**, so the same entity, property and relationship names can be reused across budget datasets (corporate FP&A, public sector / non-profit, project / capital).

The ontology is **live-bound** to the semantic model through DirectQuery. No data is copied. Questions asked through the ontology agent or a Fabric data agent are answered from the semantic model and its measures.

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

**Business rules** (natural-language guidance used by the ontology agent)

| Rule | Summary |
|---|---|
| FavorableVariance | Favorable Variance = (Actual − Budget) × FavorableSign; positive always means favorable. |
| ProfitDefinition | Profit = Revenue − Expense in the same scenario; Margin = Profit / Revenue. |
| ScenarioSeparation | Always split or filter by scenario; never add Actual and Budget together. |
| FiscalPeriodGrain | Amounts are monthly; analyse at period, quarter or year; YTD starts at the first fiscal period. |
| ExpenseUtilization | Actual expenses ÷ budget expenses; above 100% means overspend. |
| ComparableBasis | Compare budget and actual on the same basis, classification, scope and period (IPSAS 24). |
| WhatIfScenarioModelling | How the Revenue Growth, Expense Change and Budget Adjustment what-if inputs are applied. |

**Metrics:** 47 business measures from the semantic model (Actual / Budget amount, variance, favorable variance, revenue, expenses, profit, margin, YTD, MoM, expense budget utilization and what-if scenario measures), exposed through `EXTERNALMEASURE`.

Every entity type and property carries a description and business synonyms (for example *cost center*, *GL account*, *plan type*). Each entity type links to the `BudgetAnalysis` Power BI report.

## Folder layout

```
BudgetAnalysis_Generic/
├── .platform                     # item metadata (type Ontology, version 2.0)
├── database.tmdl
├── model.tmdl                    # refs to tables, entities, namespace, rules
├── expressions.tmdl              # DirectQuery-to-Analysis-Services source
├── relationships.tmdl            # semantic-model (TOM) relationships
├── entityRelationships.tmdl      # ontology relationships
├── namespaces/default.tmdl
├── entities/*.tmdl               # 5 entity types
├── rules/*.tmdl                  # 7 business rules
└── tables/*.tmdl                 # 8 backing tables + 47 measures
```

This follows the [Ontology (new) item definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/ontology-definition) format, so it works with the Fabric REST API `createItem` / `updateDefinition` and with Fabric Git integration.

## Prerequisites

- A Fabric capacity workspace with the **Users can create ontology (preview) items** tenant setting enabled.
- **Read** and **Build** permission on the source semantic model.
- The source semantic model needs a hidden calculated column that uniquely identifies each `Financials` row (`Financial Entry Key`):

  ```dax
  Financial Entry Key =
  FORMAT ( 'Financials'[Date], "yyyy-MM" ) & "|" & 'Financials'[Account Key] & "|"
      & 'Financials'[Department Key] & "|" & 'Financials'[Scenario]
  ```

## Deploy

The definition references a specific environment. Before deploying elsewhere, replace these values across the `.tmdl` files:

| Value | Where |
|---|---|
| Workspace ID `9d09d1a8-39f8-48f5-9b1c-eb34930a9b4d` | `expressions.tmdl`, `tables/*.tmdl` (annotations, expression name), `entities/*.tmdl` (report links) |
| Semantic model ID `5475ec3a-7213-482b-ab49-92ecc0932e4a` | `expressions.tmdl`, `tables/*.tmdl` |
| Workspace name `PBICopilot` and model name `BudgetAnalysis` | `expressions.tmdl`, `tables/*.tmdl` |
| Report ID `5360e063-005d-49ca-b2f1-a58c9b63282f` | `entities/*.tmdl` |

Create the item with PowerShell and the Azure CLI (`az login` first):

```powershell
$ws   = "<target-workspace-id>"
$root = ".\Ontology\BudgetAnalysis_Generic"
$parts = Get-ChildItem $root -Recurse -File | Where-Object Name -ne "README.md" | ForEach-Object {
    @{ path        = $_.FullName.Substring((Resolve-Path $root).Path.Length + 1).Replace('\', '/')
       payload     = [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.FullName))
       payloadType = "InlineBase64" }
}
$body = @{ displayName = "BudgetAnalysis_Generic"; type = "Ontology"; definition = @{ parts = $parts } } |
        ConvertTo-Json -Depth 6
[IO.File]::WriteAllText("$env:TEMP\onto.json", $body, [Text.UTF8Encoding]::new($false))
az rest --method POST --resource "https://api.fabric.microsoft.com" `
  --url "https://api.fabric.microsoft.com/v1/workspaces/$ws/items" `
  --headers "Content-Type=application/json" --body "@$env:TEMP\onto.json"
```

The call returns `202 Accepted` and finishes asynchronously; the ontology then appears in the workspace. To update an existing item, POST the same `definition` (without `.platform`) to `/v1/workspaces/{ws}/items/{id}/updateDefinition`.

## Notes

- Ontology is a **preview** feature; the definition format may change.
- The graph model created alongside a semantic-model-based ontology isn't loaded for direct graph (GQL) queries. Query through the **ontology agent** ("Test the ontology") or a **Fabric data agent**.
- Read more: [Generate an ontology from semantic models](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-generate-from-semantic-models).

---

> **Developed by Farhan Soomro** · Free community utility · [MIT License](https://github.com/SoomroFarhanH/SemanticModelBPforAI/blob/main/LICENSE)
>
> ⚠️ **Disclaimer:** Provided "AS IS", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. This is a personal community project. It is not an official Microsoft product and is not supported or endorsed by Microsoft or any employer. Review the code and test it in a non-production environment before use. You use it at your own risk. In no event shall the author be liable for any claim, damages, data loss, service disruption, capacity or licensing cost, or other liability arising from its use. Results are guidance only and should be validated by a qualified person.
