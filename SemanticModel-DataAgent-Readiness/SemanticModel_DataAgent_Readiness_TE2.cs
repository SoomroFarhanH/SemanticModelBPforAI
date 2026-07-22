// Semantic Model Data Agent Readiness Analyzer
// Tabular Editor 2.28.0 - Advanced Scripting compatible script
// Aligned with: Optimize your semantic model for Copilot in Power BI
//   https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data

var checkScores = new Dictionary<string, int[]>(); // key -> [achieved, max, weight]
var findings = new List<string[]>();               // [severity, check, description]
var reportLines = new List<string>();

Action separator = delegate { reportLines.Add(new string('=', 72)); };
Action<string> logInfo = delegate(string s) { reportLines.Add(s); };
Action<string> logWarn = delegate(string s) { reportLines.Add("WARNING: " + s); };
Action<string> logErr = delegate(string s) { reportLines.Add("CRITICAL: " + s); };
Action<string, string, string> addFinding = delegate(string severity, string checkName, string description)
{
    findings.Add(new[] { severity, checkName, description });
};

Func<string, bool> isBlank = delegate(string s)
{
    return string.IsNullOrWhiteSpace(s);
};

Func<string, string> safeLower = delegate(string s)
{
    return (s ?? "").ToLowerInvariant();
};

// ------------------------------------------------------------
// Model snapshot
// ------------------------------------------------------------
var userTables = Model.Tables
    .Where(t =>
    {
        var n = t.Name ?? "";
        return !n.StartsWith("DateTableTemplate_") && !n.StartsWith("LocalDateTable_");
    })
    .ToList();

var visibleTables = userTables.Where(t => !t.IsHidden).ToList();

var allColumns = userTables.SelectMany(t => t.Columns).ToList();

var visibleColumns = visibleTables
    .SelectMany(t => t.Columns)
    .Where(c =>
    {
        if (c.IsHidden) return false;

        // Exclude row-number columns when the property exists.
        try
        {
            var p = c.GetType().GetProperty("IsRowNumber");
            if (p != null)
            {
                var v = p.GetValue(c, null);
                if (v is bool && (bool)v) return false;
            }
        }
        catch { }

        return true;
    })
    .ToList();

var allMeasures = userTables.SelectMany(t => t.Measures).ToList();
var visibleMeasures = visibleTables.SelectMany(t => t.Measures).Where(m => !m.IsHidden).ToList();
var relationships = Model.Relationships.ToList();

separator();
logInfo("Semantic Model Data Agent Readiness Analyzer (TE2)");
separator();
logInfo("Model: " + Model.Database.Name);
logInfo("Visible tables: " + visibleTables.Count + " (total incl. hidden: " + userTables.Count + ")");
logInfo("Visible columns: " + visibleColumns.Count + " (total incl. hidden: " + allColumns.Count + ")");
logInfo("Visible measures: " + visibleMeasures.Count + " (total incl. hidden: " + allMeasures.Count + ")");
logInfo("Relationships: " + relationships.Count);

// ------------------------------------------------------------
// 1.1 Star schema validation
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.1: STAR SCHEMA VALIDATION");
    var score = 20;

    if (relationships.Count == 0)
    {
        logErr("CRITICAL: No relationships found.");
        addFinding("critical", "1.1 Star Schema", "No relationships found");
        score = 0;
    }
    else
    {
        var m2m = 0;
        var bidir = 0;

        foreach (var r in relationships)
        {
            var fromCard = (r.FromCardinality.ToString() ?? "").ToLowerInvariant();
            var toCard = (r.ToCardinality.ToString() ?? "").ToLowerInvariant();
            if (fromCard.Contains("many") && toCard.Contains("many")) m2m++;

            var cfb = (r.CrossFilteringBehavior.ToString() ?? "").ToLowerInvariant();
            if (cfb.Contains("both")) bidir++;
        }

        if (m2m > 0)
        {
            logWarn(m2m + " many-to-many relationship(s) detected.");
            addFinding("important", "1.1 Star Schema", m2m + " many-to-many relationship(s)");
            score -= Math.Min(6, m2m * 3);
        }

        if (bidir > 0)
        {
            logWarn(bidir + " bidirectional relationship(s) detected.");
            addFinding("important", "1.1 Star Schema", bidir + " bidirectional relationship(s)");
            score -= Math.Min(4, bidir * 2);
        }

        var related = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in relationships)
        {
            if (r.FromTable != null && !isBlank(r.FromTable.Name)) related.Add(r.FromTable.Name);
            if (r.ToTable != null && !isBlank(r.ToTable.Name)) related.Add(r.ToTable.Name);
        }

        var isolated = visibleTables
            .Where(t => !related.Contains(t.Name))
            .Where(t =>
            {
                var n = safeLower(t.Name);
                return !n.Contains("parameter") && !n.Contains("_param");
            })
            .ToList();

        if (isolated.Count > 0)
        {
            logWarn(isolated.Count + " visible table(s) have no relationships.");
            addFinding("important", "1.1 Star Schema", isolated.Count + " isolated visible table(s)");
            score -= Math.Min(6, isolated.Count * 2);
        }
    }

    score = Math.Max(0, score);
    checkScores["1.1_star_schema"] = new[] { score, 20, 3 };
    logInfo("Score: " + score + "/20");
}

