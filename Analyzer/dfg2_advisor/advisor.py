"""Engine selection advisor based on the Fabric decision guide (copy activity / Copy job / Dataflow Gen2 / Eventstream / Spark)."""
from __future__ import annotations

from typing import Any, Dict, List

from . import knowledge as K
from .models import Config, DataflowModel, Finding, Query, Recommendation
from .rules import RuleMeta, RULES

ARCH_META = {
    "ARCH-001": RuleMeta("ARCH-001", "Ingestion is better served by Copy job / pipeline Copy activity", "medium", "Architecture", "DG",
                         K.DOC_DECISION, "The decision guide positions Copy job and Copy activity for data ingestion, replication and lightweight transformation at low-to-high volume with incremental/CDC support.",
                         ["See the recommendation details for migration steps."], ["speed", "capacity"], "medium"),
    "ARCH-002": RuleMeta("ARCH-002", "Transformation workload is a better fit for Spark", "medium", "Architecture", "DG",
                         K.DOC_DECISION, "Spark scales out heavy transformation, custom logic and large joins that run on a single mashup engine in Dataflow Gen2.",
                         ["See the recommendation details for migration steps."], ["speed", "capacity"], "high"),
    "ARCH-003": RuleMeta("ARCH-003", "Event/streaming source is a better fit for Eventstream", "medium", "Architecture", "DG",
                         K.DOC_DECISION, "Eventstream ingests events as they occur without polling schedules.",
                         ["See the recommendation details for migration steps."], ["speed", "capacity"], "medium"),
    "ARCH-004": RuleMeta("ARCH-004", "Split into Copy job ingestion + Dataflow Gen2 transformation", "medium", "Architecture", "DG",
                         K.DOC_DECISION, "Mixing raw movement and transformation in one dataflow forfeits Fast Copy / Copy job throughput and burns Standard Compute on movement.",
                         ["See the recommendation details for migration steps."], ["speed", "capacity"], "medium"),
}
RULES.update(ARCH_META)

COPY_SOURCES = {"sql", "adls", "blob", "fabric_lakehouse", "fabric_warehouse", "odbc", "odata", "saas", "file", "sharepoint", "nosql"}
STREAM_FAMS = {"stream"}


def _simple_ingest(df: DataflowModel, q: Query) -> bool:
    if not q.source_calls or not set(q.families) & COPY_SOURCES or q.refs:
        return False
    calls = {c for s in q.steps for c in s.calls} if q.steps else set(q.calls)
    return not (calls & (K.HEAVY_OPS | K.FOLD_BREAKERS)) and not q.row_level_calls


def _heavy(q: Query) -> List[str]:
    calls = {c for s in q.steps for c in s.calls} if q.steps else set(q.calls)
    return sorted(calls & (K.HEAVY_OPS | {"Table.Buffer", "List.Accumulate", "List.Generate", "Table.FuzzyJoin", "Table.FuzzyNestedJoin"}))


