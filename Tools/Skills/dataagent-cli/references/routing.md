<!-- Topic reference for the `dataagent-cli` skill. Loaded on demand from `planning.md` and `authoring.md` for agents with more than one source. -->

# Routing — helping the agent pick the right source

Source: [Improve data source routing](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-routing). Routing matters only when an agent has **more than one** source; for a single source write "Not applicable".

## How routing works

The orchestrator builds a plan, picks the source most likely to hold the answer from each source's metadata (**name, description, selected schema, example queries**), calls that source's query tool, reviews results, and may repeat. For speed it routes from a *subset* of the metadata; when that is not enough (large schema, similar names, ambiguous question) it calls a routing tool to inspect the full schema and examples.

## Symptoms

- Wrong source for a question that one source clearly owns.
- "Cannot find an answer" though the data exists in a connected source.
- Different answers to similar questions because the source choice varies.

Confirm in the portal: expand the run steps to see the chosen source and whether the routing tool ran (a sign the decision was ambiguous).

## Fix in this order — stop when the symptom is solved

1. **Tighten schema selection** on each source; descriptive object names; remove overlap between sources.
2. **Add a short source description** per source (what it contains, which questions it answers, what makes it authoritative). Not available for semantic models — their routing signal is the model's names, selected tables, and the agent instructions.
3. **Add example queries** for each source, especially for questions that previously routed wrongly (SQL, KQL, graph; semantic models use Verified Answers in Prep for AI).
4. **Add routing rules to the agent instructions as a last resort**: grouped by topic, concise, at most about 10 lines, naming each source exactly as it is named now. Update them whenever a source is added or renamed.

```md
## Topics

- When asked about logistics trends, shipment delays, or carrier performance, use **FabrikamLogisticsLH**.
- When asked about marketing campaigns, ad spend, or channel performance, use **FabrikamMarketingDW**.
- When asked about customer support tickets or SLA breaches, use **FabrikamSupportKQL**.
```

## Rules for this skill

- Never write a routing rule that names a source that is not attached; never leave a rule naming a removed or renamed source.
- Keep one metric definition per concept across sources; when sources define the same term differently, say which source is authoritative and why.
- Do not duplicate source-specific query logic in agent instructions.
- Overlapping similar names or descriptions across sources are a defect to fix at steps 1–2, not with rules.
- Verify with 3–5 questions per topic and inspect the run steps (see `evaluation.md`).
