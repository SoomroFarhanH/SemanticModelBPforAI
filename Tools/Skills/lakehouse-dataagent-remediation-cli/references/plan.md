<!-- Mode reference for the `lakehouse-dataagent-remediation-cli` skill. Loaded on demand from `skills/lakehouse-dataagent-remediation-cli/SKILL.md` when the request matches the `plan` mode. -->

# Plan — evidence-based remediation, then stop for approval

Input: the run folder from `assess`. Output: `remediation-plan.md` in that run folder, a summary in chat, and an explicit approval question. **Nothing is written to Fabric in this mode, and the turn ends at the approval question.**

## Change types

Every planned change has an ID (`C01`, `C02`, ...), one target, and the evidence and rule it addresses.

| Target | What changes | Written by | Scope item the user approves |
|---|---|---|---|
| `SOURCE_COMMENT` | Delta table/column `COMMENT` in the lakehouse | Spark SQL via Livy | **Lakehouse comments** (affects every consumer) |
| `AGENT_DESCRIPTION` | `elements[].description` on tables/columns in the agent's `datasource.json` | `updateDefinition` (draft) | Agent configuration |
| `SOURCE_DESCRIPTION` | `userDescription` of the data source | `updateDefinition` (draft) | Agent configuration |
| `SOURCE_INSTRUCTIONS` | `dataSourceInstructions` | `updateDefinition` (draft) | Agent configuration |
| `FEWSHOT` | add, change, or remove an item in `fewshots.json` | `updateDefinition` (draft) | Agent configuration |
| `SELECTION` | `is_selected` on tables | `updateDefinition` (draft) | Agent configuration |
| `AGENT_INSTRUCTIONS` | `aiInstructions` in `draft/stage_config.json` (structure and routing rules) | `updateDefinition` (draft) | Agent configuration |

Runtime rule: if the agent is on the **standard** runtime (no `enableExperimentalFeatures`), `AGENT_DESCRIPTION` is not available. Move object-level meaning into `SOURCE_INSTRUCTIONS` (a concise glossary of the objects that need it) and say so in the plan. Do not change the runtime flag as part of the plan unless the user asks; preview use carries a release gate and needs explicit acceptance.

## Writing rules (from the Microsoft Learn guidance)

**Descriptions** (`SOURCE_COMMENT` and `AGENT_DESCRIPTION`)
- Tables: the entity or event, the **grain** ("One row per ..."), and the purpose or authoritative use. Columns: business meaning, **format, unit, expected values**, and what null means when it matters.
- Prioritize what cannot be inferred: codes, flags, abbreviations, similarly named columns, dates that mean a specific event, amounts and their unit. Skip columns whose name already says everything; never repeat the name.
- Source the values from `profile.json`. Example: `stat_cd` with observed values `AP, PD, CN` → list those three, and mark their meaning `NEEDS_OWNER_REVIEW` unless an existing description, instruction, or documentation confirms it.
- Keep each description to one or two sentences.
- Same-meaning text must not differ between the lakehouse comment and the agent description. An agent-level edit stops that object inheriting later source updates; say so in the plan for every `AGENT_DESCRIPTION` on an object that already has a source comment.

**Source description** (`SOURCE_DESCRIPTION`, also a routing signal)
- One or two short sentences: what the source contains, which questions it answers, what makes it the authoritative choice.
- Example: "Contains retail customer orders and the customer dimension. Use it for order counts, revenue, status and region; it is the authoritative source for orders."

**Data source instructions** (`SOURCE_INSTRUCTIONS`)
- Direct sentences, grouped under short Markdown headings: `Objects` (authoritative vs excluded tables), `Joins` (exact keys and paths; forbid fact-to-fact joins that fan out), `Grain and deduplication`, `Business values` (codes, booleans, units, null/sentinel meaning), `Time logic` (default event date, calendar vs fiscal, time zone, inclusive/exclusive boundaries), `Calculations` ("X is calculated as ...").
- Cross-object rules go here. Single-object definitions go in descriptions, not here.
- Do not copy the whole schema; instruction space is limited.

**Example queries** (`FEWSHOT`)
- One reusable pattern per example, with a natural-language question that maps clearly to the T-SQL: relative dates, status filters, preaggregation before a join, top-N, window functions.
- Add a leading `--` comment for substituted values or non-obvious logic (for example `-- substitute the year range here`).
- Every literal in the question appears in the query (numbers, dates, categories). Explicit column lists, no `SELECT *`. Bound detail queries with `TOP`; aggregates need no limit.
- No overlapping or contradictory examples; at most 100 per source; only SELECT. Validate each on the SQL endpoint in `apply` (and optionally with the SDK `evaluate_few_shots`, SQL only).

**Schema selection** (`SELECTION`)
- Propose deselecting staging, raw, archive, audit, temp and duplicate objects; keep what the questions need. When two selected objects hold similar data, add an "authoritative" rule in `SOURCE_INSTRUCTIONS` instead of leaving both ambiguous.

**Routing** (only when the agent has more than one source; otherwise write "Not applicable: single source")
Follow the order from the routing guidance, stopping when the symptom is solved: (1) tighten schema selection, (2) a short source description, (3) example queries for questions that previously routed wrongly, (4) as a last resort, concise routing rules under a `## Topics` heading in the agent instructions, one line per topic, naming sources exactly as they are named now, at most 10 lines. Do not write routing rules that name a source that does not exist.

**Agent instructions** (`AGENT_INSTRUCTIONS`, only if the Analyzer reported `DA-001/002/007` or routing gaps)
- Sections: Objective, Data sources and routing, Shared terminology, Response guidelines, Out of scope.
- Keep it short and consistent with the source instructions. Never paste secrets, IDs or customer data.

## Plan file template

````markdown
# Remediation plan — <agent> (<UTC timestamp>)

**Agent:** <name> | **Workspace:** <name> | **Runtime:** standard|preview | **Sources:** <n>
**Baseline:** readiness <x>% / coverage <y>% / <failing critical rules>
**Scope requested:** <comments / descriptions / instructions / examples / selection / routing>

## Summary
<3-5 lines: biggest problems and what the plan changes>

## Changes
| ID | Target | Object | Before | After | Evidence | Fixes rule | Owner review |
|---|---|---|---|---|---|---|---|
| C01 | AGENT_DESCRIPTION | dbo.fact_ord.stat_cd | (none) | Order status: AP approved, PD pending, CN canceled. | distinct values AP/PD/CN (profile.json) | SQL-005, SQL-009 | meanings NEEDS_OWNER_REVIEW |

## Example queries
| ID | Question | T-SQL | Validated |
|---|---|---|---|

## Not changing (and why)
<items skipped: unprovable meaning, no write permission, runtime limits, routing not applicable>

## Risks
- `COMMENT` changes are visible to every lakehouse consumer.
- Agent edits go to the **draft** only; publishing is a separate step.

## Rollback
Backup: `before/`. Restore by sending the backup parts through `updateDefinition`; prior comments in `evidence/comments.json`.
````

## Approval gate

Persist the plan, show the user the summary table, and ask for approval **per scope item** (lakehouse comments separately from agent configuration). End the turn. Do not load `apply` in this turn. Approval in a later reply may name which `C##` items to include; apply exactly those.
