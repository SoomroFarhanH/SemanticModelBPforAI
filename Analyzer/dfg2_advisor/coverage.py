"""Traceability: which section of the Microsoft guidance is checked by which rule, and what stays manual."""
from __future__ import annotations

from typing import Dict, List

from . import knowledge as K
from .rules import RULES

# key -> (source, title, url, manual checks the tool cannot infer from the definition)
SECTIONS: Dict[str, tuple] = {
    "BP-KA1": ("Performance best practices", "Key areas: data movement", K.DOC_BP,
               ["Confirm network path/region between source, gateway and Fabric capacity.",
                "Check the Engine column in refresh history to see whether Fast Copy was actually used."]),
    "BP-KA2": ("Performance best practices", "Key areas: data transformation (query folding, filter early, avoid unnecessary transformations)", K.DOC_BP,
               ["Confirm folding with the Applied steps indicators and 'View data source query' (static analysis can only approximate folding)."]),
    "BP-KA3": ("Performance best practices", "Key areas: staging data and warehouse compute", K.DOC_BP,
               ["Compare run time/CU with staging on vs off for fully folding queries."]),
    "BP-C1": ("Performance best practices", "Consideration 1: Fast Copy for data movement", K.DOC_FASTCOPY,
              ["Decide whether to set 'Require Fast Copy' per query (fails the refresh if Fast Copy cannot be used - good for debugging).",
               "Verify thresholds: files >= 100 MB (CSV/Parquet on ADLS/Blob) or >= 5 million rows for databases."]),
    "BP-C2": ("Performance best practices", "Consideration 2: staging + splitting queries for complex transformations", K.DOC_BP,
              ["Use 'Extract previous' on the first non-folding step in the editor."]),
    "BP-C3": ("Performance best practices", "Consideration 3: staging-to-Lakehouse movement / Optimized copy", K.DOC_STAGED, []),
    "BP-C4": ("Performance best practices", "Consideration 4: large data previews at design time", K.DOC_BP,
              ["Use Schema view while authoring large tables."]),
    "BP-C5": ("Performance best practices", "Consideration 5: Gen2 vs Gen1 runtime characteristics (Delta Parquet vs CSV)", K.DOC_BP,
              ["Informational: expect longer ETL than Gen1 CSV output but faster downstream (Direct Lake, SQL endpoint). Judge on end-to-end time and CU."]),
    "BP-C6": ("Performance best practices", "Consideration 6: incremental refresh for large transactional data", K.DOC_INCREMENTAL,
              ["Confirm a Date/DateTime column suitable for bucketing and a fully folding query.",
               "Review bucket counts (<= 50 per query, <= 150 per dataflow) and Lakehouse concurrency (max 10)."]),
    "BP-C7": ("Performance best practices", "Consideration 7: on-premises gateway", K.DOC_BP,
              ["Check gateway version (>= 3000.270 for incremental refresh to Lakehouse) and host CPU/memory."]),
    "BP-C8": ("Performance best practices", "Consideration 8: consume through destinations, not the Dataflow connector", K.DOC_BP, []),
    "BP-C9": ("Performance best practices", "Consideration 9: Modern Evaluator", K.DOC_MODERN, []),
    "FC-DEST": ("Fast Copy", "Fast Copy connectors, transformation limits and Lakehouse-only destination", K.DOC_FASTCOPY, []),
    "SD-VORDER": ("Staged data options", "V-Order for staging and destination Lakehouse", K.DOC_STAGED,
                  ["Review the destination-level 'Enable use of V-Order compression' option per Lakehouse destination (depends on how the table is read)."]),
    "PC": ("Partitioned compute (Preview)", "Parallel evaluation of file partitions", K.DOC_PARTITION, []),
    "IR": ("Incremental refresh", "Prerequisites and limitations (fixed schema, Replace, destinations, buckets)", K.DOC_INCREMENTAL,
           ["Avoid other writers or OPTIMIZE/REORG on Lakehouse tables that use incremental refresh."]),
    "DEST": ("Data destinations", "Destination settings, staging requirements, maintenance", K.DOC_DEST,
             ["Schedule Lakehouse table maintenance: VACUUM (and OPTIMIZE where incremental refresh is not used)."]),
    "PRICE": ("Dataflow Gen2 pricing and benchmarks", "CU meters: Standard Compute, High Scale, Fast Copy; CI/CD vs legacy", K.DOC_PRICING,
              ["Validate real CU in the Fabric Capacity Metrics app (the cost model here is indicative)."]),
    "OPS": ("Operations", "Refresh history: failures, duration, schedule frequency, staleness", K.DOC_BP,
            ["Stagger schedules so many dataflows do not start at the same minute."]),
    "DG": ("Decision guide", "Copy activity / Copy job / Dataflow Gen2 / Eventstream / Spark selection", K.DOC_DECISION,
           ["Confirm team skill set (M vs Spark vs low-code pipelines) and governance requirements."]),
}

# Decision-guide scenarios and comparison-table properties handled by the advisor (not by single rules).
DECISION_GUIDE_ITEMS = [
    ("Use case / transformation complexity", "advisor: heavy ops, fold breakers, row-level calls", ["ARCH-001", "ARCH-002"]),
    ("Data volume (low to high)", "advisor: refresh duration (p50) as a proxy; supply real volumes in the review", ["ARCH-001", "ARCH-002", "DFG-092"]),
    ("Sources (50+ vs 150+ vs Spark libraries)", "advisor: copy-supported connector families only trigger Copy job advice", ["ARCH-001"]),
    ("Destinations (40+ vs Lakehouse/SQL/ADX)", "advisor + DFG-011/DFG-023 destination checks", ["ARCH-001", "DFG-011", "DFG-023"]),
    ("Persona / skill set / code vs low-code", "manual (listed in the report checklist)", []),
    ("Scenario 1: bronze ingestion at scale -> pipeline Copy activity", "ARCH-001", ["ARCH-001"]),
    ("Scenario 2: low/medium-volume cleansing, multi-destination -> Dataflow Gen2", "'Keep and optimize' recommendation", []),
    ("Scenario 3: event data -> Eventstream", "ARCH-003", ["ARCH-003"]),
    ("Scenario 4: large-scale analytics/ML-style processing -> Spark", "ARCH-002", ["ARCH-002"]),
    ("Scenario 5: CDC / incremental replication -> Copy job", "ARCH-001 (incremental copy rationale)", ["ARCH-001"]),
]


def coverage_matrix() -> List[dict]:
    rows = []
    for key, (src, title, url, manual) in SECTIONS.items():
        rules = [r.id for r in RULES.values() if r.section == key]
        status = "Automated + manual" if rules and manual else "Automated" if rules else "Manual / informational"
        rows.append({"section": key, "source": src, "title": title, "url": url, "rules": rules, "manual": manual, "status": status})
    return rows


def manual_checklist() -> List[str]:
    seen, out = set(), []
    for _k, (_s, title, _u, manual) in SECTIONS.items():
        for m in manual:
            if m not in seen:
                seen.add(m)
                out.append(f"{title}: {m}")
    return out
