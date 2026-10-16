"""HTML / Markdown / JSON / CSV report writers."""
from __future__ import annotations

import csv
import html
import io
import json
import os
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List

from . import knowledge as K
from typing import Any, Dict, List

from . import knowledge as K
from .coverage import DECISION_GUIDE_ITEMS, coverage_matrix, manual_checklist
from .models import SEV_RANK, SEVERITIES, DataflowResult, Finding
from .rules import RULES

SEV_COLOR = {"critical": "#8b0000", "high": "#d9480f", "medium": "#e8a400", "low": "#2b7bb9", "info": "#6c757d"}
EFFORT_RANK = {"low": 0, "medium": 1, "high": 2}


def quick_wins(r: DataflowResult, limit: int = 8) -> List[Finding]:
    cand = [f for f in r.findings if f.severity in ("critical", "high", "medium") and f.rule_id.startswith("DFG")]
    cand.sort(key=lambda f: (EFFORT_RANK[f.effort], SEV_RANK[f.severity]))
    seen, out = set(), []
    for f in cand:
        if f.rule_id in seen:
            continue
        seen.add(f.rule_id)
        out.append(f)
    return out[:limit]


def summarize(results: List[DataflowResult]) -> Dict[str, Any]:
    sev = Counter(f.severity for r in results for f in r.findings)
    cats = Counter(f.category for r in results for f in r.findings)
    rules = Counter(f.rule_id for r in results for f in r.findings)
    cu = sum(r.cost.get("cu_seconds_per_month_est", 0) for r in results)
    scored = [r.score for r in results if r.score is not None]
    return {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dataflows": len(results),
        "average_score": round(sum(scored) / len(scored), 1) if scored else None,
        "not_assessed": sum(1 for r in results if r.score is None),
        "severity_counts": {s: sev.get(s, 0) for s in SEVERITIES},
        "category_counts": dict(cats),
        "top_rules": [{"rule": k, "title": RULES[k].title if k in RULES else k, "count": v} for k, v in rules.most_common(10)],
        "estimated_cu_seconds_per_month": cu or None,
    }


def result_dict(r: DataflowResult) -> Dict[str, Any]:
    m = r.model
    return {
        "name": m.name, "workspace": m.workspace_name, "workspaceId": m.workspace_id, "id": m.id, "format": m.fmt, "source": m.source,
        "score": r.score, "grade": r.grade,
        "settings": {k: v for k, v in m.settings.items() if not k.startswith("_")},
        "queries": [
            {"name": q.name, "role": q.role, "steps": q.step_count, "staged": q.staged, "sources": q.source_calls, "families": q.families,
             "canFold": q.can_fold, "fastCopyConnector": q.fast_copy_connector, "referencedBy": q.referenced_by,
             "destinations": [d.__dict__ for d in q.destinations]}
            for q in m.queries.values()
        ],
        "quickWins": [f.rule_id for f in quick_wins(r)],
        "findings": [f.to_dict() for f in r.findings],
        "recommendations": [x.__dict__ for x in r.recommendations],
        "telemetry": r.telemetry, "cost": r.cost, "historyError": m.history_error,
    }


def write_json(results: List[DataflowResult], path: str) -> None:
    doc = {"summary": summarize(results), "dataflows": [result_dict(r) for r in results],
           "coverage": coverage_matrix(), "decisionGuideItems": [{"item": a, "handledBy": b, "rules": c} for a, b, c in DECISION_GUIDE_ITEMS],
           "manualChecklist": manual_checklist()}
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, default=str)


def write_csv(results: List[DataflowResult], path: str) -> None:
    cols = ["workspace", "dataflow", "query", "rule_id", "severity", "confidence", "category", "effort", "impact", "title", "evidence", "remediation", "reference"]
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for r in results:
            for f in r.findings:
                w.writerow([r.model.workspace_name, f.dataflow, f.query or "", f.rule_id, f.severity, f.confidence, f.category, f.effort,
                            "|".join(f.impact), f.title, f.evidence, " || ".join(f.remediation), f.reference])