// ------------------------------------------------------------
// 1.4 Data type validation
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.4: DATA TYPE VALIDATION");
    var score = 10;

    var textDate = visibleColumns.Where(c =>
    {
        var dt = c.DataType.ToString();
        if (!safeLower(dt).Contains("string") && !safeLower(dt).Contains("text")) return false;

        var n = safeLower(c.Name);
        return n.Contains("date") || n.Contains("day") || n.Contains("month") || n.Contains("year") || n.Contains("time") || n.Contains("timestamp");
    }).ToList();

    var textNumeric = visibleColumns.Where(c =>
    {
        var dt = c.DataType.ToString();
        if (!safeLower(dt).Contains("string") && !safeLower(dt).Contains("text")) return false;

        var n = safeLower(c.Name);
        return n.EndsWith("amount") || n.EndsWith("amt") || n.EndsWith("qty") || n.EndsWith("count") || n.EndsWith("price") || n.EndsWith("cost") || n.EndsWith("rate") || n.EndsWith("percent") || n.EndsWith("id") || n.EndsWith("key");
    }).ToList();

    if (textDate.Count > 0)
    {
        logWarn(textDate.Count + " date-like column(s) stored as text.");
        addFinding("important", "1.4 Data Types", textDate.Count + " date-like columns stored as text");
        score -= Math.Min(5, textDate.Count);
    }

    if (textNumeric.Count > 0)
    {
        logWarn(textNumeric.Count + " numeric-like column(s) stored as text.");
        addFinding("recommended", "1.4 Data Types", textNumeric.Count + " numeric-like columns stored as text");
        score -= Math.Min(3, textNumeric.Count);
    }

    score = Math.Max(0, score);
    checkScores["1.4_data_types"] = new[] { score, 10, 2 };
    logInfo("Score: " + score + "/10");
}

// ------------------------------------------------------------
// 1.6 Description coverage
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.6: DESCRIPTIONS COVERAGE");
    var score = 20;

    var missing = visibleTables.Count(t => isBlank(t.Description))
        + visibleColumns.Count(c => isBlank(c.Description))
        + visibleMeasures.Count(m => isBlank(m.Description));

    var total = visibleTables.Count + visibleColumns.Count + visibleMeasures.Count;

    if (missing > 0)
    {
        var cov = 1.0 - ((double)missing / Math.Max(total, 1));
        score = Math.Max(0, (int)Math.Round(20 * cov));
        logErr(missing + " visible object(s) missing descriptions.");
        addFinding("critical", "1.6 Coverage", missing + " visible objects missing descriptions");
    }

    checkScores["1.6_descriptions"] = new[] { score, 20, 3 };
    logInfo("Score: " + score + "/20");
}

// ------------------------------------------------------------
// 1.9 Explicit measures (no implicit summarization)
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.9: EXPLICIT MEASURES");
    var score = 15;

    var numericCols = visibleColumns.Where(c =>
    {
        var dt = safeLower(c.DataType.ToString());
        return dt.Contains("int") || dt.Contains("decimal") || dt.Contains("double") || dt.Contains("currency") || dt.Contains("number");
    }).ToList();

    var implicitCols = new List<object>();
    foreach (var c in numericCols)
    {
        try
        {
            var p = c.GetType().GetProperty("SummarizeBy");
            if (p != null)
            {
                var v = p.GetValue(c, null);
                var s = safeLower(v == null ? "" : v.ToString());
                if (s != "none" && s != "donotsummarize" && s != "do not summarize")
                    implicitCols.Add(c);
            }
        }
        catch { }
    }

    if (implicitCols.Count > 0)
    {
        logErr(implicitCols.Count + " numeric column(s) use implicit summarization.");
        addFinding("critical", "1.9 Implicit Measures", implicitCols.Count + " columns with implicit summarization");
        var pct = (double)implicitCols.Count / Math.Max(numericCols.Count, 1) * 100.0;
        score = Math.Max(0, (int)Math.Round(15 - pct / 5.0));
    }

    checkScores["1.9_implicit_measures"] = new[] { score, 15, 3 };
    logInfo("Score: " + score + "/15");
}

