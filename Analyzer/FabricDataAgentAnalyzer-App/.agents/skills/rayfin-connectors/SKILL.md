---
name: rayfin-connectors
description: "Connect existing Fabric data sources (Lakehouse, Warehouse, SQL Database, semantic model, KQL Database/Eventhouse) to Rayfin apps; not app-owned data models. Use for connector discovery, setup, entity generation, authorization, SDK wiring, inspecting rows, invoking queries, and troubleshooting. Triggers: rayfin connector (add/search/types/inspect/invoke), rayfin up connector apply, connectors:, fabric-sqlanalytics, fabric-warehouse, fabric-sqldatabase, fabric-semanticmodel, kusto/KQL, DAX EVALUATE, rayfin/connectors/, metadata.json, AppConnectorsSchema, ConnectorsSchema, ConnectorsRayfinClient, client.connectors, connectorConfig, GraphQLBackedConnector, schema.ts, @role, claims.sub, executeQuery, executeCommand, resultSetRowCountLimit, queryServiceUri, databaseName, KustoConnectorConfig. Includes connector entity imports/maps causing a blank page after deploy, Uncaught SyntaxError, or Invalid or unexpected token."
metadata:
  author: microsoft
  version: 0.7.4
rayfin-managed: true
---
# Rayfin Connectors

Bring an existing Fabric data source into a Rayfin app.

Two contracts govern connectors, and this file is neither of them:

- **The versioned behavioral contract** — the category guides shipped in `@microsoft/rayfin-guide`.
  Workflow, generation rules, authorization semantics, per-dialect behavior, error handling.
- **The live catalog contract** — `rayfin connector types --json`.
  Current types, categories, allowed operations, auth modes, required config, adapter versions, and the packages plus versions to install.

**Read the matching category guide for workflow and semantics.
Read `rayfin connector types --json` for current types, capabilities, package names, and versions.**
Answer neither from memory, and never copy either into code or prose — a copied catalog goes stale within days.

This file is the router: whether a connector applies, which category you are in, and where to read next.

## When to Use a Connector

Use a connector when the user wants the app to read or write **existing** data already living in a Fabric workspace.

Do **not** use a connector when the user is creating a brand-new data model owned by the Rayfin app — those entities go under `rayfin/data/` and are managed via `rayfin up db apply`, not `rayfin connector add`.

**Routing note:** `@role` and `@entity` also appear in the base `rayfin` skill for owned `rayfin/data/` models.
This skill applies only when those decorators are used inside `rayfin/connectors/` files.

Connectors are cloud-only on day one.
`rayfin dev` parses the `connectors:` block but does not wire it; verifying connector behavior requires `rayfin up`.

`fabric-sqlanalytics` means the Lakehouse SQL analytics endpoint, not full Lakehouse access.
It can read SQL-visible tables and views only; it cannot directly open PDFs, images, or other files in the Lakehouse `Files` area.
Do not describe it as generic Lakehouse support.

## Connector Commands

`rayfin connector ...` is always registered; no opt-in is required.

## Two Categories — Decide First

|                                                          | Category A — GraphQL entities                                   | Category B — function bridge                   |
| -------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| Types                                                    | `fabric-sqlanalytics`, `fabric-warehouse`, `fabric-sqldatabase` | `fabric-semanticmodel`; `kusto` is experimental |
| App surface                                              | Generated entity files with typed CRUD                          | Named operations carrying a raw query          |
| Entity files, `@role` policies, `metadata.json` entities | Yes                                                             | No                                             |
| Read next                                                | `cli/connectors/category-a-entities.md`            | `cli/connectors/category-b-function-bridge.md` |

Category membership is stable enough to route on.
Everything else about a type — allowed operations, auth modes, required config, adapter version, packages to install — comes from `rayfin connector types --json`, including types added after this file was written.

**New `kusto` authoring is held in this release.** It is absent from `connector types` and `connector search`, and rejected by `connector add`. If the user asks to add a KQL database, say so and stop rather than substituting another source. A project that already declares a Kusto connector stays valid — validate, deploy and invoke all work — so the guidance below applies to it today.

Do not read both category docs.
Category A's entity-generation contract does not apply to `fabric-semanticmodel` or experimental `kusto`, and Category B's function-bridge contract does not apply to the SQL types.

## Reading the Connector Guides

These guides are published with the Rayfin guide package. Resolve them from disk when you need the version installed in the app:

`node_modules/@microsoft/rayfin-guide/assets/docs/<path>`.

This skill can load before `@microsoft/rayfin-guide` is installed, or against a different package version than the one it was written for.
If the guide path is unavailable, say it is unavailable and fall back to `rayfin connector types --json` and `rayfin connector <command> --help`.
Do not reconstruct the contract from memory.

