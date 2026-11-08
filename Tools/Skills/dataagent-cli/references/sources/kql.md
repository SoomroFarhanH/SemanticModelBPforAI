<!-- Source reference for the `dataagent-cli` skill: Eventhouse KQL databases. Loaded on demand from `planning.md` and `authoring.md`. -->

# Eventhouse KQL database

Query tool: **NL2KQL** over the Eventhouse KQL database endpoint; it can use KQL user-defined functions (UDFs) present in the selected objects and supports standard time filters and time-series patterns. The agent queries in place (no data movement) and is read-only: it never triggers anomaly detection, notebooks or write workflows. Sources: [data source configuration](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-add-datasources) · [concepts](https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent).

## Supported configuration

Schema selection (**tables, materialized views, functions, shortcuts**), agent instructions, source instructions, source description, example queries (KQL, ≤100). **No** topics. Schema object descriptions are documented only for SQL sources.

## Readiness checks (read-only)

| Check | Fix |
|---|---|
| Selected objects exist and are readable (bounded `take 1` / schema query) | Re-select or fix permissions; consumers need the **Reader** role on the database |
| Scope is focused: only tables, materialized views, functions and shortcuts the questions need | Deselect the rest |
| Event time is typed `datetime` (not epoch `long`) | Fix ingestion/update policy or expose a function/view |
| Default time column and timezone stated | Source instructions |
| Retention window and latest event timestamp known | Record in the source description/instructions |
| Frequently extracted dynamic fields | Materialize at ingestion where appropriate |
| Repeated heavy aggregations | Consider materialized views |
| Shortcut targets healthy (availability, permission, latency) | Fix before relying on them |
| Functions callable with required parameters and permissions | Test with bounded samples; document parameters |

## Writing the context

Follow [context-playbook.md](../context-playbook.md), with these KQL specifics:

- **Source description:** the event domain, the retention window, and the authoritative tables.
- **Source instructions:** default time column and timezone; which tables/functions/materialized views are authoritative; join strategy for large inputs (check input sizes); how to use functions (parameters); retention/freshness; encourage a time filter on high-volume tables.
- **Example queries (KQL):** put the selective `where` (datetime first) immediately after the table reference; name tables and columns instead of `union *` / `search *`; prefer `has` / `==` over `contains` when token semantics allow; bound detail output with `take`/`limit`/`count`/`summarize`; use `//` comments for substituted values. Validate each by running it bounded (`| take 10` or with a short time window) before writing it.
- Conflicts: two examples with the same intent but different tables, filters or aggregation confuse the tool; keep one.

## Analyzer rules

`KQL-001` … `KQL-018` (scope, resolvable objects, names/description, datetime event time, default time column, early filters, specific references, string predicates, bounded results, dynamic fields, materialized views, joins, functions, example validity, conflicts, retention/freshness, shortcuts, reader permissions). Use `eventhouse-cli` for table/function/policy changes.

## Validation

Run KQL read-only through the Eventhouse query endpoint (`eventhouse-cli` consumption). A query that fails or returns nothing for a window where data exists is dropped, not repaired silently.