# --------------------------------------------------------------------------- Markdown
def write_markdown(results: List[DataflowResult], path: str) -> None:
    s = summarize(results)
    o = io.StringIO()
    o.write("# Dataflow Gen2 Best-Practice Review\n\n")
    o.write(f"Generated {s['generated_utc']} - {s['dataflows']} dataflow(s) - average score **{s['average_score']}**\n\n")
    o.write("Sources: [Dataflow Gen2 performance best practices](%s), [Decision guide](%s)\n\n" % (K.DOC_BP, K.DOC_DECISION))
    o.write("| Severity | Findings |\n|---|---|\n")
    for sev in SEVERITIES:
        o.write(f"| {sev} | {s['severity_counts'][sev]} |\n")
    o.write("\n## Scorecard\n\n| Workspace | Dataflow | Score | Grade | Critical/High | Medium | Recommended engine |\n|---|---|---|---|---|---|---|\n")
    for r in results:
        ch = sum(1 for f in r.findings if f.severity in ("critical", "high"))
        md = sum(1 for f in r.findings if f.severity == "medium")
        rec = next((x.engine for x in r.recommendations if x.verdict == "recommended"), r.recommendations[0].engine if r.recommendations else "-")
        o.write(f"| {r.model.workspace_name or '-'} | {r.model.name} | {_sc(r)} | {r.grade} | {ch} | {md} | {rec} |\n")
    for r in results:
        o.write(f"\n---\n\n## {r.model.name}  (score {_sc(r)}, grade {r.grade})\n\n")
        if r.model.workspace_name:
            o.write(f"Workspace: {r.model.workspace_name}  \n")
        o.write(f"Format: {r.model.fmt}; queries: {len(r.model.real_queries())}\n\n")
        qw = quick_wins(r)
        if qw:
            o.write("### Prioritised remediation plan (quick wins first)\n\n")
            for i, f in enumerate(qw, 1):
                o.write(f"{i}. **[{f.rule_id}] {f.title}** ({f.severity}, effort {f.effort}) - {f.remediation[0]}\n")
            o.write("\n")
        if r.telemetry:
            t = r.telemetry
            o.write("### Refresh telemetry\n\n")
            o.write(f"- Runs: {t.get('runs')} (failed {t.get('failed')}, failure rate {t.get('failure_rate') if t.get('failure_rate') is None else format(t['failure_rate'], '.0%')})\n")
            if t.get("p50_s") is not None:
                o.write(f"- Duration p50 {t['p50_s'] / 60:.1f} min, p95 {t['p95_s'] / 60:.1f} min, max {t['max_s'] / 60:.1f} min\n")
            if r.cost:
                o.write(f"- Indicative cost: {r.cost.get('cu_seconds_per_run_p50')} CU-s/run ({r.cost.get('basis')})\n")
            o.write("\n")
        o.write("### Findings\n\n")
        if not r.findings:
            o.write("No findings.\n")
        for f in r.findings:
            o.write(f"#### [{f.rule_id}] {f.title}\n\n- Severity: **{f.severity}** | Confidence: {f.confidence} | Category: {f.category} | Effort: {f.effort} | Impact: {', '.join(f.impact) or '-'}\n")
            if f.query:
                o.write(f"- Query: `{f.query}`\n")
            o.write(f"- Evidence: {f.evidence}\n- Why it matters: {f.why}\n- Remediation:\n")
            for step in f.remediation:
                o.write(f"  1. {step}\n")
            if f.snippet:
                o.write(f"\n```\n{f.snippet}\n```\n")
            o.write(f"- Reference: {f.reference}\n\n")
        o.write("### Alternative engines (decision guide)\n\n")
        for x in r.recommendations:
            o.write(f"#### {x.engine} - {x.verdict} (confidence {x.confidence})\n\n")
            for k, label in (("rationale", "Why"), ("benefits", "Benefits"), ("tradeoffs", "Trade-offs"), ("migration_steps", "How to try it")):
                o.write(f"**{label}**\n\n")
                for line in getattr(x, k):
                    o.write(f"- {line}\n")
                o.write("\n")
    o.write("\n---\n\n## Coverage of the Microsoft guidance\n\n| Section | Source | Status | Rules |\n|---|---|---|---|\n")
    for c in coverage_matrix():
        o.write(f"| [{c['title']}]({c['url']}) | {c['source']} | {c['status']} | {', '.join(c['rules']) or '-'} |\n")
    o.write("\n### Decision-guide items\n\n| Item | Handled by |\n|---|---|\n")
    for a, b, _c in DECISION_GUIDE_ITEMS:
        o.write(f"| {a} | {b} |\n")
    o.write("\n### Manual verification checklist (cannot be inferred from the definition)\n\n")
    for m in manual_checklist():
        o.write(f"- [ ] {m}\n")
    o.write("\n### Dataflow Gen2 CU rate card\n\n- Standard Compute (CI/CD): 12 CU/s for the first 10 minutes of each query, then 1.5 CU/s\n- Standard Compute (non CI/CD): 16 CU/s\n- High Scale (staging) compute: 6 CU/s\n- Fast Copy: 1.5 CU/s of aggregate core time\n")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(o.getvalue())


