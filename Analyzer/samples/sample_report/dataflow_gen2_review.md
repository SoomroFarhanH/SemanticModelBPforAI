# Dataflow Gen2 Best-Practice Review

Generated 2026-10-16T14:19:40Z - 2 dataflow(s) - average score **50.0**

Sources: [Dataflow Gen2 performance best practices](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices), [Decision guide](https://learn.microsoft.com/en-us/fabric/fundamentals/decision-guide-pipeline-dataflow-spark)

| Severity | Findings |
|---|---|
| critical | 0 |
| high | 7 |
| medium | 13 |
| low | 9 |
| info | 1 |

## Scorecard

| Workspace | Dataflow | Score | Grade | Critical/High | Medium | Recommended engine |
|---|---|---|---|---|---|---|
| - | BadSales | 0 | F | 7 | 13 | Eventstream |
| - | GoodSales | 100 | A | 0 | 0 | Dataflow Gen2 (keep and optimize) |

---

## BadSales  (score 0, grade F)

Format: cicd; queries: 6

### Prioritised remediation plan (quick wins first)

1. **[DFG-001] Fast Copy is disabled for the dataflow** (high, effort low) - Open the dataflow > Home > Options > Scale and turn on 'Allow use of fast copy connectors'.
2. **[DFG-023] Warehouse destination without staging** (medium, effort low) - Enable staging on queries that load to a Warehouse destination.
3. **[DFG-035] Table.Buffer / List.Buffer used** (medium, effort low) - Remove the buffer unless profiling shows a benefit.
4. **[DFG-011] Fast Copy source loads directly to a non-Lakehouse destination** (medium, effort low) - Stage the ingestion query (no destination).
5. **[DFG-040] Design-time row limit left in the query** (medium, effort low) - Replace hard-coded limits with a parameter (for example DesignDateFilter) whose value is widened for production runs.
6. **[DFG-032] Rows are filtered late in the query** (medium, effort low) - Move Table.SelectRows (date/ID filters) directly after the source navigation.
7. **[DFG-050] Gateway runs the whole dataflow, including transformations** (high, effort medium) - Dataflow A (gateway): copy on-premises data to a Lakehouse/Warehouse, Fast Copy where supported, no transformations.
8. **[DFG-020] Heavy transformations run in the mashup engine without staging** (high, effort medium) - Right-click the first non-folding step > Extract previous, name the new query, and enable staging on it.

### Findings

#### [DFG-001] Fast Copy is disabled for the dataflow

- Severity: **high** | Confidence: high | Category: Performance | Effort: low | Impact: speed, capacity
- Evidence: computeEngineSettings.allowFastCopy = false. Fast-copy capable queries: RawFiles, FilesToWarehouse.
- Why it matters: Fast Copy uses the pipeline Copy-activity backend for high-throughput ingestion. Disabling it forces the slower mashup-engine data path even for eligible sources.
- Remediation:
  1. Open the dataflow > Home > Options > Scale and turn on 'Allow use of fast copy connectors'.
  1. In the definition set computeEngineSettings.allowFastCopy = true (the default).
  1. Keep Fast Copy queries free of non-folding transformations; put those in a second, referencing query.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflows-gen2-fast-copy

#### [DFG-050] Gateway runs the whole dataflow, including transformations

- Severity: **high** | Confidence: high | Category: Architecture | Effort: medium | Impact: speed, capacity, reliability
- Evidence: gatewayObjectId set; queries mixing source + transformations: FactSales, RawFiles, FilesToWarehouse, Orphan.
- Why it matters: The gateway executes every transformation on the gateway machine. Keeping only data movement on the gateway reduces latency and capacity pressure.
- Remediation:
  1. Dataflow A (gateway): copy on-premises data to a Lakehouse/Warehouse, Fast Copy where supported, no transformations.
  1. Dataflow B (cloud, no gateway): read the landed data and apply transformations.
  1. Alternatively use a pipeline Copy activity/Copy job via the gateway for the movement step.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-020] Heavy transformations run in the mashup engine without staging

