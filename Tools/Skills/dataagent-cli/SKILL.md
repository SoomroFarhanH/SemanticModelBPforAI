---
name: dataagent-cli
description: "Plans, creates, configures, improves, publishes, and evaluates Fabric data agents over lakehouses, warehouses, SQL databases, mirrored databases, semantic models, Eventhouse KQL, graph, ontology, and AI Search, applying Microsoft's best practices per source type. Plan-first with backup and rollback. Scoring only is the Data Agent Analyzer; Prep for AI model edits are semantic-model-authoring."
---

> **Telemetry — MANDATORY.** Every `api.fabric.microsoft.com` call must carry
> `x-ms-fabric-skill: dataagent-cli` (`az rest`: `--headers "x-ms-fabric-skill=dataagent-cli"`),
> including every LRO poll, `fabric_lro` and retry. Snippets omit it — add it anyway.

> **CRITICAL NOTES**
> 1. To find the workspace details (including its ID) from workspace name: list all workspaces and, then, use JMESPath filtering
> 2. To find the item details (including its ID) from workspace ID, item type, and item name: list all items of that type (`DataAgent`, `Lakehouse`, `Warehouse`, `SemanticModel`, `KQLDatabase`, ...) in that workspace and, then, use JMESPath filtering
> 3. **Skill disambiguation**: use `dataagent-cli` for the **data agent item** and its configuration across any source type. Scoring or auditing readiness is the Fabric Data Agent Analyzer notebook. Editing the semantic model itself (descriptions, AI data schema, verified answers, AI instructions) is `semantic-model-authoring`. Lakehouse tables and Spark are `spark-cli`; read-only T-SQL is `sqldw-cli`; KQL tables and policies are `eventhouse-cli`; asking questions of Power BI data is `fabriciq`. A deep, lakehouse-only remediation workflow also exists as `lakehouse-dataagent-remediation-cli`.
> 4. **Capacity boundary**: if Fabric returns `CapacityNotActive`, stop and tell the user. Never resume, scale or buy capacity on your own.

# Fabric Data Agent — CLI Skill

This skill owns the Fabric **data agent** lifecycle end to end: requirements and scope, creating the agent and attaching sources, writing the context that makes it accurate (descriptions, instructions, example queries, schema selection, routing), publishing, and evaluating. Best practices are applied **per source type**, because each query tool (NL2SQL, NL2DAX, NL2KQL, GQL, AI Search) is configured differently.

It is a **mode dispatcher** and intentionally contains no detailed procedures. Select the mode, then read its reference end to end before acting. The mode file holds the workflow, payloads, templates and failure rules.

## Mode selection

| Mode | Use when the request... | Example triggers | Read first |
|---|---|---|---|
| `planning` | starts a new agent, or a significant redesign, and needs requirements, source readiness, scope, and an approved spec before anything is built | create a data agent, build an agent over my lakehouse/model, which sources should the agent use, plan my agent | [references/planning.md](references/planning.md) |
| `authoring` | creates or changes the agent **draft**: attach sources, select schema, write descriptions, instructions, example queries, routing; also improves an existing agent against best practices | add a lakehouse to the agent, write instructions, add example queries, fix routing, improve my agent, remediate analyzer findings | [references/authoring.md](references/authoring.md) |
| `evaluation` | tests quality: example validation, ground-truth questions, run-step inspection, Analyzer before/after | evaluate my agent, did the changes help, test the agent, regression check | [references/evaluation.md](references/evaluation.md) |
| `management` | operates the item: list, get, export/backup, restore/rollback, publish, delete, ALM (Git, deployment pipelines), permissions and sharing guidance | publish the agent, back up the agent, roll back, delete the agent, promote to prod | [references/management.md](references/management.md) |

Shared topic references (open from the mode file that needs them, once):

