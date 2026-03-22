using System.Text;
using System.Text.RegularExpressions;

// =============================================================================
//  SEMANTIC MODEL AI READINESS ANALYZER
//  Full 11-Check Version - TE2 Compatible
// =============================================================================

StringBuilder report = new StringBuilder();
List<string> allIssues = new List<string>();
Dictionary<string, int> scores = new Dictionary<string, int>();
Dictionary<string, int> maxScores = new Dictionary<string, int>();

int MAX_SHOW = 20;
Regex sysTablePattern = new Regex("^(DateTableTemplate_|LocalDateTable_)", RegexOptions.IgnoreCase);

var visibleTables = Model.Tables.Where(t => !t.IsHidden && !sysTablePattern.IsMatch(t.Name)).ToList();
var visibleColumns = Model.AllColumns.Where(c => !c.IsHidden && !sysTablePattern.IsMatch(c.Table.Name) && c.Type != ColumnType.RowNumber).ToList();
var visibleMeasures = Model.AllMeasures.Where(m => !m.IsHidden && !sysTablePattern.IsMatch(m.Table.Name)).ToList();

// =============================================================================
// CHECK 1 - STAR SCHEMA / RELATIONSHIP STRUCTURE (15 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 1 - STAR SCHEMA / RELATIONSHIP STRUCTURE  (max 15 pts)");
report.AppendLine("------------------------------------------------------------");
int score1 = 15;

var relationships = Model.Relationships.ToList();

if (!relationships.Any())
{
    report.AppendLine("CRITICAL: No relationships found - flat model detected.");
    report.AppendLine("  Refactor into a star schema with clear fact and dimension tables.");
    allIssues.Add("CRITICAL: No relationships found - flat model detected");
    score1 = 0;
}
else
{
    report.AppendLine("  Relationships found: " + relationships.Count);
    
    int m2mCount = 0;
    int biDirCount = 0;
    
    foreach(var r in relationships)
    {
        if (r.FromCardinality == RelationshipEndCardinality.Many && r.ToCardinality == RelationshipEndCardinality.Many)
            m2mCount++;
        if (r.CrossFilteringBehavior == CrossFilteringBehavior.BothDirections)
            biDirCount++;
    }
    
    if (m2mCount > 0)
    {
        report.AppendLine("\nWARNING: " + m2mCount + " many-to-many relationship(s) found");
        report.AppendLine("  DAX accuracy and performance suffer with M:M relationships.");
        allIssues.Add("WARNING: " + m2mCount + " many-to-many relationship(s)");
        score1 -= Math.Min(5, m2mCount * 2);
    }
    
    if (biDirCount > 0)
    {
        report.AppendLine("\nWARNING: " + biDirCount + " bidirectional relationship(s)");
        report.AppendLine("  Bidirectional cross-filtering can introduce ambiguity in DAX generation.");
        allIssues.Add("WARNING: " + biDirCount + " bidirectional relationship(s)");
        score1 -= Math.Min(3, biDirCount);
    }
    
    if (m2mCount == 0 && biDirCount == 0)
        report.AppendLine("\nPASSED: Relationship structure is consistent with star schema design.");
}

score1 = Math.Max(0, score1);
double pct1 = 15 > 0 ? (double)score1 / 15 * 100.0 : 0;
int fill1 = (int)Math.Floor(pct1 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill1) + new string('.', 20 - fill1) + "] " + score1 + "/15 (" + pct1.ToString("F0") + "%) " + (pct1 >= 80 ? "PASS" : (pct1 >= 50 ? "WARN" : "FAIL")));
scores["star_schema"] = score1;
maxScores["star_schema"] = 15;

// =============================================================================
// CHECK 2 - BUSINESS-FRIENDLY NAMING (10 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 2 - BUSINESS-FRIENDLY NAMING  (max 10 pts)");
report.AppendLine("------------------------------------------------------------");
int score2 = 10;