### Eventhouse (`kusto`) has a dedicated guide

The experimental Eventhouse (`kusto`) connector reads large, append-only time-series data from a Fabric Eventhouse KQL Database; for small relational lookups or CRUD, use a Category A SQL type instead.
When to choose it, the streaming model, shaping KQL, safe query construction, and result handling all live in `cli/connectors/eventhouse.md`, with the shared function-bridge contract in `cli/connectors/category-b-function-bridge.md`.
Read those; do not reconstruct them from memory.

## Workflow

1. **Add.** `rayfin connector add --type <type> --workspace-id <ws> --item-id <item> [--name <name>] [--operations <ops>]`
   Verifies the Fabric item, writes the `rayfin.yml` entry, and scaffolds `rayfin/connectors/<name>/` — plus `metadata.json` for Category A.
   It **installs nothing**, but it prints the exact version-pinned `npm install` command — run that verbatim.
   Never install these packages unversioned: their npm tags lag the published release, so `npm install <pkg>` pulls an older connector and a second, mismatched copy of `@microsoft/rayfin-data`.
   See `cli/connectors/add.md`.
2. **Scope.** Without `--operations`, `add` writes every operation the catalog allows.
   Confirm what the user actually needs and narrow to it: read-only → `read`; append-only → `read`, `create`; edit-but-not-add → `read`, `update`; full CRUD → all four.
   Ask when the intent is ambiguous; for Category A also ask whether rows are scoped per user.
   You can narrow below the catalog default, never widen above it.
3. **Follow the category guide.** Category A generates entity files, scopes `@role(...)`, and writes the aggregate `schema.ts`; Category B installs a marker package and calls a named operation.
4. **Deploy.** `rayfin up`, or `rayfin up connector apply` to re-apply DAB config alone.
5. **Preflight — prove data comes back before you build anything on it.**
   Run exactly one query and stop if it fails. This is a gate, not a suggestion: a connector that cannot return data fails the same way after a dashboard is built on top of it, only an hour later and with the cause buried.

   | Category | Command |
   | --- | --- |
   | A | `rayfin connector inspect --name <name> --entity <entity> --rows 1` |
   | B — `fabric-semanticmodel` | `rayfin connector invoke <name> executeQuery --file ./probe.query.json` |
   | B — `kusto` | `rayfin connector invoke <name> executeQuery --file ./probe.query.json` |

   `fabric-semanticmodel` is the one you can run **before** step 4: from the CLI it calls Power BI directly under your identity, so it needs no deployment. Use that to fail fast. Everything else reads through the deployed app and needs step 4 first.

   **A CLI probe does not prove the deployed app works.** For `fabric-semanticmodel` the CLI takes the direct Power BI route under *your* identity by default; the deployed app instead goes through the platform's user-data function, which re-authorises as the signed-in user. Those are different transports with different permissions, and the second can fail — typically `Unauthorized` — after the first has passed. So the probe is necessary, not sufficient: **the connector is only proven once the deployed app itself executes the query and renders real rows in the browser.** Re-running `rayfin connector invoke` after `rayfin up` does not change that: it still takes the CLI-direct path unless you pass `--transport deployed`, and that route authenticates the *app*, so it needs an app-session token in `RAYFIN_TOKEN` — a normal `rayfin login` cannot mint one.

   `--file` takes a **JSON payload**, not a raw `.dax` or `.kql` file — it is `JSON.parse`d, so a bare query fails before the connector is ever reached. Write the query into the operation's input envelope:

   ```json
   { "query": "EVALUATE TOPN(1, Sales)" }
   ```

   Prefer that over `--input '<json>'` for anything you or a model composed: DAX and KQL are full of quotes and brackets a shell reads as syntax, and one apostrophe in a string literal is enough to corrupt the command. The path is resolved against the project root and must stay inside it.

   A failure here is a connector, permission, or platform-enablement problem. Report it and stop — do not scaffold UI, and do not work around it in app code. `FEATURE_NOT_ENABLED` in particular is a workspace switch nobody can fix from inside the app.

## Commands

| Command                                      | What it does                                                        | Doc path                    |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| `rayfin connector types [--json]`            | Emit the live catalog.                                              | —                           |
| `rayfin connector search [query]`            | Discover addable Fabric sources before you know workspace/item IDs. | `cli/connectors/search.md`  |
| `rayfin connector add`                       | Declare a connector and scaffold it.                                | `cli/connectors/add.md`     |
| `rayfin connector list` / `remove`           | List connectors; remove the entry **and** its directory.            | `cli/connectors/index.md`   |
| `rayfin connector inspect`                   | Run one read-only sample query against a source.                    | `cli/connectors/inspect.md` |
| `rayfin connector invoke <name> <operation>` | Run one named operation — the loop for Category B.                  | `cli/connectors/invoke.md`  |

