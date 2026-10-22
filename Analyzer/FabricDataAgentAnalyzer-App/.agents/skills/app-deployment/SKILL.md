---
name: app-deployment
description: >
  Validate and remotely deploy a Universal App through the installed,
  version-matched Rayfin CLI. Use before deploying to run local checks, confirm
  the target workspace, preview the operation, deploy, and validate the live
  app. This skill orchestrates existing executables; it does not implement
  deployment.
---

# App Deployment

This skill orchestrates the installed Rayfin CLI lifecycle. It does not
recreate the validation or deployment implementation.

## Before a remote write

1. Apply every capability pack the app needs.
2. Read `app-validation` and complete its static gates: typecheck, build, lint,
   tests, and pack-provided validators.
   Run pre-deploy browser or persistence checks only when the installed guide
   and current environment already support a local or deployed runtime.
3. Obtain the user's confirmation for the target Fabric workspace and remote
   deployment. Do not select or create a workspace the user did not approve.

## Rayfin CLI deployment

1. Read the installed package metadata for `@microsoft/rayfin-guide`, then read
   its version-matched deployment guide. The current guide location is
   `node_modules/@microsoft/rayfin-guide/assets/docs/app-backend/deploy.md`; if
   package metadata points elsewhere, follow that installed location.
2. Follow that guide's authentication and deployment workflow. For the current
   version, preview the remote operation with `npx rayfin up -n`, verify the
   confirmed target, and then run `npx rayfin up --json`.
   JSON mode is non-interactive.
   On a first deployment with no recorded target, pass the confirmed target
   explicitly with `--workspace-id <id>`, `--workspace <name>`, or
   `--workspace-uri <uri>`.
3. Read the machine-readable deployment result before continuing.
   Overall `status: "success"` is not enough for a source-backed request.
   Inspect `generate` status first.
   For every connector declared in `rayfin.yml`, require one matching
   `generate[]` result.
   A missing result or a result with `status: "error"` is blocking.
   Only when a result has `status: "skipped"` should you inspect its
   `skipReason`.
   Every connector required by the requested deployed experience must complete
   the generation/apply path its installed type contract requires.
   A Category B `non-graphql-connector` skip is acceptable only when the
   installed type contract documents that path and the connector's deployed
   behavior was validated separately.
   Any other skip for a required connector is blocking.
   `skippedConnectors` summarizes skipped results only; it excludes errors and
   cannot reveal a missing `generate[]` result.
   Do not use `skippedConnectors` or warning wording to decide whether a
   connector succeeded.
   If a required connector is missing, errors, or has a blocking skip, report
   the blocker and stop.
   Do not continue to browser validation or claim the source-backed request
   succeeded.
4. Do not claim the CLI has validation guarantees that its installed guide does
   not document.
5. Use the direct static-hosting link emitted by the CLI for standalone browser validation.
   Use the actual Fabric or external host when validating embedded capabilities.
6. Determine `services.staticHosting.assetAccess` before choosing the browser
   checks. Local `autoLogin` does not prove the deployed public signed-out
   experience.

Do not publish automatically.
Do not add `--force` unless the user explicitly requests it and the installed
guide documents the consequence for the exact operation.

Never put access tokens, credentials, or secret values in command arguments,
chat, source, or logs. Use interactive authentication and masked secret prompts
when the installed guide requires them.

## Prove the deployed result

After deployment succeeds, read `app-validation` and validate the deployed app
at its direct hosting URL, confirming that signed-out users must authenticate before app content renders.
Run the browser checks and, for app-owned records, the persistence create,
reload, update, and delete checks against the deployed result.
For public hosting, also open the standalone hosting URL in a clean browser
session and verify signed-out then signed-in behavior. For protected hosting,
verify session restoration and stale-session replacement. For embedded apps,
validate through the actual Fabric or external host.
Do not report deployment complete from a build, dry run, hosting URL, or CLI
success alone.
Report the Fabric app link only after the deployed runtime checks pass, unless
the user explicitly defers runtime validation.
