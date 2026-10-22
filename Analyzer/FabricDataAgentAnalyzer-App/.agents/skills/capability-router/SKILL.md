---
name: capability-router
description: >
  Start here for build and feature requests.
  Resolve the intended data source, select only the required Universal App
  capabilities, and hand the implementation to one owning skill per capability.
---

# Capability Router

The base workspace contains dynamic authentication, theming, an error boundary, an authenticated welcome view, and three packages: frontend, data, and shared.
It has no live data source, persistence, charting, or trusted server-side logic until a capability pack adds it.

## Decide the source first

Preserve what the user asked to use.
Do not select a pack from words such as "dashboard" or "workflow" alone.

| User intent or evidence | Decision |
| --- | --- |
| A named semantic model, dataset, or report matches one verified source | Use that source with `analytics` |
| A supplied Fabric or Power BI URL or explicit IDs | Extract the workspace and item IDs, verify them, and use them |
| Several sources could match | Ask the user to select the intended source |
| A named source cannot be found | Ask which source they meant; do not substitute sample data or another model |
| No source is named | Search a relevant catalog when available, then ask a focused source-or-sample question if still unresolved |
| The user requested sample data or a mock-up | Use `visuals` and label the sample data visibly |
| The user supplied a static file for bundling | Review it and emit typed rows; do not imply that the file is a live source |

Never fabricate identifiers, schemas, query output, or business values.
Do not ask the user to describe a discoverable schema.
Use the installed tools and version-matched docs to inspect it.

A declared semantic-model app needs its intended model.
Sample data is a separate, user-confirmed route, not a fallback for a missing model.

## Select the capabilities

| Need | Pack command | Seed or implementation anchor | Owning skill |
| --- | --- | --- | --- |
| Read an existing Power BI semantic model | `npm run pack:add -- connectors`, then `npm run pack:add -- analytics` | `packages/frontend/src/lib/connectors.ts`, `packages/frontend/src/hooks/use-semantic-model-query.ts`, `packages/frontend/src/queries/` | [`analytics`](../analytics/SKILL.md) |
| Chart semantic-model results | `npm run pack:add -- visuals` after analytics | frontend visuals kit and typed visual specifications | [`visuals`](../visuals/SKILL.md) |
| Chart sample data or app-owned records | `npm run pack:add -- visuals` | frontend visuals kit and typed visual specifications | [`visuals`](../visuals/SKILL.md) |
| Create and own records | `npm run pack:add -- data-modeling` | `packages/data/src/Item.ts`, `packages/data/src/index.ts`, `packages/shared/src/index.ts` | [`data-modeling`](../data-modeling/SKILL.md) |
| Read an existing warehouse, SQL database, or Lakehouse SQL endpoint | `npm run pack:add -- connectors` | `rayfin/rayfin.yml`, `rayfin/connectors/<alias>/` | [`connectors`](../connectors/SKILL.md) |
| Call an external API, webhook, or custom model endpoint | `npm run pack:add -- functions` | `packages/functions/src/function_app.ts` | [`functions-capability`](../functions-capability/SKILL.md) |
| Use a secret or trusted operation | `npm run pack:add -- functions` | `packages/functions/src/function_app.ts` | [`functions-capability`](../functions-capability/SKILL.md) |
| Call a published Fabric data agent | `npm run pack:add -- functions` | `packages/functions/src/function_app.ts` | [`functions-capability`](../functions-capability/SKILL.md) |
| Bundle a supplied CSV or spreadsheet | no pack | a typed module in the owning workspace package | this skill |
| Use Kusto or KQL | unavailable in this release | none | [`connectors`](../connectors/SKILL.md) |

Capabilities compose.
An app that stores records, reads a semantic model, charts results, and calls a trusted API needs four separate pack invocations.
The current scaffolder accepts one pack per invocation.
Run pack commands serially because they mutate workspace manifests, root scripts, and service configuration.

Use `data-modeling` for records the app owns.
Use `connectors` for records that already exist in a supported Fabric source.
Use `visuals` for rendering, regardless of whether rows come from sample data, Rayfin data, or analytics.
Use `functions` only for trusted code, secrets, app identity connections, or server-side calls.

Kusto and KQL are not supported in this release.
Say so and stop rather than swapping in another source.

## Optional consolidated install

When several packs are selected, you may avoid a separate install after each
pack without inventing a multi-pack command:

1. Run each selected `npm run pack:add -- <name> --no-install` command
   serially.
2. Inspect every result for preserved files and stop if any pack reports one.
3. After all packs apply cleanly, run one install from the workspace root:

```sh
npm install --ignore-scripts --no-audit --no-fund
```

This is a manual authoring optimization, not durable pack caching.
The consolidated install does not write the per-pack success markers, so a
later ordinary pack reapply may install again.

## Preserve workspace ownership

Run pack and lifecycle commands from the workspace root.
The pack manifest selects the package manifest that owns its dependencies:

- Frontend and connector dependencies belong in `packages/frontend/package.json`.
- Decorated entities belong in `packages/data`, while browser-safe record contracts belong in `packages/shared`.
- The functions pack creates `packages/functions` and composes it into the root build and typecheck scripts.

Do not create nested lockfiles or install dependencies separately inside workspace packages.
Do not import decorated entity classes into frontend code.

## Apply and hand off

Apply selected packs before editing files they seed.
If a pack preserves an existing file, report it and stop instead of assuming the pack's contract is installed.
Use `--force-seeds` only with explicit user approval.

After routing:

1. Read the owning skill for each selected capability.
2. Read the relevant seed files and exact installed package documentation in parallel where independent.
3. Establish a runnable shell in `packages/frontend` with honest loading states, preserving protected hosting and the dynamic auth gate.
4. Verify real query or operation output before writing code that consumes its fields.
5. Integrate data, interactions, and polish, then follow `AGENTS.md` for final validation and deployment.

Substantial independent discovery or implementation may be delegated behind a clear interface.
Do not fan out a tiny app or tightly coupled flow merely because parallel agents are available.
