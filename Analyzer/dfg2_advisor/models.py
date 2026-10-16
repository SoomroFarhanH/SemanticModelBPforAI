"""Data model and configuration."""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

SEVERITIES = ["critical", "high", "medium", "low", "info"]
SEV_RANK = {s: i for i, s in enumerate(SEVERITIES)}
SEV_PENALTY = {"critical": 20, "high": 10, "medium": 5, "low": 2, "info": 0}


@dataclass
class Config:
    """Tunable thresholds. Override with --config thresholds.json."""

    many_queries: int = 15
    long_query_steps: int = 40
    repeated_type_steps: int = 3
    heavy_ops_for_staging: int = 1
    long_refresh_minutes: float = 30.0
    very_long_refresh_minutes: float = 120.0
    failure_rate_warn: float = 0.10
    failure_rate_high: float = 0.30
    duration_regression_pct: float = 30.0
    frequent_schedule_minutes: int = 15
    stale_days: int = 30
    history_days: int = 30
    min_runs_for_trends: int = 6
    spark_refresh_minutes: float = 30.0
    max_concurrency_hint_queries: int = 4
    assume_incremental: List[str] = field(default_factory=list)
    suppress_rules: List[str] = field(default_factory=list)
    large_source_names: List[str] = field(default_factory=list)

    @staticmethod
    def load(path: Optional[str]) -> "Config":
        cfg = Config()
        if path:
            with open(path, "r", encoding="utf-8") as fh:
                for k, v in json.load(fh).items():
                    if hasattr(cfg, k):
                        setattr(cfg, k, v)
        return cfg


@dataclass
class Destination:
    kind: str  # lakehouse | warehouse | azure_sql | fabric_sql | adls | kql | snowflake | other | default
    query: Optional[str]
    update_method: Optional[str]
    dynamic_schema: Optional[bool]
    settings_kind: Optional[str]
    has_column_mappings: bool
    type_kind: Optional[str]


@dataclass
class Query:
    name: str
    role: str  # query | parameter | function | destination | default_destination
    line: int
    step_count: int
    steps: List[Any]
    calls: List[str]
    row_level_calls: List[str]
    refs: List[str]
    referenced_by: List[str] = field(default_factory=list)
    source_calls: List[str] = field(default_factory=list)
    families: List[str] = field(default_factory=list)
    can_fold: Optional[bool] = None
    fast_copy_connector: bool = False
    destinations: List[Destination] = field(default_factory=list)
    load_enabled: Optional[bool] = None  # staging: None unknown
    hidden: bool = False
    expr: str = ""
    strings: List[str] = field(default_factory=list)

    @property
    def staged(self) -> Optional[bool]:
        return self.load_enabled


@dataclass
class DataflowModel:
    id: str
    name: str
    workspace_id: str = ""
    workspace_name: str = ""
    fmt: str = "cicd"  # cicd | legacy | unknown
    source: str = ""
    definition_available: bool = True
    header_attrs: str = ""
    settings: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    queries: Dict[str, Query] = field(default_factory=dict)
    connections: List[Dict[str, Any]] = field(default_factory=list)
    raw_text: str = ""
    runs: List[Dict[str, Any]] = field(default_factory=list)
    schedules: List[Dict[str, Any]] = field(default_factory=list)
    history_error: Optional[str] = None
    history_loaded: bool = False
    definition_error: Optional[str] = None

    @property
    def fast_copy_declared(self) -> bool:
        return "StagingDefinition" in self.header_attrs and "FastCopy" in self.header_attrs

    def real_queries(self) -> List[Query]:
        return [q for q in self.queries.values() if q.role == "query"]


@dataclass
class Finding:
    rule_id: str
    title: str
    severity: str
    category: str  # Performance | Capacity | Reliability | Maintainability | Architecture
    dataflow: str
    query: Optional[str]
    evidence: str
    why: str
    remediation: List[str]
    reference: str
    confidence: str = "medium"  # high | medium | low
    impact: List[str] = field(default_factory=list)  # speed, capacity, reliability
    effort: str = "low"  # low | medium | high
    snippet: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Recommendation:
    engine: str
    verdict: str  # recommended | consider | keep
    confidence: str
    rationale: List[str]
    benefits: List[str]
    tradeoffs: List[str]
    migration_steps: List[str]
    reference: str
    scope: str = "dataflow"  # dataflow | query
    query: Optional[str] = None


@dataclass
class DataflowResult:
    model: DataflowModel
    findings: List[Finding] = field(default_factory=list)
    recommendations: List[Recommendation] = field(default_factory=list)
    score: Optional[int] = 100
    grade: str = "A"
    telemetry: Dict[str, Any] = field(default_factory=dict)
    cost: Dict[str, Any] = field(default_factory=dict)
