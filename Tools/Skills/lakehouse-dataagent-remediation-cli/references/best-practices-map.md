<!-- Topic reference for the `lakehouse-dataagent-remediation-cli` skill. Loaded on demand from `assess.md` and `plan.md`. -->

# Best-practices map — Analyzer rule → remediation

How each Analyzer finding for a **lakehouse** source is fixed, and which Microsoft Learn guidance it comes from. Rule IDs are those of the Fabric Data Agent Analyzer (v3.2.x); the Analyzer's checks are text heuristics, so write for the reader (the agent) and treat the rule as a signal.

Docs: [best practices](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configuration-best-practices) · [schema object descriptions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-schema-object-descriptions) · [example queries](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-example-queries) · [routing](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-routing) · [configurations](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configurations) · [runtime](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-runtime)

| Rule(s) | Finding | Fix (change type) | What a good fix contains |
|---|---|---|---|
| `SQL-004`, `SQL-021` | Tables not described, or descriptions only repeat the name | `AGENT_DESCRIPTION` (+ `SOURCE_COMMENT`) | Entity/event, grain ("one row per ..."), purpose, authoritative use |
| `SQL-005` | Ambiguous columns (codes, flags, dates, units, abbreviations) undocumented | `AGENT_DESCRIPTION` (+ `SOURCE_COMMENT`) | Meaning, format, unit, expected values, null meaning; expand abbreviations |
| `SQL-006` | Grain not documented | `AGENT_DESCRIPTION`, `SOURCE_INSTRUCTIONS` | "One row per ..." for each fact/event table |
| `SQL-007` | Join path not documented | `SOURCE_INSTRUCTIONS`, `FEWSHOT` | Exact keys and path ("Join A to B on K"); warn about fan-out/fact-to-fact joins; an example that joins |
| `SQL-008`, `SQL-001`, `DA-011`, `LH-004` | Overlapping current/archive/raw/curated objects, noisy selection | `SELECTION`, `SOURCE_INSTRUCTIONS` | Deselect staging/archive/raw; state which object is authoritative when similar ones remain |
| `SQL-009` | Business values undocumented | `SOURCE_INSTRUCTIONS`, `AGENT_DESCRIPTION` | Code/flag meanings, units (for example cents vs dollars), null and sentinel meaning, state-name forms |
| `SQL-010` | Time logic undocumented | `SOURCE_INSTRUCTIONS` | Default event date, calendar vs fiscal, time zone, inclusive/exclusive period boundaries |
| `SQL-011` | Calculations vague | `SOURCE_INSTRUCTIONS`, `FEWSHOT` | "X is calculated as ..." plus an example that implements it |
| `DA-006` | Source description weak | `SOURCE_DESCRIPTION` | What it contains, which questions it answers, what distinguishes it (also a routing signal) |
| `DA-008` | No source-specific instructions | `SOURCE_INSTRUCTIONS` | Objects, grain, joins, date rules, calculations, values |
| `SQL-012`, `EXQ-002` … `EXQ-005`, `SQL-013` … `SQL-016` | Example queries missing, overlapping, uncommented, invalid, `SELECT *`, unbounded | `FEWSHOT` | One pattern per example, guiding `--` comments, validated T-SQL, explicit columns, bounded detail queries, <= 100 |
| `DA-001`, `DA-002`, `DA-007`, `DA-027` … `DA-029` | Agent instructions missing or unstructured; routing gaps | `AGENT_INSTRUCTIONS` | Objective, Data sources and routing, Shared terminology, Response guidelines, Out of scope; short `## Topics` routing lines only if routing still fails |
| `SQL-022` | Topics poorly structured | `SOURCE_INSTRUCTIONS` | Markdown headings that match how people ask, self-contained sections |
| `SQL-023`, `DA-013`, `DA-039` | Preview runtime in use | none (report only) | Needs explicit owner acceptance; descriptions require the preview runtime; never flip the flag silently |
| `SQL-018`, `SQL-019`, `LH-001`, `LH-002`, `LH-003`, `LH-005` | Data quality, freshness, SQL-endpoint sync, shortcuts, Delta health | none (report; verify with SQL endpoint) | Operational, outside agent configuration; list as follow-ups |
| `DA-015` … `DA-017`, `DA-022` … `DA-024`, `DA-033` | Permissions, evaluation, publishing description | none (manual) | Out of scope for remediation; list as release-gate follow-ups |

## Where the fix goes (decision guide)

| Context to express | Best place |
|---|---|
| Meaning of one table or column, units, expected values | Source `COMMENT` (benefits every consumer) and agent description |
| Rules spanning objects: joins, grain, dedup, defaults, calendars | Data source instructions |
| A reusable query pattern that is clearer as code | Example query |
| Which tables the agent can see at all | Schema selection |
| Which source answers which topic (multi-source only) | Source description → examples → (last resort) routing rules in agent instructions |

## Observed effect (small lakehouse agent, static Analyzer)

| Stage | Readiness | Coverage |
|---|---|---|
| Baseline (no descriptions, no instructions, no examples, noisy selection) | 38% | 57% |
| + object descriptions, source description and instructions, validated examples, deselect staging/archive | 78% | 62% |
| + values, time logic, calculation rules, example comments, remaining column descriptions | 85% | 62% |
| + agent instructions | 91% | 62% |

The release gates still failed at the end (preview acceptance, ground-truth evaluation, publishing description), as expected for a static check.
