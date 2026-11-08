---
name: power-bi-directquery-best-practices
description: "Audit Power BI and Microsoft Fabric DirectQuery semantic models for modeling, relationship, aggregation, query-reduction, concurrency, and advanced performance practices. Use when reviewing a DirectQuery model, troubleshooting source-query pressure or capacity-unit usage, running the DirectQuery best-practices notebook or Tabular Editor 2 script, or preparing evidence-based remediation guidance."
argument-hint: "<workspace and semantic model, or open TE2 model>"
user-invocable: true
disable-model-invocation: false
---

# Power BI DirectQuery Best-Practices Audit

Assess a Power BI or Microsoft Fabric semantic model that uses DirectQuery and produce an evidence-based report of configuration, modeling, and performance opportunities.

This skill diagnoses and recommends. Do not modify the model, report, data source, gateway, or capacity settings unless the user separately approves an authoring workflow.

## Inputs

Collect or confirm:

- The semantic model name.
- The Fabric or Power BI workspace name or ID when using the notebook.
- The capacity SKU for concurrency guidance. Do not silently assume the notebook's default `F64` value is correct.
- The available execution environment:
  - Microsoft Fabric notebook with Semantic Link.
  - Tabular Editor 2 with the model open.
- Optional workload evidence: Performance Analyzer export, Execution Metrics, server timings, source query plans, concurrency telemetry, and representative report scenarios.

Do not request credentials, access tokens, connection strings, or gateway secrets in chat.

## Preferred Local Engines

Use the highest available option:

1. **Fabric notebook:** run [DirectQuery_BestPractices_Check.ipynb](../../../Notebooks/SemanticModel-Optimization/DirectQuery_BestPractices_Check.ipynb) when Semantic Link and workspace access are available. Set `WORKSPACE`, `DATASET`, and `TARGET_SKU` before execution.
2. **Tabular Editor 2:** run [DirectQuery_BestPractices_Check_TabularEditor2.cs](../../../Notebooks/SemanticModel-Optimization/DirectQuery_BestPractices_Check_TabularEditor2.cs) from the Advanced Scripting tab when the model is open in TE2.
3. **Manual audit:** follow this skill directly when neither engine can run. Clearly label every unverified item `MANUAL`.

Run diagnostic code only after confirming the target model and SKU. Preserve the source notebook and script.

## Source Authority

When evidence conflicts, use this order:

1. Observed model metadata and measured workload evidence.
2. Current Microsoft Learn and official API documentation.
3. The canonical notebook and TE2 script in this repository.
4. The supplementary performance articles under References.

Treat supplementary examples as hypotheses to test, not guarantees for every model.

## Status Meanings

- `FAIL`: a directly observed high-confidence configuration or modeling defect.
- `WARN`: an observed condition that commonly warrants remediation but needs model context.
- `MANUAL`: the engine cannot determine the result or workload testing is required.
- `INFO`: context or an optional technique, not a failed practice.
- `PASS`: the inspected metadata satisfies the check.

Do not convert optional advanced techniques into universal failures.

## Workflow

### 1. Confirm DirectQuery Scope

1. Inventory tables, partitions, storage modes, relationships, columns, and data sources.
2. Confirm that at least one partition uses DirectQuery.
3. Identify composite or hybrid models rather than assuming the entire model has one storage mode.
4. Record any metadata that could not be read because of engine, permission, or wrapper limitations.

If the model does not use DirectQuery, report that the DirectQuery-specific checks are not applicable rather than issuing failures.

### 2. Evaluate Model Shape

#### Star Schema

- Classify fact-like tables from relationship many-sides and dimensions from one-sides.
- Flag dimension-to-dimension snowflaking for review.
- Flag disconnected tables only when they are not intentional utility, parameter, calculation, or measure tables.
- Prefer a clear star schema with one-to-many, single-direction relationships.

#### Power Query Transformations

- Inspect M expressions on DirectQuery partitions.
- Flag non-trivial transformations on large fact tables, especially filtering, joins, grouping, pivoting, type conversion, custom columns, buffering, and expansion.
- Recommend implementing complex logic in a source view when that improves folding, governance, and source optimization.
- Do not claim that every M step breaks folding; verify native query folding when tooling is available.