// ------------------------------------------------------------
// 1.12 Hidden objects + technical columns
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.12: HIDDEN OBJECTS AND TECH COLUMNS");
    var score = 5;

    var hiddenColumns = allColumns.Where(c => c.IsHidden).ToList();

    var visibleTech = visibleColumns.Where(c =>
    {
        var n = safeLower(c.Name);
        return n == "id" || n.EndsWith("_id") || n == "key" || n.EndsWith("_key") || n.Contains("guid") || n.Contains("sort") || n.Contains("rowversion") || n.Contains("etag");
    }).ToList();

    if (visibleTech.Count > 0)
    {
        logWarn(visibleTech.Count + " visible technical column(s) (PK/FK/GUID/sort-like).");
        addFinding("important", "1.12 Hidden Objects", visibleTech.Count + " visible technical columns should be hidden");
        score = Math.Max(1, score - 2);
    }

    if (hiddenColumns.Count > 0)
    {
        var hiddenNoDesc = hiddenColumns.Count(c => isBlank(c.Description));
        var pct = (double)hiddenNoDesc / Math.Max(hiddenColumns.Count, 1) * 100.0;
        if (pct > 50.0)
        {
            logWarn(hiddenNoDesc + " hidden column(s) without descriptions.");
            addFinding("important", "1.12 Hidden Objects", hiddenNoDesc + " hidden columns without descriptions");
            score = Math.Max(1, score - 2);
        }
    }

    checkScores["1.12_hidden_objects"] = new[] { score, 5, 1 };
    logInfo("Score: " + score + "/5");
}

// ------------------------------------------------------------
// 1.15 Duplicate column names across tables
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.15: DUPLICATE COLUMN NAMES ACROSS TABLES");
    var score = 5;

    var duplicates = visibleColumns
        .GroupBy(c => c.Name ?? "", StringComparer.OrdinalIgnoreCase)
        .Select(g => new { Name = g.Key, TableCount = g.Select(c => c.Table.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() })
        .Where(x => x.TableCount > 1)
        .ToList();

    if (duplicates.Count > 0)
    {
        logWarn(duplicates.Count + " duplicate column name(s) across tables.");
        addFinding("important", "1.15 Duplicate Columns", duplicates.Count + " column names shared across multiple tables");
        var penalty = Math.Min(4, duplicates.Count);
        score = Math.Max(1, 5 - penalty);
    }

    checkScores["1.15_duplicate_cols"] = new[] { score, 5, 1 };
    logInfo("Score: " + score + "/5");
}

// ------------------------------------------------------------
// 1.17 Hierarchies (logical groupings)
// Ref: https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data (Model structure)
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.17: HIERARCHIES (LOGICAL GROUPINGS)");
    var score = 5;

    var drillPattern = new System.Text.RegularExpressions.Regex(
        "(date|calendar|time|geography|geo|location|product|organi[sz]ation|org|customer|employee|account)",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    var tablesWithHier = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var hierCount = 0;
    foreach (var t in userTables)
    {
        var hc = t.Hierarchies.Count;
        if (hc > 0)
        {
            hierCount += hc;
            tablesWithHier.Add(t.Name ?? "");
        }
    }

    if (hierCount > 0)
        logInfo(hierCount + " hierarchy(ies) found across " + tablesWithHier.Count + " table(s).");
    else
        logWarn("No hierarchies found in the model.");

    var missingHier = visibleTables
        .Where(t => drillPattern.IsMatch(t.Name ?? "") && !tablesWithHier.Contains(t.Name ?? ""))
        .Select(t => t.Name)
        .ToList();

    if (missingHier.Count > 0)
    {
        logWarn(missingHier.Count + " drill-down candidate table(s) without a hierarchy: " + string.Join(", ", missingHier.Take(10)));
        logInfo("ACTION: Add hierarchies (e.g., Date: Year > Quarter > Month > Day; Geography: Country/Region > State > City) so Copilot can drill down.");
        addFinding("recommended", "1.17 Hierarchies", missingHier.Count + " drill-down table(s) without a hierarchy");
        score = Math.Max(2, score - 2);
    }
    else if (hierCount > 0)
    {
        logInfo("Key dimension tables have hierarchies configured.");
    }

    logInfo("Reference: https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data");
    checkScores["1.17_hierarchies"] = new[] { score, 5, 1 };
    logInfo("Score: " + score + "/5");
}

