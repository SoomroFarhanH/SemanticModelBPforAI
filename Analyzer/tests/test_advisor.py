import base64
import json
import os
import tempfile
import unittest

from dfg2_advisor import knowledge as K
from dfg2_advisor.builder import build_model, load_path, model_from_legacy_json, model_from_parts
from dfg2_advisor.coverage import SECTIONS, coverage_matrix, manual_checklist
from dfg2_advisor.engine import analyze, analyze_all, collect_live
from dfg2_advisor.mashup import extract_destinations, parse_document, tokenize
from dfg2_advisor.models import Config
from dfg2_advisor.report import write_all
from dfg2_advisor.rules import RULES, classify_failure
from dfg2_advisor.telemetry import analyze_runs, parse_ts, schedule_interval_minutes, tiered_cu

SAMPLES = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples")


def ids(result):
    return {f.rule_id for f in result.findings}


def model(mashup, meta=None, **kw):
    meta = meta or {}
    meta.setdefault("queriesMetadata", {})
    return build_model(df_id="t", name="t", mashup_text=mashup, metadata=meta, **kw)


class ParserTests(unittest.TestCase):
    def test_tokenizer_strings_comments_quoted(self):
        toks = tokenize('// c\n#"My step" = "a ""q"" b" /* x */ , 12')
        self.assertEqual([t.kind for t in toks], ["qident", "sym", "string", "sym", "number"])
        self.assertEqual(toks[2].text, 'a "q" b')

    def test_members_steps_and_references(self):
        doc = parse_document(
            '[StagingDefinition = [Kind = "FastCopy"]]\nsection Section1;\n'
            'shared A = let S = Sql.Database("h", "d"), T = Table.SelectRows(S, each [x] = ",;"), #"Last step" = Table.Sort(T, {{"x", 0}}) in #"Last step";\n'
            '[DataDestinations = {[Definition = [Kind = "Reference", QueryName = "A_DataDestination"], Settings = [Kind = "Manual", DynamicSchema = false, UpdateMethod = [Kind = "Append"]]]}]\n'
            'shared B = let X = A in X;\nshared A_DataDestination = Lakehouse.Contents(null);')
        self.assertIn("FastCopy", doc.header_attrs)
        self.assertEqual(list(doc.members), ["A", "B", "A_DataDestination"])
        self.assertEqual([s.name for s in doc.members["A"].steps], ["S", "T", "Last step"])
        self.assertEqual(doc.members["B"].refs, ["A"])
        dest = extract_destinations(doc.members["B"].attrs)
        self.assertEqual(dest[0]["update_method"], "Append")
        self.assertIs(dest[0]["dynamic_schema"], False)

    def test_nested_let_and_row_level_calls(self):
        doc = parse_document('section Section1;\nshared Q = let A = Table.AddColumn(S, "c", each let z = Web.Contents("u") in z), B = Table.Buffer(A) in B;')
        steps = doc.members["Q"].steps
        self.assertEqual(len(steps), 2)
        self.assertIn("Web.Contents", steps[0].row_level_calls)

    def test_function_and_parameter_roles(self):
        m = model('section Section1;\nshared P = 1 meta [IsParameterQuery = true];\nshared F = (x) => x + 1;\nshared Q = let S = Sql.Database("a.database.windows.net","d") in S;')
        self.assertEqual(m.queries["P"].role, "parameter")
        self.assertEqual(m.queries["F"].role, "function")
        self.assertEqual(m.queries["Q"].role, "query")


class SampleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.models = {m.name: m for m in load_path(SAMPLES)}
        cls.cfg = Config()

    def test_bad_sample_triggers_expected_rules(self):
        r = analyze(self.models["BadSales"], self.cfg)
        expected = {"DFG-001", "DFG-020", "DFG-023", "DFG-026", "DFG-035", "DFG-036", "DFG-050", "DFG-060", "DFG-061", "DFG-062",
                    "DFG-005", "DFG-011", "DFG-025", "DFG-040", "DFG-041", "ARCH-003", "ARCH-004"}
        self.assertTrue(expected <= ids(r), expected - ids(r))
        self.assertEqual(r.grade, "F")

    def test_combine_files_is_not_flagged_as_row_by_row(self):
        r = analyze(self.models["BadSales"], self.cfg)
        flagged = {f.query for f in r.findings if f.rule_id == "DFG-036"}
        self.assertEqual(flagged, {"FactSales"})

    def test_good_sample_is_clean(self):
        r = analyze(self.models["GoodSales"], self.cfg)
        self.assertEqual([f.rule_id for f in r.findings], [])
        self.assertEqual(r.score, 100)
        self.assertEqual(r.recommendations[0].verdict, "keep")

    def test_suppress_rules(self):
        cfg = Config(suppress_rules=["DFG-001"])
        self.assertNotIn("DFG-001", ids(analyze(self.models["BadSales"], cfg)))


class RuleTests(unittest.TestCase):
    cfg = Config()

    def test_fast_copy_blocked_by_group(self):
        m = model('section Section1;\nshared Q = let S = Sql.Database("x.database.windows.net","d"), N = S{[Item="t"]}[Data], G = Table.Group(N, {"a"}, {{"c", each Table.RowCount(_), Int64.Type}}) in G;',
                  {"computeEngineSettings": {"allowFastCopy": True}, "queriesMetadata": {"Q": {"loadEnabled": True}}})
        self.assertIn("DFG-010", ids(analyze(m, self.cfg)))

    def test_fast_copy_simple_query_ok(self):
        m = model('section Section1;\nshared Q = let S = Sql.Database("x.database.windows.net","d"), N = S{[Item="t"]}[Data], C = Table.SelectColumns(N, {"a"}), T = Table.TransformColumnTypes(C, {{"a", Int64.Type}}) in T;',
                  {"computeEngineSettings": {"allowFastCopy": True}, "queriesMetadata": {"Q": {"loadEnabled": True}}})
        self.assertNotIn("DFG-010", ids(analyze(m, self.cfg)))

    def test_shared_unstaged_query(self):
        m = model('section Section1;\nshared A = let S = Sql.Database("x.database.windows.net","d") in S;\nshared B = let X = A in X;\nshared C = let X = A in X;',
                  {"queriesMetadata": {"A": {"loadEnabled": False}, "B": {"loadEnabled": True}, "C": {"loadEnabled": True}}})
        self.assertIn("DFG-021", ids(analyze(m, self.cfg)))

    def test_fold_breaker_before_filter(self):
        m = model('section Section1;\nshared Q = let S = Sql.Database("x.database.windows.net","d"), A = Table.AddIndexColumn(S, "i", 0, 1), B = Table.SelectRows(A, each [i] > 1), C = Table.Sort(B, {{"i", 0}}) in C;')
        self.assertIn("DFG-030", ids(analyze(m, self.cfg)))

    def test_native_query_without_folding(self):
        m = model('section Section1;\nshared Q = let S = Sql.Database("x.database.windows.net","d", [Query = "select 1"]) in S;')
        self.assertIn("DFG-031", ids(analyze(m, self.cfg)))

    def test_incremental_conflicts(self):
        m = model('section Section1;\n[DataDestinations = {[Definition = [Kind = "Reference", QueryName = "Q_DataDestination"], Settings = [Kind = "Manual", DynamicSchema = true, UpdateMethod = [Kind = "Append"]]]}]\n'
                  'shared Q = let S = Sql.Database("x.database.windows.net","d") in S;\nshared Q_DataDestination = Lakehouse.Contents(null);')
        r = analyze(m, Config(assume_incremental=["Q"]))
        self.assertIn("DFG-063", ids(r))
        self.assertNotIn("DFG-060", ids(r))

    def test_full_reload_candidate(self):
        m = model('section Section1;\n[DataDestinations = {[Definition = [Kind = "Reference", QueryName = "Q_DataDestination"], Settings = [Kind = "Manual", UpdateMethod = [Kind = "Replace"]]]}]\n'
                  'shared Q = let S = Sql.Database("x.database.windows.net","d"), F = Table.SelectRows(S, each [ModifiedDate] > #date(2020,1,1)) in F;\nshared Q_DataDestination = Lakehouse.Contents(null);')
        self.assertIn("DFG-060", ids(analyze(m, self.cfg)))

    def test_legacy_model_flagged(self):
        legacy = {"name": "Old", "pbi:mashup": {"document": 'section Section1;\nshared Q = let S = Sql.Database("a.database.windows.net","d") in S;', "queriesMetadata": {"Q": {"loadEnabled": True}}}}
        m = model_from_legacy_json(legacy, df_id="old")
        self.assertEqual(m.fmt, "legacy")
        self.assertIn("DFG-008", ids(analyze(m, self.cfg)))

    def test_partitioned_compute_misconfigured(self):
        m = model('section Section1;\nshared Q = let S = AzureStorage.DataLake("https://a.dfs.core.windows.net/c") in S;',
                  {"computeEngineSettings": {"allowPartitionedCompute": True}, "queriesMetadata": {"Q": {"loadEnabled": False}}})
        self.assertIn("DFG-006", ids(analyze(m, self.cfg)))

    def test_unreadable_definition_is_not_scored(self):
        m = build_model(df_id="x", name="x", mashup_text="")
        m.definition_available = False
        m.definition_error = 'HTTP 404: {"errorCode":"CapacityNotActive","message":"Capacity is not active"}'
        r = analyze(m, Config())
        self.assertIsNone(r.score)
        self.assertEqual(r.grade, "N/A")
        self.assertEqual([f.rule_id for f in r.findings], ["DFG-000"])
        self.assertIn("capacity", r.findings[0].evidence)

    def test_every_rule_maps_to_a_known_section(self):
        for rid, meta in RULES.items():
            self.assertIn(meta.section, SECTIONS, rid)
        self.assertTrue(manual_checklist())
        self.assertTrue(all(row["status"] for row in coverage_matrix()))


