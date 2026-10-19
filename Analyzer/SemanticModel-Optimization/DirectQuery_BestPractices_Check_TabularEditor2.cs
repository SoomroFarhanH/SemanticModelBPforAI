/*
 * DirectQuery Semantic Model - Best Practices Check
 * -------------------------------------------------
 * C# script for TABULAR EDITOR 2.x (Advanced Scripting tab).
 *
 * How to run:
 *   1. Open the semantic model in Tabular Editor 2.x
 *      (File > Open > From DB..., connect to the workspace XMLA endpoint and pick the model).
 *   2. Open the "C# Script" tab.
 *   3. Paste this script and press F5 (Run).
 *   4. Results appear in the Output window (a text report is shown at the end).
 *
 * What it checks (parity with the Fabric notebook, where feasible in TE2):
 *   1  Star schema fundamentals (snowflaking / standalone tables)
 *   1b Power Query transformations on DirectQuery FACT tables -> recommend a source view
 *   2  Dimension tables in Dual storage mode
 *   3  Assume Referential Integrity on relationships
 *   4  Relationship columns are Integer (Int64)
 *   5  Aggregation strategy (prefer targeted User-Defined Aggregations)
 *      Auto Aggregations = MANUAL and informational (AlternateOf isn't exposed by the TE2 wrapper)
 *   5b SSO vs Auto Aggregations = MANUAL (SSO lives on the gateway/connection, not in TOM)
 *   5c Calendar-based time intelligence and Visual Calculations = MANUAL
 *   5d Hybrid Tables / dataCoverageDefinition = INFO (coverage verification is manual)
 *   5e Discourage Implicit Measures = PASS / WARN / MANUAL
 *   6  MaxParallelismPerQuery = MANUAL (not exposed by the TE2 wrapper)
 *   7  Data source MaxConnections vs SKU cap = MANUAL (MaxConnections not exposed by the TE2 wrapper)
 *
 * NOTE: TE2 scripts run only against the model's public wrapper API (no .MetadataObject,
 *       no Power BI REST). Checks that need TOM internals or the service are reported as MANUAL.
 */

// ---- Config -------------------------------------------------------------
var TARGET_SKU = "F64";   // F2, F4, F8, F16, F32, F64, F128, F256, F512, F1024, F2048

// SKU limits: name -> (MaxConcurrentDQConnections, SuggestedMaxDQParallelism)
var skuLimits = new System.Collections.Generic.Dictionary<string, System.Tuple<int, string>>() {
    { "F2",    System.Tuple.Create(5,   "1")   },
    { "F4",    System.Tuple.Create(5,   "1")   },
    { "F8",    System.Tuple.Create(10,  "1")   },
    { "F16",   System.Tuple.Create(10,  "1")   },
    { "F32",   System.Tuple.Create(10,  "1")   },
    { "F64",   System.Tuple.Create(50,  "4-8") },
    { "F128",  System.Tuple.Create(75,  "6-12")},
    { "F256",  System.Tuple.Create(100, "8-16")},
    { "F512",  System.Tuple.Create(200, "10-20")},
    { "F1024", System.Tuple.Create(200, "12-24")},
    { "F2048", System.Tuple.Create(200, "12-24")},
};

// ---- Report accumulator -------------------------------------------------
var report = new System.Collections.Generic.List<string[]>();
System.Action<string, string, string> Add = (check, status, detail) =>
    report.Add(new string[] { check, status, detail });

// ---- Helper: M expression of a partition (Power Query / M sources only) ---
System.Func<Partition, string> GetM = (p) =>
{
    try {
        if (p.SourceType.ToString() == "M") return p.Expression ?? "";
    } catch { }
    return "";
};

// ---- Storage mode per table & DirectQuery detection ----------------------
var storageMode = new System.Collections.Generic.Dictionary<string, string>();
bool isDqModel = false;
foreach (var t in Model.Tables)
{
    var modes = t.Partitions.Select(p => p.Mode.ToString()).Distinct().OrderBy(x => x).ToList();
    var joined = string.Join(",", modes);
    storageMode[t.Name] = string.IsNullOrEmpty(joined) ? "Unknown" : joined;
    if (joined.Contains("DirectQuery")) isDqModel = true;
}
Add("Model uses DirectQuery", "INFO", isDqModel.ToString());

