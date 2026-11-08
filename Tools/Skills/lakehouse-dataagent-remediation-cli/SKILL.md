---
name: lakehouse-dataagent-remediation-cli
description: "Improves the Lakehouse source behind a Fabric data agent: drafts and applies schema object and table/column descriptions, source instructions, validated example queries, schema selection trims and routing rules, plan-first with backup, readback and rollback. Use to fix Fabric Data Agent Analyzer findings for a lakehouse. Scoring only is the analyzer; semantic models are semantic-model-authoring."
---

> **Telemetry — MANDATORY.** Every `api.fabric.microsoft.com` call must carry
> `x-ms-fabric-skill: lakehouse-dataagent-remediation-cli` (`az rest`: `--headers "x-ms-fabric-skill=lakehouse-dataagent-remediation-cli"`),
> including every LRO poll, `fabric_lro` and retry. Snippets omit it — add it anyway.

> **CRITICAL NOTES**
> 1. To find the workspace details (including its ID) from workspace name: list all workspaces and, then, use JMESPath filtering
> 2. To find the item details (including its ID) from workspace ID, item type, and item name: list all items of that type (`Lakehouse`, `DataAgent`) in that workspace and, then, use JMESPath filtering
> 3. **Skill disambiguation**: use this skill to **change** the lakehouse source and its data agent configuration. Scoring or auditing a data agent is the Fabric Data Agent Analyzer notebook; Spark runs and notebooks are `spark-cli`; ad-hoc read-only SQL is `sqldw-cli`; questions answered over Power BI data are `fabriciq`; semantic-model remediation is `semantic-model-authoring`.
> 4. **Capacity boundary**: if Fabric returns `CapacityNotActive`, stop and tell the user. Never resume or scale a paid capacity on your own.

# Lakehouse Data Agent Remediation — CLI Skill

This one skill owns improving a **Fabric data agent's Lakehouse data source** against the Microsoft Learn guidance on
[query-generation best practices](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configuration-best-practices),
[schema object descriptions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-schema-object-descriptions),
[example queries](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-example-queries) and
[data source routing](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-routing).
It is the lakehouse counterpart of the semantic-model remediation flow: find what is weak, draft evidence-based fixes, get approval, write them, then prove the result.

It is a **mode dispatcher** and contains NO procedures. Pick the mode, then **read the matching `references/<mode>.md` end to end BEFORE the first command**. The reference holds the verified payloads, SQL, templates and gotchas; acting without it produces broken definitions.

## Mode selection

| Mode | Use when the request ... | Example triggers | Read this first |
|---|---|---|---|
| `assess` | reads the agent and its lakehouse (read-only): exports the agent definition, ingests Analyzer findings, profiles tables and columns | what is wrong with my lakehouse agent, why does the agent answer badly, profile the lakehouse for the agent, gather evidence | [references/assess.md](references/assess.md) |
| `plan` | turns the evidence into a reviewable remediation plan and **stops for approval** | plan the fixes, what would you change, draft descriptions and examples, prepare remediation | [references/plan.md](references/plan.md) |
| `apply` | writes an **approved** plan: backup first, then lakehouse comments and/or agent draft definition | apply the plan, make the changes, write the descriptions, add the example queries | [references/apply.md](references/apply.md) |
| `verify` | proves the result: readback, example-query re-run, Analyzer before/after, rollback | verify the changes, did it improve, compare before and after, undo the remediation | [references/verify.md](references/verify.md) |

Rule-to-fix mapping and the documentation each fix comes from: [references/best-practices-map.md](references/best-practices-map.md).

### Mode boundary rule

`assess`, `plan` and `verify` never change anything (except `verify` rollback when the user asks for it). Only `apply` writes, and only from a plan the user approved in an **earlier reply**. A request such as "fix my lakehouse agent" is `assess` then `plan`; stop at the plan.

> **APPROVAL BARRIER — MANDATORY.** Until the user explicitly approves a persisted `remediation-plan.md` in a later reply, keep `plan` as the only active mode: do not load `apply`, do not write to the lakehouse or the agent, do not create or publish anything. "Fix it" in the original request is desired future scope, not approval. Persist the plan, ask for approval, end the turn.

Handle one mode at a time and announce each switch. If the mode is ambiguous after reading this table, ask one short clarifying question.

## Terminal write — the step you must not skip

Reading, profiling and drafting are NOT completing an apply request. `apply` ends with a successful `updateDefinition` (agent changes) and/or successful Spark `COMMENT` statements (lakehouse changes), each followed by a readback. If a write call did not return success, nothing was persisted — say so explicitly instead of reporting success.

## Rules

### MUST

- Resolve workspace, agent and lakehouse IDs by listing and filtering; never guess a GUID.
- Take a **backup** of the full agent definition (and prior table/column comments) before any write, and keep it in the run folder.
- Write only the **draft** stage. Never edit `Files/Config/published/...`; publishing is a separate explicit user step.
- Derive every description, value list and example from profiled data or the existing configuration. Anything that cannot be proven from evidence is marked `NEEDS_OWNER_REVIEW` and is not written as fact.
- Validate every example query read-only on the SQL analytics endpoint before it is written. Examples that fail are dropped, not repaired silently.
- Send the **complete** definition on `updateDefinition` (it replaces the whole definition); preserve every part you did not intend to change.
- Report preview limits honestly: schema object descriptions apply only to the preview runtime; the SDK is preview. Report `NOT_SUPPORTED` or `NOT_EVALUATED`, never a pass you did not observe.
- Treat lakehouse `COMMENT` changes as a separate, explicitly approved item: the lakehouse is shared by every consumer, not just this agent.

### PREFER

- Source-level comments for meaning that every consumer needs; agent-level descriptions and instructions for agent-specific behavior.
- Direct, imperative instructions ("Join `A` to `B` on `K`") over advice ("avoid wrong joins").
- Small, targeted changes ranked by impact (critical analyzer rules first), with the rule ID each change fixes.
- The Analyzer's JSON evidence when it already exists; otherwise export the definition and run it in `GIT_EXPORT` mode.

### AVOID

- Inventing business meaning, units, fiscal calendars or status values the data does not show.
- Selecting more objects to "help" the agent; fewer, clearer objects route and query better.
- Long routing-rule lists in agent instructions; they are a last resort and must be short.
- Publishing, deleting, or overwriting the published stage; resuming paid capacity; broad profiling scans of very large tables (sample with `TOP`).
- Reloading this dispatcher or a reference you already read in the current task.

## Examples

| User request | Mode |
|---|---|
| "My lakehouse data agent gives wrong answers — what should I fix?" | `assess`, then `plan` (stop for approval) |
| "Draft column descriptions and example queries for BudgetAnalysisLakeHouse." | `assess`, then `plan` |
| "Apply the approved remediation plan to the draft agent." | `apply`, then `verify` |
| "Did the changes improve readiness? Undo them if not." | `verify` |
