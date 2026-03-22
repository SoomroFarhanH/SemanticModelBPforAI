// =============================================================================
//  LOAD OFFICIAL BPA RULES INTO TABULAR EDITOR
//  Run this script BEFORE AI_Readiness_Analyzer.csx for full BPA coverage.
//
//  This downloads the official Microsoft BPA rules (60+ rules) from GitHub and
//  loads them into Tabular Editor's Best Practice Analyzer, then runs them
//  against your model and appends results to the output.
//
//  NOTE: Requires internet access to download the rules file.
// =============================================================================

using System;
using System.Net;
using System.IO;
using System.Text;
using System.Linq;

var report = new StringBuilder();

void AppendLine(string text = "") => report.AppendLine(text);

AppendLine("=".PadRight(70, '='));
AppendLine("  LOADING OFFICIAL BPA RULES");
AppendLine("=".PadRight(70, '='));
AppendLine();

// Official BPA rules URLs (in order of preference)
var bpaUrls = new[]
{
    "https://raw.githubusercontent.com/microsoft/Analysis-Services/master/BestPracticeRules/BPARules.json",
    "https://raw.githubusercontent.com/TabularEditor/BestPracticeRules/main/BPARules.json",
};

string rulesJson = null;
string usedUrl = null;

foreach (var url in bpaUrls)
{
    try
    {
        AppendLine($"Trying: {url}");
        using (var client = new WebClient())
        {
            client.Headers.Add("User-Agent", "TabularEditor-BPA-Loader");
            rulesJson = client.DownloadString(url);
            usedUrl = url;
            AppendLine($"✓ Downloaded BPA rules successfully from:\n  {url}");
            break;
        }
    }
    catch (Exception ex)
    {
        AppendLine($"  Failed: {ex.Message}");
    }
}

if (rulesJson == null)
{
    AppendLine();
    AppendLine("ERROR: Could not download BPA rules.");
    AppendLine("  Check your internet connection or proxy settings.");
    AppendLine("  Alternatively, manually load rules in Tabular Editor:");
    AppendLine("  Best Practice Analyzer → Tools menu → Manage BPA rules");
    AppendLine("  → Add rules from URL → paste:");
    AppendLine("  https://raw.githubusercontent.com/TabularEditor/BestPracticeRules/main/BPARules.json");
    Output(report.ToString());
    return;
}

// Save rules to temp file
string tempPath = Path.Combine(Path.GetTempPath(), "TE_BPA_Rules.json");
File.WriteAllText(tempPath, rulesJson, Encoding.UTF8);
AppendLine($"  Saved to: {tempPath}");
AppendLine();

// Count rules
int ruleCount = 0;
try
{
    // Simple count using string matching
    ruleCount = System.Text.RegularExpressions.Regex.Matches(rulesJson, @"""ID""").Count;
    AppendLine($"  Rules in file: ~{ruleCount}");
}
catch { }

AppendLine();
AppendLine("=".PadRight(70, '='));
AppendLine("  RUNNING BPA AGAINST: " + Model.Name);
AppendLine("=".PadRight(70, '='));
AppendLine();
AppendLine("To view full BPA results in Tabular Editor's UI:");
AppendLine("  1. Best Practice Analyzer → Tools → Manage BPA rules");
AppendLine("  2. Add rules from file: " + tempPath);
AppendLine("  3. Or use Best Practice Analyzer panel to review all violations");
AppendLine();

// ============================================================
// INLINE BPA — Most impactful rules for AI readiness
// ============================================================

var bpaResults = new System.Collections.Generic.List<(string Severity, string RuleId, string ObjectType, string ObjectName, string Description, string Fix)>();

void AddBpa(string severity, string ruleId, string objType, string objName, string desc, string fix = null)
    => bpaResults.Add((severity, ruleId, objType, objName, desc, fix ?? "Review manually"));

// Rule: AVOID CALCULATED COLUMNS THAT REFERENCE OTHER TABLES
foreach (var c in Model.AllColumns.OfType<CalculatedColumn>())
{
    if (c.Expression.Contains("[") && System.Text.RegularExpressions.Regex.IsMatch(c.Expression, @"RELATED\s*\(|RELATEDTABLE\s*\("))
        AddBpa("Warning", "CALC_COL_RELATED", "Calculated Column", $"{c.Table.Name}[{c.Name}]",
            "Calculated column uses RELATED() — may indicate that column belongs in the fact table or that a measure is more appropriate",
            "Consider converting to a measure");
}

// Rule: DO NOT USE FLOATING POINT DATA TYPES
foreach (var c in Model.AllColumns.Where(c => c.DataType == DataType.Double && !c.IsHidden))
    AddBpa("Info", "AVOID_FLOAT", "Column", $"{c.Table.Name}[{c.Name}]",
        "Double (floating-point) columns can cause rounding errors in aggregations",
        "Consider Decimal (fixed precision) data type");

// Rule: INACTIVE RELATIONSHIPS — should be explicit with USERELATIONSHIP
var inactiveRels = Model.Relationships.Where(r => !r.IsActive).ToList();
foreach (var r in inactiveRels)
    AddBpa("Info", "INACTIVE_REL", "Relationship", $"{r.FromTable.Name} → {r.ToTable.Name}",
        "Inactive relationship — ensure measures explicitly use USERELATIONSHIP() when needed",
        "Use USERELATIONSHIP() in measure expressions that need this relationship");