Flags, output shapes, and error catalogs live in those docs and in `--help`.
Read one before answering a detailed question; do not guess.

Two behaviors worth knowing before you pick a command:

- `connector inspect` does not support experimental `kusto` — use `rayfin connector invoke <name> executeQuery` instead.
- `connector invoke` on `fabric-semanticmodel` runs under the developer's identity and works without `rayfin up`; every other type, including experimental `kusto`, POSTs to the deployed item and requires a prior `rayfin up`.

## Rules and Anti-Patterns

- The `rayfin.yml` `connectors:` block is an **array** of entries with `name` and `type` fields. Never write the legacy map shape.
- **Never name an entity after a reserved GraphQL type.**
  Entity names become GraphQL type names, so built-in scalars, the operation root types, and any name starting with `__` are rejected at `rayfin up`.
  Matching is case-sensitive and exact — `TaskDate` is fine.
  The authoritative list is the "Reserved entity names" section of `@microsoft/rayfin-core/assets/docs/decorators.md` — read it there, never from memory.
  Rename the entity and keep `Source({ table: '...' })` pointed at the original table.
- `rayfin connector add` discovers schema only when `workspaceId` and `itemId` are literal strings — `${VAR}` placeholders are rejected.
- Default to the **narrowest** operations the user described — do not assume full CRUD for a read-only ask.
- Never hand-edit a file that carries a `// @generated — do not edit.` banner — re-add the connector to regenerate it. This covers the Category B `schema.ts`. The Category A `schema.ts` ships **without** that banner: it is a placeholder you are expected to overwrite with the aggregate schema.
- In a Category A `schema.ts`, import and re-export the generated entity **classes** as values, and list those classes in `connectorConfig.entities` (e.g. `entities: { Order, Customer }`). The client reads each class for the default column selection and relationship cardinality.
- The relationship options `sourceFields` / `targetFields` (on `@one()` / `@many()`) declare a custom foreign key and are **connector entities only** — they are rejected on the data path.
- Connectors do not run under `rayfin dev` — test via `rayfin up` and `rayfin up connector apply` against a deployed environment.
- **Never build UI on an unproven connector.** Run the Workflow step 5 preflight first. Rendering a component against a connector that has never returned a row means the eventual failure looks like a UI bug and is debugged in the wrong place.
- Pass model- or user-authored DAX and KQL to `invoke` with `--file`, and remember it takes a **JSON payload** (`{"query":"…"}`), not a raw `.dax`/`.kql` file — a bare query is `JSON.parse`d and fails before the connector is reached. An inline `--input` goes through a shell that treats quotes and brackets as syntax, so a query containing an apostrophe is silently mangled rather than rejected.
- Do not load both category reference docs, and do not restate a guide's contents instead of reading it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `rayfin up` fails with "does not support operation" | The YAML `operations:` list exceeds the type's allowlist. Check `rayfin connector types --json` and narrow it. |
| `rayfin up` reports "Reserved GraphQL type names detected" | An entity is named after a built-in scalar or root type (for example `Date`). Rename the class and keep `Source({ table: '...' })` on the original table. |
| `connector add` errors with "literal IDs required" | `--workspace-id` or `--item-id` was a `${VAR}` placeholder. Pass literal values. |
| The scaffolded `rayfin/connectors/<name>/` does not compile | Its imports are not installed. Run the pinned `npm install` command `connector add` printed. |
| Type errors between connector and client code | An unversioned install pulled a stale connector, so two `@microsoft/rayfin-data` copies exist. Reinstall pinned. |
| A query chain throws `SELECTION_REQUIRED` | `.where()` / `.orderBy()` / `.first()` never inherit the default selection. Add `.select([...])` to the chain. |
| `findMany` / `findFirst` / `findByKey` throws `SELECTION_REQUIRED` | `connectorConfig.entities` is missing. Add the entity class to it, or pass an explicit selection. |
| Local `rayfin dev` ignores the connector | Expected — connectors are cloud-only. Exercise via `rayfin up`. |
| `FEATURE_NOT_ENABLED` / 404 from `/connector-invoke/<name>` | Not app config — ConnectorFunction invocation is disabled for that Fabric workspace. The message is server-side, so it is not in any local source. Stop and escalate for workspace enablement instead of editing the app. |

Everything else belongs to a guide: entity generation and authorization in `cli/connectors/category-a-entities.md`, connector config fields in `cli/connectors/category-b-function-bridge.md`, and per-command error catalogs in the command docs above.
