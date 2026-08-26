# Semantic Model Best Practices for AI

Toolkit to make Power BI semantic models and Fabric Data Agents AI/Copilot-ready: semantic model AI-readiness analyzers, a Data Agent config validator, a natural-language remediation agent, a Copilot diagnostics troubleshooter, and lakehouse data-source readiness checks.

Each tool lives in its own folder with a dedicated README.

This repository is built for teams searching for: Power BI Copilot readiness, Fabric Data Agent best practices, semantic model optimization for AI, Copilot diagnostics troubleshooting, DirectQuery tuning, and OneLake data-source readiness.

## Table of contents

- [What this toolkit offers](#what-this-toolkit-offers)
- [Search-friendly use cases](#search-friendly-use-cases)
- [Keywords](#keywords)
- [Tooling formats included](#tooling-formats-included)
- [Who this is for](#who-this-is-for)
- [Tools](#tools)
- [How to pick a tool](#how-to-pick-a-tool)
- [Docs included](#docs-included)
- [Repository organization](#repository-organization)
- [Suggested GitHub topics](#suggested-github-topics)
- [Reference documentation](#reference-documentation)

## What this toolkit offers

- Semantic model AI-readiness analysis for naming, descriptions, DAX quality, schema clarity, and performance signals.
- Fabric Data Agent configuration validation against practical best practices.
- Natural-language remediation assets (agent + prompt + script) to translate findings into fix actions.
- Copilot diagnostics parsing and troubleshooting guidance to connect symptoms to model-level fixes.
- Lakehouse data-source readiness checks for agent and Copilot scenarios.

## Search-friendly use cases

- Power BI Copilot semantic model best practices
- How to prepare semantic model for Copilot and AI
- Fabric Data Agent configuration validator and readiness checklist
- Copilot diagnostics export analyzer for Power BI
- Natural-language remediation for semantic model issues
- DirectQuery best practices checker and max connection tuning
- OneLake shortcut audit and automation for Fabric
- DAX export to Excel paginated-style reporting workflow
- Fabric AI readiness tools and docs for analytics teams

## Keywords

Power BI, Microsoft Fabric, Copilot, Fabric Data Agent, semantic model, AI readiness, Copilot readiness, semantic model analyzer, data agent validator, diagnostics troubleshooter, DirectQuery best practices, DAX optimization, OneLake shortcut automation, lakehouse readiness, Tabular Editor, model governance, analytics engineering.

## Tooling formats included

- Jupyter notebooks for analyzers, diagnostics, assessments, and guided workflows.
- PowerShell scripts for repeatable semantic model setting changes and utilities.
- Agent and prompt definition files for remediation workflows.
- Markdown playbooks and checklists for implementation guidance.

## Who this is for

- Power BI developers optimizing semantic models for Copilot.
- Fabric data engineers building or validating Data Agents.
- Analytics platform teams troubleshooting Copilot response quality.
- BI governance teams standardizing AI-readiness checks and documentation.

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

## Docs included

- [PowerBI_Report_Authoring_Unified_Checklist.md](PowerBI_Report_Authoring_Unified_Checklist.md) - Report-authoring checklist.
- [Docs/A Practical Guide to Building and Deploying Data Agents.pdf](Docs/A%20Practical%20Guide%20to%20Building%20and%20Deploying%20Data%20Agents.pdf) - Practical implementation guide for data agents.
- [Docs/autonomous_fabric_-_agentic_data_quality_using_fabric_data_agents.pdf](Docs/autonomous_fabric_-_agentic_data_quality_using_fabric_data_agents.pdf) - Agentic data-quality architecture and workflows.
- [Docs/build_smarter_analytics_assistants_with_fabric_data_agents_and_copilot_studio.pdf](Docs/build_smarter_analytics_assistants_with_fabric_data_agents_and_copilot_studio.pdf) - Building analytics assistants with Data Agents and Copilot Studio.
- [Docs/mastering_fabric_data_agents_from_setup_to_success.pdf](Docs/mastering_fabric_data_agents_from_setup_to_success.pdf) - End-to-end setup and adoption guidance.

## Repository organization

The repository now separates packaged tools from supporting assets:

- [SemanticModel-AI-Readiness-Analyzer/](SemanticModel-AI-Readiness-Analyzer/) and related tool folders: production analyzers and validators.
- [Notebooks/](Notebooks/) - Working notebooks grouped by scenario (semantic model optimization, OneLake, Copilot/agent insights, business demos).
- [Scripts/](Scripts/) - Reusable automation scripts grouped by purpose (model settings and utilities).

### New notebook catalog

- [Notebooks/SemanticModel-Optimization/](Notebooks/SemanticModel-Optimization/) - Model quality, performance, and schema-shaping notebooks.
- [Notebooks/Lakehouse-OneLake/](Notebooks/Lakehouse-OneLake/) - OneLake shortcut governance and automation.
- [Notebooks/Copilot-Agent-Insights/](Notebooks/Copilot-Agent-Insights/) - Copilot usage mining and agent quality analysis.
- [Notebooks/Business-Demos/](Notebooks/Business-Demos/) - Architecture and dashboard-oriented demos.

### New script catalog

- [Scripts/PowerBI-Model-Settings/](Scripts/PowerBI-Model-Settings/) - Semantic model connectivity and DirectQuery tuning scripts.
- [Scripts/Utilities/](Scripts/Utilities/) - Helper scripts for operational tasks.

## Suggested GitHub topics

Add these topics in repository settings to improve GitHub search visibility:

- power-bi
- microsoft-fabric
- copilot
- semantic-model
- fabric-data-agent
- ai-readiness
- directquery
- onelake
- dax
- tabular-editor
- analytics-engineering
- business-intelligence

## Reference documentation

- [Use Copilot with semantic models](https://learn.microsoft.com/power-bi/create-reports/copilot-semantic-models)
- [Prepare your data for AI (Power BI)](https://learn.microsoft.com/power-bi/create-reports/copilot-prepare-data-ai-faq)
- [Best practices for configuring your data agent](https://learn.microsoft.com/fabric/data-science/data-agent-configuration-best-practices)
