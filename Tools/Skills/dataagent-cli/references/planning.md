<!-- Mode reference for the `dataagent-cli` skill. Loaded on demand from `skills/dataagent-cli/SKILL.md` when the request matches the `planning` mode. -->

# Planning — requirements to an approved spec (no building)

Output: `_brief/dataagent-spec.md` (or the user-named equivalent), a short chat summary, and an explicit approval question. **The turn ends there.** Do not create the item, write definitions, or call Fabric write APIs in this mode.

For a small, well-scoped request (one or two sources, the user already knows the scope), use the condensed spec in [quickstart.md](quickstart.md) — same approval gate, fewer questions. Design every decision so it will pass [preflight-checklist.md](preflight-checklist.md).

For an **existing** agent, planning means: export it (`management.md`), run the Analyzer or read its evidence (`evaluation.md`), and write `remediation-plan.md` using the same gate (template at the end).

## 1. Gather requirements (infer first, ask only what is missing)

Infer from the prompt, workspace items and any existing agent. Ask only for what you cannot infer, in one short form.

| Topic | What to settle |
|---|---|
| Purpose and audience | Who asks, what decisions, what 10–20 representative questions (these become example candidates and the evaluation set) |
| Sources | Which items answer those questions; **max 5 sources**, any mix of lakehouse, warehouse, SQL database, mirrored database, semantic model, Eventhouse KQL database, graph model, ontology, Azure AI Search index, Microsoft Graph (preview) |
| Scope per source | Which tables/views/functions (or model tables) the questions need; what must be excluded |
| Preferred source per topic | Which source is authoritative for which topic (drives routing) |
| Runtime | Standard (GA, default) or preview. Schema object descriptions, topics, advanced NL2SQL/DAX and 1,000-row answers need the **preview runtime**; preview carries a release gate and needs explicit owner acceptance |
| Language | English only (questions, instructions, examples) |
| Security | Consumers' access (the agent uses the caller's permissions; RLS/CLS apply; sharing the agent does not grant data access); Purview/DLP expectations |
| Delivery | Where users will consume it (portal, MCP server, Microsoft 365 Copilot, Copilot Studio, Azure AI Foundry, Teams — see [consumption.md](consumption.md)); a draft of the **publishing description** (it becomes the MCP tool description and the orchestrator routing signal); Git/deployment-pipeline needs |

## 2. Check each source's readiness (read-only)

Open the matching source reference **once** and run its readiness checks:

| Source | Reference |
|---|---|
| Lakehouse, warehouse, SQL database, mirrored database | [sources/sql.md](sources/sql.md) |
| Power BI semantic model | [sources/semantic-model.md](sources/semantic-model.md) |
| Eventhouse KQL database | [sources/kql.md](sources/kql.md) |
| Graph model, ontology, Azure AI Search | [sources/graph-ontology-search.md](sources/graph-ontology-search.md) |

Cross-source checks (all agents):
- Capacity of every source is in the **same region** as the agent's capacity; capacity is active (`CapacityNotActive` → stop and report).
- Paid capacity F2+ (or P1+) with Fabric enabled, and the data agent tenant settings (including cross-geo processing/storing for AI where required) are on — these are tenant/admin settings: report, do not change.
- The user has read access to every source; lakehouse data must be in **tables** (files are not queried; unstructured files need an AI Search index).
- Business-friendly names exist for the objects the agent will see; if not, plan descriptions or curated views rather than relying on cryptic names.

## 3. Design the context layers

For each source decide where each piece of context lives (details in [context-playbook.md](context-playbook.md)): schema selection → source description → source instructions → schema object descriptions (SQL, preview runtime) → example queries → agent-level instructions. For more than one source also read [routing.md](routing.md). Semantic-model context is **not** written on the agent; it is planned as Prep for AI work for `semantic-model-authoring`.

## 4. Persist the spec

````markdown
# Data agent spec — <agent name> (<UTC timestamp>)

**Workspace:** <name> | **Runtime:** standard|preview | **Delivery:** <channels>
**Audience / purpose:** <one or two lines>
**Publishing description (draft):** <domain, sources, typical questions, what it does not answer>
**Representative questions:** <10-20, grouped by source/topic>

## Sources
| # | Source (type) | Item | Scope (objects) | Authoritative for | Readiness | Gaps |
|---|---|---|---|---|---|---|

## Context plan (per source)
| Source | Selection | Source description | Source instructions | Object descriptions | Example queries | Prep for AI (semantic model) |
|---|---|---|---|---|---|---|

## Agent instructions outline
Objective / Data sources (and routing) / Key terminology / Response guidelines / Handling common topics (only what applies across sources)

## Routing plan
<single source: "Not applicable"; otherwise the ordered steps from routing.md>

## Evaluation set
<questions with expected answers or expected source>

## Risks and owner decisions
<preview acceptance, unprovable meanings, permissions, capacity/region, anything needing an admin>

## Out of scope
<what the agent will not answer>
````

## 5. Approval gate

Show the summary, then ask for approval (and any owner decisions) and end the turn. Approval must come in a later reply. Only then switch to `authoring`.

## Existing-agent variant: `remediation-plan.md`

Use the same gate. Table of changes with `ID | Source | Layer | Object | Before | After | Evidence | Fixes (Analyzer rule) | Owner review`, plus `Not changing (and why)`, `Risks`, and `Rollback` (backup path). Rank by Analyzer severity (blockers/critical first).