var techPatterns = new List<Tuple<Regex, string>>
{
    Tuple.Create(new Regex("^(DIM|FACT|FCT|STG|SRC|TBL|VW|RPT|TMP|TEMP|LKP|REF|BRG|BRIDGE|MAP|INT|SLV|GLD|GOLD|SILVER|BRONZE|OWN|RAW)_", RegexOptions.IgnoreCase), "Database prefix"),
    Tuple.Create(new Regex("_(DIM|FACT|FCT|TBL|LKP|REF|SK|NK|AK|BK)$", RegexOptions.IgnoreCase), "Database suffix"),
    Tuple.Create(new Regex("_(AMT|QTY|CNT|CT|NUM|NBR|DT|TS|FLG|FLAG|IND|CD|CODE|KEY|ID)$", RegexOptions.IgnoreCase), "Column abbreviation"),
    Tuple.Create(new Regex("^[A-Z][A-Z0-9_]{2,}$"), "All-uppercase name"),
};

int flaggedCount = 0;
foreach(var t in visibleTables)
{
    foreach(var pattern in techPatterns)
        if (pattern.Item1.IsMatch(t.Name)) { flaggedCount++; break; }
}
foreach(var c in visibleColumns)
{
    foreach(var pattern in techPatterns)
        if (pattern.Item1.IsMatch(c.Name)) { flaggedCount++; break; }
}
foreach(var m in visibleMeasures)
{
    foreach(var pattern in techPatterns)
        if (pattern.Item1.IsMatch(m.Name)) { flaggedCount++; break; }
}

int totalVisible = visibleTables.Count + visibleColumns.Count + visibleMeasures.Count;

if (flaggedCount == 0)
{
    report.AppendLine("PASSED: All visible object names appear business-friendly.");
}
else
{
    double pct2Raw = (double)flaggedCount / Math.Max(totalVisible, 1) * 100.0;
    score2 = Math.Max(0, (int)(10.0 - pct2Raw / 10.0));
    report.AppendLine("WARNING: " + flaggedCount + " object(s) with technical-style names");
    report.AppendLine("  Use business-friendly names like 'Customer' instead of 'DIM_CUSTOMER'");
    allIssues.Add("WARNING: " + flaggedCount + " technical-style object names");
}

double pct2 = 10 > 0 ? (double)score2 / 10 * 100.0 : 0;
int fill2 = (int)Math.Floor(pct2 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill2) + new string('.', 20 - fill2) + "] " + score2 + "/10 (" + pct2.ToString("F0") + "%) " + (pct2 >= 80 ? "PASS" : (pct2 >= 50 ? "WARN" : "FAIL")));
scores["naming"] = score2;
maxScores["naming"] = 10;

// =============================================================================
// CHECK 3 - OBJECT DESCRIPTIONS (15 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 3 - OBJECT DESCRIPTIONS  (max 15 pts)");
report.AppendLine("------------------------------------------------------------");
int score3 = 15;

int tablesNoDesc = visibleTables.Count(t => string.IsNullOrWhiteSpace(t.Description));
int colsNoDesc = visibleColumns.Count(c => string.IsNullOrWhiteSpace(c.Description));
int measuresNoDesc = visibleMeasures.Count(m => string.IsNullOrWhiteSpace(m.Description));

double tblCov = visibleTables.Count > 0 ? 1.0 - (double)tablesNoDesc / visibleTables.Count : 1.0;
double colCov = visibleColumns.Count > 0 ? 1.0 - (double)colsNoDesc / visibleColumns.Count : 1.0;
double msrCov = visibleMeasures.Count > 0 ? 1.0 - (double)measuresNoDesc / visibleMeasures.Count : 1.0;

report.AppendLine("  Description Coverage:");
report.AppendLine("    Tables   : " + (visibleTables.Count - tablesNoDesc) + "/" + visibleTables.Count + "  (" + (tblCov * 100).ToString("F0") + "%)");
report.AppendLine("    Columns  : " + (visibleColumns.Count - colsNoDesc) + "/" + visibleColumns.Count + "  (" + (colCov * 100).ToString("F0") + "%)");
report.AppendLine("    Measures : " + (visibleMeasures.Count - measuresNoDesc) + "/" + visibleMeasures.Count + "  (" + (msrCov * 100).ToString("F0") + "%)");

int totalMissing = tablesNoDesc + colsNoDesc + measuresNoDesc;
int totalObjects = visibleTables.Count + visibleColumns.Count + visibleMeasures.Count;

if (totalMissing == 0)
{
    report.AppendLine("\nPASSED: All visible objects have descriptions.");
}
else
{
    double overallCov = 1.0 - (double)totalMissing / Math.Max(totalObjects, 1);
    score3 = Math.Max(0, (int)(15.0 * overallCov));
    report.AppendLine("\nWARNING: " + totalMissing + " visible object(s) missing descriptions");
    report.AppendLine("  Add descriptions in Power BI Desktop -> Data view -> Properties pane");
    allIssues.Add("CRITICAL: " + totalMissing + " objects missing descriptions");
}

