"""Command line interface."""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from typing import List

from . import __version__
from .builder import load_path
from .engine import analyze_all, collect_live
from .fabric_api import ApiError, FabricClient
from .models import SEV_RANK, Config
from .report import _sc, write_all
from .rules import RULES


def _scan(args: argparse.Namespace) -> int:
    cfg = Config.load(args.config)
    cfg.history_days = args.history_days
    models = []
    if args.path:
        for p in args.path:
            models.extend(load_path(p))
        print(f"Loaded {len(models)} dataflow definition(s) from disk (offline: no refresh history).")
    if args.workspace or args.all_workspaces:
        client = FabricClient(verbose=args.verbose)
        print("Scanning Fabric workspaces...")
        try:
            models.extend(collect_live(client, args.workspace or [], cfg, name_filter=args.dataflow,
                                       with_history=not args.no_history, include_legacy=args.include_legacy))
        except (ApiError, RuntimeError) as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2
    if not models:
        print("No dataflows found. Use --path <folder|file> or --workspace <name|id> (or --all-workspaces).", file=sys.stderr)
        return 2
    results = analyze_all(models, cfg)
    out = args.out or os.path.join("reports", datetime.now().strftime("%Y%m%d-%H%M%S"))
    paths = write_all(results, out, [f.strip() for f in args.format.split(",")])
    print("\nScore  Grade  Findings  Dataflow")
    for r in sorted(results, key=lambda x: x.score if x.score is not None else 101):
        print(f"{_sc(r):>5}  {r.grade:^5}  {len(r.findings):>8}  {r.model.workspace_name + ' / ' if r.model.workspace_name else ''}{r.model.name}")
    print("\nReports:")
    for p in paths:
        print("  " + os.path.abspath(p))
    threshold = SEV_RANK[args.fail_on] if args.fail_on else None
    if threshold is not None and any(SEV_RANK[f.severity] <= threshold for r in results for f in r.findings):
        return 1
    return 0


def _rules(_args: argparse.Namespace) -> int:
    print(f"{'ID':<9}{'Severity':<10}{'Category':<17}{'Section':<11}Title")
    for rid in sorted(RULES):
        m = RULES[rid]
        print(f"{rid:<9}{m.severity:<10}{m.category:<17}{m.section:<11}{m.title}")
    return 0


def main(argv: List[str] = None) -> int:
    ap = argparse.ArgumentParser(prog="dfg2_advisor", description="Check Fabric Dataflow Gen2 items against Microsoft best practices and recommend optimisations or alternative engines.")
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan", help="analyse dataflows (live workspaces and/or exported definitions)")
    s.add_argument("--workspace", "-w", action="append", help="workspace name or id (repeatable)")
    s.add_argument("--all-workspaces", action="store_true", help="scan every workspace you can access")
    s.add_argument("--dataflow", "-d", help="only dataflows whose name contains this text")
    s.add_argument("--path", "-p", action="append", help="folder (Git export), getDefinition JSON, model.json or .pq file (repeatable)")
    s.add_argument("--no-history", action="store_true", help="skip refresh history and schedules")
    s.add_argument("--history-days", type=int, default=30)
    s.add_argument("--include-legacy", action="store_true", help="also read non-CI/CD dataflows through the Power BI API")
    s.add_argument("--config", help="JSON file overriding thresholds / suppress_rules / assume_incremental")
    s.add_argument("--out", "-o", help="output folder (default reports/<timestamp>)")
    s.add_argument("--format", default="html,md,json,csv", help="comma list of html,md,json,csv")
    s.add_argument("--fail-on", choices=["critical", "high", "medium", "low"], help="exit 1 if a finding at or above this severity exists (CI gate)")
    s.add_argument("--verbose", "-v", action="store_true")
    s.set_defaults(fn=_scan)
    r = sub.add_parser("rules", help="list the rule catalogue")
    r.set_defaults(fn=_rules)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
