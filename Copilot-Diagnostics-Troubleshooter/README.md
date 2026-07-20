# Copilot Diagnostics Troubleshooter

Parses a **Power BI Copilot diagnostic file** (`copilot_diagnostic_data_*.txt`, a JSON export) and turns it into an actionable troubleshooting report. It explains **why some prompts are answered well while others are not**, and maps every signal to a concrete **fix in your semantic model**.

## What this tool does

1. **Loads** the most recent diagnostic file (or a path you set).
2. **Session metadata** — session IDs, agent, service version, timestamp.
3. **Conversation turns** — each user question, the tool Copilot invoked, and the outcome.
4. **Per-question diagnostics** — interpretation warnings, NL‑to‑DAX fallback reasons, the generated DAX, empty results, and clarifications.
5. **Model AI settings** — the AI data schema (visible vs. hidden fields), AI instructions, example prompts, and indexing state.
6. **Automated report** — a prioritized list of findings (ERROR / WARNING / CHECK / INFO), each mapped to *what it means* and *what to adjust*.
7. **Shareable Markdown report** — exports a report you can hand to model owners.

## Key behavior

- **Category-based remediation, not exact-code lookup.** Copilot emits many signal codes and the exact string often has no dedicated docs page. Unknown codes are matched by keyword to the closest remediation category (e.g. any *schema* signal → *simplify the model schema*; any *index* signal → *enable/complete Q&A indexing*).
- **Informational signals** such as `VerifiedAnswerNaiveMatch` are reported at **INFO** severity, not as warnings.

## How to use

1. In Copilot, open a response's **…** menu and **download the diagnostics**.
2. Put the `copilot_diagnostic_data_*.txt` file next to the notebook (or set `DIAG_PATH`).
3. Run the cells top to bottom.
4. Review section 7 (findings) and, optionally, run the last section to export a Markdown report.

## Reference docs

- [Copilot for Power BI overview](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction) — full list of error / warning / info messages
- [FAQ: Preparing data for AI (Power BI)](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai-faq)
- [Tutorial: Prepare a semantic model for AI](https://learn.microsoft.com/en-us/power-bi/create-reports/tutorial-copilot-power-bi-prepare-model)

## Files

- [`Copilot_Diagnostics_Troubleshooter.ipynb`](Copilot_Diagnostics_Troubleshooter.ipynb) — the notebook.