# --------------------------------------------------------------------------- HTML
def _e(x: Any) -> str:
    return html.escape(str(x), quote=True)


CSS = """
:root{--b:#0f6cbd;--bg:#f5f6f8;--card:#fff;--tx:#1b1f24;--mut:#5d6672}
*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:var(--bg);color:var(--tx)}
header{background:#0b2a4a;color:#fff;padding:20px 32px}header h1{margin:0 0 4px;font-size:22px}header p{margin:0;color:#c8d6e5;font-size:13px}
main{padding:20px 32px;max-width:1280px;margin:auto}.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.card{background:var(--card);border-radius:8px;padding:14px 18px;min-width:150px;box-shadow:0 1px 3px #0002}.card b{display:block;font-size:26px}
.card span{color:var(--mut);font-size:12px}table{border-collapse:collapse;width:100%;background:var(--card);border-radius:8px;overflow:hidden;box-shadow:0 1px 3px #0002;margin-bottom:18px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #e6e8eb;font-size:13px;vertical-align:top}th{background:#eef2f6}
.badge{display:inline-block;color:#fff;border-radius:10px;padding:1px 9px;font-size:11px;font-weight:600;text-transform:uppercase}
.grade{display:inline-block;width:28px;text-align:center;border-radius:4px;color:#fff;font-weight:700}
details{background:var(--card);border-radius:8px;margin-bottom:12px;box-shadow:0 1px 3px #0002}details>summary{padding:12px 16px;cursor:pointer;font-weight:600}
.body{padding:4px 18px 14px}.finding{border-left:4px solid #999;padding:8px 12px;margin:10px 0;background:#fafbfc}
.finding h4{margin:0 0 4px;font-size:14px}.meta{color:var(--mut);font-size:12px;margin-bottom:4px}
pre{background:#101820;color:#e6edf3;padding:10px;border-radius:6px;overflow:auto;font-size:12px}
.rec{border:1px solid #d5dbe2;border-radius:8px;padding:10px 14px;margin:10px 0}.rec h4{margin:0 0 6px}
.tag{background:#e9eef5;border-radius:4px;padding:1px 6px;font-size:11px;margin-right:4px}
.filters{margin:10px 0;font-size:13px}.filters label{margin-right:12px}input[type=search]{padding:5px 8px;width:260px}
h2{margin-top:28px}a{color:var(--b)}ul,ol{margin:4px 0 4px 18px;padding:0}.small{font-size:12px;color:var(--mut)}
"""