// ------------------------------------------------------------
// 1.18 Description length - Copilot 200-character window
// Ref: https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data (DAX query considerations)
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.18: DESCRIPTION LENGTH - COPILOT 200-CHARACTER WINDOW");
    var score = 5;
    var limit = 200;

    var longTables = visibleTables.Where(t => !isBlank(t.Description) && t.Description.Trim().Length > limit).ToList();
    var longColumns = visibleColumns.Where(c => !isBlank(c.Description) && c.Description.Trim().Length > limit).ToList();
    var longMeasures = visibleMeasures.Where(m => !isBlank(m.Description) && m.Description.Trim().Length > limit).ToList();
    var totalLong = longTables.Count + longColumns.Count + longMeasures.Count;

    if (totalLong == 0)
    {
        logInfo("PASSED: All descriptions fit within the " + limit + "-character Copilot grounding window.");
    }
    else
    {
        logWarn(totalLong + " description(s) exceed " + limit + " characters - Copilot reads only the first " + limit + ".");
        foreach (var t in longTables.Take(8)) logInfo(" - Table " + t.Name + " (" + t.Description.Trim().Length + " chars)");
        foreach (var c in longColumns.Take(8)) logInfo(" - Column " + c.Table.Name + "[" + c.Name + "] (" + c.Description.Trim().Length + " chars)");
        foreach (var m in longMeasures.Take(8)) logInfo(" - Measure " + m.Table.Name + "[" + m.Name + "] (" + m.Description.Trim().Length + " chars)");
        logInfo("ACTION: Front-load the business meaning + intended usage in the first " + limit + " characters.");
        addFinding("recommended", "1.18 Desc Length", totalLong + " description(s) exceed the " + limit + "-char Copilot window");
        score = Math.Max(2, 5 - Math.Min(3, totalLong));
    }

    logInfo("Reference: https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data");
    checkScores["1.18_desc_length"] = new[] { score, 5, 1 };
    logInfo("Score: " + score + "/5");
}

// ------------------------------------------------------------
// 1.19 Calculation group descriptions
// Ref: https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data (DAX query considerations)
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 1.19: CALCULATION GROUP DESCRIPTIONS");
    var score = 5;
    var limit = 200;

    var cgTotal = 0;
    var cgIssues = new List<string>();

    foreach (var t in userTables)
    {
        var cgt = t as CalculationGroupTable;
        if (cgt == null) continue;
        cgTotal++;

        var items = cgt.CalculationItems.Select(ci => ci.Name ?? "").ToList();
        var desc = (t.Description ?? "").Trim();

        if (isBlank(desc))
        {
            cgIssues.Add(t.Name + " -> no description (list the calculation item names)");
        }
        else
        {
            var descLower = desc.ToLowerInvariant();
            var listsAny = items.Any(it => !isBlank(it) && descLower.Contains(it.ToLowerInvariant()));
            if (items.Count > 0 && !listsAny)
                cgIssues.Add(t.Name + " -> description doesn't list any item: " + string.Join(", ", items.Take(5)));
            else if (desc.Length > limit)
                cgIssues.Add(t.Name + " -> description exceeds " + limit + " chars (" + desc.Length + ") - item names may be cut off");
        }
    }

    if (cgTotal == 0)
    {
        logInfo("No calculation groups found - nothing to check.");
    }
    else if (cgIssues.Count == 0)
    {
        logInfo("PASSED: All " + cgTotal + " calculation group(s) list their item names within the " + limit + "-char window.");
    }
    else
    {
        logWarn(cgIssues.Count + "/" + cgTotal + " calculation group(s) need better descriptions.");
        foreach (var s in cgIssues.Take(8)) logInfo(" - " + s);
        logInfo("ACTION: In the calculation group description, list the item names (e.g., 'YTD: year to date, MTD: month to date, PY: prior year') within the first " + limit + " characters.");
        addFinding("important", "1.19 Calc Groups", cgIssues.Count + " calculation group(s) without item names in description");
        score = Math.Max(1, 5 - Math.Min(3, cgIssues.Count));
    }

    logInfo("Reference: https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data");
    checkScores["1.19_calc_groups"] = new[] { score, 5, 1 };
    logInfo("Score: " + score + "/5");
}

