"""Refresh-history statistics, schedule parsing and an indicative CU cost model."""
from __future__ import annotations

import re
import statistics
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from . import knowledge as K
from .models import Config
from .rules import classify_failure


_TS = re.compile(r"^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$")


def parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    m = _TS.match(value.strip())
    if not m:
        return None
    base, frac, tz = m.groups()
    text = base.replace(" ", "T") + (f".{frac[:6].ljust(6, '0')}" if frac else "")
    if tz and tz != "Z":
        text += tz if ":" in tz else tz[:3] + ":" + tz[3:]
    else:
        text += "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _pct(values: List[float], p: float) -> float:
    s = sorted(values)
    k = (len(s) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def schedule_interval_minutes(schedules: List[Dict[str, Any]]) -> Optional[float]:
    best: Optional[float] = None
    for s in schedules or []:
        if not s.get("enabled", True):
            continue
        cfg = s.get("configuration", {})
        t = cfg.get("type")
        val: Optional[float] = None
        if t == "Cron":
            val = float(cfg.get("interval", 0) or 0) or None
        elif t in ("Daily", "Weekly"):
            times = cfg.get("times") or []
            days = len(cfg.get("weekdays") or []) if t == "Weekly" else 7
            if times:
                val = (1440.0 * 7 / (len(times) * max(days, 1)))
        if val is not None and (best is None or val < best):
            best = val
    return best


def analyze_runs(runs: List[Dict[str, Any]], schedules: List[Dict[str, Any]], cfg: Config, history_loaded: bool) -> Dict[str, Any]:
    stats: Dict[str, Any] = {"history_loaded": history_loaded, "runs": len(runs)}
    if not history_loaded:
        return {}
    rows = []
    for r in runs:
        st, en = parse_ts(r.get("startTimeUtc")), parse_ts(r.get("endTimeUtc"))
        dur = (en - st).total_seconds() if st and en else None
        rows.append({"status": r.get("status"), "start": st, "dur": dur, "reason": (r.get("failureReason") or {}), "invoke": r.get("invokeType")})
    rows.sort(key=lambda x: x["start"] or datetime.min.replace(tzinfo=timezone.utc))
    done = [x for x in rows if x["status"] == "Completed" and x["dur"] is not None]
    failed = [x for x in rows if x["status"] == "Failed"]
    stats.update(completed=len(done), failed=len(failed), cancelled=sum(1 for x in rows if x["status"] == "Cancelled"))
    denom = len(done) + len(failed)
    stats["failure_rate"] = (len(failed) / denom) if denom else None
    if done:
        d = [x["dur"] for x in done]
        stats.update(p50_s=statistics.median(d), p95_s=_pct(d, 0.95), avg_s=statistics.fmean(d), max_s=max(d), min_s=min(d))
        if len(done) >= max(cfg.min_runs_for_trends, 3):
            third = max(len(d) // 3, 1)
            early, late = statistics.median(d[:third]), statistics.median(d[-third:])
            stats["duration_trend_pct"] = ((late - early) / early * 100.0) if early > 0 else None
    cls = Counter(classify_failure((x["reason"].get("message") or "") + " " + (x["reason"].get("errorCode") or "")) for x in failed)
    stats["failure_classes"] = dict(cls.most_common())
    stats["last_run_utc"] = rows[-1]["start"].isoformat() if rows and rows[-1]["start"] else None
    first, last = (rows[0]["start"], rows[-1]["start"]) if rows else (None, None)
    span_days = max(((last - first).total_seconds() / 86400.0) if first and last else 1.0, 1.0)
    stats["runs_per_day"] = len(rows) / min(max(span_days, 1.0), float(cfg.history_days))
    stats["scheduled_runs"] = sum(1 for x in rows if (x["invoke"] or "").lower() == "scheduled")
    stats["min_schedule_interval_min"] = schedule_interval_minutes(schedules)
    return stats


def tiered_cu(duration_s: float, legacy: bool = False) -> float:
    if legacy:
        return duration_s * K.STANDARD_LEGACY_RATE
    t1 = min(duration_s, K.STANDARD_TIER1_SECONDS)
    t2 = max(duration_s - K.STANDARD_TIER1_SECONDS, 0.0)
    return t1 * K.STANDARD_TIER1_RATE + t2 * K.STANDARD_TIER2_RATE


def estimate_cost(legacy: bool, stats: Dict[str, Any]) -> Dict[str, Any]:
    """Indicative only: assumes the refresh duration is billed as one mashup query.

    Real billing sums per-query evaluation time (parallel queries add up) plus separate
    High Scale (6 CU/s) and Fast Copy (1.5 CU/s per aggregate core-second) meters, so use the
    Fabric Capacity Metrics app for exact numbers.
    """
    if not stats or stats.get("p50_s") is None:
        return {}
    p50 = stats["p50_s"]
    per_run = tiered_cu(p50, legacy)
    out = {
        "basis": "single-query approximation of Standard Compute" + (" (legacy 16 CU/s)" if legacy else " (12 CU/s first 10 min, 1.5 CU/s after)"),
        "cu_seconds_per_run_p50": round(per_run),
        "cu_seconds_per_run_p95": round(tiered_cu(stats.get("p95_s", p50), legacy)),
    }
    rpd = stats.get("runs_per_day")
    if rpd:
        out["runs_per_day"] = round(rpd, 2)
        out["cu_seconds_per_month_est"] = round(per_run * rpd * 30)
        out["cu_hours_per_month_est"] = round(per_run * rpd * 30 / 3600, 1)
    if legacy:
        out["cu_seconds_per_run_if_cicd"] = round(tiered_cu(p50, False))
    return out
