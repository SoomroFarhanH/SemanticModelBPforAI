# Unified Semantic Model and Copilot Readiness Checklist

Use this single checklist before report authoring and Copilot-enabled analytics work.

## 0. Scope and Design

- [ ] [CRITICAL] Define a narrow business scope (avoid broad "ask anything" agent behavior).
- [ ] [CRITICAL] Confirm target users, top scenarios, and expected question types.
- [ ] [CRITICAL] Document security boundaries (RLS/OLS expectations and sensitive data exclusions).
- [ ] [IMPORTANT] Prepare a short list of sample business questions for guided testing.

## 1. Semantic Model Foundation

- [ ] [CRITICAL] Validate star schema quality (facts/dimensions, relationship direction, cardinality).
- [ ] [CRITICAL] Run Best Practice Analyzer and resolve critical findings.
- [ ] [IMPORTANT] Run Memory Analyzer and address high-impact memory issues.
- [ ] [IMPORTANT] Validate data types for all key columns and measures.
- [ ] [CRITICAL] Use business-friendly table, column, and measure names.
- [ ] [CRITICAL] Add clear descriptions for tables, columns, measures, and calculation groups.
- [ ] [RECOMMENDED] Configure synonyms and linguistic schema support for business terms.
- [ ] [IMPORTANT] Set row labels on key dimension tables.
- [ ] [CRITICAL] Define explicit business measures for core KPIs (avoid implicit logic).
- [ ] [IMPORTANT] Move report-scoped measures into the semantic model where needed.
- [ ] [IMPORTANT] Mark an official date table and remove ambiguous date usage patterns.
- [ ] [IMPORTANT] Hide technical fields (IDs, GUIDs, FK/PK, sort helpers, audit columns).
- [ ] [IMPORTANT] Mark internal-only tables as Private when they should not ground Copilot.
- [ ] [RECOMMENDED] Keep model complexity manageable (table/column/measure bloat control).
- [ ] [IMPORTANT] Remove duplicate business column names across tables when ambiguous.
- [ ] [IMPORTANT] Complete grounding metadata: format strings, data category, calc-group item naming.

## 2. Prep for AI - AI Data Schema

- [ ] [CRITICAL] Include only business-relevant tables, columns, and measures.
- [ ] [CRITICAL] Validate measure dependencies for all exposed AI schema metrics.
- [ ] [IMPORTANT] Exclude helper/intermediate measures not intended for end users.
- [ ] [CRITICAL] Ensure verified answers do not rely on hidden/unavailable fields.
- [ ] [IMPORTANT] Run Performance Analyzer for AI-schema-backed report interactions.

## 3. Prep for AI - Verified Answers

- [ ] [CRITICAL] Add verified answers for top recurring business questions.
- [ ] [CRITICAL] Confirm outputs match approved business definitions.
- [ ] [IMPORTANT] Prioritize high-value questions (top 10-20) for fast, stable responses.

## 4. Prep for AI - AI Instructions

- [ ] [CRITICAL] Add concise domain instructions, terms, and business rules.
- [ ] [CRITICAL] Define negative scope (what the model does not contain or should not answer).
- [ ] [RECOMMENDED] Specify default grouping and analysis preferences.
- [ ] [IMPORTANT] Run Prep-for-AI configuration validation and resolve mismatches.
- [ ] [IMPORTANT] Confirm Q&A is enabled where required for linguistic schema support.

## 5. Data Agent and Report Alignment

- [ ] [CRITICAL] Ensure Data Agent table/measure selection aligns with Prep for AI configuration.
- [ ] [CRITICAL] Ground key prompts on curated report visuals where possible.
- [ ] [IMPORTANT] Confirm report visuals use model measures (not ad hoc local logic) for core KPIs.

## 6. Testing and Validation

- [ ] [CRITICAL] Execute a structured test pass using representative business prompts.
- [ ] [CRITICAL] Verify factual accuracy, consistency, and metric definition compliance.
- [ ] [IMPORTANT] Validate response latency and interaction quality for common workflows.
- [ ] [IMPORTANT] Perform regression checks after each semantic model or instruction update.

## 7. Service and Admin Readiness

- [ ] [RECOMMENDED] Confirm required Copilot capacity and licensing prerequisites.
- [ ] [RECOMMENDED] Apply endorsement/tags (for example: Promoted, Certified, Prepped for AI).
- [ ] [RECOMMENDED] Confirm deployment and governance process for ongoing updates.

## Final Sign-off

- [ ] All CRITICAL items completed.
- [ ] Open IMPORTANT items are documented with owners and due dates.
- [ ] Model is approved for powerbi-report-authoring and Copilot-enabled report workflows.
