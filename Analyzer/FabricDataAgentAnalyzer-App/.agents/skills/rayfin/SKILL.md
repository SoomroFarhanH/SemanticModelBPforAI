---
name: rayfin
description: "Use when doing ANY task involving Rayfin — scaffolding, data models, decorators, auth, deployment, CLI commands, or client setup. Triggers: rayfin, rayfin init, rayfin up, rayfin login, RayfinClient, @entity, @role, @anonymous, @authenticated, @text, @uuid, @int, @decimal, @boolean, @date, @email, @set, @one, @many, DAB, Data API Builder, rayfin.yml, publishableKey, signUp, signIn, signOut, sendMagicLink, handleMagicLinkCallback, ensureSignedInWithFabric, Fabric SSO, Entra ID, rayfin up db apply, rayfin up staticapp deploy, schema.ts, OpaqueSession, onSessionChange, GraphQL select, GraphQL create, GraphQL update, GraphQL delete, findById, executePaginated, RLS policy, row-level security, claims.sub, claims.email, TC39 decorators, config generation, dialect, mssql, postgresql, deep link, deep linking, shareable URL, app state, createFabricAppStateClient, getLaunchStateSync, replaceState, onStateChange, fabricAppState"
metadata:
  author: microsoft
  version: 0.5.0
rayfin-managed: true
---
# Rayfin

## Rayfin Docs — read them from `node_modules` first

Rayfin packages that **declare a `rayfinDocs` field in their `package.json`**
ship their documentation **inside the installed package**. It describes the
exact versions this project has, which this skill cannot — decorators, field
options, client methods, and platform constraints all move between releases.
Read the docs from disk before you write Rayfin code, and before you reach for
a documentation lookup tool.

1. Read `node_modules/@microsoft/<package>/package.json` and check for a
   `rayfinDocs` field. If it is there, take the docs root from `rayfinDocs.dir`
   (today, always `assets/docs`).
2. Read `<docs-root>/index.md` and follow its links.
3. Read the file that answers the question.

| Your question is about… | Read |
| --- | --- |
| Decorators, field options, entity and permission metadata | `@microsoft/rayfin-core/assets/docs/` |
| Client queries, mutations, paging, field nullability | `@microsoft/rayfin-data/assets/docs/` |
| Guides, data modelling, permissions, auth, CLI workflows | `@microsoft/rayfin-guide/assets/docs/` |
| Client composition and configuration | `@microsoft/rayfin-client/assets/docs/` |
| Vite local routing and Rayfin CLI-backed local authentication | `@microsoft/rayfin-local-dev/assets/docs/` |
| Server-side functions (UDFs) — authoring, invoking, connections, CLI | `@microsoft/rayfin-guide/assets/docs/functions/` |
| Deep-link app state — shareable URLs for apps embedded in the Fabric portal | `@microsoft/rayfin-app-state-fabric/assets/docs/` |

Not every installed package carries docs. `@microsoft/rayfin-cli` has no
`rayfinDocs` field — questions about the CLI, its commands, or deployment
workflows are answered by `@microsoft/rayfin-guide`. Do not stop because a
package has no docs root of its own; go to the guide.

**Do not answer a Rayfin question from this skill when a package doc covers it.**
This skill owns workflow, guardrails, and the CLI surface. The packages own their
own behaviour.

Only two things justify a tool call, because a file read cannot do them. Reach
for the CLI first — it is always available in a Rayfin project:

- **Ranked search**, when the index files do not tell you which file to open —
  `rayfin docs search '<topic>'`, or `search_docs(query, module)` via MCP (if
  already installed).
- **Finding a package you do not have** — `rayfin docs discover '<topic>'`, or
  `discover_packages(query)` via MCP (if already installed).

Run either from the project root so the project's own `node_modules` wins. If
`rayfin` is not on `PATH`, use `npx -y @microsoft/rayfin-cli docs ...`.

**Before creating entities or writing queries, read known limitations.** It is
short, and it is where the platform states what it will not do:

```text
node_modules/@microsoft/rayfin-guide/assets/docs/known-limitations.md
```

## Rules

### Platform

- Rayfin uses TC39 Stage 3 decorators — never enable `experimentalDecorators` or `emitDecoratorMetadata`. This is an invariant, not a version detail; tsconfig specifics are in the guide's project-structure doc.
- Prefer `npm create @microsoft/rayfin@latest` for new projects — it generates correct tsconfig and schema boilerplate.

### Security

- **Every entity must carry an explicit permission decorator.** Omitting one silently grants full CRUD to any signed-in user, which is almost never what production data wants. The decorators, the row-level policy DSL, and field visibility options are documented in `rayfin-core/assets/docs/permissions.md` and the guide's `data/permissions.md` — read them rather than recalling them.
- Publishable keys (`pk-*`) are safe for client-side code — never expose service secrets or connection strings.
- Keep `allowedRedirectUris` in `rayfin.yml` tightly scoped to your app's origin.
- Email/password auth is local development only — deployed Fabric apps support Fabric SSO (Entra ID) exclusively.
- Fabric-hosted apps can be embedded, protected standalone, or public standalone. Keep the application auth gate in every posture; public static hosting does not make backend APIs or data anonymous.
- Vite local development may establish a Rayfin session through `@microsoft/rayfin-local-dev`, which reuses `rayfin login`, the configured tenant, and the CLI token cache. Do not add Azure CLI auth or another MSAL cache.
- Keep local auto-login behind a DEV-only dynamic import, and keep `services.auth.fabric.externalEntraExchange: true` enabled when that flow is used.
- Local auto-login does not exercise the deployed public signed-out screen. Validate public signed-out, protected/restored, embedded, and local failure/recovery paths separately.

### Project Layout

- Entities live in `rayfin/data/`, one file per entity, and every one is registered in `rayfin/data/schema.ts`. An entity that is not registered does not exist as far as the client is concerned.
- Configuration lives in `rayfin/rayfin.yml`. Enabling the data service requires a dialect.
- **The decorator surface, field options, relationships, and the client query API are package-owned.** Read `rayfin-core/assets/docs/decorators.md`, the guide's `data/overview.md`, and `data/graphql.md`. Do not write entities or queries from memory — the option names and constraints have changed between releases, and the doc in `node_modules` is the version this project has.

### Schema

- **For Fabric:** `rayfin up` is the canonical command for "deploy this change," "apply this schema change," or "push my entity update" — it deploys the app and applies pending schema migrations in a single step. Recommend it on every deploy, including incremental schema changes after the initial deploy.
- `rayfin up db apply` is a narrow advanced subcommand that applies schema-only without touching the static build — only recommend it when the user explicitly asks to skip the static deploy step.
- `--force` permits destructive changes (drop table, drop column, alter type) — never use without review.
- `--gen-config-only` generates the underlying API config without applying — use to inspect before applying.
- **Never name an entity after a reserved GraphQL type.**
  Entity names become GraphQL type names, so built-in scalars, the operation root types, and any name starting with `__` are rejected before the schema is applied — on `rayfin/data/` entities as well as connector entities.
  Matching is case-sensitive and exact — `TaskDate` is fine.
  The authoritative list is the "Reserved entity names" section of `@microsoft/rayfin-core/assets/docs/decorators.md` — read it there, never from memory.
  Read it there, never from memory, then rename the class or pass an explicit name to `@entity('...')`.

### Deployment

- When the user asks to "build and deploy," "make it live," or "deploy this change" (including schema-only changes like adding a column), execute the full workflow — do not present steps as instructions for the user to run manually.
- Workflow: `rayfin login` → `rayfin up` → `rayfin up status`. `rayfin up` builds the static app, deploys it, and applies any pending schema migrations.
- `rayfin up status` checks endpoint health — run after deployment to verify.
- Deployment metadata is written to `rayfin/.deployments.json` (per-workspace record: `fabricItemId`, `hostingUrl`, `publishableKey`, etc.). The deploy also appends the live hosting URL to `allowedRedirectUris` in `rayfin.yml`.