### 3. Evaluate Tables And Relationships

#### Dual Dimensions

- For DirectQuery models, identify dimension tables that are not in Dual mode.
- Recommend Dual only where cached dimension behavior is compatible with freshness, security, and source semantics.

#### Assume Referential Integrity

- Check `RelyOnReferentialIntegrity` on eligible DirectQuery relationships.
- Recommend enabling it only when the source data truly guarantees matching keys and the relationship meets product requirements.
- Explain that incorrect assumptions can change query semantics by enabling inner joins.

#### Integer Relationship Keys

- Check both columns in each relationship.
- Prefer integer surrogate keys over text or GUID join keys for source joins and model efficiency.
- Confirm matching data types on both sides.

### 4. Evaluate Aggregation Strategy

- Prefer targeted **User-Defined Aggregations** based on known report workloads and commonly grouped dimensions.
- Do not recommend Auto Aggregations as a default requirement.
- If Auto Aggregations are disabled, classify that as acceptable, not a warning.
- If Auto Aggregations are enabled, report them as informational and require measured query benefit versus capacity-unit consumption before recommending retention.
- Do not infer the Auto Aggregations setting from query scale-out properties; they are separate features.
- When a DirectQuery source uses SSO, explain that Auto Aggregations do not cover those tables. Recommend a security-compatible design and evaluate User-Defined Aggregations rather than suggesting that SSO be disabled solely for performance.
- Treat SSO detection as `MANUAL` when gateway or connection metadata cannot be read.

### 5. Evaluate Advanced Optimizations

#### Calendar-Based Time Intelligence

Recommend an experiment for YTD, prior-period, and similar calculations when DirectQuery time intelligence is expensive.

Compare before and after using:

- End-to-end duration.
- DirectQuery request count.
- Rows returned by source queries.
- DirectQuery iteration time.
- Formula and storage engine CPU.
- Peak memory consumption.
- Connection throttling or queueing.

Calendar-based time intelligence can reduce source rows, CPU, memory, and duration by operating at a coarser useful grain, but it can also generate more SQL requests. Do not declare it faster without a controlled benchmark.

#### Visual Calculations

- Consider Visual Calculations for visual-local running totals, moving averages, percent-of-parent, and period comparisons.
- They operate over aggregated visual data and can reduce model/source work compared with some equivalent measures.
- They are report-level objects and cannot be confirmed by a model-only audit.
- Check current feature and export limitations before recommending broad replacement of reusable semantic-model measures.

#### Hybrid Tables And Data Coverage

- Detect tables containing both Import and DirectQuery partitions.
- Recommend Hybrid Tables only for a justified hot/cold data pattern, such as stable history plus frequently changing recent data.
- For each DirectQuery partition, verify an accurate `dataCoverageDefinition` so queries covered by Import partitions can avoid unnecessary source requests.
- Treat data coverage verification as manual when the engine cannot expose the property.

#### Discourage Implicit Measures

- Inspect `Model.DiscourageImplicitMeasures` when available.
- Prefer explicit measures and consider setting the property to `true`.
- The property can suppress some implicit aggregation behavior and may reduce filter-pane count queries, but current behavior must be tested with the target report-authoring experience.
- Report an unavailable property as `MANUAL`, not `FAIL`.

### 6. Evaluate Query Reduction And Concurrency

- Recommend Apply buttons for slicers or filters when users make several selections before querying.
- Inspect `Model.MaxParallelismPerQuery` when available and compare it with the actual SKU and source capacity.
- Inspect data-source `MaxConnections` when available.
- Distinguish model-level connection settings from capacity-level DirectQuery concurrency limits.
- Higher parallelism is not automatically better. Consider source limits, page visual count, concurrent users, gateway capacity, throttling, and query duration.
- Never present the notebook SKU table as a substitute for current official limits or workload testing.

### 7. Validate Findings With Workload Evidence

For material performance recommendations:

1. Capture a repeatable report interaction or DAX query.
2. Record a cold-cache and representative warm-cache baseline where appropriate.
3. Change one variable at a time.
4. Compare query count, source rows, duration, CPU, memory, and concurrency pressure.
5. Confirm semantic equivalence and security behavior.
6. Retain a change only when measured benefits justify operational cost and complexity.