- Severity: **high** | Confidence: medium | Category: Performance | Effort: medium | Impact: speed, capacity
- Query: `FactSales`
- Evidence: Query 'FactSales' (staging off) uses Table.AddIndexColumn, Table.Buffer, Table.Group, Table.Sort on a non-folding path.
- Why it matters: Joins, group-by, pivot/unpivot, sort, distinct and buffering that do not fold to the source run in the single-node mashup engine. Staging lets the Lakehouse/Warehouse SQL engine do that work in parallel.
- Remediation:
  1. Right-click the first non-folding step > Extract previous, name the new query, and enable staging on it.
  1. Apply the heavy transformations in the second query (staging on the second query is optional).
  1. Re-check folding indicators: the first query should show green (folds to source).
  1. Sources that never fold (Excel, CSV, JSON, web, SharePoint) benefit most: land the raw data in query 1, then transform in staging compute; prefer Parquet/Delta over CSV/Excel as the landing format.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-020] Heavy transformations run in the mashup engine without staging

- Severity: **high** | Confidence: medium | Category: Performance | Effort: medium | Impact: speed, capacity
- Query: `RawFiles`
- Evidence: Query 'RawFiles' (staging off) uses Table.Combine on a non-folding path.
- Why it matters: Joins, group-by, pivot/unpivot, sort, distinct and buffering that do not fold to the source run in the single-node mashup engine. Staging lets the Lakehouse/Warehouse SQL engine do that work in parallel.
- Remediation:
  1. Right-click the first non-folding step > Extract previous, name the new query, and enable staging on it.
  1. Apply the heavy transformations in the second query (staging on the second query is optional).
  1. Re-check folding indicators: the first query should show green (folds to source).
  1. Sources that never fold (Excel, CSV, JSON, web, SharePoint) benefit most: land the raw data in query 1, then transform in staging compute; prefer Parquet/Delta over CSV/Excel as the landing format.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-020] Heavy transformations run in the mashup engine without staging

- Severity: **high** | Confidence: medium | Category: Performance | Effort: medium | Impact: speed, capacity
- Query: `FilesToWarehouse`
- Evidence: Query 'FilesToWarehouse' (staging off) uses Table.Group on a non-folding path.
- Why it matters: Joins, group-by, pivot/unpivot, sort, distinct and buffering that do not fold to the source run in the single-node mashup engine. Staging lets the Lakehouse/Warehouse SQL engine do that work in parallel.
- Remediation:
  1. Right-click the first non-folding step > Extract previous, name the new query, and enable staging on it.
  1. Apply the heavy transformations in the second query (staging on the second query is optional).
  1. Re-check folding indicators: the first query should show green (folds to source).
  1. Sources that never fold (Excel, CSV, JSON, web, SharePoint) benefit most: land the raw data in query 1, then transform in staging compute; prefer Parquet/Delta over CSV/Excel as the landing format.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-020] Heavy transformations run in the mashup engine without staging

- Severity: **high** | Confidence: medium | Category: Performance | Effort: medium | Impact: speed, capacity
- Query: `Orphan`
- Evidence: Query 'Orphan' (staging off) uses Table.Sort on a non-folding path.
- Why it matters: Joins, group-by, pivot/unpivot, sort, distinct and buffering that do not fold to the source run in the single-node mashup engine. Staging lets the Lakehouse/Warehouse SQL engine do that work in parallel.
- Remediation:
  1. Right-click the first non-folding step > Extract previous, name the new query, and enable staging on it.
  1. Apply the heavy transformations in the second query (staging on the second query is optional).
  1. Re-check folding indicators: the first query should show green (folds to source).
  1. Sources that never fold (Excel, CSV, JSON, web, SharePoint) benefit most: land the raw data in query 1, then transform in staging compute; prefer Parquet/Delta over CSV/Excel as the landing format.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-036] Row-by-row calls to external sources (N+1 pattern)

- Severity: **high** | Confidence: medium | Category: Performance | Effort: medium | Impact: speed, capacity, reliability
- Query: `FactSales`
- Evidence: 'FactSales' calls Web.Contents inside a row-level function.
- Why it matters: Calling a connector or web endpoint inside a per-row function (Table.AddColumn each ...) executes one request per row, multiplying latency and billable mashup time.
- Remediation:
  1. Replace per-row calls with a single set-based call and join/merge the result.
  1. For REST APIs, paginate with List.Generate once, or move ingestion to a pipeline Copy activity / Spark notebook.
  1. Stage the lookup table and merge instead of invoking a function per row.
- Reference: https://learn.microsoft.com/en-us/power-query/best-practices

#### [ARCH-003] Event/streaming source is a better fit for Eventstream

