# Semantic Model AI Readiness Analyzer

Validates a **Power BI semantic model** for AI-powered analytics (Copilot in Power BI) and produces a severity-weighted, actionable readiness score. Use it before turning on Copilot / *Prep data for AI* features so the model behind the AI is solid.

> *"AI is only as good as the data behind it."* If the model is messy or inconsistent, Copilot's answers will be too.

## What this tool does

- **Automates 18+ critical checks** across model design, naming, DAX quality, performance, and the AI Data Schema.
- **Severity-weighted scoring** — findings ranked 🔴 Critical → 🟠 Important → 🟡 Recommended.
- **Prep for AI guidance** — Verified Answers, AI Instructions, synonyms, row labels, descriptions, format strings, and data category completeness.
- **Aligned with Microsoft guidance** for AI-ready semantic models.

## Coverage highlights

- **Semantic model optimization** — star schema, Best Practice Analyzer, data types, business-friendly naming, descriptions, explicit measures, ambiguous date fields, hidden-object risk, model complexity/bloat, duplicate column names.
- **Prep for AI — AI Data Schema** — schema selection, measure dependencies, helper-measure exclusion, hidden fields in verified answers.
- **Scoping & design** — security requirements and focused-solution assessment.

## How to use

1. Open the notebook in a Fabric / Python environment with **Semantic Link** and **Semantic Link Labs** available.
2. Point it at your semantic model.
3. **Run all cells** and review the scored findings, starting with 🔴 Critical.
4. Remediate, then re-run to confirm improvements.

## Powered by / references

- [Semantic Link](https://learn.microsoft.com/fabric/data-science/semantic-link-overview) and [Semantic Link Labs](https://github.com/microsoft/semantic-link-labs)
- [Use Copilot with semantic models](https://learn.microsoft.com/power-bi/create-reports/copilot-semantic-models)
- [Update your data model to work well with Copilot](https://learn.microsoft.com/power-bi/create-reports/copilot-evaluate-data)

## Files

- [`SemanticModelAIReadinessAnalyzer.ipynb`](SemanticModelAIReadinessAnalyzer.ipynb) — the notebook.
