# Dataflow Gen2 Analyzer (Dataflow Gen2 Advisor)

**What it is:** a read-only, dependency-free Python tool that audits Microsoft Fabric **Dataflow Gen2** items against Microsoft's performance guidance and tells you exactly how to make them faster and cheaper in capacity units (CU). It also recommends when a different Fabric engine (Copy job, pipeline Copy activity, Spark, Eventstream) is a better fit.

**How to use it in 3 steps:** (1) `az login`, (2) `python -m dfg2_advisor scan --workspace "<name>"` (or `--path <exported folder>`), (3) open `reports\<timestamp>\dataflow_gen2_review.html`. Details below.

Checks Microsoft Fabric **Dataflow Gen2** items against the official guidance and tells you, per dataflow and per query, what to change to get **faster ingestion and lower capacity (CU) usage**. When a different engine would do the job better, it says so and explains how to try it.

Guidance it implements:

- [Best practices for getting the best performance with Dataflow Gen2](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices) (key areas + considerations 1-9)
- [Fabric decision guide: copy activity, dataflow, Eventstream or Spark](https://learn.microsoft.com/en-us/fabric/fundamentals/decision-guide-pipeline-dataflow-spark)
- Linked pages that those articles depend on: [Fast Copy](https://learn.microsoft.com/en-us/fabric/data-factory/dataflows-gen2-fast-copy), [staged data options](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-staged-data-options), [Modern Evaluator](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-modern-evaluator), [partitioned compute](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-partitioned-compute), [incremental refresh](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-incremental-refresh), [destinations](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-data-destinations-and-managed-settings), [pricing](https://learn.microsoft.com/en-us/fabric/data-factory/pricing-dataflows-gen2) and [benchmarks](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-cost-performance-benchmarks)

Pure Python 3.9+, **no third-party dependencies**.

## Quick start

```powershell
cd Analyzer

# 1. Try it on the bundled samples (no Fabric access needed)
python -m dfg2_advisor scan --path samples --out reports\demo

# 2. Scan live workspaces (uses `az login`, or set FABRIC_TOKEN)
az login
python -m dfg2_advisor scan --workspace "Sales Analytics" --workspace "Finance"
python -m dfg2_advisor scan --all-workspaces --dataflow Orders

# 3. Scan exported definitions (Git integration folders, getDefinition JSON, model.json, .pq)
python -m dfg2_advisor scan --path C:\repo\workspace --no-history

# Other
python -m dfg2_advisor rules                 # list every rule
python -m dfg2_advisor scan ... --fail-on high   # exit 1 for CI gates
python -m unittest discover -s tests         # run the tests
```

Reports are written to `reports\<timestamp>\` (override with `--out`): `dataflow_gen2_review.html` (filterable), `.md`, `.json`, `.csv`. A sample is in [samples/sample_report](samples/sample_report).

### What it reads

| Source | Used for |
|---|---|
| `getDefinition` (`mashup.pq`, `queryMetadata.json`) | queries, steps, connectors, staging (`loadEnabled`), destinations, engine settings (`allowFastCopy`, `allowModernEvaluationEngine`, `allowPartitionedCompute`, `enableVorder`, `enableOptimizedCopyToLakehouse`, `maxConcurrency`, `gatewayObjectId`, `fastCombine`) |
| Job instances API (last `--history-days`, default 30) | failure rate and failure classes, p50/p95 duration, trend, runs/day |
| Schedules API | schedule frequency, schedule collisions |
| Power BI dataflows API (`--include-legacy`) | non-CI/CD Gen2 / Gen1 definitions (`model.json`) |

Required access: Contributor (or higher) on the workspace for `getDefinition`. Nothing is modified; the tool is read-only.

## What you get per dataflow

1. **Score and grade** (A-F). Dataflows whose definition cannot be read (for example capacity paused) are reported as *not assessed*, never as a pass.
2. **Findings** with severity, confidence, category (Performance, Capacity, Reliability, Architecture, Maintainability), impact (speed / capacity / reliability), effort, evidence (query and step), why it matters, **numbered remediation steps**, a code/pattern snippet where useful and a link to the Microsoft page.
3. **Prioritised remediation plan** (quick wins first: low effort and highest severity).
4. **Alternative engines** from the decision guide: Copy job / pipeline Copy activity, Spark, Eventstream, a Copy job + Dataflow hybrid, or "keep Dataflow Gen2 and optimise", each with rationale, benefits, trade-offs and migration steps.
5. **Telemetry and indicative cost**: p50/p95 refresh time, failure classes, CU estimate per run and per month using the published rate card.
6. **Query inventory**: role, staged or not, sources, folding, Fast Copy eligibility, destinations.
7. **Coverage matrix** that maps every section of the two guides to rules, plus a **manual checklist** for what cannot be verified from a definition.

## Rule coverage (46 rules; `python -m dfg2_advisor rules`)

| Guidance | Rules |
|---|---|
| Key areas: data movement / transformation / staging | DFG-007, 021, 024, 030-033, 035-039, 067 |
| C1 Fast Copy (+ Fast Copy page: connectors, transformation limits, Lakehouse-only destination) | DFG-001, 010, 011 |
| C2 Staging and splitting queries (Extract previous) | DFG-020, 022, 038, 069 |
| C3 Optimized copy to Lakehouse; staged V-Order | DFG-003, 004 |
| C4 Design-time previews (parameters, schema view) | DFG-040, 041 |
| C5 Gen2 vs Gen1 runtime | informational, in the manual checklist |
| C6 Incremental refresh (+ limits page) | DFG-060, 061, 062, 063 |
| C7 Gateway | DFG-050 |
| C8 Consume through destinations, not the Dataflow connector | DFG-025, 026 |
| C9 Modern Evaluator | DFG-002 |
| Partitioned compute | DFG-005, 006 |
| Destinations / pricing (CI/CD vs legacy rates) | DFG-008, 023 |
| Operations (refresh history, schedules) | DFG-000, 090-095 |
| Decision guide (table + scenarios 1-5) | ARCH-001 (Copy job/Copy activity), ARCH-002 (Spark), ARCH-003 (Eventstream), ARCH-004 (hybrid), "keep and optimise" |

## How the engine recommendation works

The advisor looks at *signals* in the definition and telemetry, then maps them to the decision guide:

| Signal | Suggestion |
|---|---|
| Queries that are pure ingestion (source, select/rename/type, destination), plus long refresh, gateway-bound movement, frequent schedule or full reload of tables | **Copy job** (incremental/CDC) or **pipeline Copy activity** |
| Several heavy operations, fold breakers, per-row logic, custom API pagination, very long refresh or very many queries | **Spark** notebook (and bronze via Copy job) |
| Event hubs / Kafka / IoT sources behind a schedule | **Eventstream** |
| Movement and heavy transformation mixed in one dataflow | **Hybrid**: Copy job to Lakehouse, then Dataflow Gen2/Spark transforms |
| None of the above | **Keep Dataflow Gen2**, apply the findings |

These are *recommendations to evaluate*, not guarantees. Volume, team skills and governance matter (see the manual checklist). Compare run time and CU in the Fabric Capacity Metrics app for a week before switching.

## Scoring

Start at 100, subtract per finding: critical 20, high 10, medium 5, low 2, info 0, weighted by confidence (high 1.0, medium 0.8, low 0.5), at most two findings per rule. Grades: A >= 90, B >= 80, C >= 70, D >= 55, otherwise F.

## Configuration

`--config thresholds.json` can override any field of `Config` in [dfg2_advisor/models.py](dfg2_advisor/models.py):

```json
{
  "long_refresh_minutes": 20,
  "frequent_schedule_minutes": 30,
  "many_queries": 10,
  "suppress_rules": ["DFG-041"],
  "assume_incremental": ["FactSales"]
}
```

## Limitations (read before acting on a finding)

- **Static analysis.** Query folding and Fast Copy eligibility are approximated from the M script. Confirm with the Applied steps folding indicators, *View data source query*, and the **Engine** column in refresh history. Findings carry a confidence level for this reason.
- **Incremental refresh detection** is best effort (the definition format for it is not publicly documented). Use `assume_incremental` to tell the tool about queries that already use it.
- **Per-query settings** such as *Require Fast Copy* and the destination-level V-Order option are not visible in the definition; they are in the manual checklist.
- **CU estimates are indicative.** They treat the whole refresh duration as one Standard Compute query (12 CU/s for the first 10 minutes, 1.5 CU/s after; 16 CU/s for non-CI/CD). Real billing sums per-query time and adds High Scale (6 CU/s) and Fast Copy (1.5 CU/s of core time) meters.
- **Partitioned compute is in preview**: it can shorten wall-clock time while consuming similar or more CU.
- Non-CI/CD dataflows do not expose `getDefinition`; use `--include-legacy` or export the definition.

## Layout

```
dfg2_advisor/
  mashup.py      M tokenizer/parser (members, steps, calls, attributes)
  builder.py     definition parts / folders / model.json -> DataflowModel
  fabric_api.py  stdlib REST client (retry, paging, long-running operations)
  rules.py       rule catalogue (each rule maps to a guidance section)
  advisor.py     decision-guide engine recommendations
  telemetry.py   refresh statistics, schedules, CU model
  engine.py      orchestration, scoring, schedule-collision rule
  coverage.py    guidance -> rule traceability and manual checklist
  report.py      HTML / Markdown / JSON / CSV
samples/         BadSales.Dataflow (many issues), GoodSales.Dataflow (clean), sample_report/
tests/           unittest suite
```
