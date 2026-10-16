"""Turn raw definition parts (mashup.pq + queryMetadata.json) into a DataflowModel."""
from __future__ import annotations

import base64
import json
import os
import re
from typing import Any, Dict, Iterable, List, Optional

from . import knowledge as K
from .mashup import Document, extract_destinations, parse_document
from .models import DataflowModel, Destination, Query


match_connector = K.match_connector


def _destination_kind(member) -> str:
    calls = set(member.calls)
    text = " ".join(member.strings).lower()
    if "Lakehouse.Contents" in calls:
        return "lakehouse"
    if "Fabric.Warehouse" in calls:
        return "warehouse"
    if "Sql.Database" in calls or "Sql.Databases" in calls:
        if "database.fabric.microsoft.com" in text:
            return "fabric_sql"
        return "azure_sql"
    if calls & {"AzureStorage.DataLake", "AzureStorage.Blobs", "AzureStorage.DataLakeContents"}:
        return "adls"
    if "AzureDataExplorer.Contents" in calls:
        return "kql"
    if any(c.startswith("Snowflake.") for c in calls):
        return "snowflake"
    if any(c.startswith("SharePoint.") for c in calls):
        return "sharepoint"
    return "other"


def build_model(
    *,
    df_id: str,
    name: str,
    mashup_text: str,
    metadata: Optional[Dict[str, Any]] = None,
    fmt: str = "cicd",
    source: str = "",
    workspace_id: str = "",
    workspace_name: str = "",
) -> DataflowModel:
    metadata = metadata or {}
    doc: Document = parse_document(mashup_text)
    model = DataflowModel(
        id=df_id,
        name=name,
        workspace_id=workspace_id,
        workspace_name=workspace_name,
        fmt=fmt,
        source=source,
        header_attrs=doc.header_attrs,
        metadata=metadata,
        settings=dict(metadata.get("computeEngineSettings") or {}),
        connections=list(metadata.get("connections") or []),
        raw_text=mashup_text,
    )
    qmeta: Dict[str, Any] = metadata.get("queriesMetadata") or {}

    dest_query_names = set()
    for m in doc.members.values():
        for d in extract_destinations(m.attrs):
            if d.get("query"):
                dest_query_names.add(d["query"])
    default_dest = None
    mm = re.search(r"DefaultOutputDestinationSettings\s*=\s*\[\s*DestinationDefinition\s*=\s*\[[^\]]*QueryName\s*=\s*\"([^\"]+)\"", doc.header_attrs)
    if mm:
        default_dest = mm.group(1)
    model.settings["_default_destination_query"] = default_dest

    for name_, m in doc.members.items():
        if m.is_parameter:
            role = "parameter"
        elif m.is_function:
            role = "function"
        elif name_ in dest_query_names or name_.endswith("_DataDestination"):
            role = "destination"
        elif default_dest and name_ == default_dest:
            role = "default_destination"
        else:
            role = "query"
        meta = qmeta.get(name_)
        load_enabled: Optional[bool] = None
        hidden = False
        if isinstance(meta, dict):
            load_enabled = meta.get("loadEnabled", True)
            hidden = bool(meta.get("isHidden", False))
        calls: List[str] = list(m.calls)
        row_calls: List[str] = []
        for s in m.steps:
            row_calls.extend(s.row_level_calls)
        q = Query(
            name=name_, role=role, line=m.line, step_count=len(m.steps), steps=m.steps,
            calls=calls, row_level_calls=row_calls, refs=list(m.refs), load_enabled=load_enabled,
            hidden=hidden, expr=m.expr, strings=m.strings,
        )
        src_calls: List[str] = []
        fams: List[str] = []
        folds: List[bool] = []
        fast: List[bool] = []
        for c in calls:
            hit = match_connector(c)
            if hit and hit[1][0] != "file_parser":
                src_calls.append(c)
                fam, fold, fc = hit[1]
                if fam not in fams:
                    fams.append(fam)
                folds.append(fold)
                fast.append(fc)
        q.source_calls = list(dict.fromkeys(src_calls))
        q.families = fams
        if folds:
            q.can_fold = all(folds)
            q.fast_copy_connector = all(fast)
        if role == "query":
            for d in extract_destinations(m.attrs):
                dq = doc.members.get(d.get("query") or "")
                q.destinations.append(
                    Destination(
                        kind=_destination_kind(dq) if dq else "other",
                        query=d.get("query"),
                        update_method=d.get("update_method"),
                        dynamic_schema=d.get("dynamic_schema"),
                        settings_kind=d.get("settings_kind"),
                        has_column_mappings=d.get("has_column_mappings", False),
                        type_kind=d.get("type_kind"),
                    )
                )
        model.queries[name_] = q

    for q in model.queries.values():
        for r in q.refs:
            if r in model.queries:
                model.queries[r].referenced_by.append(q.name)
    return model