- Severity: **medium** | Confidence: high | Category: Architecture | Effort: high | Impact: speed, capacity
- Evidence: Query 'Telemetry' reads an event/streaming source (EventHubs.Contents) through a scheduled dataflow.
- Why it matters: Eventstream ingests events as they occur without polling schedules.
- Remediation:
  1. Create an Eventstream with the same source and route to Eventhouse or Lakehouse.
  1. Keep a Dataflow Gen2 / Spark job only for downstream business transformations, reading the landed table.
  1. Retire the scheduled dataflow once parity is validated.
- Reference: https://learn.microsoft.com/en-us/fabric/fundamentals/decision-guide-pipeline-dataflow-spark

#### [DFG-023] Warehouse destination without staging

- Severity: **medium** | Confidence: high | Category: Reliability | Effort: low | Impact: reliability
- Query: `FilesToWarehouse`
- Evidence: Query 'FilesToWarehouse' writes to a Warehouse with staging disabled.
- Why it matters: Loading to a Fabric Warehouse requires staging to be enabled on the query.
- Remediation:
  1. Enable staging on queries that load to a Warehouse destination.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-data-destinations-and-managed-settings

#### [DFG-026] Consumes data through the Dataflow connector

- Severity: **medium** | Confidence: high | Category: Architecture | Effort: medium | Impact: speed, capacity
- Query: `DimCustomer`
- Evidence: Query 'DimCustomer' reads through PowerPlatform.Dataflows.
- Why it matters: Using PowerPlatform.Dataflows as a source chains dataflows via the slower connector instead of destinations.
- Remediation:
  1. Give the upstream dataflow a Lakehouse/Warehouse destination and read that table (Lakehouse.Contents / SQL endpoint).
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-035] Table.Buffer / List.Buffer used

- Severity: **medium** | Confidence: high | Category: Performance | Effort: low | Impact: speed, reliability
- Query: `FactSales`
- Evidence: Query 'FactSales' uses Table.Buffer.
- Why it matters: Buffering materialises the table in memory, breaks query folding and can cause out-of-memory failures on large data.
- Remediation:
  1. Remove the buffer unless profiling shows a benefit.
  1. Stage the data instead; the staging SQL engine handles large intermediate results.
- Reference: https://learn.microsoft.com/en-us/power-query/best-practices

#### [ARCH-004] Split into Copy job ingestion + Dataflow Gen2 transformation

- Severity: **medium** | Confidence: medium | Category: Architecture | Effort: high | Impact: speed, capacity
- Evidence: Movement and heavy transformation are mixed in the same dataflow: RawFiles, FilesToWarehouse.
- Why it matters: Mixing raw movement and transformation in one dataflow forfeits Fast Copy / Copy job throughput and burns Standard Compute on movement.
- Remediation:
  1. Stage 1: ingestion-only query (or Copy job) -> Lakehouse.
  1. Stage 2: referencing query/dataflow/notebook applies Group/Join/Sort logic.
  1. Wire both in a pipeline so stage 2 starts only after stage 1 succeeds.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-005] File-combine queries could use Partitioned Compute

- Severity: **medium** | Confidence: medium | Category: Performance | Effort: medium | Impact: speed
- Query: `RawFiles`
- Evidence: Query 'RawFiles' combines files from AzureStorage.DataLake without partitioned compute.
- Why it matters: Partitioned compute evaluates each file partition in parallel, cutting wall-clock time on large multi-file loads (ADLS Gen2, Blob, Folder). Recommended over Fast Copy when the source cannot fold your transformations.
- Remediation:
  1. Options > Scale > 'Allow use of partitioned compute' and Privacy > 'Allow combining data from multiple sources'.
  1. Re-run the Combine files experience so a Table.ReplacePartitionKey step is generated; keep the partition column in the query.
  1. Stage the query and load directly to staging or a Fabric Warehouse for best results (Preview; each partition is billed for its own duration, so CU can be similar or higher while wall-clock drops).
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-partitioned-compute

#### [DFG-011] Fast Copy source loads directly to a non-Lakehouse destination

- Severity: **medium** | Confidence: medium | Category: Performance | Effort: low | Impact: speed
- Query: `FilesToWarehouse`
- Evidence: Query 'FilesToWarehouse' (Fast Copy connector) writes straight to warehouse without staging.
- Why it matters: Fast Copy can only write directly to a Lakehouse. For any other destination the query must be staged and a second query that references it must hold the destination.
- Remediation:
  1. Stage the ingestion query (no destination).
  1. Create a referencing query that carries the Warehouse / SQL / KQL destination.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflows-gen2-fast-copy

