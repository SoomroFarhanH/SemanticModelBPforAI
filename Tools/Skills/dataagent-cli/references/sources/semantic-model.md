<!-- Source reference for the `dataagent-cli` skill: Power BI semantic models. Loaded on demand from `planning.md` and `authoring.md`. -->

# Power BI semantic model

Query tool: **NL2DAX** over the model's XMLA endpoint. Source: [Semantic model best practices for data agents](https://learn.microsoft.com/en-us/fabric/data-science/semantic-model-best-practices) · [Prep your data for AI](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai).

## The rule that changes everything

The DAX generation tool uses **only the model's metadata and its Prep for AI configuration**. **Data-agent-level instructions are not passed to it and are ignored when querying a semantic model**, and the agent has **no source instructions, no source description, and no example queries** for a semantic model. So:

- Put **all semantic-model-specific guidance in Prep for AI** (AI data schema, AI instructions, verified answers) and in the model's own descriptions/names.
- Agent instructions carry only cross-source content: response format, tone, abbreviations, cross-source routing.

Prep for AI edits are semantic-model work: hand them to `semantic-model-authoring` (hosted or local modeling tools) — this skill plans them and wires the agent.

## Supported on the agent

| Configuration | Supported |
|---|---|
| Schema selection | Yes: select tables to expose; column-level control comes from the AI data schema (Prep for AI) |
| Agent instructions | Yes (cross-source only; ignored by the DAX tool) |
| Source instructions / source description | **No** |
| Example queries | **No** — use **Verified Answers** in Prep for AI |
| Topics | No |

Permissions: the agent uses the user's **Read** permission on the model (Build is not required for agent queries); RLS and CLS apply. Data agent access does not need workspace access.

## Recommended implementation order

1. **Optimize the model first.** Poor agent performance is usually a poor model or slow measures. Use Best Practice Analyzer and the Semantic Model Memory Analyzer (Fabric notebook) to fix data types, unused/high-cardinality columns, and inefficient DAX. Remove unnecessary objects (noise lowers accuracy).
2. **Business-friendly names and descriptions** for tables, columns and measures (`Total Revenue`, not `TR_AMT`). Descriptions explain purpose and how to use a measure; state sign conventions and what a measure ignores (for example slicers it overrides).
3. **AI data schema** (Prep for AI → Simplify data schema): select only the tables, columns and measures the agent's questions need. Include **dependent objects** of selected measures (use `get_measure_dependencies` from Semantic Link Labs). Resolve ambiguity by excluding competing measures (keep `Net Sales`, hide `Gross Sales` if reporting uses net).
4. **Verified answers:** the most common questions, each backed by a suitable visual; **five to seven** trigger phrasings per answer (formal and conversational), up to **three filters**; full questions, not fragments. Verified answers steer DAX generation (the visual itself is not returned). Re-save them if a referenced object is renamed.
5. **Add the model to the agent** with the **same tables** as the AI data schema; test; *then* add **AI instructions** where testing shows gaps.
6. **AI instructions** (Prep for AI): time-period definitions, metric preferences ("for profitability use `Contribution_Margin`, not `Gross_Profit`"), default groupings (fiscal quarter vs calendar month), table-priority hints, business terms ("top performer = ≥110% of quota; use `Rep_Performance` where `Quota_Attainment >= 1.1`"). They are unstructured guidance, not guaranteed; clear and specific beats long and conflicting.

## Preview runtime

**Advanced DAX generation** (multi-step reasoning, **instance value indexing**) is on the preview runtime. Instance value indexing needs the model's **Q&A** setting enabled (default for Import and Direct Lake; Q&A retires in December 2026 with a replacement setting). Preview carries a release gate.

## Readiness checks (read-only)

| Check | Fix |
|---|---|
| Model is Import/Direct Lake/DirectQuery and queryable by the user (Read) | Grant Read; confirm RLS behavior |
| Q&A enabled (if instance value indexing is wanted) | Enable it |
| Names, descriptions on selected objects | `semantic-model-authoring` |
| AI data schema defined and equal to the agent's selected tables | Define it; align the selection |
| Verified answers exist for top questions | Create them (Prep for AI) |
| AI instructions present and consistent | Draft and test (Prep for AI) |
| Measure dependencies included | `get_measure_dependencies` |
| "Approved for Copilot" if the org requires it | Model settings |

The Analyzer covers these as `SM-000` … `SM-027` (28 checks; some are manual, for example Memory Analyzer review and service settings).

## What this skill writes on the agent

Only the agent's `datasource.json` selection (`is_selected` on `semantic_model.table` elements) and cross-source agent instructions. Everything else is planned here and executed in the model.
