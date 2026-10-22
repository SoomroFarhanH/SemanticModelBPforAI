---
name: rayfin-functions
description: "Use when writing Rayfin user-defined functions (UDFs), invoking functions from frontend code, or using functions CLI commands. Triggers: rayfin functions, udf.func, UserDataFunctions, RayfinContext, FabricContext, AppFunctionsSchema, functions init, dev functions apply, client.functions, invoke, func start, function_app.ts, types.ts, rayfin/functions/, FunctionClient, FunctionsSchema, fabric-user-data-functions, functionsBaseUrl, rayfinLocalDev, resolveRayfinFunctionsBaseUrl, VITE_RAYFIN_FUNCTIONS_URL"
metadata:
  author: microsoft
  version: 0.2.0
rayfin-managed: true
---
# Rayfin Functions

Server-side user-defined functions (UDFs) that run in the Fabric runtime and are invocable from your frontend via `RayfinClient`. Write trusted backend logic once; get a type-safe client call on the frontend.

The full reference lives in the Rayfin guide. **Read the doc for the task you're doing before writing code** — don't guess API shapes, endpoints, or CLI flags. Read a doc off disk from `node_modules/@microsoft/rayfin-guide/assets/docs/<path>`, or fetch it with `rayfin docs get --module guide --path '<path>'` — or `get_doc` with `module: "guide"` via MCP.

## Where to read

| Task | Doc path |
| --- | --- |
| Overview, auth configuration and identities, project structure, first function | `functions/index.md` |
| `udf.func()` API, `RayfinContext`, data access, importing entities | `functions/writing-functions.md` |
| How `types.ts` is generated and kept in sync | `functions/typegen.md` |
| Reading secrets inside a function | `functions/secrets.md` |
| Calling functions from the frontend (`client.functions.*.invoke`) | `functions/invoking-from-frontend.md` |
| Connecting to external resources — audiences, recipe chooser, per-resource walkthroughs | `functions/connections/index.md` |
| CLI: scaffold, local host, deploy | `cli/functions/index.md`, `init.md`, `dev-apply.md`, `deploy.md` |

## Connections and secrets

**Read `functions/connections/index.md` before writing any connection code, and `functions/secrets.md` before reading a secret.** Both are the source of truth; the summary below exists only so you know what to look for.

Enabled Functions require `services.functions.auth.type: application`.
Read **Application authentication** in `functions/index.md` for the configuration, identity model, and deployment requirements.

- Generic connections are declared **on the context annotation** — `RayfinContext<AppSchema, AudienceType.Sql | AudienceType.Storage>` — and read as `ctx.Tokens.Sql`.
  The annotation is what registers the binding, so the third argument of `udf.func()` stays `[]`.
- Supported audiences are `Sql`, `Storage`, `Fabric`, `AzureAI`, and `ADO`.
- `ctx.Tokens.*` uses the app identity for external resources; `ctx.getDataClient()` uses the caller's Rayfin token for Rayfin DB access.
  Keep tokens server-side.
- Audiences are resolved by the TypeScript compiler at deploy time, so a type alias works — but prefer literal `AudienceType.Sql`, and keep a `tsconfig.json` in the functions project. Without one the CLI reads the annotation syntactically, cannot resolve aliases, and warns.
- Secrets are declared with `rayfin secret set`, recorded in `rayfin.yml`, and read as `ctx.Secrets.STRIPE_API_KEY`. The CLI generates `rayfin/functions/src/secrets.generated.ts`; **never hand-edit it and never hard-code a secret name**.
- `ctx.getToken()` and `ctx.getSecret()` are **deprecated** and flagged by `@typescript-eslint/no-deprecated`. Use `ctx.Tokens` and `ctx.Secrets`.

### Get the Fabric info for the user

Connection code needs real endpoints — the SQL server or the OneLake path.
**Resolve these yourself; don't ask the user to paste connection strings.**
When the user names a Fabric item ("connect to lakehouseA in workspaceB"), turn the workspace + item display names into coordinates:

- If a **Fabric CLI** (e.g. `fab`) or **Fabric MCP** is already available in the workspace, prefer it — it wraps the same endpoints.
- Otherwise call the **Fabric REST API** directly: base `https://api.fabric.microsoft.com/v1`, token from `az account get-access-token --resource https://api.fabric.microsoft.com`.

Only fall back to asking the user when the name matches multiple items, the lookup returns 403 (no access), or you can't determine the workspace. The full lookup workflow is in `functions/connections/get-fabric-info.md`.

## Local functions routing

Read `functions/invoking-from-frontend.md` before changing frontend routing.
Bundled Vite templates already use `rayfinLocalDev()` from
`@microsoft/rayfin-local-dev`. Leave `functionsBaseUrl` undefined so the SDK
uses `/functions/<name>/invoke`; the adapter forwards that same-origin route to
the local Functions host selected by `rayfin dev`.
For custom or older Vite projects, add the adapter as documented. Use
`resolveRayfinFunctionsBaseUrl()` only when existing code must explicitly
provide a Functions base URL.
For other frameworks, pass the framework-mapped Functions URL only during development.

## Guardrails

- Import `RayfinContext` from `@microsoft/fabric-user-data-functions` — **not** from `@microsoft/rayfin-functions`.
- Register every function with `udf.func(name, handler, [])` — don't export bare functions.
- Use `import type` for data-entity imports — a runtime import pulls the decorator runtime into the functions bundle.
- Never hand-edit `rayfin/functions/src/types.ts` — typegen regenerates it and will overwrite your edits.
- Never expose a local Functions URL in production; leave `functionsBaseUrl` undefined so `invoke()` targets the deployed backend.
- Install resource SDK packages in `rayfin/functions/package.json`, not the project root.
- Prefer secrets via `rayfin secret set <NAME>` read through `ctx.Secrets`; use `process.env` only for local debugging.