double pct3 = 15 > 0 ? (double)score3 / 15 * 100.0 : 0;
int fill3 = (int)Math.Floor(pct3 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill3) + new string('.', 20 - fill3) + "] " + score3 + "/15 (" + pct3.ToString("F0") + "%) " + (pct3 >= 80 ? "PASS" : (pct3 >= 50 ? "WARN" : "FAIL")));
scores["descriptions"] = score3;
maxScores["descriptions"] = 15;

// =============================================================================
// CHECK 4 - SYNONYMS (5 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 4 - SYNONYMS / LINGUISTIC SCHEMA  (max 5 pts)");
report.AppendLine("------------------------------------------------------------");
int score4 = 5;

int tblWithSyn = 0;
int colWithSyn = 0;
int msrWithSyn = 0;

foreach(var t in visibleTables)
{
    if (t.Synonyms != null && t.Synonyms.Any()) tblWithSyn++;
    foreach(var c in t.Columns.Where(c => !c.IsHidden && c.Type != ColumnType.RowNumber))
        if (c.Synonyms != null && c.Synonyms.Any()) colWithSyn++;
    foreach(var m in t.Measures.Where(m => !m.IsHidden))
        if (m.Synonyms != null && m.Synonyms.Any()) msrWithSyn++;
}

int totalSyn = tblWithSyn + colWithSyn + msrWithSyn;

if (totalSyn == 0)
{
    report.AppendLine("WARNING: No synonyms configured on any visible object.");
    report.AppendLine("  Example: 'revenue', 'income', 'turnover' -> Total Sales measure");
    score4 = 1;
    allIssues.Add("WARNING: No synonyms configured");
}
else
{
    report.AppendLine("  Synonyms configured on:");
    report.AppendLine("    Tables   : " + tblWithSyn);
    report.AppendLine("    Columns  : " + colWithSyn);
    report.AppendLine("    Measures : " + msrWithSyn);
    
    if (msrWithSyn < visibleMeasures.Count / 2)
    {
        score4 = 3;
        report.AppendLine("\nTIP: Add synonyms to more key measures for better AI accuracy.");
    }
    else
    {
        report.AppendLine("\nPASSED: Good synonym coverage for AI natural language matching.");
    }
}

double pct4 = 5 > 0 ? (double)score4 / 5 * 100.0 : 0;
int fill4 = (int)Math.Floor(pct4 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill4) + new string('.', 20 - fill4) + "] " + score4 + "/5 (" + pct4.ToString("F0") + "%) " + (pct4 >= 80 ? "PASS" : (pct4 >= 50 ? "WARN" : "FAIL")));
scores["synonyms"] = score4;
maxScores["synonyms"] = 5;

// =============================================================================
// CHECK 5 - IMPLICIT MEASURES (10 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 5 - IMPLICIT MEASURES (NUMERIC SUMMARISATION)  (max 10 pts)");
report.AppendLine("------------------------------------------------------------");
int score5 = 10;

var numericTypes = new HashSet<DataType> { DataType.Int64, DataType.Double, DataType.Decimal };
var implicitCols = visibleColumns.OfType<Column>()
    .Where(c => numericTypes.Contains(c.DataType) && c.SummarizeBy != AggregateFunction.None)
    .ToList();

if (!implicitCols.Any())
{
    report.AppendLine("PASSED: All visible numeric columns have SummarizeBy = None.");
}
else
{
    int numericVisible = visibleColumns.Count(c => numericTypes.Contains(c.DataType));
    double pct5Raw = (double)implicitCols.Count / Math.Max(numericVisible, 1) * 100.0;
    score5 = Math.Max(0, (int)(10.0 - pct5Raw / 10.0));
    
    report.AppendLine("WARNING: " + implicitCols.Count + " visible numeric column(s) with implicit summarisation");
    report.AppendLine("  Set SummarizeBy = None in Tabular Editor column properties");
    allIssues.Add("CRITICAL: " + implicitCols.Count + " implicit measures detected");
}

