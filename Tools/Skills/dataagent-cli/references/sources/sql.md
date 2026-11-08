<!-- Source reference for the `dataagent-cli` skill: SQL sources. Loaded on demand from `planning.md` and `authoring.md`. -->

# SQL sources — lakehouse, warehouse, SQL database, mirrored database

Query tool: **NL2SQL** over the source's SQL analytics endpoint (T-SQL, read-only). Sources: [data source configuration](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-add-datasources) · [best practices](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configuration-best-practices).

## Supported configuration

Schema selection (tables, views, functions), agent instructions, source instructions, source description, schema object descriptions (**preview runtime**), topics (**preview runtime**, up to 1,000,000 characters), example queries (≤100, T-SQL).

## Readiness checks (read-only; do these in `planning`)

| Check | How | Fix when it fails |
|---|---|---|
| Selected objects are visible to the agent | Lakehouse tables appear in the SQL analytics endpoint; endpoint `provisioningStatus = Success` | Wait for/refresh endpoint sync; the agent cannot query files or unsynced tables |
| Data is in **tables**, not only files | list tables vs `Files/` | Ingest files into Delta tables |
| Noise objects | names like `stg_`, `raw`, `bronze`, `tmp`, `_archive`, `_old`, `audit`; near-duplicate base names | Deselect; add an "authoritative object" rule if similar objects stay |
| Names and meanings | cryptic names, abbreviations, codes | Descriptions (preview runtime) or instructions; or a curated view |
| Keys, grain, orphans | `COUNT(*) = COUNT(DISTINCT key)`, left-join orphan counts, fan-out test | Document in instructions; build a view if joins are fragile |
| Codes/flags/units | distinct values (≤25) of low-cardinality columns, numeric ranges | Document expected values and units |
| Time logic | date ranges, which date means which event | Default date, calendar vs fiscal, time zone, boundaries |
| Permissions | consumer can `SELECT` (warehouse/SQL DB) or read the lakehouse | Grant read; the agent uses the caller's identity |
| Region | source capacity region equals the agent capacity region | Move or choose another source |

Profiling is read-only T-SQL on the SQL endpoint (token audience `https://database.windows.net`): `INFORMATION_SCHEMA.COLUMNS`, counts, null rates, `TOP 25 ... GROUP BY` value lists, min/max dates. For very large tables sample with `TOP`; the endpoint has no `TABLESAMPLE`. Python `pyodbc` with the access token (`attrs_before={1256: <packed token>}`) or `sqlcmd -G` both work; call `az.cmd` on Windows.

## Per-type notes

| Type | Notes |
|---|---|
| **Lakehouse** | Select Delta **tables** in `dbo` (or schemas on schema-enabled lakehouses). Delta table/column `COMMENT`s (Spark SQL: `COMMENT ON TABLE`, `ALTER TABLE ... ALTER COLUMN ... COMMENT`) give every consumer a description; the agent inherits available source descriptions unless an agent-level description overrides them (the override stops inheriting later source updates). The deep workflow: `lakehouse-dataagent-remediation-cli`. `GET /lakehouses/{id}` gives `properties.sqlEndpointProperties.connectionString` |
| **Warehouse** | Curated views should encapsulate fragile joins and calculations; hide technical/staging schemas; grant Read/SELECT; check representative query latency |
| **SQL database** | Expose analytics-safe views rather than raw OLTP tables; document status/soft-delete/current-row semantics (`IsDeleted`, `IsActive`, `ValidTo`) so inactive rows are excluded |
| **Mirrored database** | Confirm mirroring is running and replicated before testing; measure replication lag; watch schema drift between source and mirror; outbound-access rules must allow the connection |

## Writing the context

Follow [context-playbook.md](../context-playbook.md). SQL specifics:
- Object descriptions: table = entity/event + grain + purpose; column = meaning, format, unit, expected values. Requires the preview runtime; on the standard runtime put a concise glossary of the objects that need it into source instructions instead.
- Source instructions: Objects, Joins, Grain, Business values, Time logic, Calculations (the playbook template).
- Examples: T-SQL, validated read-only on the SQL endpoint (SELECT/WITH only, no DDL/DML, bounded detail queries). The SDK `evaluate_few_shots` (SQL only, preview) scores clarity, relatedness and mapping and detects conflicts.
- Topics: only for large instruction sets by subject, preview runtime.

## Analyzer rules for SQL sources

`SQL-001` … `SQL-023`, `LH-*`, `WH-*`, `SQLDB-*`, `MIR-*` (see the Analyzer). Verified effect on a lakehouse agent: readiness 38% → 91% and every `SQL-004` … `SQL-011`, `LH-004`, `EXQ-001` finding cleared, with descriptions, instructions, validated examples, selection trims and agent instructions applied to the draft.
