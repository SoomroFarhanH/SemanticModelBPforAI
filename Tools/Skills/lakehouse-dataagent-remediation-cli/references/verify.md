<!-- Mode reference for the `lakehouse-dataagent-remediation-cli` skill. Loaded on demand from `skills/lakehouse-dataagent-remediation-cli/SKILL.md` when the request matches the `verify` mode. -->

# Verify — prove the result, report honestly, roll back on request

Read-only except for an explicitly requested rollback. Run after `apply`, or any time the user asks whether the configuration improved.

## 1. Readback

Re-export the draft definition and confirm each approved `C##` is present exactly as planned, `published/` parts equal `before/`, and unplanned parts are unchanged (the same checks as step 4 of `apply.md`). For lakehouse comments, `DESCRIBE TABLE EXTENDED` shows the new table and column comments. Save to `after/`.

## 2. Re-run the example queries

Execute every example in `fewshots.json` on the SQL analytics endpoint (SELECT only, `TOP` bounds for detail queries) and confirm each returns without error and with a plausible result (non-empty where data exists; magnitude consistent with the profile). Report per-example pass or fail.

## 3. Analyzer before and after

1. Run the Analyzer in `GIT_EXPORT` mode on `before/Files/Config` (if the baseline is not already saved) and on `after/Files/Config`, with the same flags (query/performance/evaluation `False`).
2. Compare `scorecard.readiness`, `scorecard.coverage`, and per-rule `status` for every `rule_id`. Report improved, unchanged, and regressed rules; a regression is a defect to fix or roll back.
3. Report remaining `WARN`/`FAIL` rows with their cause. Example of a verified before/after on a small lakehouse agent: readiness 38% → 91% and every lakehouse-source rule (`SQL-004` … `SQL-011`, `LH-004`, `EXQ-001`) cleared, coverage 57% → 62%.

What a static `GIT_EXPORT` run **cannot** show, and the plan summary must say so:
- It reads configuration text; it does not judge answer correctness, latency, or routing behavior.
- Release gates still fail without a ground-truth evaluation, accepted preview usage, a publishing description, and permission tests. A `NOT READY` rating after remediation is expected until those are done. Do not describe the agent as "ready".
- The Analyzer's checks are text heuristics. Passing them is necessary evidence, not proof of quality; the user should still ask representative questions and inspect the run steps (generated query, which examples were retrieved, routing decisions).

## 4. Suggest the next checks (do not run them unasked)

- A small ground-truth set evaluated with the SDK (`evaluate_data_agent`) or the Analyzer's `RUN_EVALUATION`.
- Ask three to five representative questions per source in the portal and open the run steps.
- For multi-source agents, test questions that previously routed wrongly.
- Publish when satisfied (portal or SDK `publish_staging`); this skill does not publish.

## 5. Rollback (only when the user asks)

1. Take a fresh backup of the current definition (so the rollback itself is reversible).
2. `updateDefinition` with **exactly** the parts from `before/` (full replace). Verified: this restores every part, including removing a `fewshots.json` that did not exist before.
3. Re-export and compare to `before/` (ignore `.platform` display noise). Report the result.
4. Lakehouse comments: re-apply the previous comments from `evidence/comments.json` with the same `COMMENT ON TABLE` / `ALTER COLUMN ... COMMENT` statements; an object that had no comment is reset with an empty comment string `''` (not exercised in testing; confirm with `DESCRIBE TABLE EXTENDED`).

## Output of `verify`

A concise report: readback result, example-query results, before/after table (readiness, coverage, rules improved/regressed), the remaining gaps and why, and the recommended next checks.