#### [DFG-025] Staged output is only reachable through the Dataflow connector

- Severity: **medium** | Confidence: medium | Category: Architecture | Effort: medium | Impact: speed, capacity
- Query: `DimCustomer`
- Evidence: Query 'DimCustomer' is staged but has no destination and no referencing query.
- Why it matters: Consuming a dataflow through the Dataflow connector is slower and burns more capacity than reading a Lakehouse/Warehouse destination through the SQL analytics endpoint or Direct Lake.
- Remediation:
  1. Add a Lakehouse or Warehouse data destination to the query.
  1. Point reports/pipelines at the destination table instead of the Dataflow connector.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-025] Staged output is only reachable through the Dataflow connector

- Severity: **medium** | Confidence: medium | Category: Architecture | Effort: medium | Impact: speed, capacity
- Query: `Telemetry`
- Evidence: Query 'Telemetry' is staged but has no destination and no referencing query.
- Why it matters: Consuming a dataflow through the Dataflow connector is slower and burns more capacity than reading a Lakehouse/Warehouse destination through the SQL analytics endpoint or Direct Lake.
- Remediation:
  1. Add a Lakehouse or Warehouse data destination to the query.
  1. Point reports/pipelines at the destination table instead of the Dataflow connector.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-040] Design-time row limit left in the query

- Severity: **medium** | Confidence: medium | Category: Reliability | Effort: low | Impact: reliability
- Query: `FilesToWarehouse`
- Evidence: Step 'Top' limits rows with a literal (Table.FirstN(Grouped, 1000)).
- Why it matters: Hard-coded Table.FirstN/Table.Range limits used to keep previews small silently truncate production loads.
- Remediation:
  1. Replace hard-coded limits with a parameter (for example DesignDateFilter) whose value is widened for production runs.
  1. Use Schema view to design without loading data.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-060] Full reload (Replace) of a source table on every refresh

- Severity: **medium** | Confidence: medium | Category: Capacity | Effort: medium | Impact: speed, capacity
- Query: `FactSales`
- Evidence: Query 'FactSales' reloads fully into lakehouse and references date/time columns.
- Why it matters: Re-reading and rewriting an unchanged history every run wastes ingestion time and CU. Incremental refresh processes only new/changed buckets.
- Remediation:
  1. Right-click the query > Incremental refresh; pick a Date/DateTime column, bucket size and window; make sure the query fully folds.
  1. Use a fixed-schema Lakehouse/Warehouse/Azure SQL destination with update method Replace.
  1. If the source cannot fold, use the incremental amassing pattern (tutorial) or a Copy job with watermark/CDC.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-incremental-refresh

#### [DFG-032] Rows are filtered late in the query

- Severity: **medium** | Confidence: low | Category: Performance | Effort: low | Impact: speed, capacity
- Query: `FactSales`
- Evidence: First filter is step 10 but a heavier step occurs at step 6 ('Buffered').
- Why it matters: Best practice is to filter early and often so less data flows through every downstream step.
- Remediation:
  1. Move Table.SelectRows (date/ID filters) directly after the source navigation.
  1. Combine with a Date-parameter filter to also keep design-time previews small.
- Reference: https://learn.microsoft.com/en-us/power-query/best-practices

#### [DFG-032] Rows are filtered late in the query

- Severity: **medium** | Confidence: low | Category: Performance | Effort: low | Impact: speed, capacity
- Query: `FilesToWarehouse`
- Evidence: First filter is step 4 but a heavier step occurs at step 3 ('Grouped').
- Why it matters: Best practice is to filter early and often so less data flows through every downstream step.
- Remediation:
  1. Move Table.SelectRows (date/ID filters) directly after the source navigation.
  1. Combine with a Date-parameter filter to also keep design-time previews small.
- Reference: https://learn.microsoft.com/en-us/power-query/best-practices

#### [DFG-037] Repetitive type/rename/add-column steps

- Severity: **low** | Confidence: high | Category: Maintainability | Effort: low | Impact: speed
- Query: `FactSales`
- Evidence: Query 'FactSales' has 3 separate Table.TransformColumnTypes steps.
- Why it matters: Many repeated Table.TransformColumnTypes / RenameColumns steps add evaluation overhead and bloat the script.
- Remediation:
  1. Merge consecutive type changes into one Table.TransformColumnTypes call and renames into one Table.RenameColumns.
