"""Orchestration: load -> analyse -> score."""
from __future__ import annotations

from collections import defaultdict
from typing import Callable, Dict, List, Optional

from . import knowledge as K
from .advisor import advise, recommendations_to_findings
from .builder import model_from_legacy_json, model_from_parts
from .fabric_api import ApiError, FabricClient
from .models import SEV_PENALTY, SEV_RANK, Config, DataflowModel, DataflowResult, Finding
from .rules import RULES, RuleMeta, run_rules
from .telemetry import analyze_runs, estimate_cost

RULES["DFG-095"] = RuleMeta(
    "DFG-095", "Many dataflows start at the same minute", "low", "Capacity", "OPS", K.DOC_PRICING,
    "Concurrent starts spike capacity utilisation and can trigger throttling even when total daily CU is fine.",
    ["Stagger schedules by a few minutes (for example 02:00, 02:07, 02:15).", "Chain dependent dataflows with a Data Pipeline instead of parallel schedules."],
    ["capacity", "reliability"], "low", needs_telemetry=True)

CONF_WEIGHT = {"high": 1.0, "medium": 0.8, "low": 0.5}


def grade(score: int) -> str:
    return "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 55 else "F"


def score_findings(findings: List[Finding]) -> int:
    per_rule: Dict[str, int] = defaultdict(int)
    total = 0.0
    for f in sorted(findings, key=lambda x: SEV_RANK[x.severity]):
        if per_rule[f.rule_id] >= 2:
            continue
        per_rule[f.rule_id] += 1
        total += SEV_PENALTY[f.severity] * CONF_WEIGHT.get(f.confidence, 0.8)
    return max(0, int(round(100 - total)))


def analyze(df: DataflowModel, cfg: Config) -> DataflowResult:
    stats = analyze_runs(df.runs, df.schedules, cfg, history_loaded=True) if df.history_loaded else {}
    findings = run_rules(df, cfg, stats or None)
    recs = advise(df, cfg, stats)
    findings += recommendations_to_findings(df, recs)
    findings = [f for f in findings if f.rule_id not in cfg.suppress_rules]
    findings.sort(key=lambda f: (SEV_RANK[f.severity], {"high": 0, "medium": 1, "low": 2}.get(f.confidence, 1), f.rule_id))
    if not df.definition_available:
        return DataflowResult(model=df, findings=findings, recommendations=[], score=None, grade="N/A",
                              telemetry=stats, cost=estimate_cost(False, stats))
    score = score_findings(findings)
    return DataflowResult(model=df, findings=findings, recommendations=recs, score=score, grade=grade(score),
                          telemetry=stats, cost=estimate_cost(df.fmt == "legacy", stats))


def _slots(schedules: List[dict]) -> List[str]:
    out: List[str] = []
    for s in schedules or []:
        if not s.get("enabled", True):
            continue
        c = s.get("configuration", {})
        if c.get("type") in ("Daily", "Weekly"):
            out += [t for t in c.get("times", [])]
        elif c.get("type") == "Cron" and c.get("startDateTime"):
            out.append(c["startDateTime"][11:16])
    return out


def analyze_all(models: List[DataflowModel], cfg: Config) -> List[DataflowResult]:
    results = [analyze(m, cfg) for m in models]
    if "DFG-095" in cfg.suppress_rules:
        return results
    groups: Dict[tuple, List[DataflowResult]] = defaultdict(list)
    for r in results:
        for slot in set(_slots(r.model.schedules)):
            groups[(r.model.workspace_id, slot)].append(r)
    meta = RULES["DFG-095"]
    for (_ws, slot), rs in groups.items():
        if len(rs) >= 4:
            for r in rs:
                r.findings.append(Finding(
                    rule_id=meta.id, title=meta.title, severity=meta.severity, category=meta.category, dataflow=r.model.name, query=None,
                    evidence=f"{len(rs)} dataflows in this workspace are scheduled at {slot}: {', '.join(x.model.name for x in rs[:8])}.",
                    why=meta.why, remediation=meta.remediation, reference=meta.reference, confidence="medium", impact=list(meta.impact), effort=meta.effort))
                if r.score is not None:
                    r.score = score_findings(r.findings)
                    r.grade = grade(r.score)
    return results


# --------------------------------------------------------------------------- live collection
def collect_live(client: FabricClient, workspace_refs: List[str], cfg: Config, name_filter: Optional[str] = None,
                 with_history: bool = True, include_legacy: bool = False, log: Callable[[str], None] = print) -> List[DataflowModel]:
    workspaces = client.list_workspaces() if not workspace_refs else [client.resolve_workspace(w) for w in workspace_refs]
    models: List[DataflowModel] = []
    for ws in workspaces:
        try:
            items = client.list_dataflows(ws["id"])
        except ApiError as e:
            log(f"  ! {ws['displayName']}: cannot list dataflows ({e.status})")
            continue
        for it in items:
            if name_filter and name_filter.lower() not in it["displayName"].lower():
                continue
            log(f"  - {ws['displayName']} / {it['displayName']}")
            try:
                d = client.get_definition(ws["id"], it["id"])
                m = model_from_parts(d["definition"]["parts"], df_id=it["id"], name=it["displayName"],
                                     source=f"fabric://{ws['id']}/{it['id']}", workspace_id=ws["id"], workspace_name=ws["displayName"])
                m.name = it["displayName"]
            except (ApiError, KeyError) as e:
                from .builder import build_model
                m = build_model(df_id=it["id"], name=it["displayName"], mashup_text="", source=f"fabric://{ws['id']}/{it['id']}",
                                workspace_id=ws["id"], workspace_name=ws["displayName"])
                m.definition_available = False
                m.definition_error = str(e)
                log(f"    ! definition unavailable: {e}")
            if with_history:
                try:
                    m.runs = client.list_job_instances(ws["id"], it["id"], days=cfg.history_days)
                    m.schedules = client.list_schedules(ws["id"], it["id"])
                    m.history_loaded = True
                except ApiError as e:
                    m.history_error = str(e)
            models.append(m)
        if include_legacy:
            try:
                for ld in client.list_legacy_dataflows(ws["id"]):
                    if name_filter and name_filter.lower() not in ld.get("name", "").lower():
                        continue
                    doc = client.get_legacy_dataflow(ws["id"], ld["objectId"])
                    m = model_from_legacy_json(doc, df_id=ld["objectId"], source=f"powerbi://{ws['id']}/{ld['objectId']}",
                                               workspace_id=ws["id"], workspace_name=ws["displayName"])
                    models.append(m)
                    log(f"  - {ws['displayName']} / {m.name} (legacy)")
            except ApiError as e:
                log(f"  ! legacy dataflow listing failed for {ws['displayName']}: {e.status}")
    return models
