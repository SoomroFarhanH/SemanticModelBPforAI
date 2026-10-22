---
name: functions-capability
description: >
  Apply and build the Universal App functions capability.
  Use for trusted server-side logic, secrets, external APIs, custom model
  endpoints, published Fabric data agents, webhooks, or privileged operations.
---

# Rayfin functions

Use functions when code must be trusted, needs a secret, or must call a service
without exposing credentials or access tokens to the browser.

## Apply the capability first

Run this before customizing the app:

```sh
npm run pack:add -- functions
```

The pack enables `services.functions`, creates the `@rayfin-app/functions`
workspace package under `packages/functions`, installs all workspace
dependencies from the root, builds functions before the frontend, and wires
`AppFunctionsSchema` into the existing client.
The existing Vite adapter forwards the client's default
`/functions/<name>/invoke` route to the local Functions host selected by
`rayfin dev`; do not add a direct `functionsBaseUrl` override.

Do not copy these files by hand.
Reapplying the pack preserves authored functions and generated types unless
`--force-seeds` is explicitly used.

## Install guidance and use the workspace-aware development session

Install or refresh the version-matched functions agent context separately:

```sh
npx rayfin init ai-files install --enable skill:rayfin-functions --non-interactive
```

The active session does not refresh its skill registry after installation, so
do not call the skill tool for `rayfin-functions` in the same turn.
Read `.agents/skills/rayfin-functions/SKILL.md` directly from disk, then read
the package documentation under `node_modules/@microsoft/` before writing
Rayfin APIs.
Do not stop or restart.

For Functions authentication, read the **Application authentication** section in the installed `@microsoft/rayfin-guide` documentation at `functions/index.md`.

**Do not run `npx rayfin functions init` in this workspace template.**
The current command writes, installs, builds, and generates types under the
legacy `rayfin/functions` location instead of the configured
`services.functions.path` at `packages/functions`.
That would create a second functions project and leave the workspace package's
generated types stale.

Use the documented root `npm run dev` session for type generation and local
function development.
It resolves `services.functions.path`, performs the initial generation in
`packages/functions`, and watches registered function signature edits.
Before starting a Fabric-backed development session that may provision or reuse
a backend, read the installed local-development guide and obtain the user's
approval for the target workspace.
Satisfy its documented Node.js and Azure Functions Core Tools prerequisites.

Do not deploy only to obtain generated types.
If the approved development session cannot start, report the prerequisite or
target blocker and leave generated files unchanged.
There is no standalone public type-generation command to substitute.

## Authoring sequence

1. Apply the functions pack.
2. Install the version-matched agent context with
   `npx rayfin init ai-files install --enable skill:rayfin-functions --non-interactive`.
3. Read the installed skill directly from disk and read the package docs
   relevant to the function.
4. With the target approved and local prerequisites available, run
   `npm run dev` from the workspace root and wait for its initial
   type-generation pass.
5. Replace the starter registration in
   `packages/functions/src/function_app.ts`.
6. Keep explicit input and output types on every registered function, and keep
   the development session running while registered signatures change.
   Wait for the watcher to refresh the generated schema after each signature
   edit.
7. Never edit `packages/functions/src/types.ts` by hand.
   Never cast `client.functions`, the Rayfin client, or a handwritten invoker
   to bypass a function missing from `AppFunctionsSchema`.
   A green TypeScript build after `as any` or `as unknown as` is not a valid
   generated contract.
8. Run `npm run validate:functions` and confirm every authored `udf.func()`
   registration is present in `AppFunctionsSchema` with no Functions-client
   casts.
9. After generated types are current, run the root `npm run typecheck` and
   `npm run build` gates.
10. Invoke the function through the typed client from the frontend.
11. Preserve loading, empty, success, expected-failure, and unexpected-failure
    states.
12. Run the normal app validation and deployment workflow.

## Security boundary

- Keep secrets and access tokens inside the function.
- Never put secrets in chat, source, YAML values, frontend environment
  variables, command arguments, logs, or function output.
- Never log prompts, user content, authorization headers, access tokens, raw
  provider bodies, or sensitive exception details.
- Bound user input, outbound request duration, provider output, and the value
  returned to the browser.
- Return typed safe results for expected configuration, authentication,
  provider, and timeout outcomes.
- Surface unexpected failures without returning credentials or provider
  internals.

For a secret-backed service, continue with `external-api-workflows`.
For Fabric data-agent access, continue with `fabric-data-agent`.

## What the pack validates

The template tests prove that applying the pack:

- Enables the functions service and its build command.
- Creates `packages/functions` as `@rayfin-app/functions`.
- Wires the generated schema into the frontend client while preserving the
  Vite same-origin Functions route.
- Fails validation when authored function registrations and
  `AppFunctionsSchema` differ.
- Rejects frontend casts around the Functions client that hide a stale
  generated contract.
- Builds functions before the frontend in the root build scripts.
- Preserves authored functions and generated files when reapplied.
- Leaves existing authentication, data, and analytics pack behavior intact.

The pack does not prove that a deployment has its required secret values,
resource permissions, or downstream endpoint access.
Those checks require a deployed scenario.
The template and CLI checks cover missing functions packages, type generation,
generated-contract freshness, unsafe Functions-client casts, and workspace
build failures separately.