- Reference: https://learn.microsoft.com/en-us/power-query/best-practices

#### [DFG-062] Dynamic schema destination

- Severity: **low** | Confidence: high | Category: Reliability | Effort: low | Impact: reliability
- Query: `FactSales`
- Evidence: Query 'FactSales' uses DynamicSchema = true.
- Why it matters: Incremental refresh requires a fixed schema, and dynamic schema lets upstream column drift silently change destination tables.
- Remediation:
  1. Switch the destination mapping to fixed schema (manual mapping) where schema is stable.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-incremental-refresh

#### [DFG-067] Unused query

- Severity: **low** | Confidence: high | Category: Maintainability | Effort: low | Impact: -
- Query: `RawFiles`
- Evidence: Query 'RawFiles' is not loaded, has no destination and is not referenced.
- Why it matters: Queries that are not loaded, not staged and not referenced add clutter and validation time and confuse ownership.
- Remediation:
  1. Delete the query or document why it is kept.
- Reference: https://learn.microsoft.com/en-us/power-query/best-practices

#### [DFG-067] Unused query

- Severity: **low** | Confidence: high | Category: Maintainability | Effort: low | Impact: -
- Query: `Orphan`
- Evidence: Query 'Orphan' is not loaded, has no destination and is not referenced.
- Why it matters: Queries that are not loaded, not staged and not referenced add clutter and validation time and confuse ownership.
- Remediation:
  1. Delete the query or document why it is kept.
- Reference: https://learn.microsoft.com/en-us/power-query/best-practices

#### [DFG-004] V-Order is applied to the staging Lakehouse

- Severity: **low** | Confidence: medium | Category: Performance | Effort: low | Impact: speed, capacity
- Evidence: enableVorder is not set (default on) and staging is in use.
- Why it matters: The staging Lakehouse is read only by Dataflow Gen2 itself. V-Order adds write-time CPU and lengthens refreshes; it only pays off when staged output is read many times through the Dataflow connector.
- Remediation:
  1. Options > Scale > Staged Data > turn off 'Enable V-Order compression' (enableVorder = false) for most dataflows.
  1. Keep V-Order for the Lakehouse destination itself when Direct Lake / SQL endpoint / Spark read it (destination-level option).
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-staged-data-options

#### [DFG-007] Low maxConcurrency with many independent queries

- Severity: **low** | Confidence: medium | Category: Performance | Effort: low | Impact: speed
- Evidence: maxConcurrency = 1 with 6 independent queries.
- Why it matters: A concurrency of 1 evaluates queries one after another, stretching refresh time for independent queries.
- Remediation:
  1. Raise 'Maximum concurrent evaluations' (Options > Scale; computeEngineSettings.maxConcurrency) gradually while watching source throttling.
  1. Incremental refresh to a Lakehouse supports at most 10 concurrent bucket evaluations.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-002] Modern Evaluator is not enabled

- Severity: **low** | Confidence: low | Category: Performance | Effort: low | Impact: speed, capacity
- Evidence: allowModernEvaluationEngine is not set in the definition (enabled by default only for newly created CI/CD items; older items may still use the standard engine). Verify under Options > Scale.
- Why it matters: The Modern query evaluation engine (.NET 8) runs mashup transformations substantially faster and more efficiently, especially for non-folding connectors, filters, derived columns and cleansing at volume.
- Remediation:
  1. Dataflow editor > Home > Options > Scale > turn on 'Modern query evaluation engine', then save and run.
  1. Definition setting: computeEngineSettings.allowModernEvaluationEngine = true.
  1. Note: Db2, Informix and MQ connectors still route to the standard engine.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-modern-evaluator

#### [DFG-041] No parameter limits design-time data previews

- Severity: **low** | Confidence: low | Category: Maintainability | Effort: low | Impact: speed
- Evidence: 4 source query(ies) and no parameter query in the dataflow.
- Why it matters: Large previews slow authoring. A parameter-driven date or ID filter (or Schema view) keeps the editor responsive.
- Remediation:
  1. Manage parameters > add e.g. DesignDateFilter (DateTime) and filter large tables by it.
  1. Switch to Schema view when only the structure is needed.
  1. Widen the parameter value before running in production.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices

#### [DFG-061] Append destination without a visible incremental/dedup pattern

- Severity: **low** | Confidence: low | Category: Reliability | Effort: medium | Impact: capacity, reliability
- Query: `FilesToWarehouse`
- Evidence: Query 'FilesToWarehouse' appends without reading back the destination to bound the filter.
- Why it matters: Appending each refresh without a filter on already-loaded data duplicates rows and grows tables unbounded, hurting both capacity and downstream performance.
- Remediation:
  1. Use native incremental refresh (Replace per bucket) instead of Append.
  1. If you must append, filter the source to rows newer than the max timestamp already in the destination, and deduplicate downstream.
- Reference: https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-incremental-refresh

#### [ARCH-002] Transformation workload is a better fit for Spark

- Severity: **info** | Confidence: low | Category: Architecture | Effort: high | Impact: speed, capacity
- Query: `FactSales, RawFiles, FilesToWarehouse, Orphan`
- Evidence: Signals: 7 heavy operations (Table.AddIndexColumn, Table.Buffer, Table.Combine, Table.Group, Table.Sort).
- Why it matters: Spark scales out heavy transformation, custom logic and large joins that run on a single mashup engine in Dataflow Gen2.
- Remediation:
  1. Land sources with Copy job / Fast Copy into Lakehouse Delta tables (bronze).
  1. Re-implement the heavy queries in a notebook (Spark SQL/PySpark), writing silver/gold Delta tables.
  1. Keep Dataflow Gen2 for light business-user shaping of the gold tables if needed.
  1. Orchestrate with a Data Pipeline; use incremental MERGE for fact tables; validate row counts against the dataflow output.
- Reference: https://learn.microsoft.com/en-us/fabric/fundamentals/decision-guide-pipeline-dataflow-spark

### Alternative engines (decision guide)

#### Eventstream - recommended (confidence high)

**Why**

- Query 'Telemetry' reads an event/streaming source (EventHubs.Contents) through a scheduled dataflow.
- Decision guide: Eventstream = event data ingestion/transformation, medium to high volume, no extraction schedule.

**Benefits**

- Events land as they occur instead of per-refresh polling.
- Avoids Standard Compute billing on every poll.

**Trade-offs**

- Only lightweight transformation; complex shaping stays in Spark/Dataflow downstream.

**How to try it**

- Create an Eventstream with the same source and route to Eventhouse or Lakehouse.
- Keep a Dataflow Gen2 / Spark job only for downstream business transformations, reading the landed table.
- Retire the scheduled dataflow once parity is validated.

#### Spark (notebook / Spark job definition) - consider (confidence low)

**Why**

- Signals: 7 heavy operations (Table.AddIndexColumn, Table.Buffer, Table.Combine, Table.Group, Table.Sort).
- Decision guide: Spark = data ingestion, transformation, processing, profiling with native Spark and open-source libraries; low to high complexity and volume.

**Benefits**

- Distributed execution for large joins/aggregations that otherwise run in one mashup engine.
- Direct Delta writes, partition pruning, OPTIMIZE/V-Order and MERGE for upserts.
- Better fit for custom logic, window functions and API pagination.

**Trade-offs**

- Requires Spark (PySpark/Spark SQL) skills and code review/CI practices.
- Session start-up and Spark CU consumption: validate with the Capacity Metrics app; short, light jobs can cost more than Dataflow.
- For SQL-shaped logic already in OneLake, a Warehouse T-SQL procedure or Materialized Lake Views may be simpler than Spark (outside the decision-guide table; evaluate).

**How to try it**

- Land sources with Copy job / Fast Copy into Lakehouse Delta tables (bronze).
- Re-implement the heavy queries in a notebook (Spark SQL/PySpark), writing silver/gold Delta tables.
- Keep Dataflow Gen2 for light business-user shaping of the gold tables if needed.
- Orchestrate with a Data Pipeline; use incremental MERGE for fact tables; validate row counts against the dataflow output.

#### Hybrid: Copy job (ingest) + Dataflow Gen2 or Spark (transform) - recommended (confidence medium)

**Why**

- Movement and heavy transformation are mixed in the same dataflow: RawFiles, FilesToWarehouse.
- Best-practice consideration 1/2/7: separate the Fast Copy / movement step from transformation.

**Benefits**

- Fast Copy / Copy job throughput for the movement step.
- Transformation runs on staging SQL compute or Spark instead of the gateway/mashup engine.

