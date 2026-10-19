# Agent Configuration Quality Validator

Validates your **Fabric Data Agent** configuration against Microsoft best practices, so the agent is well-scoped, well-instructed, and reliable before you ship it.

**Reference:** [Best practices for configuring your data agent](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configuration-best-practices)

## What this tool does

Runs a set of validation checks over your agent configuration and returns recommendations:

- ✅ **Benchmark coverage** — test cases cover all business domains.
- ✅ **Instruction quality** — agent and data-source instruction completeness.
- ✅ **Example query quality** — few-shot examples follow best practices.
- ✅ **Join risk assessment** — identifies cross-lakehouse join complexity.
- ✅ **Failure diagnosis** — analyzes failure patterns with recommended fixes.
- ✅ **Iteration planning** — suggests the next improvement actions.

## How to use

1. **Configure your agent** in the input section of the notebook.
2. **Run all cells** to execute the validation checks.
3. **Review results** and apply the recommendations, then iterate.

## Files

- [`Agent Readiness Validator.ipynb`](Agent%20Readiness%20Validator.ipynb) — the notebook.