double pct5 = 10 > 0 ? (double)score5 / 10 * 100.0 : 0;
int fill5 = (int)Math.Floor(pct5 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill5) + new string('.', 20 - fill5) + "] " + score5 + "/10 (" + pct5.ToString("F0") + "%) " + (pct5 >= 80 ? "PASS" : (pct5 >= 50 ? "WARN" : "FAIL")));
scores["implicit_measures"] = score5;
maxScores["implicit_measures"] = 10;

// =============================================================================
// CHECK 6 - DUPLICATE MEASURES (5 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 6 - DUPLICATE / OVERLAPPING MEASURES  (max 5 pts)");
report.AppendLine("------------------------------------------------------------");
int score6 = 5;

var msrNames = visibleMeasures.Select(m => m.Name).ToList();
var normalisedMap = new Dictionary<string, List<string>>();

foreach(var name in msrNames)
{
    string key = Regex.Replace(name.ToLower(), "[^a-z0-9]", "");
    if (!normalisedMap.ContainsKey(key)) normalisedMap[key] = new List<string>();
    normalisedMap[key].Add(name);
}

var nearDupes = normalisedMap.Where(kvp => kvp.Value.Count > 1).ToList();

if (!nearDupes.Any())
{
    report.AppendLine("PASSED: No obvious duplicate or overlapping measures detected.");
}
else
{
    report.AppendLine("WARNING: " + nearDupes.Count + " near-identical measure name pair(s):");
    foreach(var kvp in nearDupes.Take(10))
        report.AppendLine("   - " + string.Join("  vs  ", kvp.Value));
    
    score6 = Math.Max(0, 5 - nearDupes.Count);
    allIssues.Add("WARNING: " + nearDupes.Count + " near-duplicate measure names");
}

double pct6 = 5 > 0 ? (double)score6 / 5 * 100.0 : 0;
int fill6 = (int)Math.Floor(pct6 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill6) + new string('.', 20 - fill6) + "] " + score6 + "/5 (" + pct6.ToString("F0") + "%) " + (pct6 >= 80 ? "PASS" : (pct6 >= 50 ? "WARN" : "FAIL")));
scores["duplicate_measures"] = score6;
maxScores["duplicate_measures"] = 5;

// =============================================================================
// CHECK 7 - DATE FIELDS (5 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 7 - AMBIGUOUS DATE FIELDS  (max 5 pts)");
report.AppendLine("------------------------------------------------------------");
int score7 = 5;

var dateCols = visibleColumns.OfType<Column>()
    .Where(c => c.DataType == DataType.DateTime || c.Name.IndexOf("date", StringComparison.OrdinalIgnoreCase) >= 0)
    .ToList();

if (!dateCols.Any())
{
    report.AppendLine("OK: No visible date columns found (may be hidden by design).");
}
else if (dateCols.Count == 1)
{
    report.AppendLine("PASSED: Single visible date column - no ambiguity.");
}
else if (dateCols.Count <= 3)
{
    report.AppendLine("INFO: " + dateCols.Count + " date columns found (low ambiguity risk)");
    report.AppendLine("  TIP: Add AI Instructions to specify the default date field");
    score7 = 4;
}
else
{
    report.AppendLine("WARNING: " + dateCols.Count + " visible date column(s) - HIGH ambiguity risk!");
    report.AppendLine("  Add AI Instructions: 'Use [Order Date] by default unless specified'");
    score7 = Math.Max(0, 5 - Math.Max(0, dateCols.Count - 3));
    allIssues.Add("WARNING: " + dateCols.Count + " date columns without clear guidance");
}

double pct7 = 5 > 0 ? (double)score7 / 5 * 100.0 : 0;
int fill7 = (int)Math.Floor(pct7 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill7) + new string('.', 20 - fill7) + "] " + score7 + "/5 (" + pct7.ToString("F0") + "%) " + (pct7 >= 80 ? "PASS" : (pct7 >= 50 ? "WARN" : "FAIL")));
scores["date_fields"] = score7;
maxScores["date_fields"] = 5;

// =============================================================================
// CHECK 8 - HIDDEN OBJECTS (5 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 8 - HIDDEN OBJECTS RISK  (max 5 pts)");
report.AppendLine("------------------------------------------------------------");
int score8 = 5;

var hiddenColumns = Model.AllColumns.Where(c => c.IsHidden && !sysTablePattern.IsMatch(c.Table.Name)).ToList();

report.AppendLine("  Hidden columns: " + hiddenColumns.Count);