**Trade-offs**

- Two items to schedule; orchestrate with a Data Pipeline.

**How to try it**

- Stage 1: ingestion-only query (or Copy job) -> Lakehouse.
- Stage 2: referencing query/dataflow/notebook applies Group/Join/Sort logic.
- Wire both in a pipeline so stage 2 starts only after stage 1 succeeds.


---

## GoodSales  (score 100, grade A)

Format: cicd; queries: 2

### Findings

No findings.
### Alternative engines (decision guide)

#### Dataflow Gen2 (keep and optimize) - keep (confidence medium)

**Why**

- No signal strong enough to justify a different engine; Dataflow Gen2 fits low-to-medium volume, Power Query skills and multi-destination shaping (decision guide scenario 2).
- Apply the findings above (staging, Fast Copy, Modern Evaluator, incremental refresh) before reconsidering.

**Benefits**

- No migration cost.
- 300+ transformations in a low-code UI.

**Trade-offs**

- Revisit if volume grows or refresh time exceeds your SLA.

**How to try it**

- Re-run this advisor after remediation and compare the score and refresh telemetry.


---

## Coverage of the Microsoft guidance

| Section | Source | Status | Rules |
|---|---|---|---|
| [Key areas: data movement](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Automated + manual | DFG-007 |
| [Key areas: data transformation (query folding, filter early, avoid unnecessary transformations)](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Automated + manual | DFG-030, DFG-031, DFG-032, DFG-033, DFG-035, DFG-036, DFG-037, DFG-039, DFG-067 |
| [Key areas: staging data and warehouse compute](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Automated + manual | DFG-021, DFG-024 |
| [Consideration 1: Fast Copy for data movement](https://learn.microsoft.com/en-us/fabric/data-factory/dataflows-gen2-fast-copy) | Performance best practices | Automated + manual | DFG-001, DFG-010 |
| [Consideration 2: staging + splitting queries for complex transformations](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Automated + manual | DFG-020, DFG-022, DFG-038, DFG-069 |
| [Consideration 3: staging-to-Lakehouse movement / Optimized copy](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-staged-data-options) | Performance best practices | Automated | DFG-003 |
| [Consideration 4: large data previews at design time](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Automated + manual | DFG-040, DFG-041 |
| [Consideration 5: Gen2 vs Gen1 runtime characteristics (Delta Parquet vs CSV)](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Manual / informational | - |
| [Consideration 6: incremental refresh for large transactional data](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-incremental-refresh) | Performance best practices | Automated + manual | DFG-060, DFG-061, DFG-062 |
| [Consideration 7: on-premises gateway](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Automated + manual | DFG-050 |
| [Consideration 8: consume through destinations, not the Dataflow connector](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Performance best practices | Automated | DFG-025, DFG-026 |
| [Consideration 9: Modern Evaluator](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-modern-evaluator) | Performance best practices | Automated | DFG-002 |
| [Fast Copy connectors, transformation limits and Lakehouse-only destination](https://learn.microsoft.com/en-us/fabric/data-factory/dataflows-gen2-fast-copy) | Fast Copy | Automated | DFG-011 |
| [V-Order for staging and destination Lakehouse](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-staged-data-options) | Staged data options | Automated + manual | DFG-004 |
| [Parallel evaluation of file partitions](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-partitioned-compute) | Partitioned compute (Preview) | Automated | DFG-005, DFG-006 |
| [Prerequisites and limitations (fixed schema, Replace, destinations, buckets)](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-incremental-refresh) | Incremental refresh | Automated + manual | DFG-063 |
| [Destination settings, staging requirements, maintenance](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-data-destinations-and-managed-settings) | Data destinations | Automated + manual | DFG-023 |
| [CU meters: Standard Compute, High Scale, Fast Copy; CI/CD vs legacy](https://learn.microsoft.com/en-us/fabric/data-factory/pricing-dataflows-gen2) | Dataflow Gen2 pricing and benchmarks | Automated + manual | DFG-008 |
| [Refresh history: failures, duration, schedule frequency, staleness](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) | Operations | Automated + manual | DFG-000, DFG-090, DFG-091, DFG-092, DFG-093, DFG-094, DFG-095 |
| [Copy activity / Copy job / Dataflow Gen2 / Eventstream / Spark selection](https://learn.microsoft.com/en-us/fabric/fundamentals/decision-guide-pipeline-dataflow-spark) | Decision guide | Automated + manual | ARCH-001, ARCH-002, ARCH-003, ARCH-004 |

### Decision-guide items

| Item | Handled by |
|---|---|
| Use case / transformation complexity | advisor: heavy ops, fold breakers, row-level calls |
| Data volume (low to high) | advisor: refresh duration (p50) as a proxy; supply real volumes in the review |
| Sources (50+ vs 150+ vs Spark libraries) | advisor: copy-supported connector families only trigger Copy job advice |
| Destinations (40+ vs Lakehouse/SQL/ADX) | advisor + DFG-011/DFG-023 destination checks |
| Persona / skill set / code vs low-code | manual (listed in the report checklist) |
| Scenario 1: bronze ingestion at scale -> pipeline Copy activity | ARCH-001 |
| Scenario 2: low/medium-volume cleansing, multi-destination -> Dataflow Gen2 | 'Keep and optimize' recommendation |
| Scenario 3: event data -> Eventstream | ARCH-003 |
| Scenario 4: large-scale analytics/ML-style processing -> Spark | ARCH-002 |
| Scenario 5: CDC / incremental replication -> Copy job | ARCH-001 (incremental copy rationale) |

### Manual verification checklist (cannot be inferred from the definition)

- [ ] Key areas: data movement: Confirm network path/region between source, gateway and Fabric capacity.
- [ ] Key areas: data movement: Check the Engine column in refresh history to see whether Fast Copy was actually used.
- [ ] Key areas: data transformation (query folding, filter early, avoid unnecessary transformations): Confirm folding with the Applied steps indicators and 'View data source query' (static analysis can only approximate folding).
- [ ] Key areas: staging data and warehouse compute: Compare run time/CU with staging on vs off for fully folding queries.
- [ ] Consideration 1: Fast Copy for data movement: Decide whether to set 'Require Fast Copy' per query (fails the refresh if Fast Copy cannot be used - good for debugging).
- [ ] Consideration 1: Fast Copy for data movement: Verify thresholds: files >= 100 MB (CSV/Parquet on ADLS/Blob) or >= 5 million rows for databases.
- [ ] Consideration 2: staging + splitting queries for complex transformations: Use 'Extract previous' on the first non-folding step in the editor.
- [ ] Consideration 4: large data previews at design time: Use Schema view while authoring large tables.
- [ ] Consideration 5: Gen2 vs Gen1 runtime characteristics (Delta Parquet vs CSV): Informational: expect longer ETL than Gen1 CSV output but faster downstream (Direct Lake, SQL endpoint). Judge on end-to-end time and CU.
- [ ] Consideration 6: incremental refresh for large transactional data: Confirm a Date/DateTime column suitable for bucketing and a fully folding query.
- [ ] Consideration 6: incremental refresh for large transactional data: Review bucket counts (<= 50 per query, <= 150 per dataflow) and Lakehouse concurrency (max 10).
- [ ] Consideration 7: on-premises gateway: Check gateway version (>= 3000.270 for incremental refresh to Lakehouse) and host CPU/memory.
- [ ] V-Order for staging and destination Lakehouse: Review the destination-level 'Enable use of V-Order compression' option per Lakehouse destination (depends on how the table is read).
- [ ] Prerequisites and limitations (fixed schema, Replace, destinations, buckets): Avoid other writers or OPTIMIZE/REORG on Lakehouse tables that use incremental refresh.
- [ ] Destination settings, staging requirements, maintenance: Schedule Lakehouse table maintenance: VACUUM (and OPTIMIZE where incremental refresh is not used).
- [ ] CU meters: Standard Compute, High Scale, Fast Copy; CI/CD vs legacy: Validate real CU in the Fabric Capacity Metrics app (the cost model here is indicative).
- [ ] Refresh history: failures, duration, schedule frequency, staleness: Stagger schedules so many dataflows do not start at the same minute.
- [ ] Copy activity / Copy job / Dataflow Gen2 / Eventstream / Spark selection: Confirm team skill set (M vs Spark vs low-code pipelines) and governance requirements.

### Dataflow Gen2 CU rate card

- Standard Compute (CI/CD): 12 CU/s for the first 10 minutes of each query, then 1.5 CU/s
- Standard Compute (non CI/CD): 16 CU/s
- High Scale (staging) compute: 6 CU/s
- Fast Copy: 1.5 CU/s of aggregate core time