def _decode(part: Dict[str, Any]) -> str:
    payload = part.get("payload", "")
    if part.get("payloadType", "InlineBase64") == "InlineBase64":
        return base64.b64decode(payload).decode("utf-8-sig")
    return payload


def model_from_parts(parts: Iterable[Dict[str, Any]], *, df_id: str, name: str, **kw: Any) -> DataflowModel:
    mashup = ""
    metadata: Dict[str, Any] = {}
    display = name
    for p in parts:
        path = p.get("path", "")
        if path == "mashup.pq":
            mashup = _decode(p)
        elif path == "queryMetadata.json":
            metadata = json.loads(_decode(p))
        elif path == ".platform":
            try:
                display = json.loads(_decode(p)).get("metadata", {}).get("displayName", display)
            except ValueError:
                pass
    if metadata.get("name") and display == name and not name:
        display = metadata["name"]
    return build_model(df_id=df_id, name=display or metadata.get("name", df_id), mashup_text=mashup, metadata=metadata, **kw)


def model_from_legacy_json(doc: Dict[str, Any], *, df_id: str = "", **kw: Any) -> DataflowModel:
    mash = doc.get("pbi:mashup") or {}
    metadata = {
        "name": doc.get("name", df_id),
        "queriesMetadata": mash.get("queriesMetadata") or {},
        "fastCombine": mash.get("fastCombine"),
        "allowNativeQueries": mash.get("allowNativeQueries"),
        "computeEngineSettings": {},
        "connections": [],
    }
    return build_model(
        df_id=df_id or doc.get("objectId", doc.get("name", "")),
        name=doc.get("name", df_id),
        mashup_text=mash.get("document", ""),
        metadata=metadata,
        fmt="legacy",
        **kw,
    )


def load_folder(path: str) -> List[DataflowModel]:
    """Load Git-integration style folders (``*.Dataflow``) or any folder holding mashup.pq."""
    models: List[DataflowModel] = []
    for root, _dirs, files in os.walk(path):
        if "mashup.pq" not in files:
            continue
        with open(os.path.join(root, "mashup.pq"), "r", encoding="utf-8-sig") as fh:
            mashup = fh.read()
        metadata: Dict[str, Any] = {}
        mp = os.path.join(root, "queryMetadata.json")
        if os.path.exists(mp):
            with open(mp, "r", encoding="utf-8-sig") as fh:
                metadata = json.load(fh)
        display = metadata.get("name") or os.path.basename(root).replace(".Dataflow", "")
        pp = os.path.join(root, ".platform")
        if os.path.exists(pp):
            try:
                with open(pp, "r", encoding="utf-8-sig") as fh:
                    display = json.load(fh).get("metadata", {}).get("displayName", display)
            except ValueError:
                pass
        models.append(build_model(df_id=display, name=display, mashup_text=mashup, metadata=metadata, source=root))
    return models


def load_json_file(path: str) -> List[DataflowModel]:
    with open(path, "r", encoding="utf-8-sig") as fh:
        doc = json.load(fh)
    base = os.path.splitext(os.path.basename(path))[0]
    if isinstance(doc, dict) and "pbi:mashup" in doc:
        return [model_from_legacy_json(doc, df_id=base, source=path)]
    definition = doc.get("definition", doc) if isinstance(doc, dict) else {}
    parts = definition.get("parts")
    if parts:
        return [model_from_parts(parts, df_id=base, name=base, source=path)]
    raise ValueError(f"{path}: not a recognised Dataflow definition (expected getDefinition response or model.json)")


def load_path(path: str) -> List[DataflowModel]:
    if os.path.isdir(path):
        models = load_folder(path)
        for dirpath, _d, files in os.walk(path):
            for f in files:
                if f.lower().endswith(".json") and f != "queryMetadata.json" and f != ".platform":
                    full = os.path.join(dirpath, f)
                    try:
                        with open(full, "r", encoding="utf-8-sig") as fh:
                            head = fh.read(4000)
                        if '"pbi:mashup"' in head or '"parts"' in head:
                            models.extend(load_json_file(full))
                    except (ValueError, OSError):
                        continue
        return models
    if path.lower().endswith(".pq"):
        with open(path, "r", encoding="utf-8-sig") as fh:
            name = os.path.splitext(os.path.basename(path))[0]
            return [build_model(df_id=name, name=name, mashup_text=fh.read(), source=path)]
    return load_json_file(path)