// ---- Classify fact vs dimension via relationships ------------------------
var manySide = new System.Collections.Generic.HashSet<string>();   // FROM = many => fact-like
var oneSide  = new System.Collections.Generic.HashSet<string>();   // TO   = one  => dimension-like
foreach (var r in Model.Relationships.OfType<SingleColumnRelationship>())
{
    manySide.Add(r.FromTable.Name);
    oneSide.Add(r.ToTable.Name);
}
System.Func<string, string> Role = (name) =>
{
    bool f = manySide.Contains(name), o = oneSide.Contains(name);
    if (f && !o) return "Fact";
    if (o && !f) return "Dimension";
    if (f && o)  return "Bridge/Snowflake";
    return "Standalone";
};

// ---- Check 1: Star schema fundamentals -----------------------------------
var snowflake = Model.Relationships.OfType<SingleColumnRelationship>()
                     .Where(r => manySide.Contains(r.FromTable.Name) && oneSide.Contains(r.FromTable.Name))
                     .ToList();
var standalone = Model.Tables.Where(t => !manySide.Contains(t.Name) && !oneSide.Contains(t.Name))
                             .Select(t => t.Name).ToList();
Add("Star schema - snowflaked relationships",
    snowflake.Count == 0 ? "PASS" : "WARN",
    snowflake.Count + " dimension->dimension relationship(s)");
Add("Star schema - standalone tables",
    standalone.Count == 0 ? "PASS" : "WARN",
    standalone.Count == 0 ? "none" : string.Join(", ", standalone));

// ---- Check 1b: Power Query transforms on DirectQuery fact tables ----------
var patterns = new string[] {
    @"Table\.TransformColumns", @"Table\.AddColumn", @"Table\.SelectRows",
    @"Table\.RemoveColumns", @"Table\.RenameColumns", @"Table\.TransformColumnTypes",
    @"Table\.Group", @"Table\.Pivot", @"Table\.Unpivot", @"Table\.Distinct",
    @"Table\.Sort", @"Table\.Join", @"Table\.NestedJoin", @"Table\.FillDown",
    @"Table\.FillUp", @"Table\.SplitColumn", @"Table\.CombineColumns",
    @"Table\.ReplaceValue", @"Table\.Buffer", @"Table\.ExpandTableColumn",
    @"Table\.ExpandRecordColumn", @"Table\.AddIndexColumn",
    @"#""Filtered Rows""", @"#""Added Custom""", @"#""Grouped Rows""",
    @"#""Removed Columns""", @"#""Changed Type""", @"#""Merged Queries""",
    @"#""Added Conditional Column""", @"#""Changed Type with Locale""",
    @"#""Added Custom Column""", @"#""Inserted "
};
var rx = new System.Text.RegularExpressions.Regex(string.Join("|", patterns));

var factDqTransforms = new System.Collections.Generic.List<string>();
var otherDqTransforms = new System.Collections.Generic.List<string>();
foreach (var t in Model.Tables)
{
    if (!storageMode[t.Name].Contains("DirectQuery")) continue;
    var mAll = string.Join("\n", t.Partitions.Select(p => GetM(p)));
    if (string.IsNullOrEmpty(mAll)) continue;
    if (!rx.IsMatch(mAll)) continue;
    if (Role(t.Name) == "Fact") factDqTransforms.Add(t.Name);
    else otherDqTransforms.Add(t.Name);
}
string VIEW_DOC = "https://learn.microsoft.com/power-bi/guidance/directquery-model-guidance";
if (factDqTransforms.Count > 0)
    Add("Power Query transforms on DQ fact tables (create source view)", "WARN",
        "Create a VIEW at the data source for: " + string.Join(", ", factDqTransforms) + ". See " + VIEW_DOC);
else if (otherDqTransforms.Count > 0)
    Add("Power Query transforms on DQ fact tables (create source view)", "WARN",
        "DQ (non-fact) tables use M transforms - consider a source view: " + string.Join(", ", otherDqTransforms));
else
    Add("Power Query transforms on DQ fact tables (create source view)", "PASS",
        "No non-trivial Power Query transformations on DirectQuery tables.");

// ---- Check 2: Dimensions in Dual mode ------------------------------------
var notDual = Model.Tables.Where(t => Role(t.Name) == "Dimension" && storageMode[t.Name] != "Dual")
                          .Select(t => t.Name).ToList();