If DAX is the bottleneck, hand off to the semantic-model-authoring DAX performance workflow for trace-based optimization. Do not rewrite generated visual DAX as though it were necessarily the underlying measure definition.

## Reporting Contract

Present findings grouped by severity, with failures and warnings first. For each finding include:

- Check name.
- Status.
- Observed evidence.
- Why it matters for DirectQuery.
- Recommended action.
- Validation needed after remediation.
- Relevant reference link.

Separate automated findings from manual checks. State all engine limitations, inaccessible metadata, and untested workload assumptions.

End with a prioritized action list:

1. Correctness and security risks.
2. Source-query and modeling improvements.
3. Aggregation and time-intelligence experiments.
4. Concurrency and capacity tuning.
5. Optional advanced techniques.

## Remediation Boundaries

- Do not enable Assume Referential Integrity without proof from source data.
- Do not change storage modes without assessing freshness and security.
- Do not disable SSO merely to make an optimization available.
- Do not enable Auto Aggregations solely because they are absent.
- Do not raise parallelism or connection limits without source and capacity evidence.
- Do not apply Hybrid Tables, data coverage definitions, or calendar-based time intelligence without semantic and performance validation.
- Obtain user approval before making any model, report, gateway, source, or capacity change.

## References

### DirectQuery And Modeling

- [DirectQuery model guidance](https://learn.microsoft.com/power-bi/guidance/directquery-model-guidance)
- [Use DirectQuery in Power BI Desktop](https://learn.microsoft.com/power-bi/connect-data/desktop-use-directquery)
- [Star schema guidance](https://learn.microsoft.com/power-bi/guidance/star-schema)
- [Storage modes](https://learn.microsoft.com/power-bi/transform-model/desktop-storage-mode)
- [Assume referential integrity](https://learn.microsoft.com/power-bi/connect-data/desktop-assume-referential-integrity)
- [Relationship column data types](https://learn.microsoft.com/power-bi/transform-model/desktop-relationships-understand#data-types-of-columns)

### Aggregations And SSO

- [User-defined aggregations](https://learn.microsoft.com/power-bi/transform-model/aggregations-advanced)
- [Automatic aggregations](https://learn.microsoft.com/fabric/enterprise/powerbi/aggregations-auto)
- [Configure automatic aggregations](https://learn.microsoft.com/power-bi/enterprise/aggregations-auto-configure)
- [Gateway single sign-on overview](https://learn.microsoft.com/power-bi/connect-data/service-gateway-sso-overview)
- [Power BI service SSO considerations](https://learn.microsoft.com/power-bi/connect-data/service-get-data#considerations-and-limitations)

### Advanced DirectQuery Optimization

- [Calendar-based time intelligence and DirectQuery performance](https://blog.crossjoin.co.uk/2025/11/30/a-look-at-the-impact-of-calendar-based-time-intelligence-on-power-bi-directquery-performance/)
- [Visual Calculations overview](https://learn.microsoft.com/power-bi/transform-model/desktop-visual-calculations-overview)
- [Hybrid Tables and `dataCoverageDefinition`](https://blog.crossjoin.co.uk/2024/02/25/datacoveragedefinition-a-new-optimisation-for-hybrid-tables-in-power-bi/)
- [Table partitions and data coverage definitions](https://learn.microsoft.com/analysis-services/tom/table-partitions)
- [Filter-pane aggregates and Discourage Implicit Measures](https://blog.crossjoin.co.uk/2023/04/16/disabling-filter-pane-aggregates-in-power-bi/)
- [`Model.DiscourageImplicitMeasures`](https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.model.discourageimplicitmeasures)

### Query Reduction And Parallelism

- [Query reduction settings](https://learn.microsoft.com/power-bi/create-reports/desktop-optimize-ribbon-scenarios#apply-query-reduction-settings)
- [Evaluation configuration settings](https://learn.microsoft.com/power-bi/create-reports/desktop-evaluation-configuration)
- [DirectQuery query parallelization](https://powerbi.microsoft.com/blog/query-parallelization-helps-to-boost-power-bi-dataset-performance-in-directquery-mode/)
- [`Model.MaxParallelismPerQuery`](https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.model.maxparallelismperquery)