if (hiddenColumns.Any())
{
    var hiddenColsNoDesc = hiddenColumns.Where(c => string.IsNullOrWhiteSpace(c.Description)).ToList();
    double pct8Hid = (double)hiddenColsNoDesc.Count / hiddenColumns.Count * 100.0;
    
    if (pct8Hid > 50)
    {
        report.AppendLine("\nWARNING: " + hiddenColsNoDesc.Count + " hidden column(s) lack descriptions (" + pct8Hid.ToString("F0") + "%)");
        report.AppendLine("  If referenced by Verified Answers, the answer will silently fail.");
        score8 = 3;
        allIssues.Add("WARNING: Hidden columns without descriptions - Verified Answers risk");
    }
    else
    {
        report.AppendLine("\nPASSED: Most hidden columns have descriptions (" + (100.0 - pct8Hid).ToString("F0") + "% coverage)");
    }
}
else
{
    report.AppendLine("\nPASSED: No hidden columns found.");
}

report.AppendLine("\nREMINDER: Verified Answers will NOT work if they reference hidden columns.");

double pct8 = 5 > 0 ? (double)score8 / 5 * 100.0 : 0;
int fill8 = (int)Math.Floor(pct8 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill8) + new string('.', 20 - fill8) + "] " + score8 + "/5 (" + pct8.ToString("F0") + "%) " + (pct8 >= 80 ? "PASS" : (pct8 >= 50 ? "WARN" : "FAIL")));
scores["hidden_objects"] = score8;
maxScores["hidden_objects"] = 5;

// =============================================================================
// CHECK 9 - MODEL COMPLEXITY (5 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 9 - MODEL COMPLEXITY / BLOAT  (max 5 pts)");
report.AppendLine("------------------------------------------------------------");
int score9 = 5;

report.AppendLine("  Visible tables   : " + visibleTables.Count);
report.AppendLine("  Visible columns  : " + visibleColumns.Count);
report.AppendLine("  Visible measures : " + visibleMeasures.Count);

var helperPattern = new Regex("\\b(helper|aux|auxiliary|temp|tmp|working|intermediate)\\b", RegexOptions.IgnoreCase);
var visibleHelpers = visibleMeasures.Where(m => helperPattern.IsMatch(m.Name)).ToList();

if (visibleHelpers.Any())
{
    report.AppendLine("\nWARNING: " + visibleHelpers.Count + " potentially visible helper/intermediate measure(s)");
    report.AppendLine("  Helper measures should be hidden or excluded from AI Data Schema");
    allIssues.Add("WARNING: " + visibleHelpers.Count + " visible helper measures");
    score9 -= 2;
}

if (visibleColumns.Count > 500)
{
    report.AppendLine("\nWARNING: " + visibleColumns.Count + " visible columns - high noise risk for AI");
    report.AppendLine("  Use Prep for AI -> AI Data Schema to define a focused subset");
    allIssues.Add("WARNING: High column count (" + visibleColumns.Count + ")");
    score9 -= 1;
}

if (visibleMeasures.Count > 150)
{
    report.AppendLine("\nWARNING: " + visibleMeasures.Count + " visible measures - review for redundancy");
    allIssues.Add("WARNING: High measure count (" + visibleMeasures.Count + ")");
    score9 -= 1;
}

if (score9 == 5) report.AppendLine("\nPASSED: Model complexity is manageable for AI use.");

score9 = Math.Max(0, score9);
double pct9 = 5 > 0 ? (double)score9 / 5 * 100.0 : 0;
int fill9 = (int)Math.Floor(pct9 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill9) + new string('.', 20 - fill9) + "] " + score9 + "/5 (" + pct9.ToString("F0") + "%) " + (pct9 >= 80 ? "PASS" : (pct9 >= 50 ? "WARN" : "FAIL")));
scores["model_bloat"] = score9;
maxScores["model_bloat"] = 5;

// =============================================================================
// CHECK 10 - PREP FOR AI CONFIGURATION (15 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 10 - PREP FOR AI CONFIGURATION  (max 15 pts)");
report.AppendLine("------------------------------------------------------------");
int score10 = 15;

bool foundAiSchema = false;
bool foundAiInstructions = false;
bool foundVerifiedAnswers = false;

