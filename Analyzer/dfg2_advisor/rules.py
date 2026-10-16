"""Rule catalogue: every rule maps to a section of the Microsoft guidance it enforces."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from . import knowledge as K
from .models import Config, DataflowModel, Finding, Query


@dataclass
class RuleMeta:
    id: str
    title: str
    severity: str
    category: str
    section: str  # key in coverage.SECTIONS
    reference: str
    why: str
    remediation: List[str]
    impact: List[str] = field(default_factory=list)
    effort: str = "low"
    needs_telemetry: bool = False


RULES: Dict[str, RuleMeta] = {}
_IMPL: Dict[str, Callable[["Ctx"], None]] = {}


def rule(meta: RuleMeta):
    def deco(fn: Callable[["Ctx"], None]):
        RULES[meta.id] = meta
        _IMPL[meta.id] = fn
        return fn

    return deco


# --------------------------------------------------------------------------- helpers
class Ctx:
    def __init__(self, df: DataflowModel, cfg: Config, stats: Optional[dict] = None):
        self.df = df
        self.cfg = cfg
        self.stats = stats or {}
        self.findings: List[Finding] = []
        self._cur: Optional[RuleMeta] = None

    def add(self, evidence: str, *, query: Optional[str] = None, severity: Optional[str] = None,
            confidence: str = "medium", snippet: Optional[str] = None, remediation: Optional[List[str]] = None,
            why: Optional[str] = None) -> None:
        m = self._cur
        assert m is not None
        self.findings.append(Finding(
            rule_id=m.id, title=m.title, severity=severity or m.severity, category=m.category,
            dataflow=self.df.name, query=query, evidence=evidence, why=why or m.why,
            remediation=remediation or m.remediation, reference=m.reference, confidence=confidence,
            impact=list(m.impact), effort=m.effort, snippet=snippet,
        ))

    # query helpers -------------------------------------------------------
    def queries(self) -> List[Query]:
        return self.df.real_queries()

    def step_calls(self, q: Query) -> List[Tuple[int, str]]:
        out: List[Tuple[int, str]] = []
        if q.steps:
            for i, s in enumerate(q.steps):
                for c in s.calls:
                    out.append((i, c))
        else:
            out = [(0, c) for c in q.calls]
        return out

    def first_idx(self, q: Query, fns: set) -> Optional[int]:
        for i, c in self.step_calls(q):
            if c in fns:
                return i
        return None

    def has(self, q: Query, fns: set) -> bool:
        return any(c in fns for _, c in self.step_calls(q))

    def used(self, q: Query, fns: set) -> List[str]:
        return sorted({c for _, c in self.step_calls(q) if c in fns})

    def upstream_families(self, q: Query, seen: Optional[set] = None) -> List[str]:
        seen = seen or set()
        fams = list(q.families)
        for r in q.refs:
            if r in seen or r not in self.df.queries:
                continue
            seen.add(r)
            fams += self.upstream_families(self.df.queries[r], seen)
        return list(dict.fromkeys(fams))

    def is_incremental(self, q: Query) -> bool:
        if q.name in self.cfg.assume_incremental:
            return True
        blob = (q.expr + " " + str(self.df.metadata.get("queriesMetadata", {}).get(q.name, ""))).lower()
        return bool(re.search(r"incrementalrefresh|rangestart|rangeend|incremental_refresh", blob))

    def uses_staging(self) -> bool:
        return any(q.staged for q in self.queries() if q.staged is not None)

    @property
    def p50_min(self) -> Optional[float]:
        v = self.stats.get("p50_s")
        return None if v is None else v / 60.0


FILE_FAMS = {"adls", "blob", "file", "sharepoint"}
NONFOLD_SOURCE_FAMS = {"file", "sharepoint", "web", "file_parser", "dataflow_connector", "nosql", "stream", "adls", "blob"}


# --------------------------------------------------------------------------- engine / settings rules
@rule(RuleMeta(
    "DFG-001", "Fast Copy is disabled for the dataflow", "medium", "Performance", "BP-C1", K.DOC_FASTCOPY,
    "Fast Copy uses the pipeline Copy-activity backend for high-throughput ingestion. Disabling it forces the slower "
    "mashup-engine data path even for eligible sources.",
    ["Open the dataflow > Home > Options > Scale and turn on 'Allow use of fast copy connectors'.",
     "In the definition set computeEngineSettings.allowFastCopy = true (the default).",
     "Keep Fast Copy queries free of non-folding transformations; put those in a second, referencing query."],
    ["speed", "capacity"], "low"))
def _r001(c: Ctx):
    if c.df.settings.get("allowFastCopy") is False:
        eligible = [q.name for q in c.queries() if q.fast_copy_connector]
        c.add(f"computeEngineSettings.allowFastCopy = false. Fast-copy capable queries: {', '.join(eligible) or 'none detected'}.",
              severity="high" if eligible else "low", confidence="high")


@rule(RuleMeta(
    "DFG-002", "Modern Evaluator is not enabled", "medium", "Performance", "BP-C9", K.DOC_MODERN,
    "The Modern query evaluation engine (.NET 8) runs mashup transformations substantially faster and more efficiently, "
    "especially for non-folding connectors, filters, derived columns and cleansing at volume.",
    ["Dataflow editor > Home > Options > Scale > turn on 'Modern query evaluation engine', then save and run.",
     "Definition setting: computeEngineSettings.allowModernEvaluationEngine = true.",
     "Note: Db2, Informix and MQ connectors still route to the standard engine."],
    ["speed", "capacity"], "low"))
def _r002(c: Ctx):
    if c.df.fmt != "cicd":
        return
    v = c.df.settings.get("allowModernEvaluationEngine")
    if v is False:
        c.add("allowModernEvaluationEngine = false.", severity="medium", confidence="high")
    elif v is None and c.queries():
        c.add("allowModernEvaluationEngine is not set in the definition (enabled by default only for newly created CI/CD items; "
              "older items may still use the standard engine). Verify under Options > Scale.", severity="low", confidence="low")
    legacy = [q.name for q in c.queries() if any(x.startswith(("Db2.", "Informix.")) for x in q.calls)]
    if legacy:
        c.add(f"Queries using Db2/Informix connectors fall back to the standard engine: {', '.join(legacy)}.",
              severity="info", confidence="high")


@rule(RuleMeta(
    "DFG-003", "'Optimized copy to Lakehouse' is off while staged queries land in a Lakehouse", "medium", "Performance",
    "BP-C3", K.DOC_STAGED,
    "Without it, staged data reaches the Lakehouse through extra serialization and network hops. The option is off by "
    "default and is recommended for most staging-heavy dataflows that write to a Lakehouse.",
    ["Options > Scale > Staged Data > turn on 'Optimized copy to Lakehouse' (setting enableOptimizedCopyToLakehouse = true).",
     "It only affects queries with staging enabled and a Fabric Lakehouse destination; there is no per-query override."],
    ["speed", "capacity"], "low"))
def _r003(c: Ctx):
    qs = [q.name for q in c.queries() if q.staged and any(d.kind == "lakehouse" for d in q.destinations)]
    if qs and not c.df.settings.get("enableOptimizedCopyToLakehouse"):
        c.add(f"Staged queries writing to Lakehouse: {', '.join(qs)}; enableOptimizedCopyToLakehouse is "
              f"{c.df.settings.get('enableOptimizedCopyToLakehouse', 'not set (default off)')}.", confidence="high" if "enableOptimizedCopyToLakehouse" in c.df.settings else "medium")


@rule(RuleMeta(
    "DFG-004", "V-Order is applied to the staging Lakehouse", "low", "Performance", "SD-VORDER", K.DOC_STAGED,
    "The staging Lakehouse is read only by Dataflow Gen2 itself. V-Order adds write-time CPU and lengthens refreshes; "
    "it only pays off when staged output is read many times through the Dataflow connector.",
    ["Options > Scale > Staged Data > turn off 'Enable V-Order compression' (enableVorder = false) for most dataflows.",
     "Keep V-Order for the Lakehouse destination itself when Direct Lake / SQL endpoint / Spark read it (destination-level option)."],
    ["speed", "capacity"], "low"))
def _r004(c: Ctx):
    if not c.uses_staging():
        return
    v = c.df.settings.get("enableVorder")
    if v is True or v is None:
        c.add("enableVorder is " + ("true" if v else "not set (default on)") + " and staging is in use.",
              confidence="high" if v else "medium")


@rule(RuleMeta(
    "DFG-005", "File-combine queries could use Partitioned Compute", "medium", "Performance", "PC", K.DOC_PARTITION,
    "Partitioned compute evaluates each file partition in parallel, cutting wall-clock time on large multi-file loads "
    "(ADLS Gen2, Blob, Folder). Recommended over Fast Copy when the source cannot fold your transformations.",
    ["Options > Scale > 'Allow use of partitioned compute' and Privacy > 'Allow combining data from multiple sources'.",
     "Re-run the Combine files experience so a Table.ReplacePartitionKey step is generated; keep the partition column in the query.",
     "Stage the query and load directly to staging or a Fabric Warehouse for best results (Preview; each partition is billed for its own duration, so CU can be similar or higher while wall-clock drops)."],
    ["speed"], "medium"))
def _r005(c: Ctx):
    if c.df.settings.get("allowPartitionedCompute"):
        return
    for q in c.queries():
        fams = set(q.families)
        if fams & {"adls", "blob", "file"} and c.has(q, {"Table.Combine", "Table.ExpandTableColumn", "Csv.Document", "Parquet.Document", "Excel.Workbook"}) \
                and c.has(q, {"Table.AddColumn", "Table.TransformColumns"}):
            c.add(f"Query '{q.name}' combines files from {', '.join(q.source_calls)} without partitioned compute.", query=q.name, confidence="medium")


@rule(RuleMeta(
    "DFG-006", "Partitioned Compute is enabled but cannot take effect", "medium", "Performance", "PC", K.DOC_PARTITION,
    "Partitioning requires a staged query, a surviving partition-key column, a supported connector (ADLS Gen2, Folder, Blob) and "
    "the privacy setting 'Allow combining data from multiple sources'. SharePoint and Lakehouse connectors are not supported.",
    ["Enable staging on the partitioned query and keep the Table.ReplacePartitionKey column.",
     "Turn on Privacy > 'Allow combining data from multiple sources' (fastCombine = true).",
     "For Lakehouse files use the ADLS Gen2 connector against the Files URL."],
    ["speed"], "low"))
def _r006(c: Ctx):
    if not c.df.settings.get("allowPartitionedCompute"):
        return
    if not c.df.metadata.get("fastCombine"):
        c.add("allowPartitionedCompute = true but fastCombine (Allow combining data from multiple sources) is not enabled.", confidence="high")
    has_key = "ReplacePartitionKey" in c.df.raw_text
    for q in c.queries():
        if set(q.families) & {"adls", "blob", "file"}:
            if q.staged is False:
                c.add(f"Query '{q.name}' reads files but is not staged.", query=q.name, confidence="high")
            if not has_key:
                c.add(f"Query '{q.name}' reads files but no Table.ReplacePartitionKey step exists in the dataflow.", query=q.name, confidence="medium")
        if set(q.families) & {"sharepoint", "fabric_lakehouse"}:
            c.add(f"Query '{q.name}' uses a connector that does not support partitioned compute ({', '.join(q.families)}).", query=q.name, severity="low", confidence="high")


@rule(RuleMeta(
    "DFG-007", "Low maxConcurrency with many independent queries", "low", "Performance", "BP-KA1", K.DOC_BP,
    "A concurrency of 1 evaluates queries one after another, stretching refresh time for independent queries.",
    ["Raise 'Maximum concurrent evaluations' (Options > Scale; computeEngineSettings.maxConcurrency) gradually while watching source throttling.",
     "Incremental refresh to a Lakehouse supports at most 10 concurrent bucket evaluations."],
    ["speed"], "low"))
def _r007(c: Ctx):
    mc = c.df.settings.get("maxConcurrency")
    independent = [q for q in c.queries() if not q.refs]
    if mc == 1 and len(independent) > c.cfg.max_concurrency_hint_queries:
        c.add(f"maxConcurrency = 1 with {len(independent)} independent queries.", confidence="medium")


def classify_definition_error(msg: Optional[str]) -> str:
    t = (msg or "").lower()
    if "capacitynotactive" in t or "capacity" in t and "not active" in t:
        return "capacity"
    if any(x in t for x in ("403", "401", "forbidden", "unauthorized", "insufficient", "requestblocked", "accessdenied")):
        return "permission"
    if any(x in t for x in ("notsupported", "not supported", "itemnotfound", "404", "unsupported")):
        return "unsupported"
    return "other"


@rule(RuleMeta(
    "DFG-000", "Definition could not be read - dataflow was not assessed", "medium", "Reliability", "OPS", K.DOC_CICD,
    "The advisor needs mashup.pq and queryMetadata.json. Without them none of the best-practice rules can be evaluated, so no score is given.",
    ["Check the error below and re-run the scan."],
    ["reliability"], "low"))
def _r000(c: Ctx):
    err = c.df.definition_error
    if c.df.definition_available:
        return
    kind = classify_definition_error(err)
    fix = {
        "capacity": ["The workspace capacity is paused/inactive: resume or re-assign an active Fabric capacity, then re-run the scan.",
                     "Refresh history above is still available, but the definition cannot be read until the capacity is active."],
        "permission": ["Ensure you have at least Contributor on the workspace (getDefinition needs read/write access to the item).",
                       "For service principals enable 'Service principals can use Fabric APIs' and grant item.ReadWrite scope."],
        "unsupported": ["The item may be a non-CI/CD Dataflow Gen2 or Gen1: re-run with --include-legacy to read it through the Power BI API, or upgrade it to Dataflow Gen2 (CI/CD)."],
        "other": ["Re-run with --verbose; export the dataflow from the portal (Git integration) and scan it with --path as a workaround."],
    }[kind]
    c.add(f"getDefinition failed ({kind}): {(err or '')[:300]}", severity="medium", confidence="high", remediation=fix)


@rule(RuleMeta(
    "DFG-008", "Dataflow is not a Gen2 CI/CD item (legacy format)", "high", "Capacity", "PRICE", K.DOC_PRICING,
    "Non-CI/CD Dataflow Gen2 is billed at a flat 16 CU/s for the whole query duration, while CI/CD uses 12 CU/s for the first "
    "10 minutes and 1.5 CU/s afterwards. Modern Evaluator and Partitioned Compute are CI/CD-only, and Git/ALM is unavailable.",
    ["Use 'Save as Dataflow Gen2 (CI/CD)' (or the Gen1/Gen2 save-as upgrade path) to create a CI/CD copy.",
     "Re-validate destinations, schedules and connections on the new item, then retire the legacy one.",
     "Enable Modern Evaluator and Fast Copy on the new item."],
    ["speed", "capacity"], "medium"))
def _r008(c: Ctx):
    if c.df.fmt == "legacy":
        c.add("Definition was only available in the legacy model.json format.", confidence="medium")
    elif not c.df.definition_available and classify_definition_error(c.df.definition_error) == "unsupported":
        c.add("getDefinition is not supported for this item, which typically means a non-CI/CD dataflow.", severity="medium", confidence="low")


# --------------------------------------------------------------------------- Fast Copy rules
def _fc_blockers(c: Ctx, q: Query) -> List[str]:
    blockers = set(c.used(q, K.HEAVY_OPS | K.FOLD_BREAKERS))
    if set(q.families) & FILE_FAMS:
        blockers |= {fn for _, fn in c.step_calls(q) if fn.startswith("Table.") and fn not in K.FAST_COPY_FILE_OPS and not fn.startswith("Table.Schema")}
    return sorted(b for b in blockers if b != "Table.TransformColumnTypes")


@rule(RuleMeta(
    "DFG-010", "Fast Copy is likely disabled by transformations in the same query", "high", "Performance", "BP-C1", K.DOC_FASTCOPY,
    "Fast Copy only supports combine files, select/remove/rename columns and type changes (for SQL sources, anything that folds into "
    "the native query). Adding other transformations to the same query silently falls back to the slow mashup path, or fails if "
    "'Require Fast Copy' is set.",
    ["Split the query: query 1 = ingestion only (Fast Copy, staging enabled); query 2 references query 1 and applies the heavy transformations in staging compute.",
     "Use 'Extract previous' on the first non-folding step in the Applied steps pane to do the split.",
     "Check the Fast Copy indicator in the query steps pane and the Engine column in refresh history."],
    ["speed", "capacity"], "low"))
def _r010(c: Ctx):
    if c.df.settings.get("allowFastCopy") is False:
        return
    for q in c.queries():
        if q.fast_copy_connector and q.step_count:
            b = _fc_blockers(c, q)
            if b:
                c.add(f"Query '{q.name}' reads from a Fast Copy connector ({', '.join(q.source_calls)}) but also uses: {', '.join(b)}.",
                      query=q.name, confidence="medium",
                      snippet="// Query A (Fast Copy + staging): source -> select/rename/type only\n// Query B: references A, applies Group/Join/Sort/custom logic")


@rule(RuleMeta(
    "DFG-011", "Fast Copy source loads directly to a non-Lakehouse destination", "medium", "Performance", "FC-DEST", K.DOC_FASTCOPY,
    "Fast Copy can only write directly to a Lakehouse. For any other destination the query must be staged and a second query that "
    "references it must hold the destination.",
    ["Stage the ingestion query (no destination).", "Create a referencing query that carries the Warehouse / SQL / KQL destination."],
    ["speed"], "low"))
def _r011(c: Ctx):
    for q in c.queries():
        bad = [d.kind for d in q.destinations if d.kind not in ("lakehouse",)]
        if q.fast_copy_connector and bad and q.staged is False:
            c.add(f"Query '{q.name}' (Fast Copy connector) writes straight to {', '.join(bad)} without staging.", query=q.name, confidence="medium")


# --------------------------------------------------------------------------- staging rules
@rule(RuleMeta(
    "DFG-020", "Heavy transformations run in the mashup engine without staging", "high", "Performance", "BP-C2", K.DOC_BP,
    "Joins, group-by, pivot/unpivot, sort, distinct and buffering that do not fold to the source run in the single-node mashup "
    "engine. Staging lets the Lakehouse/Warehouse SQL engine do that work in parallel.",
    ["Right-click the first non-folding step > Extract previous, name the new query, and enable staging on it.",
     "Apply the heavy transformations in the second query (staging on the second query is optional).",
     "Re-check folding indicators: the first query should show green (folds to source).",
     "Sources that never fold (Excel, CSV, JSON, web, SharePoint) benefit most: land the raw data in query 1, then transform in staging compute; prefer Parquet/Delta over CSV/Excel as the landing format."],
    ["speed", "capacity"], "medium"))
def _r020(c: Ctx):
    for q in c.queries():
        heavy = c.used(q, K.HEAVY_OPS)
        if len(heavy) >= c.cfg.heavy_ops_for_staging and q.staged is False and not q.refs:
            nonfold_src = q.can_fold is False or c.has(q, K.FOLD_BREAKERS)
            c.add(f"Query '{q.name}' (staging off) uses {', '.join(heavy)}"
                  + (" on a non-folding path" if nonfold_src else "") + ".",
                  query=q.name, severity="high" if nonfold_src else "medium", confidence="medium" if nonfold_src else "low")


@rule(RuleMeta(
    "DFG-021", "Shared query is not staged and is re-evaluated by every consumer", "medium", "Capacity", "BP-KA3", K.DOC_BP,
    "A non-staged query referenced by several queries is evaluated once per consumer, re-reading the source each time and "
    "paying mashup-engine CU repeatedly.",
    ["Enable staging on the shared query so the result is materialised once in the staging Lakehouse/Warehouse.",
     "Keep it hidden/without a destination if it is only an intermediate."],
    ["speed", "capacity"], "low"))
def _r021(c: Ctx):
    for q in c.queries() + [x for x in c.df.queries.values() if x.role == "default_destination"]:
        consumers = [n for n in q.referenced_by if c.df.queries[n].role == "query"]
        if len(consumers) >= 2 and q.staged is False:
            c.add(f"Query '{q.name}' is referenced by {len(consumers)} queries ({', '.join(consumers)}) and staging is off.", query=q.name, confidence="high")


@rule(RuleMeta(
    "DFG-022", "Join/merge of queries that are not staged", "medium", "Performance", "BP-C2", K.DOC_BP,
    "Merging queries from different connectors cannot fold; the mashup engine joins in memory. Staging both inputs lets the "
    "staging SQL engine perform the join.",
    ["Enable staging on each input query and perform the merge in a query that references the staged inputs."],
    ["speed", "capacity"], "medium"))
def _r022(c: Ctx):
    for q in c.queries():
        if c.has(q, K.JOIN_OPS) and q.refs:
            unstaged = [r for r in q.refs if r in c.df.queries and c.df.queries[r].role == "query" and c.df.queries[r].staged is False]
            if unstaged:
                c.add(f"Query '{q.name}' merges with non-staged quer{'y' if len(unstaged) == 1 else 'ies'}: {', '.join(unstaged)}.", query=q.name, confidence="medium")


@rule(RuleMeta(
    "DFG-023", "Warehouse destination without staging", "medium", "Reliability", "DEST", K.DOC_DEST,
    "Loading to a Fabric Warehouse requires staging to be enabled on the query.",
    ["Enable staging on queries that load to a Warehouse destination."],
    ["reliability"], "low"))
def _r023(c: Ctx):
    for q in c.queries():
        if any(d.kind == "warehouse" for d in q.destinations) and q.staged is False:
            c.add(f"Query '{q.name}' writes to a Warehouse with staging disabled.", query=q.name, confidence="high")


@rule(RuleMeta(
    "DFG-024", "Staging enabled on a fully-folding query that writes straight to a Lakehouse", "info", "Capacity", "BP-KA3", K.DOC_BP,
    "If the transformations fully fold to the source you can write directly to the Lakehouse with staging disabled, avoiding the "
    "staging write and High-Scale compute (6 CU/s).",
    ["Verify folding (right-click last step > View data source query). If it folds, disable staging on the query and compare run time and CU."],
    ["capacity", "speed"], "low"))
def _r024(c: Ctx):
    for q in c.queries():
        if (q.staged and q.can_fold and not q.fast_copy_connector and not q.referenced_by and q.destinations
                and all(d.kind == "lakehouse" for d in q.destinations)
                and not c.has(q, K.HEAVY_OPS | K.FOLD_BREAKERS)):
            c.add(f"Query '{q.name}' appears to fold fully ({', '.join(q.source_calls)}) yet is staged.", query=q.name, confidence="low")


@rule(RuleMeta(
    "DFG-025", "Staged output is only reachable through the Dataflow connector", "medium", "Architecture", "BP-C8", K.DOC_BP,
    "Consuming a dataflow through the Dataflow connector is slower and burns more capacity than reading a Lakehouse/Warehouse "
    "destination through the SQL analytics endpoint or Direct Lake.",
    ["Add a Lakehouse or Warehouse data destination to the query.", "Point reports/pipelines at the destination table instead of the Dataflow connector."],
    ["speed", "capacity"], "medium"))
def _r025(c: Ctx):
    for q in c.queries():
        if q.staged and not q.destinations and not q.referenced_by and not q.hidden and q.step_count:
            c.add(f"Query '{q.name}' is staged but has no destination and no referencing query.", query=q.name, confidence="medium")


@rule(RuleMeta(
    "DFG-026", "Consumes data through the Dataflow connector", "medium", "Architecture", "BP-C8", K.DOC_BP,
    "Using PowerPlatform.Dataflows as a source chains dataflows via the slower connector instead of destinations.",
    ["Give the upstream dataflow a Lakehouse/Warehouse destination and read that table (Lakehouse.Contents / SQL endpoint)."],
    ["speed", "capacity"], "medium"))
def _r026(c: Ctx):
    for q in c.queries():
        if "dataflow_connector" in q.families:
            c.add(f"Query '{q.name}' reads through {', '.join(q.source_calls)}.", query=q.name, confidence="high")


# --------------------------------------------------------------------------- folding / M pattern rules
@rule(RuleMeta(
    "DFG-030", "Query folding is broken early on a foldable source", "high", "Performance", "BP-KA2", K.DOC_FOLDING,
    "A step that cannot fold forces every later step (and all rows) to be processed in the mashup engine instead of the source.",
    ["Move filters, column selection and aggregations before the first non-folding step.",
     "If it cannot be reordered, use Extract previous and stage the first query.",
     "Check the folding indicators and 'View data source query' for each step."],
    ["speed", "capacity"], "medium"))
def _r030(c: Ctx):
    for q in c.queries():
        if not q.can_fold or not q.steps:
            continue
        calls = c.step_calls(q)
        for idx, fn in calls:
            if fn in K.FOLD_BREAKERS and fn not in ("Json.Document",):
                after = q.step_count - idx - 1
                heavy_after = [f for i, f in calls if i > idx and f in (K.HEAVY_OPS | K.FILTER_OPS)]
                if after >= 2 or heavy_after:
                    c.add(f"'{fn}' at step {idx + 1} ('{q.steps[idx].name}') on a foldable source; {after} step(s) follow"
                          + (f", including {', '.join(sorted(set(heavy_after)))}" if heavy_after else "") + ".",
                          query=q.name, confidence="medium", severity="high" if heavy_after else "medium")
                break


@rule(RuleMeta(
    "DFG-031", "Native SQL query disables folding for subsequent steps", "medium", "Performance", "BP-KA2", K.DOC_FOLDING,
    "Passing a Query to Sql.Database/Odbc, or using Value.NativeQuery without EnableFolding, stops later steps from folding.",
    ["Prefer a database view or navigate to the table so Power Query can fold.",
     "If you must use native SQL, call Value.NativeQuery(..., null, [EnableFolding = true]) and push filters into the SQL text.",
     "Remember allowNativeQueries must be true for native queries to run."],
    ["speed", "capacity"], "medium"))
def _r031(c: Ctx):
    for q in c.queries():
        for s in q.steps:
            if "Value.NativeQuery" in s.calls and "EnableFolding" not in s.text:
                c.add(f"Step '{s.name}' uses Value.NativeQuery without EnableFolding = true.", query=q.name, confidence="high")
            elif any(x in s.calls for x in ("Sql.Database", "Odbc.Query", "PostgreSQL.Database", "Oracle.Database", "MySQL.Database")) and re.search(r"\bQuery\s*=", s.text):
                c.add(f"Step '{s.name}' passes a native Query to the source connector.", query=q.name, confidence="high")


@rule(RuleMeta(
    "DFG-032", "Rows are filtered late in the query", "medium", "Performance", "BP-KA2", K.DOC_PQ_BP,
    "Best practice is to filter early and often so less data flows through every downstream step.",
    ["Move Table.SelectRows (date/ID filters) directly after the source navigation.",
     "Combine with a Date-parameter filter to also keep design-time previews small."],
    ["speed", "capacity"], "low"))
def _r032(c: Ctx):
    for q in c.queries():
        f = c.first_idx(q, K.FILTER_OPS - {"Table.Skip"})
        h = c.first_idx(q, K.HEAVY_OPS | {"Table.ExpandTableColumn", "Table.AddColumn"})
        if f is not None and h is not None and f > h and q.step_count >= 4:
            c.add(f"First filter is step {f + 1} but a heavier step occurs at step {h + 1} ('{q.steps[h].name}').", query=q.name, confidence="low")


@rule(RuleMeta(
    "DFG-033", "No row filter and no column pruning on a large-source query", "low", "Performance", "BP-KA2", K.DOC_PQ_BP,
    "Reading every row and column from a source wastes movement and compute. Select only the columns you need and filter by date/ID where possible.",
    ["Add Table.SelectColumns/RemoveColumns right after the source.", "Add a filter step (ideally parameter-driven) or enable incremental refresh."],
    ["speed", "capacity"], "low"))
def _r033(c: Ctx):
    for q in c.queries():
        if q.steps and q.source_calls and set(q.families) & {"sql", "adls", "blob", "fabric_lakehouse", "fabric_warehouse", "odbc", "kql"}:
            if not c.has(q, K.FILTER_OPS) and not c.has(q, K.COLUMN_PRUNE_OPS) and q.step_count >= 3:
                c.add(f"Query '{q.name}' neither filters rows nor prunes columns.", query=q.name, confidence="low")


@rule(RuleMeta(
    "DFG-035", "Table.Buffer / List.Buffer used", "medium", "Performance", "BP-KA2", K.DOC_PQ_BP,
    "Buffering materialises the table in memory, breaks query folding and can cause out-of-memory failures on large data.",
    ["Remove the buffer unless profiling shows a benefit.", "Stage the data instead; the staging SQL engine handles large intermediate results."],
    ["speed", "reliability"], "low"))
def _r035(c: Ctx):
    for q in c.queries():
        b = c.used(q, {"Table.Buffer", "List.Buffer", "Binary.Buffer"})
        if b:
            c.add(f"Query '{q.name}' uses {', '.join(b)}.", query=q.name, confidence="high")


@rule(RuleMeta(
    "DFG-036", "Row-by-row calls to external sources (N+1 pattern)", "high", "Performance", "BP-KA2", K.DOC_PQ_BP,
    "Calling a connector or web endpoint inside a per-row function (Table.AddColumn each ...) executes one request per row, "
    "multiplying latency and billable mashup time.",
    ["Replace per-row calls with a single set-based call and join/merge the result.",
     "For REST APIs, paginate with List.Generate once, or move ingestion to a pipeline Copy activity / Spark notebook.",
     "Stage the lookup table and merge instead of invoking a function per row."],
    ["speed", "capacity", "reliability"], "medium"))
def _r036(c: Ctx):
    for q in c.queries() + [x for x in c.df.queries.values() if x.role == "function"]:
        hit = sorted({fn for fn in q.row_level_calls if fn in K.NETWORK_ROW_FUNCS or (match_conn(fn) and not fn.startswith(("Folder.", "File.", "AzureStorage.")))})
        if hit:
            c.add(f"'{q.name}' calls {', '.join(hit)} inside a row-level function.", query=q.name, confidence="medium")


def match_conn(fn: str) -> bool:
    hit = K.match_connector(fn)
    return bool(hit and hit[1][0] not in ("file_parser",))


@rule(RuleMeta(
    "DFG-037", "Repetitive type/rename/add-column steps", "low", "Maintainability", "BP-KA2", K.DOC_PQ_BP,
    "Many repeated Table.TransformColumnTypes / RenameColumns steps add evaluation overhead and bloat the script.",
    ["Merge consecutive type changes into one Table.TransformColumnTypes call and renames into one Table.RenameColumns."],
    ["speed"], "low"))
def _r037(c: Ctx):
    for q in c.queries():
        for fn in ("Table.TransformColumnTypes", "Table.RenameColumns"):
            n = sum(1 for s in q.steps if fn in s.calls)
            if n >= c.cfg.repeated_type_steps:
                c.add(f"Query '{q.name}' has {n} separate {fn} steps.", query=q.name, confidence="high")


@rule(RuleMeta(
    "DFG-038", "Very long query script", "low", "Maintainability", "BP-C2", K.DOC_BP,
    "Long step chains are hard to reason about and usually contain a folding break. Splitting into staged layers makes each stage reusable and cheaper to evaluate.",
    ["Split on logical boundaries (ingest > clean > shape) using Extract previous; stage the intermediate queries."],
    ["speed", "reliability"], "medium"))
def _r038(c: Ctx):
    for q in c.queries():
        if q.step_count >= c.cfg.long_query_steps:
            c.add(f"Query '{q.name}' has {q.step_count} steps.", query=q.name, confidence="high")


@rule(RuleMeta(
    "DFG-039", "Sorting rows that are written to a table destination", "low", "Performance", "BP-KA2", K.DOC_PQ_BP,
    "Row order is not preserved in Lakehouse/Warehouse/SQL tables, so a Table.Sort that is not required by Top-N, window or dedupe logic is wasted compute.",
    ["Remove the sort, or sort at read time in the consumer (SQL ORDER BY / DAX)."],
    ["speed", "capacity"], "low"))
def _r039(c: Ctx):
    for q in c.queries():
        if c.has(q, {"Table.Sort"}) and q.destinations and not c.has(q, {"Table.FirstN", "Table.Group", "Table.Distinct", "Table.AddIndexColumn", "Table.Buffer", "Table.Skip"}):
            c.add(f"Query '{q.name}' sorts rows and writes to {', '.join(d.kind for d in q.destinations)}.", query=q.name, confidence="medium")


@rule(RuleMeta(
    "DFG-040", "Design-time row limit left in the query", "medium", "Reliability", "BP-C4", K.DOC_BP,
    "Hard-coded Table.FirstN/Table.Range limits used to keep previews small silently truncate production loads.",
    ["Replace hard-coded limits with a parameter (for example DesignDateFilter) whose value is widened for production runs.",
     "Use Schema view to design without loading data."],
    ["reliability"], "low"))
def _r040(c: Ctx):
    for q in c.queries():
        for s in q.steps:
            if any(f in s.calls for f in K.PREVIEW_LIMIT_OPS) and re.search(r",\s*\d{2,}\s*\)", s.text):
                c.add(f"Step '{s.name}' limits rows with a literal ({s.text.strip()[:80]}).", query=q.name, confidence="medium")
                break


@rule(RuleMeta(
    "DFG-041", "No parameter limits design-time data previews", "low", "Maintainability", "BP-C4", K.DOC_BP,
    "Large previews slow authoring. A parameter-driven date or ID filter (or Schema view) keeps the editor responsive.",
    ["Manage parameters > add e.g. DesignDateFilter (DateTime) and filter large tables by it.", "Switch to Schema view when only the structure is needed.",
     "Widen the parameter value before running in production."],
    ["speed"], "low"))
def _r041(c: Ctx):
    big = [q for q in c.queries() if set(q.families) & {"sql", "adls", "blob", "fabric_lakehouse", "fabric_warehouse", "odbc", "kql", "file", "sharepoint"}]
    if big and not any(q.role == "parameter" for q in c.df.queries.values()):
        c.add(f"{len(big)} source query(ies) and no parameter query in the dataflow.", confidence="low")


# --------------------------------------------------------------------------- gateway
@rule(RuleMeta(
    "DFG-050", "Gateway runs the whole dataflow, including transformations", "medium", "Architecture", "BP-C7", K.DOC_BP,
    "The gateway executes every transformation on the gateway machine. Keeping only data movement on the gateway reduces latency and capacity pressure.",
    ["Dataflow A (gateway): copy on-premises data to a Lakehouse/Warehouse, Fast Copy where supported, no transformations.",
     "Dataflow B (cloud, no gateway): read the landed data and apply transformations.",
     "Alternatively use a pipeline Copy activity/Copy job via the gateway for the movement step."],
    ["speed", "capacity", "reliability"], "medium"))
def _r050(c: Ctx):
    gw = c.df.metadata.get("gatewayObjectId")
    onprem = []
    for q in c.queries():
        for s in q.steps:
            if "Sql.Database" in s.calls or "Oracle.Database" in s.calls or "PostgreSQL.Database" in s.calls:
                host = (s.strings[0] if s.strings else "").lower()
                if host and not any(x in host for x in ("windows.net", "fabric.microsoft.com", "azure", "amazonaws", "snowflake")):
                    onprem.append(q.name)
    if gw or onprem:
        transforming = [q.name for q in c.queries() if q.source_calls and (c.has(q, K.HEAVY_OPS) or q.step_count >= 8) and not q.refs]
        if transforming:
            c.add(("gatewayObjectId set" if gw else "On-premises style host detected") + f"; queries mixing source + transformations: {', '.join(transforming)}.",
                  confidence="high" if gw else "low", severity="high" if gw and any(c.has(c.df.queries[n], K.HEAVY_OPS) for n in transforming) else "medium")


# --------------------------------------------------------------------------- destinations / incremental
@rule(RuleMeta(
    "DFG-060", "Full reload (Replace) of a source table on every refresh", "medium", "Capacity", "BP-C6", K.DOC_INCREMENTAL,
    "Re-reading and rewriting an unchanged history every run wastes ingestion time and CU. Incremental refresh processes only new/changed buckets.",
    ["Right-click the query > Incremental refresh; pick a Date/DateTime column, bucket size and window; make sure the query fully folds.",
     "Use a fixed-schema Lakehouse/Warehouse/Azure SQL destination with update method Replace.",
     "If the source cannot fold, use the incremental amassing pattern (tutorial) or a Copy job with watermark/CDC."],
    ["speed", "capacity"], "medium"))
def _r060(c: Ctx):
    for q in c.queries():
        if not q.destinations or c.is_incremental(q):
            continue
        replace = any(d.update_method in (None, "Replace") for d in q.destinations)
        if replace and q.source_calls and set(q.families) & {"sql", "adls", "blob", "fabric_lakehouse", "fabric_warehouse", "odbc", "kql", "odata", "saas"}:
            datey = bool(re.search(r"(?i)(date|time|modified|updated|created|timestamp)", " ".join(s.text for s in q.steps)))
            slow = (c.p50_min or 0) >= c.cfg.long_refresh_minutes
            c.add(f"Query '{q.name}' reloads fully into {', '.join(d.kind for d in q.destinations)}"
                  + (" and references date/time columns" if datey else "") + (f"; refresh p50 = {c.p50_min:.0f} min" if c.p50_min else "") + ".",
                  query=q.name, confidence="medium" if datey else "low", severity="high" if slow and datey else "medium" if datey or slow else "low")


@rule(RuleMeta(
    "DFG-061", "Append destination without a visible incremental/dedup pattern", "medium", "Reliability", "BP-C6", K.DOC_INCREMENTAL,
    "Appending each refresh without a filter on already-loaded data duplicates rows and grows tables unbounded, hurting both capacity and downstream performance.",
    ["Use native incremental refresh (Replace per bucket) instead of Append.",
     "If you must append, filter the source to rows newer than the max timestamp already in the destination, and deduplicate downstream."],
    ["capacity", "reliability"], "medium"))
def _r061(c: Ctx):
    for q in c.queries():
        if any(d.update_method == "Append" for d in q.destinations) and not c.is_incremental(q):
            reads_dest = any(f in q.calls for f in ("Lakehouse.Contents", "Fabric.Warehouse")) and q.source_calls and len(q.source_calls) > 1
            if not reads_dest:
                c.add(f"Query '{q.name}' appends without reading back the destination to bound the filter.", query=q.name, confidence="low", severity="low")


@rule(RuleMeta(
    "DFG-062", "Dynamic schema destination", "low", "Reliability", "BP-C6", K.DOC_INCREMENTAL,
    "Incremental refresh requires a fixed schema, and dynamic schema lets upstream column drift silently change destination tables.",
    ["Switch the destination mapping to fixed schema (manual mapping) where schema is stable."],
    ["reliability"], "low"))
def _r062(c: Ctx):
    for q in c.queries():
        if any(d.dynamic_schema for d in q.destinations):
            c.add(f"Query '{q.name}' uses DynamicSchema = true.", query=q.name, confidence="high",
                  severity="medium" if c.is_incremental(q) else "low")


@rule(RuleMeta(
    "DFG-063", "Incremental refresh configuration conflicts", "high", "Reliability", "IR", K.DOC_INCREMENTAL,
    "Incremental refresh needs a fully folding query, a Lakehouse/Warehouse/Azure SQL destination with fixed schema and update method Replace; default destinations are unsupported.",
    ["Fix the destination (explicit, fixed schema, Replace).", "Ensure the query folds; otherwise stage + reference or change source.",
     "Keep buckets <= 50 per query and 150 per dataflow; avoid other writers/OPTIMIZE on the Lakehouse table; use gateway >= 3000.270."],
    ["reliability"], "medium"))
def _r063(c: Ctx):
    for q in c.queries():
        if not c.is_incremental(q):
            continue
        for d in q.destinations:
            if d.kind not in ("lakehouse", "warehouse", "azure_sql"):
                c.add(f"'{q.name}' is incremental but writes to unsupported destination '{d.kind}'.", query=q.name, confidence="medium")
            if d.update_method == "Append":
                c.add(f"'{q.name}' is incremental but uses Append (only Replace is supported).", query=q.name, confidence="high")
            if d.dynamic_schema:
                c.add(f"'{q.name}' is incremental with a dynamic-schema destination.", query=q.name, confidence="high")
        if q.can_fold is False or c.has(q, K.FOLD_BREAKERS):
            c.add(f"'{q.name}' is incremental but does not appear to fold.", query=q.name, confidence="low")
        if c.df.settings.get("_default_destination_query"):
            c.add("A default destination is configured; incremental refresh needs explicit destinations.", query=q.name, confidence="medium", severity="medium")


@rule(RuleMeta(
    "DFG-067", "Unused query", "low", "Maintainability", "BP-KA2", K.DOC_PQ_BP,
    "Queries that are not loaded, not staged and not referenced add clutter and validation time and confuse ownership.",
    ["Delete the query or document why it is kept."],
    [], "low"))
def _r067(c: Ctx):
    for q in c.queries():
        if q.staged is False and not q.destinations and not q.referenced_by:
            c.add(f"Query '{q.name}' is not loaded, has no destination and is not referenced.", query=q.name, confidence="high")


@rule(RuleMeta(
    "DFG-069", "Too many queries in one dataflow", "medium", "Architecture", "BP-C2", K.DOC_BP,
    "Large dataflows have a big blast radius, validate/publish slowly, and cannot be scheduled or scaled independently.",
    ["Split by layer: ingestion dataflow(s) landing to Lakehouse/Warehouse, transformation dataflow(s) reading that data.",
     "Orchestrate the pieces with a Data Pipeline (Dataflow activity) and pass parameters between them."],
    ["speed", "reliability"], "medium"))
def _r069(c: Ctx):
    n = len(c.queries())
    if n >= c.cfg.many_queries:
        c.add(f"{n} queries in a single dataflow (threshold {c.cfg.many_queries}).", confidence="high")


# --------------------------------------------------------------------------- telemetry rules
@rule(RuleMeta(
    "DFG-090", "High refresh failure rate", "high", "Reliability", "OPS", K.DOC_BP,
    "Failing refreshes waste capacity (billed compute up to the failure) and leave consumers with stale data.",
    ["Review the top failure classes below and apply the matching fix.", "Add alerting on refresh failure and retry in the orchestrating pipeline."],
    ["capacity", "reliability"], "medium", needs_telemetry=True))
def _r090(c: Ctx):
    s = c.stats
    if s.get("runs", 0) >= 3 and s.get("failure_rate") is not None:
        fr = s["failure_rate"]
        if fr >= c.cfg.failure_rate_warn:
            reasons = "; ".join(f"{k} x{v}" for k, v in (s.get("failure_classes") or {}).items())
            hints = [FAILURE_HINTS[k] for k in (s.get("failure_classes") or {}) if k in FAILURE_HINTS]
            c.add(f"{fr:.0%} of {s['runs']} runs failed in the last {c.cfg.history_days} days" + (f" ({reasons})" if reasons else "") + ".",
                  severity="high" if fr >= c.cfg.failure_rate_high else "medium", confidence="high", remediation=hints or None)


FAILURE_HINTS = {
    "fast-copy": "Fast Copy failure: remove unsupported transformations from the Fast Copy query or disable 'Require Fast Copy'; stage and reference instead.",
    "timeout": "Timeout: split the dataflow, stage heavy steps, enable incremental refresh or move the workload to Spark/Copy job.",
    "throttling": "Capacity throttling: stagger schedules, enable smoothing-friendly incremental loads and review capacity SKU in the Metrics app.",
    "gateway": "Gateway: update the gateway (>= 3000.270 for incremental Lakehouse), split movement from transformation, check gateway CPU/memory.",
    "memory": "Out of memory: remove Table.Buffer, stage intermediate results, enable Modern Evaluator, reduce columns/rows early.",
    "auth": "Credential/privacy errors: re-bind connections, review privacy levels and 'Allow combining data from multiple sources'.",
    "schema": "Schema/destination mismatch: use fixed schema mappings and refresh the destination mapping after source changes.",
}


@rule(RuleMeta(
    "DFG-091", "Refresh duration is regressing", "medium", "Performance", "OPS", K.DOC_BP,
    "Growing refresh time usually signals growing data volume with full reloads, a lost fold, or a source/gateway bottleneck.",
    ["Check whether a recent edit broke folding or Fast Copy (Engine column in refresh history).", "Adopt incremental refresh for growing fact tables."],
    ["speed", "capacity"], "medium", needs_telemetry=True))
def _r091(c: Ctx):
    s = c.stats
    if s.get("duration_trend_pct") is not None and s["duration_trend_pct"] >= c.cfg.duration_regression_pct and s.get("completed", 0) >= c.cfg.min_runs_for_trends:
        c.add(f"Median duration of the most recent runs is {s['duration_trend_pct']:.0f}% higher than earlier runs.", confidence="medium")


@rule(RuleMeta(
    "DFG-092", "Long-running refresh", "medium", "Performance", "OPS", K.DOC_DECISION,
    "Very long Dataflow Gen2 refreshes are a signal to re-evaluate the engine: Copy job for movement, Spark for heavy transformation.",
    ["Apply the staging / Fast Copy / incremental findings first.", "If still long, follow the engine recommendation in the Alternatives section."],
    ["speed", "capacity"], "high", needs_telemetry=True))
def _r092(c: Ctx):
    p50 = c.p50_min
    if p50 is None:
        return
    if p50 >= c.cfg.very_long_refresh_minutes:
        c.add(f"Median refresh time is {p50:.0f} minutes.", severity="high", confidence="high")
    elif p50 >= c.cfg.long_refresh_minutes:
        c.add(f"Median refresh time is {p50:.0f} minutes.", severity="medium", confidence="high")


@rule(RuleMeta(
    "DFG-093", "Frequent full refresh schedule", "medium", "Capacity", "OPS", K.DOC_PRICING,
    "Each run is billed for every mashup query at 12 CU/s for its first 10 minutes. Refreshing a full-reload dataflow every few minutes multiplies that cost.",
    ["Switch to incremental refresh so each run only processes new buckets.", "Reduce frequency to the business SLA, or use Copy job incremental / Eventstream for near-real-time needs."],
    ["capacity"], "medium", needs_telemetry=True))
def _r093(c: Ctx):
    mins = c.stats.get("min_schedule_interval_min")
    if mins is not None and mins <= c.cfg.frequent_schedule_minutes:
        if not any(c.is_incremental(q) for q in c.queries()):
            c.add(f"Scheduled every {mins:.0f} minutes without incremental refresh.", confidence="medium")


@rule(RuleMeta(
    "DFG-094", "Dataflow has no recent refreshes", "low", "Maintainability", "OPS", K.DOC_BP,
    "Unused dataflows still occupy the workspace, schedules or connections and confuse ownership.",
    ["Confirm ownership, then delete or archive the dataflow."],
    [], "low", needs_telemetry=True))
def _r094(c: Ctx):
    if c.stats.get("history_loaded") and c.stats.get("runs", 0) == 0:
        c.add(f"No refresh in the last {c.cfg.history_days} days.", confidence="medium")


FAILURE_PATTERNS = [
    ("fast-copy", r"fast ?copy"),
    ("timeout", r"time(d)? ?out|exceeded the maximum"),
    ("throttling", r"throttl|429|too many requests|capacity"),
    ("gateway", r"gateway"),
    ("memory", r"out of memory|memory"),
    ("auth", r"credential|authenticat|unauthori|privacy|permission|forbidden|401|403"),
    ("schema", r"column|schema|destination"),
]


def classify_failure(text: str) -> str:
    t = (text or "").lower()
    for name, pat in FAILURE_PATTERNS:
        if re.search(pat, t):
            return name
    return "other"


def run_rules(df: DataflowModel, cfg: Config, stats: Optional[dict] = None) -> List[Finding]:
    ctx = Ctx(df, cfg, stats)
    for rid, fn in _IMPL.items():
        if rid in cfg.suppress_rules:
            continue
        meta = RULES[rid]
        if meta.needs_telemetry and not stats:
            continue
        if not df.definition_available and rid not in ("DFG-000", "DFG-008") and not meta.needs_telemetry:
            continue
        ctx._cur = meta
        fn(ctx)
    return ctx.findings
