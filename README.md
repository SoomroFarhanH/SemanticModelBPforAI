# Semantic Model Best Practices for AI

A collection of tools and guidance to make **Power BI semantic models** and **Fabric Data Agents** ready for AI / Copilot. Each tool lives in its own folder with a dedicated README.

## Tools

| Tool | What it does |
|------|--------------|
| [SemanticModel-AI-Readiness-Analyzer](SemanticModel-AI-Readiness-Analyzer/) | Validates a Power BI semantic model for Copilot with 18+ severity-weighted checks (naming, descriptions, DAX, AI Data Schema, performance). |
| [SemanticModel-DataAgent-Readiness](SemanticModel-DataAgent-Readiness/) | Data Agent readiness analyzer **plus** a natural-language remediation agent (agent + prompt + Tabular Editor script) that connects, analyzes, and fixes findings. |
| [Agent-Readiness-Validator](Agent-Readiness-Validator/) | Validates a Fabric Data Agent's configuration (benchmarks, instructions, examples, join risk, failure diagnosis) against Microsoft best practices. |
| [Copilot-Diagnostics-Troubleshooter](Copilot-Diagnostics-Troubleshooter/) | Parses a Copilot diagnostic export into a prioritized troubleshooting report and a shareable Markdown report, mapping each signal to a model fix. |
| [Lakehouse-Data-Source-Readiness](Lakehouse-Data-Source-Readiness/) | Assesses a Fabric Lakehouse data source for agent/Copilot readiness. *(Work in progress.)* |

## How to pick a tool

- **Preparing a semantic model for Copilot?** Start with [SemanticModel-AI-Readiness-Analyzer](SemanticModel-AI-Readiness-Analyzer/), then use [SemanticModel-DataAgent-Readiness](SemanticModel-DataAgent-Readiness/) to analyze and remediate.
- **Configuring a Fabric Data Agent?** Use [Agent-Readiness-Validator](Agent-Readiness-Validator/) and [Lakehouse-Data-Source-Readiness](Lakehouse-Data-Source-Readiness/).
- **Copilot answering incorrectly?** Download the diagnostics and run [Copilot-Diagnostics-Troubleshooter](Copilot-Diagnostics-Troubleshooter/).

## Additional resources

- [`PowerBI_Report_Authoring_Unified_Checklist.md`](PowerBI_Report_Authoring_Unified_Checklist.md) — report-authoring checklist.
- [`Docs/`](Docs/) — background reading on Fabric Data Agents and agentic analytics.

## Reference documentation

- [Use Copilot with semantic models](https://learn.microsoft.com/power-bi/create-reports/copilot-semantic-models)
- [Prepare your data for AI (Power BI)](https://learn.microsoft.com/power-bi/create-reports/copilot-prepare-data-ai-faq)
- [Best practices for configuring your data agent](https://learn.microsoft.com/fabric/data-science/data-agent-configuration-best-practices)
