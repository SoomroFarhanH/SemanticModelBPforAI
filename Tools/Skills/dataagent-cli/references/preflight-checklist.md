<!-- Topic reference for the `dataagent-cli` skill. Loaded on demand from `authoring.md` (before declaring a write complete), `evaluation.md` and `management.md` (before publishing). -->

# Pre-flight checklist — best practices before "done" and before publish

Run this against the **exported draft** (not against your plan). Mark each line `PASS`, `FAIL`, `N/A` or `NOT_EVALUATED`, fix `FAIL`s at the closest layer ([context-playbook.md](context-playbook.md)), and include the table in the run report. Learn sources: [best practices](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configuration-best-practices) · [configurations](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configurations) · [example queries](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-example-queries).

## A. Scope and sources

| # | Check | Why |
|---|---|---|
| A1 | ≤ 5 sources; each one answers questions in the spec; no source added "just in case" | every extra source makes routing harder |
| A2 | Every source capacity is in the same region as the agent; capacity active | cross-region sources fail |
| A3 | Schema selection is minimal: no staging, raw, audit, temp, archive or near-duplicate objects | the tool can only choose well from a clean set |
| A4 | Selected objects have business-readable names, or a curated view / description explains them | cryptic names cause wrong joins and filters |
| A5 | Lakehouse data is in **tables** (files are not queried) | files are invisible to NL2SQL |
| A6 | Semantic model: Prep for AI done (AI data schema, AI instructions, verified answers, descriptions) in the model, not on the agent | the DAX tool ignores agent instructions |

## B. Agent instructions (`aiInstructions`)

| # | Check |
|---|---|
| B1 | Uses the documented sections: **Objective**, **Data sources**, **Key terminology**, **Response guidelines**, **Handling common topics** |
| B2 | Cross-source behavior only; no per-source joins, columns or SQL (those live in source instructions) |
| B3 | Every source named in routing rules exists on the agent, with its exact display name |
| B4 | Terms and acronyms defined once; no contradiction with source instructions or examples |
| B5 | Response format stated (summary + table, date range and filters stated, units) |
| B6 | Out-of-scope line present; no secrets, IDs, connection strings or personal data |
| B7 | Concise: rules that apply to every question, not a copy of the schema |

## C. Source description and source instructions (SQL, KQL, graph)

| # | Check |
|---|---|
| C1 | Source description: 1–2 sentences — what it contains, which questions it answers, what makes it authoritative (routing signal) |
| C2 | Source instructions follow **General knowledge / Table descriptions / When asked about**, plus Joins, Business values, Time logic, Calculations where needed |
| C3 | Grain stated for every fact table ("one row per …") |
| C4 | Join keys stated directly ("Join `A` to `B` on `K`"); forbidden fact-to-fact joins called out |
| C5 | Stored values and units documented (codes, casing, cents vs units, time zone) |
| C6 | Default date column, calendar vs fiscal, and period boundaries stated |
| C7 | Business calculations written as exact expressions |
| C8 | Not set on semantic-model sources (unsupported); ontology context applies only to the mounted source |

## D. Object descriptions and topics (SQL, preview runtime)

| # | Check |
|---|---|
| D1 | Runtime decision recorded; descriptions/topics written only if the preview runtime is accepted |
| D2 | Table descriptions give entity, grain and purpose; column descriptions give meaning, format, unit, expected values, null meaning; never restate the name |
| D3 | Every value is backed by profiling or owner documentation; unprovable meaning stays `NEEDS_OWNER_REVIEW` and is not written |
| D4 | Topics (if used) are organized by how users ask, self-contained, < 1,000,000 characters; rules needed on every question remain in source instructions |

## E. Example queries (SQL, KQL, graph; not semantic models or ontology)

| # | Check |
|---|---|
| E1 | ≤ 100 per source; each one **ran successfully**, read-only and bounded, before it was written |
| E2 | Each question is a realistic user question; one reusable pattern per example |
| E3 | Every literal in the question appears in the query (mapping); comments explain substituted values and complex logic |
| E4 | Explicit columns, no `SELECT *`; detail queries bounded (`TOP`, `take`, `LIMIT`) |
| E5 | No duplicates, overlaps or contradictions (SQL: `evaluate_few_shots` conflict count is 0) |
| E6 | Coverage: multi-table joins, preaggregation, business calculations, relative dates and fiscal periods, term-to-value filters, ranking |
| E7 | Examples agree with source instructions (same joins, filters and calculations) |

## F. Multi-source routing (only when > 1 source)

| # | Check |
|---|---|
| F1 | Fixed in order: selection → source descriptions → examples → (last) routing rules ([routing.md](routing.md)) |
| F2 | Overlapping topics have one stated authoritative source |
| F3 | Routing rules are few, named by exact source display name, and testable |

## G. Evaluation evidence

| # | Check |
|---|---|
| G1 | Readback: every approved change present; `published/` unchanged unless publishing |
| G2 | Analyzer after ≥ Analyzer before; no regressed rule |
| G3 | Benchmark (10–30 questions incl. multi-source, ambiguous and previously failing) run or explicitly `NOT_EVALUATED` |
| G4 | Run steps inspected for a sample: right source, retrieved examples relevant, generated query correct |

## H. Publish gate (only when the user asks to publish)

| # | Check |
|---|---|
| H1 | Sections A–G have no open `FAIL`, or the owner accepted each in writing |
| H2 | Draft backup taken |
| H3 | Publishing description is specific (domain, sources, typical questions, exclusions): it is the MCP tool description and the routing signal for Copilot Studio / Microsoft 365 Copilot orchestrators |
| H4 | Runtime at publish is the intended one (the published agent keeps it until republished); preview use accepted in writing |
| H5 | Consumers have data access on every source (sharing the agent grants none); tenant settings, Purview/DLP expectations confirmed |
| H6 | After publish: export shows `published/` = intended draft and `publish_info.json` carries the description; MCP smoke test passes ([consumption.md](consumption.md)) |

## Anti-patterns (each one is a `FAIL`)

- Selecting every table "so the agent has everything".
- Agent instructions that repeat the schema, contain SQL, or address the DAX tool.
- Examples written without running them, or with literals that do not appear in the query.
- Two examples that answer the same question differently.
- Routing rules that name a source that is not on the agent, or long rule lists instead of better descriptions.
- Descriptions that restate the object name ("Customer ID column") or invent business meaning.
- Publishing with an empty or generic description ("Sales agent").
- Flipping the preview runtime without an owner decision.
