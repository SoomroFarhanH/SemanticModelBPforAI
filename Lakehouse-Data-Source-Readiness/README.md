# Lakehouse Data Source Readiness

Assesses whether a **Fabric Lakehouse** data source is ready to back a Data Agent / Copilot experience — checking table structure, schema clarity, descriptions, and query-friendliness of the underlying Delta tables.

> ⚠️ **Status: work in progress.** The notebook in this folder is currently a scaffold (no cells yet). This README documents the intended scope; the checks will be added here.

## Planned scope

- **Table & schema hygiene** — clear table/column names, correct data types, documented columns.
- **Modeling for AI** — star-schema-friendly structure, keys and relationships that agents can traverse.
- **Descriptions & metadata** — table/column descriptions available for grounding.
- **Freshness & availability** — data is current and reliably queryable.
- **Join complexity** — flags cross-table / cross-lakehouse joins that make agent queries fragile.

## How to use

1. Open the workspace file [`Lakehouse Data Source Readiness.code-workspace`](Lakehouse%20Data%20Source%20Readiness.code-workspace).
2. Point the notebook at your Lakehouse.
3. Run the cells (once implemented) and review the readiness findings.

## Files

- [`Lakehouse Data Source Readiness.ipynb`](Lakehouse%20Data%20Source%20Readiness.ipynb) — the notebook (scaffold).
- [`Lakehouse Data Source Readiness.code-workspace`](Lakehouse%20Data%20Source%20Readiness.code-workspace) — VS Code workspace.

---

> **Developed by Farhan Soomro** · Free community utility · [MIT License](https://github.com/SoomroFarhanH/SemanticModelBPforAI/blob/main/LICENSE)
>
> ⚠️ **Disclaimer:** Provided "AS IS", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. This is a personal community project. It is not an official Microsoft product and is not supported or endorsed by Microsoft or any employer. Review the code and test it in a non-production environment before use. You use it at your own risk. In no event shall the author be liable for any claim, damages, data loss, service disruption, capacity or licensing cost, or other liability arising from its use. Results are guidance only and should be validated by a qualified person.
