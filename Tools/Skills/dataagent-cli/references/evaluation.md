<!-- Mode reference for the `dataagent-cli` skill. Loaded on demand from `skills/dataagent-cli/SKILL.md` when the request matches the `evaluation` mode. -->

# Evaluation — prove it works, say what you could not prove

Read-only. Run after `authoring`, before publishing, and whenever the user asks whether a change helped. Learn guidance: [iterative improvement process](https://learn.microsoft.com/en-us/fabric/data-science/develop-iterative-process-data-agent) · [example queries](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-example-queries).

## 1. Readback and static checks (always)

1. Export the draft (`management.md`) and compare with the plan: every approved change present, `published/` equal to the backup, unplanned parts unchanged.
2. Re-run each example query against its source (SQL on the SQL endpoint, KQL through the Eventhouse query endpoint), read-only and bounded. Report pass or fail per example.
3. **Analyzer before and after.** Run the Fabric Data Agent Analyzer (`Analyzer/FabricDataAgentAnalyzer`) in `GIT_EXPORT` mode on the backup and on the new export (`GIT_EXPORT_ROOT` = the exported `Files/Config` folder; query, performance and evaluation flags `False`). Compare `scorecard.readiness`, `scorecard.coverage` and each `rule_id` status; list improved, unchanged and **regressed** rules. A regression is a defect to fix or roll back.
4. **Pre-flight checklist.** Run [preflight-checklist.md](preflight-checklist.md) on the export (sections A–G; add H when the user wants to publish). It covers best practices the Analyzer does not score, such as the instruction structure, example coverage and the publishing description.
Verified effect on a small lakehouse agent: readiness 38% → 91%, coverage 57% → 62%, all lakehouse-source rules cleared; release gates still failed.

## 2. What a static check cannot show (state this in every report)

- It reads configuration text; it does not judge answer correctness, latency or routing behavior.
- The Analyzer's checks are text heuristics: passing them is necessary, not sufficient.
- Release gates (accepted preview use, ground-truth evaluation, publishing description, permission tests) stay failed until done; do not call an agent "ready" while they fail.

## 3. Behavioral evaluation (when asked, or before publishing)

1. **Benchmark set.** 10–30 questions with expected answers (and, for SQL/KQL, expected queries), covering each source, multi-source questions, ambiguous questions, and previously failing questions. Format: question, expected query, expected answer (CSV with `question, expected_answer` for the SDK).
2. **Run the SDK evaluation** (`fabric-data-agent-sdk`, preview, in a Fabric notebook or with a configured credential):

   ```python
   from fabric.dataagent.evaluation import evaluate_data_agent, get_evaluation_summary, get_evaluation_details
   eval_id = evaluate_data_agent(df[["question", "expected_answer"]], "<agent name>",
                                 workspace_name="<workspace>", table_name="data_agent_eval",
                                 data_agent_stage="sandbox")        # sandbox = draft, production = published
   summary = get_evaluation_summary("data_agent_eval")
   details = get_evaluation_details(eval_id, "data_agent_eval", get_all_rows=True)
   ```

   The Analyzer can run the same with `RUN_EVALUATION = True` and `EVALUATION_DATASET_PATH`. Evaluation writes results to a table in the attached lakehouse and uses an LLM; it consumes capacity, so run it only when requested.
3. **Example-query quality (SQL sources only, preview):**

   ```python
   result = datasource.evaluate_few_shots(batch_size=20)
   result.success_rate          # share of examples judged good on all criteria
   result.failure_cases         # examples to rewrite, with reasons
   result.conflict_count, result.conflict_details   # contradictory examples, confidence 1-5
   ```

   Each example is scored on **Clarity** (the question is unambiguous), **Relatedness** (the query answers that question) and **Mapping** (every literal in the question appears in the query). Rewrite or drop failures and resolve every conflict before publishing; re-run until clean. Not available for KQL, graph or semantic-model sources: validate those by running the query (section 1).
4. **Inspect run steps in the portal** for a sample of questions: the generated query, which examples were retrieved (the three to four most similar), and which source was chosen; if the routing tool ran, the decision was ambiguous.
5. **Smoke test the published agent** (after `management` publishes, when asked): call it through its MCP endpoint with 3–5 benchmark questions ([consumption.md](consumption.md)). This exercises the published stage, the caller's permissions and the publishing description that MCP clients see as the tool description. Compare with the same questions on the draft (`data_agent_stage="sandbox"`).

## 4. Diagnose and fix (iterate at the closest layer)

| Symptom | Likely layer | Fix |
|---|---|---|
| Wrong source | routing | [routing.md](routing.md): selection → description → examples → rules |
| Wrong join or duplicated rows | source instructions / example | state join keys and grain; add a joining example |
| Wrong filter value (`CA` vs `California`) | object description / instructions | document stored values and formats |
| Wrong default date or period | source instructions | default date, calendar vs fiscal, boundaries |
| Wrong metric (semantic model) | Prep for AI | AI data schema, verified answer, AI instructions (`semantic-model-authoring`) |
| Slow or truncated answers | scope / model | narrower selection; optimized model; remember the 25-row/25-column cap (1,000 rows on the preview runtime) |
| Ambiguous question | instructions/examples | add a terminology definition or an example; on the preview runtime the tool may ask a clarifying question |

Change one layer at a time, re-run the benchmark, and keep what improved.

## Output

A concise report: readback result, example results, pre-flight table, before/after table (readiness, coverage, improved/regressed rules), benchmark results if run, remaining gaps and why, and recommended next checks. Publishing is a separate decision (`management.md`).