class TelemetryTests(unittest.TestCase):
    def runs(self, durations, failed=0):
        out = []
        for i, d in enumerate(durations):
            out.append({"status": "Completed", "invokeType": "Scheduled", "startTimeUtc": f"2026-10-{1 + i:02d}T01:00:00.1234567Z", "endTimeUtc": f"2026-10-{1 + i:02d}T01:00:00.1234567Z"})
            h, rem = divmod(int(d), 3600)
            mi, s = divmod(rem, 60)
            out[-1]["endTimeUtc"] = f"2026-10-{1 + i:02d}T{1 + h:02d}:{mi:02d}:{s:02d}.1234567Z"
        for j in range(failed):
            out.append({"status": "Failed", "startTimeUtc": f"2026-10-2{j}T01:00:00Z", "endTimeUtc": f"2026-10-2{j}T01:10:00Z",
                        "failureReason": {"message": "Request timed out after 600s", "errorCode": "Timeout"}})
        return out

    def test_parse_ts_seven_digit_fraction(self):
        self.assertEqual(parse_ts("2026-10-01T01:02:03.1234567Z").microsecond, 123456)

    def test_stats_and_rules(self):
        m = model('section Section1;\nshared Q = let S = Sql.Database("x.database.windows.net","d") in S;')
        m.runs = self.runs([600, 650, 700, 2400, 3000, 5400, 7000, 7200], failed=3)
        m.schedules = [{"enabled": True, "configuration": {"type": "Cron", "interval": 10, "startDateTime": "2026-10-01T02:00:00"}}]
        m.history_loaded = True
        r = analyze(m, Config())
        self.assertGreater(r.telemetry["failure_rate"], 0.2)
        self.assertEqual(r.telemetry["failure_classes"], {"timeout": 3})
        self.assertTrue({"DFG-090", "DFG-091", "DFG-092", "DFG-093"} <= ids(r), ids(r))
        self.assertTrue(r.cost["cu_seconds_per_run_p50"] > 0)

    def test_cost_model(self):
        self.assertEqual(tiered_cu(900), 600 * 12 + 300 * 1.5)
        self.assertEqual(tiered_cu(100), 1200)
        self.assertEqual(tiered_cu(900, legacy=True), 900 * 16)

    def test_schedule_interval(self):
        self.assertEqual(schedule_interval_minutes([{"configuration": {"type": "Daily", "times": ["01:00", "13:00"]}}]), 720 * 7 / 7)
        self.assertIsNone(schedule_interval_minutes([{"enabled": False, "configuration": {"type": "Cron", "interval": 5}}]))

    def test_failure_classifier(self):
        self.assertEqual(classify_failure("Fast copy is not supported"), "fast-copy")
        self.assertEqual(classify_failure("HTTP 429 Too Many Requests"), "throttling")

    def test_schedule_collision(self):
        ms = []
        for i in range(4):
            m = model('section Section1;\nshared Q = let S = Sql.Database("x.database.windows.net","d") in S;')
            m.name = f"df{i}"
            m.workspace_id = "ws"
            m.schedules = [{"enabled": True, "configuration": {"type": "Daily", "times": ["02:00"]}}]
            m.history_loaded = True
            ms.append(m)
        res = analyze_all(ms, Config())
        self.assertTrue(all("DFG-095" in ids(r) for r in res))