### Deep Linking

- Shareable, bookmarkable URLs for an app embedded in the Fabric portal come from `@microsoft/rayfin-app-state-fabric`. It is opt-in — installing it is not enough, the app must read launch state and write state back. Read the package docs before wiring it: the reader choice, `setState` vs `replaceState`, the size limit, and `targetOrigin` are all package-owned.
- **Leave `targetOrigin` unset.** The parent frame is a Fabric extension host on a different origin from the portal address bar, and it varies per environment. Pinning the portal origin makes the browser discard every message, and the failure is silent — `isSupported()` resolves `undefined` and writes become no-ops.
- **Restore before you sync.** When mirroring app state into a router, the launch-state restore and the location-sync must not race. Both mount effects run in the same commit: the restore effect schedules a navigation to the launch route, and a sync effect reading `location` on that same pass still sees the *pre-restore* route and writes it back — destroying the state the app was launched with. Hold the sync until the restore navigation has landed. The symptom is that a shared link opens on the right page and then immediately jumps to the default one.
- **Restore exactly once.** Outside a data router `useNavigate()` returns a new function identity on every navigation, so an effect listing it as a dependency replays the restore forever: every click is dragged back to the launch route, and the pending-restore guard suppresses the write. The symptom is that navigation looks completely dead and the URL never updates. Hold `navigate` in a ref and give the restore effect an empty dependency list.
- Deep linking is host-gated. Where the host does not support it, or its feature switch is off, the client reports `UNSUPPORTED_HOST_CAPABILITY` — degrade quietly and keep the app working. That is expected, not a bug.
- State rides in the URL, so keep it small — a route and a few identifiers, never a data cache. Oversized writes are rejected rather than producing a broken link.

## Anti-Patterns

- **Never answer a Rayfin API question from memory or from this skill.** Read the installed package's docs. A remembered decorator option or client method is a guess about a version you did not check.
- Never use raw `fetch()` or hand-built GraphQL for data operations — always use the typed client, which provides type-safe queries and automatic auth.
- Never leave an entity without an explicit permission decorator. Forgetting silently applies full CRUD for any signed-in user.
- Never design entities before reading the guide's `known-limitations.md`. Text length caps, supported scalar types, relationship rules, and MSSQL-specific constraints all shape entity design, and all of them change independently of this skill.
- Never enable `experimentalDecorators` or `emitDecoratorMetadata` to make a decorator error go away — it breaks Rayfin's metadata entirely.
- Never write the router's current location into deep-link app state on mount without first confirming a launch-state restore is not still in flight — it silently overwrites the state the app was opened with, and the app snaps back to its default page.

## CLI Quick Reference

```bash
# Scaffold
npm create @microsoft/rayfin@latest <name>   # Create from template
npx rayfin init [directory]                   # Interactive setup

# Deploy to Fabric (default workflow)
npx rayfin login                              # Sign in with Entra ID
npx rayfin up                                 # Deploy app + apply schema (canonical)
npx rayfin up status                          # Check deployment health
npx rayfin up db apply                        # Schema-only, skip static deploy (advanced)
npx rayfin up staticapp deploy                # Redeploy static content

# Server-side functions (UDFs)
npx rayfin functions init                     # Scaffold rayfin/functions/, enable the service, generate types
npx rayfin dev functions apply                # Run the local function host + typegen watcher
npx rayfin up functions deploy                # Deploy functions to Fabric
npx rayfin secret set <NAME>                  # Store a secret for functions

# Connectors (Fabric data sources)
npx rayfin connector search [query]           # Discover addable Fabric sources
npx rayfin connector add --type <type> --workspace-id <ws> --item-id <item>
npx rayfin connector inspect                  # Sample/list source entities or run a read-only query
npx rayfin connector invoke <name> <op>       # Run a named connector operation
npx rayfin up connector apply                 # Re-apply connector DAB config only
```
