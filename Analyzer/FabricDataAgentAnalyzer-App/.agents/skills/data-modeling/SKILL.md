---
name: data-modeling
description: >
  Use when the app needs to store or read data — records, a database, entities,
  CRUD, lists, "save/remember X", or per-user data with row-level security. This
  app's data layer is Rayfin's: you declare entities as TypeScript classes with
  decorators in packages/data/src/, register them in the schema, and read/write them
  through the typed rayfin-client. Covers: defining an @entity, field decorators,
  registering it, per-entity access with @role, owner-only row-level security,
  and the client query/mutation API. Triggers: data, database, model, entity,
  schema, table, record, CRUD, create, read, update, delete, list, store, save,
  persist, per-user, row-level security, RLS, access control, ownership.
---

# Data modeling — entities, schema, and row-level security

This app persists data with **Rayfin data**. You define entities as decorated
TypeScript classes under `packages/data/src/`, register them in
`packages/data/src/index.ts`, define their isomorphic contracts in
`packages/shared/src/index.ts`, and read/write them with the typed client from
`packages/frontend/src/lib/rayfin-client.ts` (`await getRayfinClient()`).

## Read the docs first — they ship in the packages

**Rayfin's data rules are owned by the installed packages, not by this skill.**
Decorators, field options, relationships, permissions, the query API and the
platform's constraints all move between releases. Read them from disk:

| You need… | Read |
|---|---|
| `@entity`, every field decorator, and their options | `node_modules/@microsoft/rayfin-core/assets/docs/decorators.md` |
| Permissions end to end — `@role`, the policy DSL, claims, `include` / `exclude` | `node_modules/@microsoft/rayfin-guide/assets/docs/data/permissions.md` |
| The `@anonymous` / `@authenticated` shorthands | `node_modules/@microsoft/rayfin-core/assets/docs/permissions.md` |
| Entity authoring end to end, relationships, schema registration | `node_modules/@microsoft/rayfin-guide/assets/docs/data/overview.md` |
| Reading and writing with the client | `node_modules/@microsoft/rayfin-guide/assets/docs/data/graphql.md` |
| Paging, cursors, text-field nullability | `node_modules/@microsoft/rayfin-data/assets/docs/index.md` |
| **Constraints that will bite you** — text length, FK naming, many-to-many, dialect | `node_modules/@microsoft/rayfin-guide/assets/docs/known-limitations.md` |

Read `known-limitations.md` **before** you design entities. It is short, and it
is where the platform tells you what it will not do.

Everything below is about **this template** — what it turns on, where files go,
and how its build is wired. For anything about Rayfin itself, use the table.

## Step 1 — turn the data service on

The base template keeps the `data` service off, because a dashboard over a
semantic model does not need a database. Turn it on for an app that needs
persistence:

```sh
npm run pack:add -- data-modeling
```

That flips `data.enabled` in `rayfin/rayfin.yml` and plants a starter entity in
`packages/data/src/Item.ts`, registered in `packages/data/src/index.ts`, with its
isomorphic contract in `packages/shared/src/index.ts`.
Re-applying is safe: it keeps files you have edited, and `--force-seeds` is the
explicit way back to the pack's version.

The template authenticates before rendering app content through its dynamic auth provider and gate.
Keep that boundary intact and follow the installed `rayfin-guide/assets/docs/auth/` pages for additional service-specific requirements.
Preserve server-side entity permissions and row-level security.
Do not replace an authentication failure with anonymous access or block the entire app because it is outside the Fabric portal.

## Step 2 — write entity files

One file per entity under `packages/data/src/`, for example
`packages/data/src/Note.ts`.
Start from the seeded `Item.ts` — rename it and change the fields.
Editing a working entity is more reliable than writing one from nothing.
When the real model replaces the example, remove the unused starter `Item`
runtime entity, its `packages/data/src/index.ts` registration, and its
`packages/shared/src/index.ts` contract so it does not become user-visible.
`@microsoft/rayfin-core`, `@microsoft/rayfin-data` and `@microsoft/rayfin-client`
are already pinned in the base app — nothing to install.

For the decorator set, field options, relationship syntax, FK naming and the
many-to-many rule, read `rayfin-core/assets/docs/decorators.md` and
`rayfin-guide/assets/docs/data/overview.md`, then `known-limitations.md`.

## Step 3 — register entities in this template's schema

`packages/data/src/index.ts` starts with the seeded `Item` registration, while
`packages/shared/src/index.ts` owns its isomorphic record contract and schema
type map.
Add every entity, including join entities, to both packages:

```ts
// packages/shared/src/index.ts
export interface NoteRecord {
  id: number;
  title: string;
}

export type UniversalAppSchema = {
  Note: NoteRecord;
};

// packages/data/src/index.ts
import { Note } from './Note.js';

export const schema = [Note];
```

> The client's generic type comes from `UniversalAppSchema` (already referenced by
> `packages/frontend/src/lib/rayfin-client.ts`), so add every entity to both the
> `schema` array: one registered in the array but missing from the type is
> reachable at runtime and invisible to the compiler.
>
> **Type-check with `tsc -b`, never `tsc --noEmit`.** The workspace packages are
> referenced TypeScript projects, and the frontend client imports the shared
> schema type, so
> a bare `tsc --noEmit` fails with `TS6305` until the referenced project has been
> built. Run `npm run typecheck` for the real referenced-project check.
> `npm run build` uses `tsc -b --noCheck` for speed and does not prove the
> entity types are correct.

## Step 4 — read and write

The query chain, mutations, `findById`, filtering and paging are documented in
`rayfin-guide/assets/docs/data/graphql.md` and
`rayfin-data/assets/docs/index.md`. Use `await getRayfinClient()` from
`packages/frontend/src/lib/rayfin-client.ts` inside an async query or mutation; that helper is this template's;
the API it returns
is the package's.

For the interface over your entities — optimistic updates, forms, and the
loading / empty / error states — read **`crud-ui`**, which ships the kit.

## Step 5 — per-user data

"Each person sees only their own …" is a **server-side** `@role` policy, never a
filter in the UI. A client-side filter still leaves the rows fetchable.

Read `rayfin-guide/assets/docs/data/permissions.md` for the decorator, the typed
policy DSL, the supported claims, logical composition, and field visibility — it
is the fullest treatment. `rayfin-core/assets/docs/permissions.md` adds the
`@anonymous` / `@authenticated` shorthands, owner-field typing, and owner
stamping.
Keep authentication and authorization on the data operations that require them.

## Notes

- **Stable features only.** Use `@authenticated` / `@role('authenticated', …)`.
  Anonymous data access on Fabric requires a tenant admin switch — see
  `rayfin-guide/assets/docs/data/overview.md`. If asked for public data, say so
  and use authenticated access.
- **Deploying ships the data model.** A schema change migrates on the next
  deploy.
  Read `app-deployment` and follow the installed, version-matched CLI guide.

<!--
MAINTAINERS: this skill owns *this template* — the data service toggle, the
workspace schema shape, the tsc -b build note, and the auth pairing. It does not own
Rayfin.

Rayfin's own rules are read at runtime from the installed packages' docs
(`rayfinDocs.dir`, today `assets/docs`), so they cannot drift from the version a
generated app actually has. That replaces the previous arrangement, where this
file hand-mirrored rules from the CLI's bundled `skill:rayfin` and had to be
diffed against it on every CLI bump. Drift under that arrangement had already
shipped once: bare `@text()` appeared in every example here while the
authoritative rule required an explicit `max` on MSSQL.
-->