| Topic | Reference |
|---|---|
| Definition parts, schemas, element types per source | [references/definition-format.md](references/definition-format.md) |
| How to write descriptions, instructions, examples, selection (all sources) | [references/context-playbook.md](references/context-playbook.md) |
| Multi-source routing | [references/routing.md](references/routing.md) |
| SQL sources: lakehouse, warehouse, SQL database, mirrored database | [references/sources/sql.md](references/sources/sql.md) |
| Power BI semantic model | [references/sources/semantic-model.md](references/sources/semantic-model.md) |
| Eventhouse KQL database | [references/sources/kql.md](references/sources/kql.md) |
| Graph model, ontology, Azure AI Search (preview) | [references/sources/graph-ontology-search.md](references/sources/graph-ontology-search.md) |

## Mode Boundary Rules

- Classify by **intent**, not by which file is open.
- `planning` produces a spec; it builds nothing. `authoring` writes the draft from an approved spec (or, for a small focused edit, from the user's explicit instruction). `management` moves and operates the item; it does not invent configuration content. `evaluation` is read-only.
- A greenfield request spans modes in this order: `planning` → `authoring` → `evaluation` → `management` (publish).
- Improving an **existing** agent is `authoring` (assess → plan the changes → approval → apply); a focused single edit the user states explicitly ("add this instruction") may be applied directly after a backup.

> **APPROVAL BARRIER — MANDATORY.** For a new agent or a multi-change improvement, persist the plan (`_brief/dataagent-spec.md`, or `remediation-plan.md` for an existing agent), ask for explicit approval, and end the turn. In that turn do not create the item, write any definition, call Fabric write APIs, or publish. "Build it" in the original request is desired future scope, not approval. Never publish without an explicit request to publish.

## Required Deliverable by Mode

| Mode | Completion requirement |
|---|---|
| `planning` | Persist the spec, ask for approval, stop. |
| `authoring` | Backup, then a successful `updateDefinition` (or create) **and** a readback that confirms every approved change. Draft only. |
| `evaluation` | Report validation results, Analyzer before/after, what a static check cannot show, and next tests. |
| `management` | Complete the requested operation including LRO polling and a documented readback. |

## Rules

### MUST

- Resolve workspace, agent and source item IDs by listing and filtering; never guess a GUID.
- Read the source-type reference before writing source-level context: what is supported differs by source (for example, semantic models take **no** source instructions or description; example queries are not supported for them).
- Back up the full definition before any write; keep it in the run folder. Write the **draft** stage only; `published/` parts are sent back byte-for-byte.
- Send the **complete** definition on `updateDefinition` (full replace); an omitted part is deleted.
- Derive descriptions, values, joins and examples from evidence (metadata, profiling, existing docs). Mark anything unprovable `NEEDS_OWNER_REVIEW`; do not write it as fact.
- Validate example queries read-only against the source before writing them; drop failures.
- State preview limits honestly (runtime, SDK, graph/ontology/AI Search); report `NOT_SUPPORTED` / `NOT_EVALUATED` rather than a pass you did not observe.
- Respect the product limits: up to **5 sources** per agent, up to **100 example queries per source**, answers capped at **25 rows and 25 columns** (1,000 rows on the preview runtime), English only, source capacity in the **same region** as the agent, read-only queries only.

### PREFER

- The narrowest mode that covers the request; one mode at a time, announced.
- Fewer, clearer, business-named objects over broad selection; context placed at the right layer (see the playbook).
- Existing Analyzer evidence over re-deriving problems; the SDK (`fabric-data-agent-sdk`, preview) when it resolves a source's schema for you, REST `updateDefinition` for precise edits.
- Direct, imperative instructions ("Join `A` to `B` on `K`") over advice.

### AVOID

- Putting semantic-model instructions at the agent level (the DAX tool ignores them) — they belong in Prep for AI.
- Long routing-rule lists, copying whole schemas into instructions, or contradicting examples.
- Publishing, deleting, or editing `published/` without an explicit request; resuming paid capacity; unbounded profiling scans.
- Reloading this dispatcher or a reference already read in the current task.

## Examples

| User request | Mode |
|---|---|
| "Create a data agent over my sales lakehouse and finance semantic model." | `planning` (stop at approval) |
| "Add the approved descriptions and example queries to the agent." | `authoring` |
| "My agent picks the wrong source — fix the routing." | `authoring` |
| "Did the changes improve the agent? Test it with these 20 questions." | `evaluation` |
| "Publish the agent, but back it up first." | `management` |