def advise(df: DataflowModel, cfg: Config, stats: Dict[str, Any]) -> List[Recommendation]:
    recs: List[Recommendation] = []
    qs = df.real_queries()
    if not qs:
        return recs
    p50 = (stats.get("p50_s") or 0) / 60.0 if stats else 0.0
    sched = stats.get("min_schedule_interval_min") if stats else None
    gateway = bool(df.metadata.get("gatewayObjectId"))
    simple = [q for q in qs if _simple_ingest(df, q)]
    heavy_q = {q.name: _heavy(q) for q in qs if _heavy(q)}
    heavy_total = sum(len(v) for v in heavy_q.values())
    fold_break_q = [q for q in qs if q.steps and any(c in K.FOLD_BREAKERS for s in q.steps for c in s.calls)]
    stream_q = [q for q in qs if set(q.families) & STREAM_FAMS]
    paged_api = [q for q in qs if "web" in q.families and any(c in ("List.Generate", "List.Accumulate") for c in q.calls)]

    # --- Eventstream -----------------------------------------------------------
    if stream_q:
        recs.append(Recommendation(
            engine="Eventstream", verdict="recommended", confidence="high",
            rationale=[f"Query '{q.name}' reads an event/streaming source ({', '.join(q.source_calls)}) through a scheduled dataflow." for q in stream_q]
                      + ["Decision guide: Eventstream = event data ingestion/transformation, medium to high volume, no extraction schedule."],
            benefits=["Events land as they occur instead of per-refresh polling.", "Avoids Standard Compute billing on every poll."],
            tradeoffs=["Only lightweight transformation; complex shaping stays in Spark/Dataflow downstream."],
            migration_steps=["Create an Eventstream with the same source and route to Eventhouse or Lakehouse.",
                             "Keep a Dataflow Gen2 / Spark job only for downstream business transformations, reading the landed table.",
                             "Retire the scheduled dataflow once parity is validated."],
            reference=K.DOC_DECISION))

    # --- Copy job / Copy activity -----------------------------------------------
    if simple:
        trigger = []
        if p50 >= 10:
            trigger.append(f"median refresh {p50:.0f} min")
        if gateway:
            trigger.append("gateway-bound movement")
        if sched is not None and sched <= cfg.frequent_schedule_minutes:
            trigger.append(f"schedule every {sched:.0f} min")
        incr_candidates = [q.name for q in simple if q.destinations and any(d.update_method in (None, "Replace") for d in q.destinations)
                           and not q.name in cfg.assume_incremental]
        if incr_candidates:
            trigger.append("full reload of source tables (incremental/CDC copy would avoid it)")
        whole = len(simple) == len(qs)
        verdict = "recommended" if (trigger and (p50 >= 10 or gateway or (sched is not None and sched <= cfg.frequent_schedule_minutes))) else "consider"
        recs.append(Recommendation(
            engine="Copy job" if not gateway else "Copy job / pipeline Copy activity", verdict=verdict,
            confidence="medium" if trigger else "low",
            rationale=[f"{len(simple)} of {len(qs)} queries are pure ingestion (source -> select/rename/type -> destination): {', '.join(q.name for q in simple)}."]
                      + ([f"Signals: {', '.join(trigger)}."] if trigger else [])
                      + ["Decision guide: Copy job = ingestion, incremental copy, replication, lightweight transformation, low to high volume; Copy activity = petabyte-scale ingestion, 50+ connectors."],
            benefits=["Purpose-built high-throughput movement (the same backend Fast Copy borrows) without mashup-engine overhead.",
                      "Native watermark / CDC incremental copy, so unchanged data is not re-read.",
                      "Fewer Standard Compute CU: movement is not billed as mashup query time."],
            tradeoffs=["Only lightweight transformation (type conversion, column mapping, merge/split files, flatten).",
                       "50+ connectors vs 150+ in Dataflow Gen2; 40+ destinations.",
                       "Pipelines/Copy jobs are not authored in Power Query."],
            migration_steps=["Create a Copy job (or pipeline Copy activity) with the same source connection and the Lakehouse/Warehouse destination.",
                             "Choose incremental mode with a watermark column (or CDC where the source has it) and a full-load first run.",
                             "If transformations remain, point a Dataflow Gen2 (or Spark) at the landed table as the second stage.",
                             "Compare run time and CU in the Capacity Metrics app for one week, then decommission the movement queries."]
                            + (["Gateway: keep the connection bound to the same on-premises data gateway for the Copy job."] if gateway else []),
            reference=K.DOC_DECISION, scope="dataflow" if whole else "query", query=None if whole else ", ".join(q.name for q in simple)))

    # --- Spark ---------------------------------------------------------------
    spark_triggers = []
    if heavy_total >= 3:
        spark_triggers.append(f"{heavy_total} heavy operations ({', '.join(sorted({x for v in heavy_q.values() for x in v}))})")
    if len(fold_break_q) >= 2:
        spark_triggers.append(f"{len(fold_break_q)} queries with fold-breaking logic")
    if p50 >= cfg.spark_refresh_minutes:
        spark_triggers.append(f"median refresh {p50:.0f} min")
    if paged_api:
        spark_triggers.append("custom paginated API ingestion in M")
    if len(qs) >= cfg.many_queries:
        spark_triggers.append(f"{len(qs)} queries in one dataflow")
    if spark_triggers and (heavy_total or fold_break_q or paged_api):
        strong = (heavy_total >= 3 and p50 >= cfg.spark_refresh_minutes) or p50 >= cfg.very_long_refresh_minutes
        recs.append(Recommendation(
            engine="Spark (notebook / Spark job definition)", verdict="recommended" if strong else "consider",
            confidence="medium" if strong else "low",
            rationale=["Signals: " + "; ".join(spark_triggers) + ".",
                       "Decision guide: Spark = data ingestion, transformation, processing, profiling with native Spark and open-source libraries; low to high complexity and volume."],
            benefits=["Distributed execution for large joins/aggregations that otherwise run in one mashup engine.",
                      "Direct Delta writes, partition pruning, OPTIMIZE/V-Order and MERGE for upserts.",
                      "Better fit for custom logic, window functions and API pagination."],
            tradeoffs=["Requires Spark (PySpark/Spark SQL) skills and code review/CI practices.",
                       "Session start-up and Spark CU consumption: validate with the Capacity Metrics app; short, light jobs can cost more than Dataflow.",
                       "For SQL-shaped logic already in OneLake, a Warehouse T-SQL procedure or Materialized Lake Views may be simpler than Spark (outside the decision-guide table; evaluate)."],
            migration_steps=["Land sources with Copy job / Fast Copy into Lakehouse Delta tables (bronze).",
                             "Re-implement the heavy queries in a notebook (Spark SQL/PySpark), writing silver/gold Delta tables.",
                             "Keep Dataflow Gen2 for light business-user shaping of the gold tables if needed.",
                             "Orchestrate with a Data Pipeline; use incremental MERGE for fact tables; validate row counts against the dataflow output."],
            reference=K.DOC_DECISION, scope="query" if len(heavy_q) < len(qs) else "dataflow", query=", ".join(heavy_q) or None))

    # --- Hybrid split ----------------------------------------------------------
    mixed = [q for q in qs if q.source_calls and _simple_ingest(df, q) is False and q.fast_copy_connector and _heavy(q)]
    if mixed or (simple and heavy_q and len(simple) < len(qs) and (gateway or p50 >= 10)):
        names = [q.name for q in mixed] or list(heavy_q)
        recs.append(Recommendation(
            engine="Hybrid: Copy job (ingest) + Dataflow Gen2 or Spark (transform)", verdict="recommended", confidence="medium",
            rationale=[f"Movement and heavy transformation are mixed in the same dataflow: {', '.join(names)}.",
                       "Best-practice consideration 1/2/7: separate the Fast Copy / movement step from transformation."],
            benefits=["Fast Copy / Copy job throughput for the movement step.", "Transformation runs on staging SQL compute or Spark instead of the gateway/mashup engine."],
            tradeoffs=["Two items to schedule; orchestrate with a Data Pipeline."],
            migration_steps=["Stage 1: ingestion-only query (or Copy job) -> Lakehouse.", "Stage 2: referencing query/dataflow/notebook applies Group/Join/Sort logic.",
                             "Wire both in a pipeline so stage 2 starts only after stage 1 succeeds."],
            reference=K.DOC_BP))

    # --- Keep Dataflow Gen2 ----------------------------------------------------
    if not any(r.verdict == "recommended" for r in recs):
        recs.append(Recommendation(
            engine="Dataflow Gen2 (keep and optimize)", verdict="keep", confidence="medium",
            rationale=["No signal strong enough to justify a different engine; Dataflow Gen2 fits low-to-medium volume, Power Query skills and multi-destination shaping (decision guide scenario 2).",
                       "Apply the findings above (staging, Fast Copy, Modern Evaluator, incremental refresh) before reconsidering."],
            benefits=["No migration cost.", "300+ transformations in a low-code UI."],
            tradeoffs=["Revisit if volume grows or refresh time exceeds your SLA."],
            migration_steps=["Re-run this advisor after remediation and compare the score and refresh telemetry."],
            reference=K.DOC_DECISION))
    return recs


def recommendations_to_findings(df: DataflowModel, recs: List[Recommendation]) -> List[Finding]:
    mapping = {"Eventstream": "ARCH-003", "Copy job": "ARCH-001", "Spark": "ARCH-002", "Hybrid": "ARCH-004"}
    out: List[Finding] = []
    for r in recs:
        if r.verdict == "keep":
            continue
        rid = next((v for k, v in mapping.items() if r.engine.startswith(k)), None)
        if not rid:
            continue
        m = ARCH_META[rid]
        out.append(Finding(rule_id=rid, title=m.title, severity="medium" if r.verdict == "recommended" else "info",
                           category="Architecture", dataflow=df.name, query=r.query,
                           evidence=r.rationale[0] if r.rationale else "", why=m.why,
                           remediation=r.migration_steps, reference=r.reference, confidence=r.confidence,
                           impact=list(m.impact), effort="high"))
    return out