JS = """
function applyFilter(){
 var sev={};document.querySelectorAll('.sevf').forEach(function(c){sev[c.value]=c.checked});
 var q=document.getElementById('q').value.toLowerCase();
 document.querySelectorAll('.finding').forEach(function(f){
  var ok=sev[f.dataset.sev]&&(!q||f.textContent.toLowerCase().indexOf(q)>=0);f.style.display=ok?'':'none';});
}
document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.sevf,#q').forEach(function(c){c.addEventListener('input',applyFilter)})});
"""

GRADE_COLOR = {"A": "#2e7d32", "B": "#689f38", "C": "#f9a825", "D": "#ef6c00", "F": "#c62828", "N/A": "#6c757d"}


def _sc(r: DataflowResult) -> str:
    return "n/a" if r.score is None else str(r.score)


def _badge(sev: str) -> str:
    return f'<span class="badge" style="background:{SEV_COLOR[sev]}">{sev}</span>'


def _finding_html(f: Finding) -> str:
    steps = "".join(f"<li>{_e(s)}</li>" for s in f.remediation)
    snippet = f"<pre>{_e(f.snippet)}</pre>" if f.snippet else ""
    return (f'<div class="finding" data-sev="{f.severity}" style="border-left-color:{SEV_COLOR[f.severity]}">'
            f'<h4>{_badge(f.severity)} [{_e(f.rule_id)}] {_e(f.title)}</h4>'
            f'<div class="meta">{_e(f.category)} &middot; confidence {_e(f.confidence)} &middot; effort {_e(f.effort)} &middot; impact: {_e(", ".join(f.impact) or "-")}'
            + (f' &middot; query <code>{_e(f.query)}</code>' if f.query else "") + "</div>"
            f"<div><b>Evidence:</b> {_e(f.evidence)}</div><div><b>Why:</b> {_e(f.why)}</div>"
            f"<div><b>Remediation:</b><ol>{steps}</ol></div>{snippet}"
            f'<div class="small"><a href="{_e(f.reference)}" target="_blank" rel="noopener">Microsoft guidance</a></div></div>')