class LoaderReportTests(unittest.TestCase):
    def test_get_definition_json_roundtrip(self):
        def part(path, text):
            return {"path": path, "payload": base64.b64encode(text.encode()).decode(), "payloadType": "InlineBase64"}
        parts = [part("mashup.pq", 'section Section1;\nshared Q = let S = Sql.Database("a.database.windows.net","d") in S;'),
                 part("queryMetadata.json", json.dumps({"name": "Z", "queriesMetadata": {"Q": {"loadEnabled": True}}})),
                 part(".platform", json.dumps({"metadata": {"displayName": "Display"}}))]
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "def.json")
            with open(p, "w") as fh:
                json.dump({"definition": {"parts": parts}}, fh)
            ms = load_path(p)
        self.assertEqual(ms[0].name, "Display")
        self.assertIn("Q", ms[0].queries)

    def test_reports_written_and_escaped(self):
        m = model('section Section1;\nshared #"<script>alert(1)</script>" = let S = Table.Buffer(Sql.Database("a.database.windows.net","d")) in S;')
        res = analyze_all([m], Config())
        with tempfile.TemporaryDirectory() as d:
            paths = write_all(res, d, ["html", "md", "json", "csv"])
            self.assertEqual(len(paths), 4)
            with open(paths[0], encoding="utf-8") as fh:
                html = fh.read()
            self.assertNotIn("<script>alert(1)</script>", html)
            self.assertIn("&lt;script&gt;alert(1)", html)
            with open(paths[2], encoding="utf-8") as fh:
                json.load(fh)

    def test_live_collection_with_fake_client(self):
        class Fake:
            def list_workspaces(self):
                return [{"id": "w1", "displayName": "WS"}]

            def resolve_workspace(self, ref):
                return self.list_workspaces()[0]

            def list_dataflows(self, ws):
                return [{"id": "d1", "displayName": "Sales"}]

            def get_definition(self, ws, item):
                b = lambda s: base64.b64encode(s.encode()).decode()  # noqa: E731
                return {"definition": {"parts": [
                    {"path": "mashup.pq", "payload": b('section Section1;\nshared Q = let S = Sql.Database("a.database.windows.net","d") in S;'), "payloadType": "InlineBase64"},
                    {"path": "queryMetadata.json", "payload": b('{"queriesMetadata":{"Q":{"loadEnabled":true}}}'), "payloadType": "InlineBase64"}]}}

            def list_job_instances(self, ws, item, days=30):
                return [{"status": "Completed", "startTimeUtc": "2026-10-01T01:00:00Z", "endTimeUtc": "2026-10-01T01:05:00Z"}]

            def list_schedules(self, ws, item):
                return []

        ms = collect_live(Fake(), ["WS"], Config(), log=lambda _m: None)
        self.assertEqual(ms[0].workspace_name, "WS")
        self.assertTrue(ms[0].history_loaded)
        self.assertEqual(analyze(ms[0], Config()).telemetry["runs"], 1)


if __name__ == "__main__":
    unittest.main()
