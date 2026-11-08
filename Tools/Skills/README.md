# Skills

Copilot skills for Microsoft Fabric data agents and Power BI DirectQuery models. Each folder is a self-contained skill (`SKILL.md`, plus `references/` where needed) that follows the [skills-for-fabric](https://github.com/microsoft/skills-for-fabric) layout.

| Skill | Use it to |
|---|---|
| [dataagent-cli](dataagent-cli/SKILL.md) | Plan, create, configure, improve, publish, and evaluate Fabric data agents over any source (lakehouse, warehouse, SQL database, mirrored database, semantic model, Eventhouse KQL, graph, ontology, Azure AI Search) with per-source best practices. Modes: planning (approval gate), authoring, evaluation, management. |
| [lakehouse-dataagent-remediation-cli](lakehouse-dataagent-remediation-cli/SKILL.md) | Deep, lakehouse-only workflow that fixes the findings of the [Fabric Data Agent Analyzer](../../Analyzer/FabricDataAgentAnalyzer/README.md): descriptions, instructions, validated example queries, schema selection, routing. Modes: assess, plan (approval gate), apply, verify. |
| [power-bi-directquery-best-practices](power-bi-directquery-best-practices/SKILL.md) | Audit a DirectQuery semantic model for modeling, relationship, aggregation, query-reduction, concurrency, and performance practices, using the [DirectQuery best-practices notebook](../../Notebooks/SemanticModel-Optimization/DirectQuery_BestPractices_Check.ipynb) or the Tabular Editor 2 script. |

The two data agent skills are plan-first: they back up the agent definition before writing, edit only the agent **draft** (plus lakehouse comments when separately approved), read every change back, and never publish unless asked.

The same skills are also published in [SoomroFarhanH/skills-for-fabric](https://github.com/SoomroFarhanH/skills-for-fabric/tree/main/skills).