if (!isDqModel)
    Add("Dimensions in Dual mode", "INFO", "Model is not DirectQuery - Dual mode requirement does not apply.");
else
    Add("Dimensions in Dual mode", notDual.Count == 0 ? "PASS" : "FAIL",
        notDual.Count == 0 ? "all dimensions Dual" : notDual.Count + " not Dual: " + string.Join(", ", notDual));

// ---- Check 3: Assume Referential Integrity -------------------------------
var rels = Model.Relationships.OfType<SingleColumnRelationship>().ToList();
var missingRi = rels.Where(r => !r.RelyOnReferentialIntegrity).ToList();
Add("Assume Referential Integrity on all relationships",
    rels.Count == 0 ? "INFO" : (missingRi.Count == 0 ? "PASS" : "FAIL"),
    rels.Count == 0 ? "no relationships" : missingRi.Count + " of " + rels.Count + " missing Assume RI");

// ---- Check 4: Relationship columns are Integer ---------------------------
var badTypes = rels.Where(r => r.FromColumn.DataType.ToString() != "Int64"
                            || r.ToColumn.DataType.ToString()   != "Int64").ToList();
Add("Relationship keys are Integer",
    rels.Count == 0 ? "INFO" : (badTypes.Count == 0 ? "PASS" : "FAIL"),
    badTypes.Count + " relationship(s) use non-integer join keys");

// ---- Check 5: Aggregation strategy ---------------------------------------
Add("Aggregation strategy (prefer User-Defined Aggregations)", "INFO",
    "Prefer targeted aggregations based on known report workloads: " +
    "https://learn.microsoft.com/power-bi/transform-model/aggregations-advanced");

// AlternateOf (aggregation binding) is not surfaced by the TE2 wrapper, so this is informational.
Add("Auto Aggregations (informational, not a default recommendation)", "MANUAL",
    "Not detectable in TE2. Their absence is acceptable; if enabled, retain them only when measured query " +
    "benefits justify CU consumption. Configuration reference: " +
    "https://learn.microsoft.com/power-bi/enterprise/aggregations-auto-configure");

// ---- Check 5b: SSO vs Auto Aggregations (cannot detect in TE2) ------------
Add("SSO vs Auto Aggregations (use User-Defined Aggregations if SSO)", "MANUAL",
    "SSO is on the gateway/connection, not in TOM. If SSO is ON, Auto Aggregations skip those tables - " +
    "use User-Defined Aggregations: https://learn.microsoft.com/power-bi/transform-model/aggregations-advanced");

// ---- Check 5c: Calendar time intelligence and Visual Calculations --------
Add("Calendar-based time intelligence and Visual Calculations", "MANUAL",
    "Benchmark calendar-based time intelligence for duration, DQ rows, SQL request count, CPU, and memory: " +
    "https://blog.crossjoin.co.uk/2025/11/30/a-look-at-the-impact-of-calendar-based-time-intelligence-on-power-bi-directquery-performance/ " +
    "Use Visual Calculations for suitable visual-local calculations over aggregated results: " +
    "https://learn.microsoft.com/power-bi/transform-model/desktop-visual-calculations-overview");

// ---- Check 5d: Hybrid Tables / dataCoverageDefinition --------------------
var hybridTables = Model.Tables
    .Where(t => t.Partitions.Any(p => p.Mode.ToString() == "Import")
             && t.Partitions.Any(p => p.Mode.ToString() == "DirectQuery"))
    .Select(t => t.Name).ToList();
Add("Hybrid Tables / dataCoverageDefinition (advanced)", "INFO",
    hybridTables.Count == 0
                ? "No hybrid tables detected. Consider them only for a suitable hot/cold data pattern: " +
                    "https://blog.crossjoin.co.uk/2024/02/25/datacoveragedefinition-a-new-optimisation-for-hybrid-tables-in-power-bi/"
        : "Hybrid tables detected: " + string.Join(", ", hybridTables) +
          ". Verify an accurate dataCoverageDefinition on each DirectQuery partition: " +
          "https://blog.crossjoin.co.uk/2024/02/25/datacoveragedefinition-a-new-optimisation-for-hybrid-tables-in-power-bi/");

