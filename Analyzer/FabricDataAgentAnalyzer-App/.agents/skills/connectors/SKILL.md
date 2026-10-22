---
name: connectors
description: >
  Connect a Universal App to existing Fabric data sources: a Warehouse, SQL
  database, Lakehouse SQL analytics endpoint, or Power BI semantic model. Use
  whenever the user says "connect to", names an existing Fabric item, asks to
  query data that already exists, or needs to discover available sources. This
  skill owns the Universal App pack, source routing, and the handoff to the
  installed Rayfin connector catalog and package docs. It does not cover
  app-owned CRUD data (use `data-modeling`) or arbitrary external APIs (use
  `functions-capability`).
---

# Connect to an existing Fabric data source

First install the app-side connector support:

```sh
npm run pack:add -- connectors
```

The `rayfin connector` command group is always available and requires no pack
or service flag.
This pack adds the frontend connector SDK and seeds
`packages/frontend/src/lib/connectors.ts` plus the composable Rayfin client.
It does not add `services.connectors` or declare a data source.
`rayfin connector add` owns the top-level `connectors:` configuration and the
per-source files under `rayfin/connectors/`.
Re-applying the pack is safe.

## Read the live connector contracts

Do not copy connector capabilities, operations, package versions, or client APIs
from this skill.
Read the installed, version-matched contracts before authoring:

1. Run `npx rayfin connector types --json` for the live type catalog.
2. Read
   `node_modules/@microsoft/rayfin-guide/assets/docs/cli/connectors/index.md`
   and the page for the command you are about to run.
3. After `connector add`, read the installed connector package's `package.json`,
   follow its `rayfinDocs.dir`, and use its entity-generation and typed-client
   pages.

The guide routes Category A details to
`@microsoft/rayfin-connector-fabric-graphql`.
Its installed docs own `metadata.json`, entity generation, aggregate
`schema.ts`, authorization, typed queries, and mutation behavior.

## Route by source type

| User's source                                             | Connector type or route                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Fabric Warehouse                                          | `fabric-warehouse`                                                      |
| Fabric SQL database                                       | `fabric-sqldatabase`                                                    |
| Lakehouse SQL analytics endpoint                          | `fabric-sqlanalytics`                                                   |
| Power BI semantic model                                   | `npm run pack:add -- connectors`, then `npm run pack:add -- analytics`  |
| Kusto / KQL database                                      | Check the live catalog; if it is absent, say it is unavailable and stop |
| External API, custom model endpoint, or Fabric data agent | `npm run pack:add -- functions`, then follow `functions-capability`     |

The Lakehouse route is its SQL analytics endpoint, not direct access to files.
Do not substitute a nearby source type or sample data when the requested type
is unavailable.

## Discover before connecting

Set `<source-type>` to the exact value from the table and confirm it still
appears in `connector types --json`.
If the user named a source but did not provide explicit IDs, search for it:

```sh
npx rayfin connector search "<name>" --type <source-type> --all-workspaces --json
```

Before deployment there is no workspace scope to infer.
Use `--all-workspaces` for a tenant-wide scan, or replace it with
`--workspace-id <id>` when the workspace is known.
Both explicit scopes require `--type`.
Prefer `--json` so you can compare `displayName`, `workspaceName`,
`workspaceId`, `itemId`, and `connectorType` without parsing a table.
Each result also carries a ready-to-run `addCommand`; prefer that command over
reconstructing `connector add` flags by hand.

- One unambiguous match: use it.
- Several plausible matches: show the workspace names and ask which one.
- No match: say what you searched for and ask for a corrected name or explicit
  IDs.

Never guess a source.

## Add the connector

```sh
npx rayfin connector add --type <source-type> \
  --workspace-id <workspaceId> --item-id <itemId> --name <alias>
```

Use a short lower-camel-case alias such as `salesWarehouse`.
`add` records the connection in `rayfin/rayfin.yml`, creates
a placeholder `rayfin/connectors/<alias>/schema.ts` plus `metadata.json` when
schema discovery succeeds, and prints version-pinned package specifications.
Install those exact versions into the frontend workspace from the app root:

```sh
npm install -w @rayfin-app/frontend <printed-packages-and-versions>
```

Do not install them at the workspace root or create a nested lockfile.

## Generate and wire Category A entities

`connector add` discovers metadata but does not emit the entity files.
Use `rayfin/connectors/<alias>/metadata.json` only through the installed
package's generation contract.
Follow the installed
`@microsoft/rayfin-connector-fabric-graphql` docs to generate only the entities
the app needs and replace the placeholder aggregate `schema.ts`.
Do not recreate those package-owned contracts from memory.

The CLI-generated `packages/frontend/src/lib/connectors.ts` carries this
ownership marker:

```ts
// @generated by `rayfin connector add` — do not edit below this line.
```

After the aggregate schema exports `<Name>Schema` and `connectorConfig`, take
ownership before editing by deleting that generated-marker line.
Then add the same connector name in all matching locations:

- import `<Name>Schema` and `connectorConfig` from the aggregate `schema.ts`;
- add `<alias>: <Name>Schema` to `AppConnectorsSchema`;
- add `<alias>: connectorConfig` to `connectorConfigs`.

Category A needs no `connectorRuntimes` entry.
Do not rerun `rayfin connector add --yes` after authoring entities: `--yes`
opts in to replacing the hand-authored aggregate `schema.ts` with a placeholder.
If the CLI later reports manual wiring, merge its printed maps into the
Builder-owned file instead of restoring the generated marker.

## Sample the source before building UI

List the real entities, then sample one through the read-only inspection path:

```sh
npx rayfin connector inspect --name <alias>
npx rayfin connector inspect --name <alias> --entity <entity> --rows 1
```

Use the typed client surface documented by the installed connector package for
application reads and writes.
That is the generated `client.connectors.<alias>.<Entity>` surface, not a raw
query operation invented in application code.
Category A SQL connectors do not use `connector invoke` as their authoring
workflow.
This CLI sample proves source access and shape only.
It does not replace deployed browser validation from
[`app-validation`](../app-validation/SKILL.md).
Treat connector errors as configuration, permissions, or query errors to fix,
not warnings to bypass.

After wiring application code, run the normal project gates from the workspace
root:

```sh
npm run typecheck
npm run build
npm run lint
npm test
```

Before browser validation, follow the connector deployment-outcome invariant in
[`app-deployment`](../app-deployment/SKILL.md).
Do not treat overall `rayfin up` success as proof that a required connector was
generated and applied.
