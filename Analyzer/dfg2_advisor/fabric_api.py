"""Minimal Fabric / Power BI REST client (stdlib only)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterator, List, Optional

FABRIC = "https://api.fabric.microsoft.com"
PBI = "https://api.powerbi.com"
FABRIC_SCOPE = "https://api.fabric.microsoft.com"
PBI_SCOPE = "https://analysis.windows.net/powerbi/api"


class ApiError(RuntimeError):
    def __init__(self, status: int, message: str, url: str):
        super().__init__(f"HTTP {status} for {url}: {message}")
        self.status = status
        self.url = url


def az_token(resource: str) -> str:
    az = shutil.which("az") or shutil.which("az.cmd")
    if not az:
        raise RuntimeError("Azure CLI not found. Install it and run 'az login', or set FABRIC_TOKEN / POWERBI_TOKEN.")
    out = subprocess.run(
        [az, "account", "get-access-token", "--resource", resource, "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, timeout=90,
    )
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError(f"az get-access-token failed: {out.stderr.strip()[:300]}")
    return out.stdout.strip()


def default_token_provider(scope: str) -> Callable[[], str]:
    env = "FABRIC_TOKEN" if scope == FABRIC_SCOPE else "POWERBI_TOKEN"

    def provider() -> str:
        return os.environ.get(env) or az_token(scope)

    return provider


class FabricClient:
    def __init__(self, fabric_token: Optional[Callable[[], str]] = None, pbi_token: Optional[Callable[[], str]] = None, verbose: bool = False):
        self._ft = fabric_token or default_token_provider(FABRIC_SCOPE)
        self._pt = pbi_token or default_token_provider(PBI_SCOPE)
        self.verbose = verbose

    def _request(self, method: str, url: str, body: Any = None, token: Optional[Callable[[], str]] = None, want_headers: bool = False):
        token = token or self._ft
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(6):
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("Authorization", f"Bearer {token()}")
            req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    raw = resp.read()
                    payload = json.loads(raw) if raw else {}
                    return (resp.status, dict(resp.headers), payload) if want_headers else payload
            except urllib.error.HTTPError as e:
                text = e.read().decode("utf-8", "ignore")
                if e.code in (429, 500, 502, 503, 504) and attempt < 5:
                    wait = int(e.headers.get("Retry-After", "0") or 0) or min(2 ** attempt, 30)
                    if self.verbose:
                        print(f"  retry {attempt + 1} after {wait}s ({e.code})")
                    time.sleep(wait)
                    continue
                raise ApiError(e.code, text[:400], url)
        raise ApiError(0, "retries exhausted", url)

    def _paged(self, url: str, token: Optional[Callable[[], str]] = None, key: str = "value") -> Iterator[Dict[str, Any]]:
        sep = "&" if "?" in url else "?"
        cont: Optional[str] = None
        while True:
            u = url if not cont else f"{url}{sep}continuationToken={urllib.parse.quote(cont)}"
            page = self._request("GET", u, token=token)
            for item in page.get(key, []):
                yield item
            cont = page.get("continuationToken")
            if not cont:
                return

    def list_workspaces(self) -> List[Dict[str, Any]]:
        return list(self._paged(f"{FABRIC}/v1/workspaces"))

    def resolve_workspace(self, ref: str) -> Dict[str, Any]:
        for ws in self.list_workspaces():
            if ws["id"].lower() == ref.lower() or ws["displayName"].lower() == ref.lower():
                return ws
        raise ApiError(404, f"workspace '{ref}' not found or not accessible", FABRIC)

    def list_dataflows(self, workspace_id: str) -> List[Dict[str, Any]]:
        return list(self._paged(f"{FABRIC}/v1/workspaces/{workspace_id}/items?type=Dataflow"))

    def get_definition(self, workspace_id: str, item_id: str) -> Dict[str, Any]:
        url = f"{FABRIC}/v1/workspaces/{workspace_id}/items/{item_id}/getDefinition"
        status, headers, payload = self._request("POST", url, body={}, want_headers=True)
        if status == 200:
            return payload
        op = headers.get("x-ms-operation-id") or headers.get("Location", "").rstrip("/").split("/")[-1]
        wait = int(headers.get("Retry-After", "2") or 2)
        for _ in range(90):
            time.sleep(min(wait, 10))
            st = self._request("GET", f"{FABRIC}/v1/operations/{op}")
            if st.get("status") == "Succeeded":
                return self._request("GET", f"{FABRIC}/v1/operations/{op}/result")
            if st.get("status") in ("Failed", "Cancelled"):
                raise ApiError(500, json.dumps(st.get("error", st))[:400], url)
        raise ApiError(504, "getDefinition timed out", url)

    def list_job_instances(self, workspace_id: str, item_id: str, days: int = 30, max_items: int = 500) -> List[Dict[str, Any]]:
        from .telemetry import parse_ts

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        out: List[Dict[str, Any]] = []
        for job in self._paged(f"{FABRIC}/v1/workspaces/{workspace_id}/items/{item_id}/jobs/instances"):
            started = parse_ts(job.get("startTimeUtc"))
            if started and started < cutoff:
                continue
            out.append(job)
            if len(out) >= max_items:
                break
        return out

    def list_schedules(self, workspace_id: str, item_id: str) -> List[Dict[str, Any]]:
        return list(self._paged(f"{FABRIC}/v1/workspaces/{workspace_id}/items/{item_id}/jobs/Execute/schedules"))

    def list_legacy_dataflows(self, workspace_id: str) -> List[Dict[str, Any]]:
        page = self._request("GET", f"{PBI}/v1.0/myorg/groups/{workspace_id}/dataflows", token=self._pt)
        return page.get("value", [])

    def get_legacy_dataflow(self, workspace_id: str, dataflow_id: str) -> Dict[str, Any]:
        return self._request("GET", f"{PBI}/v1.0/myorg/groups/{workspace_id}/dataflows/{dataflow_id}", token=self._pt)
