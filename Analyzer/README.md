# Analyzer collection

Consolidated copies of the analyzers, validators, advisors, auditors, and related
diagnostic tools found in this Tools workspace. Originals are unchanged.

## Start here

Choose the tool for your problem, open its README, then configure its notebook or
command-line parameters before running. Copying this collection does not run any
cloud queries, deployments, remediation, or notifications.

### Dataflow and Power BI performance

| Tool | Purpose | Entry point |
| --- | --- | --- |
| [Dataflow Gen2 Advisor](DataflowGen2-Advisor/README.md) | Dataflow performance and CU guidance, engine recommendations, CLI and Fabric notebook | [DataflowGen2_Analyzer.ipynb](DataflowGen2-Advisor/DataflowGen2_Analyzer.ipynb) |
| [Power BI Performance Analyzer Diagnostics](PowerBI-Performance-Analyzer-Diagnostics/README.md) | Slow visuals, DAX, DirectQuery, rendering, and trace-quality diagnostics | [Performance diagnostics notebook](PowerBI-Performance-Analyzer-Diagnostics/Power%20BI%20Performance%20Analyzer%20Diagnostics.ipynb) |
| [Semantic model optimization](SemanticModel-Optimization/README.md) | DirectQuery checks, model/report analysis, row groups, schema review, and aggregation candidates | [Notebook and script index](SemanticModel-Optimization/README.md) |

### AI, Copilot, and Fabric Data Agents

| Tool | Purpose | Entry point |
| --- | --- | --- |
| [Semantic Model AI Readiness Analyzer](SemanticModel-AI-Readiness-Analyzer/README.md) | Semantic-model readiness for AI and Copilot | [SemanticModelAIReadinessAnalyzer.ipynb](SemanticModel-AI-Readiness-Analyzer/SemanticModelAIReadinessAnalyzer.ipynb) |
| [Fabric Data Agent Analyzer](FabricDataAgentAnalyzer/README.md) | Agent and connected-source assessment, with optional remediation assets | [FabricDataAgentAnalyzer.ipynb](FabricDataAgentAnalyzer/FabricDataAgentAnalyzer.ipynb) |
| [Fabric Data Agent Analyzer App](FabricDataAgentAnalyzer-App/README.md) | Rayfin (Fabric App) that imports the analyzer's JSON export and shows the readiness score, release gates, and a prioritized remediation list | [README](FabricDataAgentAnalyzer-App/README.md) |
| [Agent Readiness Validator](Agent-Readiness-Validator/README.md) | Configuration, instructions, examples, and benchmark checks | [Agent Readiness Validator.ipynb](Agent-Readiness-Validator/Agent%20Readiness%20Validator.ipynb) |
| [Copilot Diagnostics Troubleshooter](Copilot-Diagnostics-Troubleshooter/README.md) | Interprets exported Copilot diagnostic files | [Copilot_Diagnostics_Troubleshooter.ipynb](Copilot-Diagnostics-Troubleshooter/Copilot_Diagnostics_Troubleshooter.ipynb) |
| [Copilot and agent insights](Copilot-Agent-Insights/README.md) | Agent quality evaluation, Copilot capacity estimation, and question mining | [Notebook index](Copilot-Agent-Insights/README.md) |

### Lakehouse, OneLake, and supporting resources

| Tool or resource | Purpose | Status |
| --- | --- | --- |
| [OneLake Shortcut Auditor](OneLake-Shortcut-Auditor/README.md) | Shortcut discovery, connectivity, and access checks | Includes optional Teams notifications and persistence; review settings first |
| [Lakehouse Data Source Readiness](Lakehouse-Data-Source-Readiness/README.md) | Intended Lakehouse readiness checks | Work in progress: the notebook has no cells |
| [Power BI model settings](PowerBI-Model-Settings/README.md) | Companion DirectQuery and connection-tuning PowerShell scripts | These scripts change model settings; review before running |
| [Reference documents](Docs/README.md) | Data Agent guides and supporting reference material | Includes the [Performance Analyzer export format](Docs/Power%20BI%20Performance%20Analyzer%20Export%20File%20Format.pdf) and [report-authoring checklist](Docs/PowerBI_Report_Authoring_Unified_Checklist.md) |
| [Distinct source variants](Variants/README.md) | Different root-level notebook and script copies | Preserved separately, not assumed to be older or interchangeable |

## Run the Dataflow analyzer locally

From the repository root:

```powershell
Set-Location .\Analyzer
python -m dfg2_advisor scan --path samples --out reports\demo
python -m unittest discover -s tests
```

The local CLI is Python 3.9+ with no third-party runtime dependencies. Other
notebooks have their own dependencies and often require a Fabric runtime and
permissions; see their individual instructions.

Every solution has a named subfolder linked above. Start the Dataflow solution in
[DataflowGen2-Advisor](DataflowGen2-Advisor/README.md); its existing Python package,
compatibility notebook, samples, and tests remain at the Analyzer root so the
published `#subdirectory=Analyzer` installation URL and older notebook links
continue to work. Its full instructions are in [DataflowGen2_Advisor.md](DataflowGen2_Advisor.md).
For an offline Fabric run, upload this Analyzer folder to
`Lakehouse > Files > Analyzer` and use the notebook's documented offline import
instead of the online install cell.

## What was preserved

- Tool notebooks, Python package sources, tests, bundled synthetic samples,
  Tabular Editor scripts, remediation assets, documentation, and report images.
- Repeated root-level copies with identical bytes are represented by one organized
  copy. All equivalent source paths are recorded.
- Root-level copies with different bytes are retained in [Variants](Variants/).
  Organized tool folders are the default entry points, not a claim that every
  variant has identical behavior.
- [manifest.json](manifest.json) records each copied file, original relative paths,
  SHA-256 hashes, and whether a local-path adjustment was made.
- Analyzer logic is preserved. For the public copies, saved notebook outputs and
  execution counts were cleared, a client-specific local input path was replaced
  with an empty configurable value, documentation paths were adapted, and the
  Lakehouse VS Code workspace's folder references were made local.

## Scope and cautions

This is a snapshot of the current Tools workspace, not a search of the entire
computer or a live synchronization with the originals. Make future changes in the
intended copy deliberately.

Business/demo apps, DAX-to-Excel export workflows, shortcut-creation automation,
onboarding solutions, generated customer reports, ad hoc report-inspection
scripts, skill instruction libraries, dependency environments, caches, and Git
metadata are outside this diagnostic collection.

Some notebooks execute queries, evaluate agents, write reports or tables, send
optional notifications, or offer remediation. Review their parameters,
permissions, data sensitivity, and opt-in actions before running or sharing them.
No live Fabric or Power BI validation was performed as part of this copy operation.
