# Pack manifest reference

A **capability pack** turns one Rayfin capability on with a single command:

```sh
npm run pack:add -- <pack>
```

The engine is [`scaffold.mjs`](./scaffold.mjs). It reads
`.agents/skills/<pack>/pack.json` and, in one idempotent pass, patches service
flags, merges dependencies and scripts, copies kit files, and installs.

## Fields

| Field                              | Purpose                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `name`                             | The pack's name. Matches its folder.                                                  |
| `description`                      | One line, printed when the pack runs.                                                 |
| `rayfin.services.<name>.enabled`   | Sets that flag in `rayfin/rayfin.yml`.                                                |
| `packageJson`                      | Workspace member manifest that owns pack dependencies; defaults to the root.          |
| `dependencies` / `devDependencies` | Merged into the owning `packageJson`.                                                 |
| `scripts`                          | Merged into the root `package.json`.                                                  |
| `copy`                             | Files to bring in from the pack's `kit/`.                                             |
| `copy[].initializationOnly`        | Creates a file only when missing; re-applications never report or overwrite it.       |
| `installDirectories`               | Legacy isolated directories that need their own install; workspace members omit this. |
| `next`                             | Skills to print at the end. No side effects.                                          |

Every field is optional.
A pack can add dependencies and initialization-only seed files without changing
any service flag — see `connectors`, whose source declarations remain owned by
`rayfin connector add`.

## `rayfin.services`

Writes keys under `services.<name>` in `rayfin/rayfin.yml`, creating the service
block when it is absent and a `services:` block when that is absent too:

```json
"rayfin": { "services": { "data": { "enabled": true, "dialect": "mssql" } } }
```

Any scalar key is allowed, not just `enabled`, because enabling a service is not
always enough to deploy it. The host rejects a data service turned on without a
`dialect`, while the template contract test rejects a `dialect` on a service left
off — only a pack can satisfy both.

The only supported non-scalar property is the Functions application-auth mapping:

```json
"rayfin": { "services": { "functions": { "enabled": true, "auth": { "type": "application" } } } }
```

The Functions pack writes `services.functions.auth.type: application` when auth is absent.
An explicitly supplied auth value must use `application`, even if Functions were disabled before applying the pack.
Null, empty, malformed, or unsupported auth fails without changing configuration, manifests, or source files.
Reapplication preserves valid authored auth, including comments and literal block or single-line flow mappings.
`--force-seeds` does not replace or migrate auth.
Other service scalars retain their existing preservation and force behavior.

The writer uses Node built-ins only, so it works before dependencies are installed.
Use unindented plain top-level keys and plain, two-space-indented `services` and `functions` blocks with unique keys.
Auth must contain only one literal `type: application`, unquoted or normally single- or double-quoted.
Its key may also be quoted; a single-line flow mapping such as `auth: { type: application }` is preserved.
Ambiguous shapes, including duplicate auth/type keys, merges, aliases, anchors, tags, multiline flow mappings, and other indentation, are refused rather than rewritten.
Rewrite those shapes explicitly before retrying.

The writer cannot create the top-level `connectors:` list; that is written by `rayfin connector add`.

## Dependency versions

Pin a version literally, or track a package the app already has:

```json
"@microsoft/rayfin-connectors": "match:@microsoft/rayfin-core"
```

`match:<pkg>` resolves to the single version the root or a declared workspace
member pins for `<pkg>`.
Use it for sibling Rayfin packages.
They ship as one version line, so a literal pin is correct the day it is written
and silently skewed one release later — which surfaces as confusing cross-package
type errors rather than an install failure.

Applying a pack fails rather than guessing if `<pkg>` is missing or has
conflicting declarations across the workspace.

## `copy`

```json
{ "from": "kit/data/Item.ts", "to": "packages/data/src/Item.ts" }
```

`from` is relative to `.agents/skills/<pack>/`. `to` is relative to the project
root. A directory copies recursively.

**An existing file is never overwritten.** Re-applying a pack keeps your edits
and prints what it preserved.

Use `initializationOnly: true` when the pack creates a starting file that
another tool owns afterward. Once present, that file is silently left alone,
including when `--force-seeds` is used.

When two packs contribute to the same seed, select a composed source after the
other pack has already been applied:

```json
{
  "from": "kit/client.ts",
  "fromVariants": [
    { "whenPacks": ["other-pack"], "from": "kit/client.with-other-pack.ts" }
  ],
  "to": "packages/frontend/src/lib/client.ts"
}
```

Variants are checked in declaration order, and every name in `whenPacks` must
already be recorded in `package.json` under `rayfinPacks`.
Include the other pack's seed digest in `seedReplaceIfPristine` so the composed
source may safely replace it without overwriting user changes.

### Seeds

A file the template already ships needs a rule for the one case where replacing
it is correct — the untouched starter:

```json
{
  "from": "kit/data/schema.ts",
  "to": "packages/data/src/index.ts",
  "seedReplaceIfPristine": ["<sha256 of the untouched base file>"]
}
```

The digest is taken with the BOM stripped and line endings normalised, so it
survives a checkout on any platform. If the destination matches a listed digest
it is still the starter and is replaced; anything else is your work and is kept.
`--force-seeds` overrides.

Get a digest with:

```sh
node -e "const{createHash}=require('crypto');const t=require('fs').readFileSync(process.argv[1],'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');console.log(createHash('sha256').update(t).digest('hex'))" <file>
```

## Idempotency

A marker at `node_modules/.rayfin-packs/<pack>.json` records the pack ran, written
only after every required install exits zero.
The marker is cleared before attempting an install and is not restored on failure, so the next run retries rather than declaring a broken tree finished.

Packs also record themselves in `package.json` under `rayfinPacks`, which is what
distinguishes "this file is the untouched starter" from "this file is your work".

## Failure recovery

If applying a pack fails, the runner rolls back its own file writes and deletions.
This includes root and workspace manifests, `rayfinPacks` and `rayfinScriptBases` metadata, service configuration, copied files, replaced seeds, and cleared build stamps.
Existing files are restored with their original bytes, file modes, and access and modification timestamps.
Only directories created by that invocation are removed, and only when empty.
Previously applied packs and preserved authored files are not removed.

Rollback checks each file's current content, identity, permissions, and modification time before restoring it.
Files changed by another writer and paths redirected through symbolic links are kept and reported, not overwritten.
Reconcile any reported conflicts before retrying.
Run pack commands, dependency installers, and builds serially; this is failure recovery within a running process, not crash recovery or a concurrent-writer transaction.

`node_modules`, npm caches, and installer-written lockfiles are outside the file journal.
They are not deleted or restored, and a failed install may have partially changed the dependency tree.
After resolving the install error and any rollback conflicts, retry the pack to apply it again.
To recover dependencies for the restored manifests instead, run `npm install --ignore-scripts --no-audit --no-fund` from the app root.
If a legacy `installDirectories` directory remains after rollback, reconcile dependencies with its retained manifest there as well.
Run the app's typecheck, build, and other applicable checks before continuing; restoring source files does not prove the installed dependency tree is healthy.

`--dry-run` writes nothing and does not install.
`--no-install` intentionally keeps a successful pack application without fetching its dependencies; a later normal invocation still installs them.

## Build stamps

Each workspace member is a referenced TypeScript project.
A pack that copies sources into a member clears that package's `.tsbuildinfo`,
because a stale stamp makes the next `tsc -b` fail with `TS6305` naming a
generated file nobody touched.

## Flags

| Flag            | Effect                                    |
| --------------- | ----------------------------------------- |
| `--dry-run`     | Print the plan; write nothing.            |
| `--no-install`  | Do everything except `npm install`.       |
| `--force-seeds` | Overwrite seed files you have customised. |

## Checklist for a new pack

1. Create `.agents/skills/<pack>/` with a `SKILL.md` **and** a `pack.json`. Every
   skill folder must carry a `SKILL.md`; a test enumerates them.
2. Register the pack in a local pack-composition scenario in
   [`e2e-pack-coverage.json`](./e2e-pack-coverage.json).
   The template guard fails when a `pack.json` has no registered composition
   coverage.
3. Do not restate what a package or the CLI already documents — point at it. A
   copy in the template freezes at scaffold time and drifts.
4. Register the pack's files in the CLI e2e template tree test, which snapshots
   every file the template ships.
5. Add a row to `capability-router`, and mirror it into `AGENTS.md`.
6. Add an integration test in
   [`scaffold.integration.test.mjs`](./scaffold.integration.test.mjs) covering a
   fresh apply and a re-apply over an edited file.