string[] instructionKeys = { "PBI_AIInstructions", "AI_INSTRUCTION", "AIINSTRUCTION", "PREP_AI_INSTRUCTION", "COPILOT_INSTRUCTION", "PBI_AI_INSTRUCTION" };
string[] verifiedKeys = { "PBI_VerifiedAnswers", "VERIFIED", "VERIFIED_ANSWER", "COPILOT_VERIFIED_ANSWER", "PBI_VERIFIED" };
string[] schemaKeys = { "PBI_AIDataSchema", "AI_SCHEMA", "AISCHEMA", "DATA_AGENT_SCHEMA", "PREP_AI_SCHEMA", "COPILOT_SCHEMA", "PBI_AI_SCHEMA" };

foreach(var key in instructionKeys)
{
    try
    {
        if (Model.Annotations[key] != null)
        {
            foundAiInstructions = true;
            break;
        }
    }
    catch { }
}

foreach(var key in verifiedKeys)
{
    try
    {
        if (Model.Annotations[key] != null)
        {
            foundVerifiedAnswers = true;
            break;
        }
    }
    catch { }
}

foreach(var key in schemaKeys)
{
    try
    {
        if (Model.Annotations[key] != null)
        {
            foundAiSchema = true;
            break;
        }
    }
    catch { }
}

report.AppendLine("  TOM annotation scan results:");
report.AppendLine("    AI Data Schema      : " + (foundAiSchema ? "Detected" : "Not detected"));
report.AppendLine("    AI Instructions     : " + (foundAiInstructions ? "Detected" : "Not detected"));
report.AppendLine("    Verified Answers    : " + (foundVerifiedAnswers ? "Detected" : "Not detected"));
report.AppendLine("");
report.AppendLine("  MANUAL CHECKLIST - verify in Power BI Desktop:");
report.AppendLine("  [ ] Home ribbon > Prep data for AI > simplify data schema");
report.AppendLine("  [ ] Add AI instructions for business terminology");
report.AppendLine("  [ ] Create verified answers for 5-10 most common questions");

if (!foundAiSchema)        { score10 -= 5; allIssues.Add("CRITICAL: AI Data Schema not detected"); }
if (!foundAiInstructions)  { score10 -= 5; allIssues.Add("CRITICAL: AI Instructions not detected"); }
if (!foundVerifiedAnswers) { score10 -= 5; allIssues.Add("CRITICAL: Verified Answers not detected"); }

score10 = Math.Max(0, score10);
double pct10 = 15 > 0 ? (double)score10 / 15 * 100.0 : 0;
int fill10 = (int)Math.Floor(pct10 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill10) + new string('.', 20 - fill10) + "] " + score10 + "/15 (" + pct10.ToString("F0") + "%) " + (pct10 >= 80 ? "PASS" : (pct10 >= 50 ? "WARN" : "FAIL")));
scores["prep_for_ai"] = score10;
maxScores["prep_for_ai"] = 15;

// =============================================================================
// CHECK 11 - BEST PRACTICE ANALYZER (10 pts)
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("CHECK 11 - BEST PRACTICE ANALYZER  (max 10 pts)");
report.AppendLine("------------------------------------------------------------");
int score11 = 10;

List<string> bpaIssues = new List<string>();

// Download official BPA rules
bool bpaDownloaded = false;
try
{
    System.Net.WebClient w = new System.Net.WebClient();
    string localPath = System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData);
    string bpaUrl = "https://raw.githubusercontent.com/microsoft/Analysis-Services/master/BestPracticeRules/BPARules.json";
    string bpaDownloadPath = localPath + @"\TabularEditor\BPARules.json";
    w.DownloadFile(bpaUrl, bpaDownloadPath);
    bpaDownloaded = true;
    report.AppendLine("  Official BPA rules downloaded to:");
    report.AppendLine("  " + bpaDownloadPath);
    report.AppendLine("  -> Restart Tabular Editor and use Tools > Best Practice Analyzer");
    report.AppendLine("");
}
catch(Exception ex)
{
    report.AppendLine("  NOTE: Could not download official BPA rules (check internet/proxy)");
    report.AppendLine("  " + ex.Message);
    report.AppendLine("");
}

// Sub-rule A: String-typed relationship keys
var strRelCols = Model.Relationships
    .SelectMany(r => new Column[] { r.FromColumn, r.ToColumn })
    .Where(c => c.DataType == DataType.String)
    .GroupBy(c => c.DaxObjectFullName)
    .Select(g => g.First())
    .ToList();
