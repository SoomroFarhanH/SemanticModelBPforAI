<!-- Topic reference for the `dataagent-cli` skill. Loaded on demand from `planning.md` and `authoring.md`. -->

# Context playbook — what to write, where, and how (all sources)

Sources: [best practices](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configuration-best-practices) · [configurations](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configurations) · [add data sources](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-add-datasources) · [schema object descriptions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-schema-object-descriptions) · [example queries](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-example-queries) · [routing](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-routing).

The query tool only sees what you give it. Put each piece of context at the **closest layer that solves the problem**, and keep every layer short.

## Layers and where they are supported

| Layer | Purpose | SQL (lakehouse, warehouse, SQL DB, mirrored) | Eventhouse KQL | Semantic model | Graph | Ontology | AI Search |
|---|---|---|---|---|---|---|---|
| Schema selection | Limit what the tool may use | tables, views, functions | tables, materialized views, functions, shortcuts | tables (columns via Prep for AI) | not supported | not supported | n/a |
| Source description | Routing signal | yes | yes | **no** | yes | via mounted source | yes (context) |
| Source instructions | Query logic across objects | yes | yes | **no** (use Prep for AI AI instructions) | yes | via mounted source | agent instructions |
| Object descriptions | Meaning of one object | yes, **preview runtime** | not documented | model metadata | not documented | n/a | n/a |
| Topics | Large topic-organized instructions | yes, **preview runtime** | no | no | no | no | no |
| Example queries | Teach a query pattern | yes (T-SQL) | yes (KQL) | **no** (use Verified Answers in Prep for AI) | yes (GQL) | via mounted source | no |
| Agent instructions | Cross-source behavior and routing | yes | yes | yes, but **ignored by the DAX tool** | yes | yes | yes |

## Choosing the layer

| Context to express | Layer |
|---|---|
| Which objects the agent can use at all | Schema selection |
| What one table/column/measure means, unit, expected values | Object description (or the model/source metadata) |
| Rules spanning objects: joins, grain, dedup, default filters, calendars, calculations | Source instructions |
| A query pattern clearer as code (multi-join, preaggregation, window, relative dates) | Example query |
| What a source is for, to choose between sources | Source description, then examples, then (last resort) routing rules |
| Terminology, tone, response format, cross-source rules | Agent instructions |

## Writing rules by layer

### Schema selection
Select only what the intended questions need; remove staging, raw, archive, audit, temp and near-duplicate objects. If similar objects remain, say which is authoritative (source instructions). Descriptive names beat cryptic ones; when you control the schema, rename or add a curated view instead of explaining `Table1`.

### Source description (one or two sentences)
What the source contains, which questions it answers, what distinguishes it. Example: "Contains retail customer orders and the customer dimension. Use it for order counts, revenue, status and region; it is the authoritative source for orders."

### Source instructions (direct sentences under short headings)
Recommended template from the docs, extended with the sections that raise accuracy:

```md
## General knowledge
<background the tool should consider>

## Table descriptions
<key tables and important columns; grain: "one row per ...">

## Joins
- Join `A` to `B` on `K`. Do not join fact table `X` to fact table `Y`.

## Business values
- `stat_cd`: AP = approved, PD = pending, CN = canceled. Amounts are stored in cents.

## Time logic
- Use `order_date` by default; calendar year in UTC; period ranges include start, exclude end.

## Calculations
- Revenue is calculated as SUM(amount) / 100.0 for approved orders.

## When asked about
- When asked about shoe sales, always use the SalesProduct table.
```

State the grain of each fact table, the exact join keys, expected values/units, default dates and fiscal/calendar rules, and exact calculations. Put single-object definitions in object descriptions rather than using instruction space as a glossary.

### Object descriptions
Tables: entity or event, **grain**, purpose. Columns: meaning, format, unit, expected values, null meaning. Clarify abbreviations and similar names; never restate the name. Derive values from profiling; mark business meaning that data cannot prove as `NEEDS_OWNER_REVIEW`.

### Example queries
- One reusable pattern per example; question and query must map clearly (every literal in the question appears in the query).
- Leading comments for substituted values or complex logic (SQL `--`, KQL `//`).
- Explicit columns, no `SELECT *`; bound detail queries (`TOP`, `take`); aggregates need no limit.
- No overlaps or contradictions; at most **100 per source**; only reads.
- Only the few most similar examples are retrieved per question (the best-practices article says three, the example-queries article about four); keep them distinct so the right ones surface. Examples that fail schema validation are not sent to the agent; run steps show which were retrieved.
- Write examples from real user questions, comment the logic inside the query, and make join paths explicit (`JOIN ... ON` with keys) so the pattern is reusable.
- Cover: multi-table joins, preaggregation, business calculations, relative dates and fiscal periods, term-to-value filters, ranking/window patterns.

### Agent instructions (cross-source only)
Recommended format from the docs:

```md
## Objective
Help <audience> analyze <domain> across <scope>.

## Data sources
Use '<SourceA>' for <topics>. Use '<SourceB>' for <topics>.

## Key terminology
'GMV' refers to Gross Merchandise Value.

## Response guidelines
Present a short summary followed by a table of the supporting data. State the date range and filters applied.

## Handling common topics
When asked about customers, use '<SourceA>' then list open tickets from '<SourceB>'.
```

Keep it concise and consistent with source instructions. Do not copy source-specific query logic here; do not put semantic-model rules here. Add an out-of-scope line for what the data does not cover.

### Topics (SQL, preview runtime)
Use for large instruction sets organized by subject: Markdown headings that match how people ask, each section self-contained, under 1,000,000 characters; rules needed on every question stay in source instructions.

## Evidence rule

Every written fact traces to evidence: metadata, profiling (distinct values, ranges, keys, orphan counts), an existing description, or documentation the user supplied. Everything else is a question for the owner, recorded as `NEEDS_OWNER_REVIEW` in the plan and left out of the written configuration.