// ---- Check 5e: Discourage Implicit Measures ------------------------------
try
{
    var discourageProperty = Model.GetType().GetProperty("DiscourageImplicitMeasures");
    if (discourageProperty == null)
        Add("Discourage Implicit Measures", "MANUAL",
            "Property is not exposed by this TE2 wrapper; verify Model.DiscourageImplicitMeasures manually.");
    else
    {
        bool discourageImplicit = System.Convert.ToBoolean(discourageProperty.GetValue(Model, null));
        Add("Discourage Implicit Measures", discourageImplicit ? "PASS" : "WARN",
            discourageImplicit
                ? "Model.DiscourageImplicitMeasures is enabled."
                : "Consider enabling Model.DiscourageImplicitMeasures after testing report-authoring and filter-pane behavior: " +
                  "https://blog.crossjoin.co.uk/2023/04/16/disabling-filter-pane-aggregates-in-power-bi/");
    }
}
catch
{
    Add("Discourage Implicit Measures", "MANUAL",
        "Could not read Model.DiscourageImplicitMeasures; verify it manually.");
}

// ---- Check 6: MaxParallelismPerQuery -------------------------------------
// Model.MaxParallelismPerQuery is not surfaced by the TE2 wrapper - manual/scripted check.
string suggestion = skuLimits.ContainsKey(TARGET_SKU) ? skuLimits[TARGET_SKU].Item2 : "n/a";
Add("MaxParallelismPerQuery configured", "MANUAL",
    "Not readable via TE2 wrapper. For " + TARGET_SKU + " consider " + suggestion +
    " when DQ latency is the bottleneck (set Model.MaxParallelismPerQuery via TOM/PowerShell).");

// ---- Check 7: DataSource MaxConnections vs SKU cap -----------------------
// MaxConnections isn't surfaced by the TE2 wrapper - report the SKU cap and count as a manual check.
int skuCap = skuLimits.ContainsKey(TARGET_SKU) ? skuLimits[TARGET_SKU].Item1 : 0;
int dsCount = 0;
try { dsCount = Model.DataSources.Count; } catch { }
Add("DataSource MaxConnections <= SKU cap", "MANUAL",
    "SKU=" + TARGET_SKU + " cap=" + skuCap + " concurrent DQ connections. " +
    dsCount + " model data source(s). MaxConnections isn't readable via the TE2 wrapper - verify it is <= " + skuCap + ".");

// ---- Sort by status: PASS, INFO, WARN, MANUAL, FAIL ----------------------
var order = new System.Collections.Generic.Dictionary<string, int>() {
    { "PASS", 0 }, { "INFO", 1 }, { "WARN", 2 }, { "MANUAL", 3 }, { "FAIL", 4 }
};
var sorted = report.OrderBy(r => order.ContainsKey(r[1]) ? order[r[1]] : 99).ToList();

// ---- Render text report --------------------------------------------------
// The Output window uses a proportional font, so column padding won't align.
// Use a per-check block layout with a status tag and word-wrapped detail.
System.Func<string, int, string, string> Wrap = (text, width, indent) =>
{
    var words = (text ?? "").Split(' ');
    var lines = new System.Collections.Generic.List<string>();
    var cur = "";
    foreach (var w in words)
    {
        if (cur.Length == 0) cur = w;
        else if ((cur.Length + 1 + w.Length) <= width) cur += " " + w;
        else { lines.Add(cur); cur = w; }
    }
    if (cur.Length > 0) lines.Add(cur);
    return string.Join("\r\n" + indent, lines);
};

var counts = new System.Text.StringBuilder();
foreach (var s in new string[] { "FAIL", "WARN", "MANUAL", "INFO", "PASS" })
{
    int n = sorted.Count(r => r[1] == s);
    if (counts.Length > 0) counts.Append("  |  ");
    counts.Append(s + " " + n);
}

var sb = new System.Text.StringBuilder();
sb.AppendLine("DirectQuery Best-Practices Check  -  Tabular Editor 2.x");
sb.AppendLine("Model: " + Model.Name + "     Target SKU: " + TARGET_SKU);
sb.AppendLine("Summary:  " + counts.ToString());
sb.AppendLine(new string('=', 90));
sb.AppendLine();

foreach (var r in sorted)
{
    sb.AppendLine("[" + r[1] + "]  " + r[0]);
    sb.AppendLine("      " + Wrap(r[2], 110, "      "));
    sb.AppendLine();
}

sb.ToString().Output();