// ------------------------------------------------------------
// 2.3 Helper measures
// ------------------------------------------------------------
{
    separator();
    logInfo("CHECK 2.3: HELPER MEASURES DETECTION");
    var score = 5;

    var helperMeasures = visibleMeasures.Where(m =>
    {
        var n = safeLower(m.Name);
        return n.Contains("helper") || n.EndsWith("_h") || n.Contains("aux") || n.Contains("temp") || n.Contains("tmp") || n.Contains("intermediate") || n.Contains("internal");
    }).ToList();

    if (helperMeasures.Count > 0)
    {
        logWarn(helperMeasures.Count + " potential helper/intermediate visible measure(s).");
        addFinding("important", "2.3 Helper Measures", helperMeasures.Count + " visible helper measures");
        score = Math.Max(1, 5 - helperMeasures.Count);
    }

    checkScores["2.3_helper_measures"] = new[] { score, 5, 1 };
    logInfo("Score: " + score + "/5");
}

// Notebook-manual placeholders
checkScores["1.2_bpa_manual"] = new[] { 10, 15, 3 };
checkScores["1.3_memory_manual"] = new[] { 3, 5, 1 };
checkScores["1.7_synonyms_manual"] = new[] { 3, 5, 1 };
checkScores["2.1_ai_data_schema_manual"] = new[] { 0, 20, 3 };
checkScores["3_verified_answers_manual"] = new[] { 0, 15, 3 };
checkScores["4_ai_instructions_manual"] = new[] { 0, 15, 3 };
checkScores["5_data_agent_config_manual"] = new[] { 0, 20, 3 };
checkScores["6_testing_manual"] = new[] { 0, 20, 3 };

addFinding("critical", "2.1 AI Data Schema", "Manual Prep for AI configuration required");
addFinding("critical", "3 Verified Answers", "Manual Verified Answers setup required");
addFinding("critical", "4 AI Instructions", "Manual AI Instructions setup required");
addFinding("critical", "5 Data Agent Config", "Manual Data Agent setup required");
addFinding("critical", "6 Testing", "Manual testing workflow required");

// ------------------------------------------------------------
// Final scorecard
// ------------------------------------------------------------
{
    separator();
    logInfo("FINAL READINESS SCORECARD");

    var totalWeighted = 0;
    var totalMaxWeighted = 0;

    foreach (var kv in checkScores)
    {
        totalWeighted += kv.Value[0] * kv.Value[2];
        totalMaxWeighted += kv.Value[1] * kv.Value[2];
    }

    var overallPct = totalMaxWeighted == 0 ? 0.0 : (100.0 * totalWeighted / totalMaxWeighted);
    logInfo("Weighted score: " + Math.Round(overallPct, 1) + "%");

    var rating = overallPct >= 90 ? "READY FOR DEPLOYMENT"
              : overallPct >= 75 ? "MOSTLY READY"
              : overallPct >= 50 ? "NEEDS WORK"
              : "NOT READY";
    logInfo("Rating: " + rating);

    var critical = findings.Where(f => f[0] == "critical").ToList();
    var important = findings.Where(f => f[0] == "important").ToList();
    var recommended = findings.Where(f => f[0] == "recommended").ToList();

    if (critical.Count > 0)
    {
        logErr("CRITICAL findings:");
        foreach (var f in critical) logErr(" - [" + f[1] + "] " + f[2]);
    }

    if (important.Count > 0)
    {
        logWarn("IMPORTANT findings:");
        foreach (var f in important) logWarn(" - [" + f[1] + "] " + f[2]);
    }

    if (recommended.Count > 0)
    {
        logInfo("RECOMMENDED findings:");
        foreach (var f in recommended) logInfo(" - [" + f[1] + "] " + f[2]);
    }

    separator();
    logInfo("Manual checks still required: BPA, Memory Analyzer, Synonyms/Q&A, Prep for AI schema, Verified Answers, AI Instructions, Data Agent configuration, testing.");
}

// Emit one readable report without modal popups.
Output(string.Join(System.Environment.NewLine, reportLines));
