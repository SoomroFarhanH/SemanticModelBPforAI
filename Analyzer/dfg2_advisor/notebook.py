"""Helpers for running the advisor from a Fabric notebook (or any Python session)."""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

from .builder import load_path
from .engine import analyze_all, collect_live
from .fabric_api import FabricClient
from .models import Config, DataflowResult
from .report import quick_wins, write_all


def default_out_dir() -> str:
    """Default lakehouse Files folder when a default lakehouse is attached, otherwise ./reports."""
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = "/lakehouse/default/Files/dfg2_reports"
    if os.path.isdir("/lakehouse/default/Files"):
        return f"{base}/{stamp}"
    return os.path.join("reports", stamp)


def run(
    workspaces: Optional[Sequence[str]] = None,
    *,
    all_workspaces: bool = False,
    dataflow: Optional[str] = None,
    paths: Optional[Sequence[str]] = None,
    history_days: int = 30,
    include_legacy: bool = False,
    with_history: bool = True,
    config: Union[None, str, Config] = None,
    out_dir: Optional[str] = None,
    formats: Iterable[str] = ("html", "md", "json", "csv"),
    client: Optional[FabricClient] = None,
    log=print,
) -> Dict[str, Any]:
    """Scan workspaces and/or exported definitions and write the reports.

    Returns {"results": [...], "paths": {format: file}, "out_dir": str}.
    """
    cfg = config if isinstance(config, Config) else Config.load(config)
    cfg.history_days = history_days
    models = []
    for p in paths or []:
        models.extend(load_path(p))
    if workspaces or all_workspaces:
        models.extend(collect_live(client or FabricClient(), list(workspaces or []), cfg, name_filter=dataflow,
                                   with_history=with_history, include_legacy=include_legacy, log=log))
    if not models:
        raise ValueError("No dataflows found: pass workspaces=[...], all_workspaces=True or paths=[...]")
    results = analyze_all(models, cfg)
    out = out_dir or default_out_dir()
    written = write_all(results, out, list(formats))
    return {"results": results, "paths": dict(zip(formats, written)), "out_dir": out}


def scorecard_rows(results: List[DataflowResult]) -> List[Dict[str, Any]]:
    rows = []
    for r in results:
        t = r.telemetry or {}
        rec = next((x for x in r.recommendations if x.verdict == "recommended"), None)
        rows.append({
            "workspace": r.model.workspace_name, "dataflow": r.model.name, "score": r.score, "grade": r.grade,
            "critical_high": sum(1 for f in r.findings if f.severity in ("critical", "high")),
            "medium": sum(1 for f in r.findings if f.severity == "medium"),
            "refresh_p50_min": round(t["p50_s"] / 60, 1) if t.get("p50_s") is not None else None,
            "failure_rate": round(t["failure_rate"], 3) if t.get("failure_rate") is not None else None,
            "est_cu_hours_per_month": (r.cost or {}).get("cu_hours_per_month_est"),
            "suggested_engine": rec.engine if rec else None,
            "top_fixes": "; ".join(f"[{f.rule_id}] {f.title}" for f in quick_wins(r, 3)),
        })
    return rows


def findings_rows(results: List[DataflowResult]) -> List[Dict[str, Any]]:
    rows = []
    for r in results:
        for f in r.findings:
            rows.append({
                "workspace": r.model.workspace_name, "dataflow": f.dataflow, "query": f.query, "rule_id": f.rule_id,
                "severity": f.severity, "confidence": f.confidence, "category": f.category, "effort": f.effort,
                "impact": ",".join(f.impact), "title": f.title, "evidence": f.evidence,
                "remediation": " | ".join(f.remediation), "reference": f.reference,
            })
    return rows