def write_html(results: List[DataflowResult], path: str) -> None:
    s = summarize(results)
    o = io.StringIO()
    o.write(f"<!doctype html><html><head><meta charset='utf-8'><title>Dataflow Gen2 Best-Practice Review</title><style>{CSS}</style></head><body>")
    o.write(f"<header><h1>Dataflow Gen2 Best-Practice Review</h1><p>Generated {_e(s['generated_utc'])} &middot; checked against "
            f"<a style='color:#9cd2ff' href='{K.DOC_BP}'>performance best practices</a> and the "
            f"<a style='color:#9cd2ff' href='{K.DOC_DECISION}'>copy / dataflow / Spark decision guide</a></p></header><main>")
    o.write("<div class='cards'>")
    o.write(f"<div class='card'><b>{s['dataflows']}</b><span>dataflows</span></div><div class='card'><b>{_e(s['average_score'])}</b><span>average score</span></div>")
    if s["not_assessed"]:
        o.write(f"<div class='card'><b>{s['not_assessed']}</b><span>not assessed (definition unreadable)</span></div>")
    for sev in SEVERITIES[:4]:
        o.write(f"<div class='card'><b style='color:{SEV_COLOR[sev]}'>{s['severity_counts'][sev]}</b><span>{sev}</span></div>")
    if s["estimated_cu_seconds_per_month"]:
        o.write(f"<div class='card'><b>{s['estimated_cu_seconds_per_month'] / 3600:,.0f}</b><span>est. CU-hours / month (indicative)</span></div>")
    o.write("</div><h2>Scorecard</h2><table><tr><th>Workspace</th><th>Dataflow</th><th>Score</th><th>Grade</th><th>Crit/High</th><th>Medium</th><th>p50 refresh</th><th>Suggested engine</th></tr>")
    for r in results:
        ch = sum(1 for f in r.findings if f.severity in ("critical", "high"))
        md = sum(1 for f in r.findings if f.severity == "medium")
        p50 = f"{r.telemetry['p50_s'] / 60:.1f} min" if r.telemetry.get("p50_s") is not None else "-"
        rec = next((x for x in r.recommendations if x.verdict == "recommended"), r.recommendations[0] if r.recommendations else None)
        o.write(f"<tr><td>{_e(r.model.workspace_name or '-')}</td><td>{_e(r.model.name)}</td><td>{_sc(r)}</td>"
                f"<td><span class='grade' style='background:{GRADE_COLOR[r.grade]}'>{r.grade}</span></td><td>{ch}</td><td>{md}</td><td>{p50}</td>"
                f"<td>{_e(rec.engine) + ' (' + _e(rec.verdict) + ')' if rec else '-'}</td></tr>")
    o.write("</table>")
    o.write("<div class='filters'><b>Filter findings:</b> " + "".join(f"<label><input type='checkbox' class='sevf' value='{x}' checked> {x}</label>" for x in SEVERITIES)
            + " <input type='search' id='q' placeholder='search text, rule id, query...'></div>")
    for r in results:
        m = r.model
        o.write(f"<details {'open' if len(results) == 1 else ''}><summary><span class='grade' style='background:{GRADE_COLOR[r.grade]}'>{r.grade}</span> "
                f"{_e(m.name)} &mdash; score {_sc(r)} &middot; {len(r.findings)} finding(s)</summary><div class='body'>")
        o.write(f"<div class='small'>Workspace: {_e(m.workspace_name or '-')} &middot; format: {_e(m.fmt)} &middot; queries: {len(m.real_queries())}"
                f" &middot; source: {_e(m.source or '-')}</div>")
        qw = quick_wins(r)
        if qw:
            o.write("<h3>Prioritised remediation plan</h3><ol>" + "".join(
                f"<li><b>[{_e(f.rule_id)}] {_e(f.title)}</b> <span class='tag'>{_e(f.severity)}</span><span class='tag'>effort {_e(f.effort)}</span> &mdash; {_e(f.remediation[0])}</li>" for f in qw) + "</ol>")
        if r.telemetry:
            t = r.telemetry
            fr = "-" if t.get("failure_rate") is None else f"{t['failure_rate']:.0%}"
            o.write(f"<h3>Refresh telemetry</h3><p class='small'>runs {t.get('runs')} &middot; failed {t.get('failed')} (rate {fr})"
                    + (f" &middot; p50 {t['p50_s'] / 60:.1f} min &middot; p95 {t['p95_s'] / 60:.1f} min &middot; max {t['max_s'] / 60:.1f} min" if t.get("p50_s") is not None else "")
                    + (f" &middot; min schedule interval {t['min_schedule_interval_min']:.0f} min" if t.get("min_schedule_interval_min") else "") + "</p>")
            if r.cost:
                o.write(f"<p class='small'>Indicative Standard Compute: {r.cost.get('cu_seconds_per_run_p50'):,} CU-s per run"
                        + (f", ~{r.cost['cu_hours_per_month_est']:,} CU-h/month" if r.cost.get("cu_hours_per_month_est") else "") + f" ({_e(r.cost.get('basis'))}).</p>")
        elif m.history_error:
            o.write(f"<p class='small'>Refresh history unavailable: {_e(m.history_error)}</p>")
        o.write("<h3>Findings</h3>")
        o.write("".join(_finding_html(f) for f in r.findings) or "<p>No findings.</p>")
        o.write("<h3>Alternative engines (decision guide)</h3>")
        for x in r.recommendations:
            lis = lambda items: "<ul>" + "".join(f"<li>{_e(i)}</li>" for i in items) + "</ul>"  # noqa: E731
            o.write(f"<div class='rec'><h4>{_e(x.engine)} <span class='tag'>{_e(x.verdict)}</span><span class='tag'>confidence {_e(x.confidence)}</span></h4>"
                    f"<b>Why</b>{lis(x.rationale)}<b>Benefits</b>{lis(x.benefits)}<b>Trade-offs</b>{lis(x.tradeoffs)}<b>How to try it</b>{lis(x.migration_steps)}</div>")
        o.write("<h3>Query inventory</h3><table><tr><th>Query</th><th>Role</th><th>Steps</th><th>Staged</th><th>Sources</th><th>Fold</th><th>Fast Copy</th><th>Destinations</th></tr>")
        for q in m.queries.values():
            o.write(f"<tr><td>{_e(q.name)}</td><td>{_e(q.role)}</td><td>{q.step_count}</td><td>{_e(q.staged)}</td><td>{_e(', '.join(q.source_calls) or '-')}</td>"
                    f"<td>{_e(q.can_fold)}</td><td>{'yes' if q.fast_copy_connector else '-'}</td>"
                    f"<td>{_e(', '.join(d.kind + '/' + str(d.update_method or 'Replace') for d in q.destinations) or '-')}</td></tr>")
        o.write("</table></div></details>")
    o.write("<h2>Coverage of the Microsoft guidance</h2><table><tr><th>Section</th><th>Source</th><th>Status</th><th>Rules</th><th>Manual checks</th></tr>")
    for c in coverage_matrix():
        o.write(f"<tr><td><a href='{_e(c['url'])}' target='_blank' rel='noopener'>{_e(c['title'])}</a></td><td>{_e(c['source'])}</td><td>{_e(c['status'])}</td>"
                f"<td>{_e(', '.join(c['rules']) or '-')}</td><td>{'<br>'.join(_e(x) for x in c['manual']) or '-'}</td></tr>")
    o.write("</table><h2>Decision-guide items</h2><table><tr><th>Item</th><th>Handled by</th></tr>")
    for a, b, _c in DECISION_GUIDE_ITEMS:
        o.write(f"<tr><td>{_e(a)}</td><td>{_e(b)}</td></tr>")
    o.write("</table><h2>Rule catalogue</h2><table><tr><th>Rule</th><th>Title</th><th>Severity</th><th>Category</th><th>Section</th></tr>")
    for rid in sorted(RULES):
        m_ = RULES[rid]
        o.write(f"<tr><td>{_e(rid)}</td><td>{_e(m_.title)}</td><td>{_badge(m_.severity)}</td><td>{_e(m_.category)}</td><td>{_e(m_.section)}</td></tr>")
    o.write("</table><h2>Manual verification checklist</h2><ul>" + "".join(f"<li>&#9744; {_e(x)}</li>" for x in manual_checklist()) + "</ul>")
    o.write("<p class='small'>Static analysis approximates query folding and Fast Copy eligibility from the definition; confirm in the editor (folding indicators, "
            "Engine column in refresh history) and measure with the Fabric Capacity Metrics app before and after each change. "
            "CU estimates are indicative: Standard Compute 12 CU/s (first 10 min per query) then 1.5 CU/s; legacy 16 CU/s; High Scale 6 CU/s; Fast Copy 1.5 CU/s.</p>")
    o.write(f"</main><script>{JS}</script></body></html>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(o.getvalue())


def write_all(results: List[DataflowResult], out_dir: str, formats: List[str]) -> List[str]:
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for fmt in formats:
        p = os.path.join(out_dir, f"dataflow_gen2_review.{ {'md': 'md', 'html': 'html', 'json': 'json', 'csv': 'csv'}[fmt] }")
        {"html": write_html, "md": write_markdown, "json": write_json, "csv": write_csv}[fmt](results, p)
        paths.append(p)
    return paths