if (strRelCols.Any())
    bpaIssues.Add("WARNING: " + strRelCols.Count + " string-typed relationship key(s) - consider Int64 surrogate keys");

// Sub-rule B: Measures without format strings
var msrsNoFormat = visibleMeasures.Where(m => string.IsNullOrWhiteSpace(m.FormatString)).ToList();
if (msrsNoFormat.Count > 0)
    bpaIssues.Add("INFO: " + msrsNoFormat.Count + " measure(s) missing FormatString");

// Sub-rule C: CALCULATE with no filters
var calcNoFilter = visibleMeasures
    .Where(m => Regex.IsMatch(m.Expression ?? "", "\\bCALCULATE\\s*\\(\\s*[^,)]+\\s*\\)", RegexOptions.IgnoreCase))
    .ToList();
if (calcNoFilter.Any())
    bpaIssues.Add("WARNING: " + calcNoFilter.Count + " CALCULATE() with no filter (redundant)");

// Sub-rule D: IF(ISBLANK()) pattern
var isBlankIf = visibleMeasures
    .Where(m => Regex.IsMatch(m.Expression ?? "", "\\bIF\\s*\\(\\s*ISBLANK\\s*\\(", RegexOptions.IgnoreCase))
    .ToList();
if (isBlankIf.Any())
    bpaIssues.Add("INFO: " + isBlankIf.Count + " measure(s) use IF(ISBLANK()) - consider // operator instead");

if (!bpaIssues.Any())
{
    report.AppendLine("PASSED: No built-in BPA issues detected.");
}
else
{
    report.AppendLine("BPA Results: " + bpaIssues.Count + " item(s) found");
    foreach(var item in bpaIssues.Take(MAX_SHOW))
        report.AppendLine("  - " + item);
    
    if (bpaDownloaded)
        report.AppendLine("\nTIP: Official BPA rules downloaded - restart TE and use Tools > Best Practice Analyzer");
    
    int bpaCount = bpaIssues.Count;
    if      (bpaCount >= 20) score11 = 2;
    else if (bpaCount >= 10) score11 = 5;
    else if (bpaCount >= 5)  score11 = 7;
    else if (bpaCount >= 1)  score11 = 8;
}

double pct11 = 10 > 0 ? (double)score11 / 10 * 100.0 : 0;
int fill11 = (int)Math.Floor(pct11 / 5.0);
report.AppendLine("\nScore: [" + new string('#', fill11) + new string('.', 20 - fill11) + "] " + score11 + "/10 (" + pct11.ToString("F0") + "%) " + (pct11 >= 80 ? "PASS" : (pct11 >= 50 ? "WARN" : "FAIL")));
scores["bpa"] = score11;
maxScores["bpa"] = 10;

// =============================================================================
// BONUS - MEASURE DEPENDENCY ANALYSIS
// =============================================================================
report.AppendLine("");
report.AppendLine("------------------------------------------------------------");
report.AppendLine("BONUS - MEASURE DEPENDENCY ANALYSIS");
report.AppendLine("------------------------------------------------------------");

var tableColRef = new Regex("'?([A-Za-z0-9 _\\-]+)'?\\[([A-Za-z0-9 _\\-]+)\\]");
var measureRef = new Regex("\\[([A-Za-z0-9 _\\-]+)\\]");
var knownMsrSet = new HashSet<string>(visibleMeasures.Select(m => m.Name), StringComparer.OrdinalIgnoreCase);

List<Tuple<string, string, string>> depMatrix = new List<Tuple<string, string, string>>();

foreach(var m in visibleMeasures.Take(50))
{
    string expr = m.Expression ?? "";
    foreach(Match match in tableColRef.Matches(expr))
        depMatrix.Add(Tuple.Create(m.Name, match.Groups[1].Value + "[" + match.Groups[2].Value + "]", "Table[Column]"));
    foreach(Match match in measureRef.Matches(expr))
    {
        string nm = match.Groups[1].Value;
        if (knownMsrSet.Contains(nm) && nm != m.Name)
            depMatrix.Add(Tuple.Create(m.Name, "[" + nm + "]", "Measure"));
    }
}