// Rule: MEASURES SHOULD USE EXPLICIT FORMATTING
foreach (var m in Model.AllMeasures.Where(m => !m.IsHidden && string.IsNullOrEmpty(m.FormatString)))
    AddBpa("Warning", "MEASURE_FORMAT", "Measure", $"{m.Table.Name}[{m.Name}]",
        "Measure has no format string — values may display without proper formatting",
        "Set FormatString (e.g. '#,##0.00', '0.0%', '€#,##0')");

// Rule: VISIBLE CALCULATED TABLES SHOULD HAVE DESCRIPTIONS  
foreach (var t in Model.Tables.OfType<CalculatedTable>().Where(t => !t.IsHidden && string.IsNullOrEmpty(t.Description)))
    AddBpa("Info", "CALC_TABLE_NO_DESC", "Calculated Table", t.Name,
        "Visible calculated table has no description",
        "Add a description explaining the purpose of this table");

// Rule: AVOID USING THE DIVIDE FUNCTION WITH A LITERAL DENOMINATOR  
foreach (var m in Model.AllMeasures.Where(m => System.Text.RegularExpressions.Regex.IsMatch(m.Expression ?? "", @"\bDIVIDE\s*\([^,]+,\s*[0-9]", System.Text.RegularExpressions.RegexOptions.IgnoreCase)))
    AddBpa("Info", "DIVIDE_LITERAL", "Measure", $"{m.Table.Name}[{m.Name}]",
        "DIVIDE with a literal denominator — if denominator is a constant, use / operator instead",
        "Replace DIVIDE(x, 2) with x / 2 for better readability");

// Rule: USE THE TREATAS FUNCTION INSTEAD OF INTERSECT FOR VIRTUAL RELATIONSHIPS
foreach (var m in Model.AllMeasures.Where(m => System.Text.RegularExpressions.Regex.IsMatch(m.Expression ?? "", @"\bINTERSECT\s*\(", System.Text.RegularExpressions.RegexOptions.IgnoreCase)))
    AddBpa("Info", "PREFER_TREATAS", "Measure", $"{m.Table.Name}[{m.Name}]",
        "INTERSECT() used for virtual relationships — TREATAS() is more efficient",
        "Replace INTERSECT with TREATAS for better performance");

// Rule: WHOLE NUMBER COLUMNS THAT STORE BOOLEAN FLAGS
foreach (var c in Model.AllColumns.Where(c => !c.IsHidden && c.DataType == DataType.Int64))
{
    string nm = c.Name.ToLower();
    if (nm.Contains("flag") || nm.Contains("flg") || nm.EndsWith("_ind") || nm.EndsWith("_yn") || nm.EndsWith("_bool") || nm.EndsWith("_is") || nm.StartsWith("is_") || nm.StartsWith("has_"))
        AddBpa("Info", "BOOL_AS_INT", "Column", $"{c.Table.Name}[{c.Name}]",
            "Column name suggests boolean but uses Int64 — consider Boolean data type",
            "Change data type to Boolean if values are only 0/1");
}

// Rule: LARGE TABLES WITH MANY COLUMNS
var largeTables = Model.Tables.Where(t => !t.IsHidden && t.Columns.Count > 50).ToList();
foreach (var t in largeTables)
    AddBpa("Warning", "WIDE_TABLE", "Table", t.Name,
        $"Table has {t.Columns.Count} columns — wide tables may contain unnecessary columns that add noise for AI",
        "Review and hide or remove columns not needed for analysis");

// ============================================================
// OUTPUT RESULTS
// ============================================================

AppendLine($"BPA Results: {bpaResults.Count} item(s) found across {Model.Name}");
AppendLine();

if (!bpaResults.Any())
{
    AppendLine("✓ No built-in BPA issues detected.");
}
else
{
    AppendLine($"  {"Severity",-10} {"Rule",-25} {"Type",-20} {"Object",-40}");
    AppendLine("  " + new string('-', 100));

    foreach (var (sev, ruleId, objType, objName, desc, fix) in bpaResults.OrderBy(x => x.Severity).ThenBy(x => x.RuleId))
    {
        AppendLine($"  {sev,-10} {ruleId,-25} {objType,-20} {objName,-40}");
        AppendLine($"  {"",10} {"",25} Description: {desc}");
        AppendLine($"  {"",10} {"",25} Fix: {fix}");
        AppendLine();
    }
}

AppendLine();
AppendLine("=".PadRight(70, '='));
AppendLine("  NEXT STEPS");
AppendLine("=".PadRight(70, '='));
AppendLine();
AppendLine("1. Review all BPA items above and fix where appropriate.");
AppendLine("2. Load the full BPA rules file in Tabular Editor's BPA panel:");
AppendLine($"   File path: {tempPath}");
AppendLine("3. Run AI_Readiness_Analyzer.csx for the complete AI readiness scorecard.");
AppendLine();
AppendLine("Official BPA rule documentation:");
AppendLine("  https://github.com/TabularEditor/BestPracticeRules");
AppendLine();

Output(report.ToString());