if (depMatrix.Any())
{
    int distinctMeasures = depMatrix.Select(d => d.Item1).Distinct().Count();
    report.AppendLine("  Dependency data extracted for " + distinctMeasures + " measure(s)  (" + depMatrix.Count + " total references)");
    report.AppendLine("");
    report.AppendLine("  TIP: When configuring Prep for AI > AI Data Schema, include ALL tables,");
    report.AppendLine("       columns, and measures listed as dependencies for your selected measures.");
}
else
{
    report.AppendLine("  No measure dependencies extracted.");
}

// =============================================================================
// FINAL SCORECARD
// =============================================================================
report.AppendLine("");
report.AppendLine("======================================================================");
report.AppendLine("   SEMANTIC MODEL AI READINESS SCORECARD");
report.AppendLine("   Model: " + Model.Name);
report.AppendLine("======================================================================");
report.AppendLine("");

int totalAchieved = scores.Values.Sum();
int totalMax = maxScores.Values.Sum();
double totalPct = totalMax > 0 ? (double)totalAchieved / totalMax * 100.0 : 0;

report.AppendLine("  " + "Check".PadRight(44) + "Score".PadLeft(8) + "   Progress");
report.AppendLine("  " + new string('-', 72));

string[] checkOrder = { "star_schema", "naming", "descriptions", "synonyms", "implicit_measures", 
                        "duplicate_measures", "date_fields", "hidden_objects", "model_bloat", "prep_for_ai", "bpa" };
string[] checkLabels = { "Star Schema Validation", "Business-Friendly Naming", "Object Descriptions", 
                        "Synonyms / Linguistic Schema", "Implicit Measures", "Duplicate / Overlapping Measures",
                        "Ambiguous Date Fields", "Hidden Objects Risk", "Model Complexity / Bloat",
                        "Prep for AI Configuration", "Best Practice Analyzer" };

for(int i = 0; i < checkOrder.Length; i++)
{
    string key = checkOrder[i];
    if (scores.ContainsKey(key))
    {
        int ach = scores[key];
        int mx = maxScores[key];
        double _ps = mx > 0 ? (double)ach / mx * 100.0 : 0;
        int _fs = (int)Math.Floor(_ps / 5.0);
        string _barStr = "[" + new string('#', _fs) + new string('.', 20 - _fs) + "] " + ach + "/" + mx + " (" + _ps.ToString("F0") + "%) " + (_ps >= 80 ? "PASS" : (_ps >= 50 ? "WARN" : "FAIL"));
        report.AppendLine("  " + checkLabels[i].PadRight(44) + (ach + "/" + mx).PadLeft(8) + "   " + _barStr);
    }
}

report.AppendLine("  " + new string('-', 72));
report.AppendLine("  " + "TOTAL SCORE".PadRight(44) + (totalAchieved + "/" + totalMax).PadLeft(8) + "   (" + totalPct.ToString("F0") + "%)");
report.AppendLine("");

string rating, comment;
if      (totalPct >= 90) { rating = "AI READY";          comment = "Well-optimized. Monitor and iterate continuously."; }
else if (totalPct >= 70) { rating = "MOSTLY READY";      comment = "Good foundation - address flagged items to maximize accuracy."; }
else if (totalPct >= 50) { rating = "NEEDS IMPROVEMENT"; comment = "Address critical items before deploying to production."; }
else                     { rating = "NOT READY";         comment = "Significant improvements needed before using with Fabric Data Agent."; }

report.AppendLine("  Rating : " + rating);
report.AppendLine("  Summary: " + comment);
report.AppendLine("");

if (allIssues.Any())
{
    report.AppendLine("  KEY ISSUES TO ADDRESS:");
    foreach(var issue in allIssues.Take(15))
        report.AppendLine("     - " + issue);
    if (allIssues.Count > 15) report.AppendLine("     ... and " + (allIssues.Count - 15) + " more");
    report.AppendLine("");
}

report.AppendLine(new string('=', 70));
report.AppendLine("  KEY RESOURCES");
report.AppendLine(new string('=', 70));
report.AppendLine("  Semantic Model Best Practices:");
report.AppendLine("    https://learn.microsoft.com/fabric/data-science/semantic-model-best-practices");
report.AppendLine("  Prep for AI:");
report.AppendLine("    https://learn.microsoft.com/power-bi/create-reports/copilot-prepare-data-ai");
report.AppendLine("  Tabular Editor BPA Rules:");
report.AppendLine("    https://github.com/TabularEditor/BestPracticeRules");
report.AppendLine(new string('=', 70));

Output(report.ToString());