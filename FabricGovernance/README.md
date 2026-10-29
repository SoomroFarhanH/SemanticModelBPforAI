# Fabric Governance Health - Rayfin App

A protected Microsoft Fabric app for explaining governance health, protection, and trust to clients and platform teams.

> **The bundled data is entirely synthetic.** No tenant was scanned to create this sample. Its names, contacts, IDs, counts, dates, source ledger, and findings are fictional. It is a static snapshot demonstration, not live monitoring or a compliance attestation.

## What you get

- Four scoped KPIs: suspended-capacity placement, single-admin workspaces, missing sensitivity labels, and failed last-recorded refreshes.
- Capacity placement, domain accountability, and a dependency-ordered action plan.
- Interactive label chart and coverage indicators for domains, descriptions, tags, and endorsements.
- Seventeen illustrative findings, searchable and filterable by pillar and priority.
- Searchable/filterable workspace grid and owner drill-down. Synthetic IDs deliberately have no real Fabric portal links.
- Failed-refresh evidence, source/pagination ledger, explicit exclusions, and unassessed areas.
- JSON and filtered, formula-safe CSV downloads; light/dark themes and responsive layout.
- Microsoft sign-in and protected static hosting. Database, storage, functions, and password authentication are disabled.

| Synthetic demo metric | Value |
|---|---:|
| Active standard workspaces / inventory items | 8 / 24 |
| Workspaces on suspended capacity | 3 / 8 (37.5%) |
| Workspaces with one direct human admin | 5 / 8 (62.5%) |
| Unlabeled supported Power BI artifacts | 8 / 12 (66.7%) |
| Failed last-recorded refreshes | 2 / 5 (40%) |

These are different populations: **do not divide scanner label findings by all Fabric items, or refresh failures by all inventoried semantic models**.

## 1. Prerequisites - read before installing

1. **Node.js 24 LTS**, npm, and Git. The app was validated with Node 24.22.1. A `.nvmrc` is included. Do not use Node 26 for this pinned Rayfin release; its declared engine range excludes it.
2. **Access to the pinned Rayfin/visuals packages through an approved npm registry.** Rayfin packages are pinned to **1.36.2** and Fabric visual packages to **1.3.0**. At publication, `@microsoft/rayfin-cli@1.36.2` was not found on the public npm registry; installed Rayfin guide metadata also marks its distribution restricted. This repository shares application source, not a public SDK distribution. A plain public-npm-only environment is **not** a supported installation path for these locked versions.
   - Obtain package access and registry/authentication instructions through your Rayfin onboarding channel.
   - Configure that approved registry outside this repository, at user or organizational level.
   - Registry tarball URLs were deliberately omitted from the lockfile. Versions and integrity hashes remain locked; npm resolves them using your configured registry.
   - Do not copy another developer's feed settings, commit `.npmrc` or tokens, disable TLS validation, or arbitrarily substitute SDK versions.
3. **A Fabric-enabled account and a workspace where you can create/deploy Fabric apps**, on an active supported capacity. App availability, preview enablement, tenant settings, licensing, and permissions must be checked in your own environment. Deploying can consume capacity and incur costs.
4. **For collecting actual tenant-wide audit data only:** an appropriately authorized Fabric tenant-admin/auditor identity, required tenant settings/consents, and access to the Fabric/Power BI admin APIs and metadata scanning. App viewers do not need tenant-admin permissions merely to view an authorized bundled snapshot.

## 2. Get the code and install

The examples below use **PowerShell**. Run project commands from this folder, not the repository root.

```powershell
git clone --depth 1 https://github.com/SoomroFarhanH/SemanticModelBPforAI.git
Set-Location .\SemanticModelBPforAI\FabricGovernance
node --version
npm --version
npm ci --ignore-scripts --no-audit --no-fund
npm run validate:share
```

The installation command above was validated independently on Windows using an already authorized registry. It skips dependency install scripts; the app's normal build commands still run their own prebuild step when invoked explicitly. Other platforms must also have their required optional native packages available through the approved registry.

**E404 or E401 for Rayfin packages is not a missing app file:** resolve package entitlement/registry authentication first. Do not delete the lockfile to hide the failure.

## 3. Publish your own protected Fabric demo

Use your own workspace ID; no original tenant, workspace, deployment, or hosting identity is supplied here.

1. Create or select your destination workspace in Fabric and verify its assigned capacity is active.
2. Copy the workspace GUID from its Fabric portal URL.
3. Sign in, preview the exact target, and review the reported workspace **name and ID** before deploying:

```powershell
npx rayfin login
npx rayfin login status

$WorkspaceId = Read-Host 'Your destination Fabric workspace GUID'
$ItemName = 'fabric-governance-demo'
npx rayfin up -n --workspace-id $WorkspaceId --item-name $ItemName --json
```

Choose a unique item name. Do not approve reuse of an existing item unless you intend to update it.

4. After the preview confirms the intended destination, deploy and verify status:

```powershell
npx rayfin up --workspace-id $WorkspaceId --item-name $ItemName --json
npx rayfin up status --json
```

`rayfin up` builds and uploads the app. Preview is read-only and does **not** build or prove that deployment will succeed. Do not add `--force`.

5. Open the **Fabric portal item link returned by the CLI**, sign in, and verify the `SYNTHETIC DEMO` banner, chart, filters, downloads, and theme controls.
6. Grant intended viewers the appropriate Fabric app/workspace access using your organization's sharing process. Recheck access as one of those viewers. For standalone access, use the returned hosting URL, verify the registered redirect origin, and test interactive Microsoft sign-in separately.

The CLI creates local deployment/environment files such as `rayfin/.deployments.json`, `rayfin/.env`, and `packages/frontend/.env.local`. They are deliberately ignored by Git. Never publish them or copy another tenant's versions.

**Keep the protections intact:** `assetAccess: protected`, Fabric authentication, `externalEntraExchange`, and the root `AuthGate`. Do not bypass sign-in to make a demonstration work.

## 4. Local development

After the initial deployment has established **your own** backend configuration:

```powershell
npx rayfin login
npm run dev
```

Open the localhost URL printed by the CLI/Vite. The committed redirect allowlist contains `http://localhost:5173`; if you intentionally use another origin, add that exact development origin through the documented Rayfin configuration workflow and sync the approved settings. Do not use wildcard redirects.

`npm run dev:frontend` runs only Vite when your environment is already configured. Local authentication uses the Rayfin CLI-backed development flow; it does not exercise hosted standalone sign-in. Missing authentication/configuration must produce an actionable error, not reveal the dashboard.

## 5. Client demonstration walkthrough

1. Explain the synthetic-data banner and snapshot dates before discussing risk.
2. Use the four KPIs to distinguish availability, administration, classification, and refresh coverage.
3. Show the paused-capacity example, then domain ownership and the dependency-ordered action plan.
4. Filter **Findings** to `Protect`, then to `Critical`; expand evidence, owner, effort, and recommended action.
5. Search for `Demo Finance`, then filter workspaces by suspended capacity or zero items. Show an owner record; explain that `example.invalid` contacts are deliberately fictional.
6. Show refresh errors and the source ledger. Explain that empty workspaces are not automatically unused, capacity counts are not CU utilization, and label presence is not DLP compliance.
7. Export filtered CSV or the full JSON to demonstrate the handoff. No remediation runs from this app.

## 6. Use your own reviewed snapshot

### Collect and review outside the app

The app **does not collect tenant telemetry, call governance APIs, poll refreshes, or perform automatic remediation**. Its runtime loads a JSON file compiled into the frontend.

Collect a read-only audit using your approved process, for example the Fabric **OneLake Catalog** governance skill (`fabric-skills:onelake-catalog-cli` in environments that provide it). Use the tenant-admin audit workflow, retrieve all pages, complete metadata scans, retain timestamps and source-specific denominators, and review the evidence before import.

There is **no universal Fabric admin JSON export** that can be dropped in unmodified. Your exporter must produce this app's report shape. Use the bundled [snapshot](packages/frontend/src/data/governance-snapshot.json), the deterministic [sample generator](scripts/generate-demo-snapshot.mjs), and [validation contract](scripts/validate-governance-snapshot.mjs) as references. This repository does not include an automated tenant collector.

### Required report shape

| Group | Required content |
|---|---|
| Identity and timing | `dataClassification: "tenant"`, `readOnly: true`, `tenantId`, `purpose`, `skill`, `status`, `interpretation`, and valid `collectedFrom` / `collectedTo` timestamps. |
| `scope` | Governable/raw workspace and inventory totals, exclusions, domain/capacity counts, personal/scanned workspace totals, label/endorsement denominators, unmatched scanner count, and freshness caveat. |
| `metrics` | `suspended`, `singleAdmin`, `unlabeled`, `failedRefresh`, `domainAssigned`, `described`, `tagged`, `labeled`, `endorsed`; each includes `numerator`, `denominator`, one-decimal `percent`, `scope`, and `source`. For denominator zero use percentage zero. |
| Objects | `workspaces` with explicit admin records and coverage counts; `capacities` with placements; `domains` with membership/accountability; `itemTypes`, `labelTypes`, and `refreshFailures`. Use `"Unassigned"` for no domain and `"Not resolvable"` for an unresolved capacity display value. Blank workspace `url` is allowed; otherwise supply a verified HTTPS URL. |
| Findings and actions | `findings` with unique key, `Health` / `Protect` / `Trust` pillar, `Critical` / `High` / `Medium` / `Low` priority, evidence metric, title, why, action, owner, effort, examples, and `detail` string (empty when not applicable); dependency-ordered `remediation`. |
| Evidence and limits | Fully paginated `sources`, completed `scanner` results, `clean`, `blindSpots`, and HTTPS `docs` links. Keep personal-workspace classification gaps separate from governable-workspace percentages. |

Counts must reconcile across workspace, type, capacity, and scope records. Label totals cover the supported Power BI subset; endorsement eligibility excludes dashboards. Native Fabric metadata that was not verified must remain unassessed. Refresh coverage cannot be treated as all semantic models. Incomplete source/scanner coverage is rejected rather than displayed as a successful complete audit.

### Import, validate, and redeploy

Keep the reviewed input outside this public checkout, then:

```powershell
npm run snapshot:import -- 'C:\Private\fabric-health-results.json'
npm run typecheck
npm test
npm run build
npm run validate:visual
npx rayfin up --workspace-id $WorkspaceId --item-name $ItemName --json
npx rayfin up status --json
```

The importer validates before replacing the bundled file, rejects credentials and non-HTTPS links, and does **not** anonymize data. A report without `dataClassification` is explicitly treated as `"tenant"` for compatibility; the command prints a confidentiality warning. The UI switches from the synthetic banner to a historical-snapshot warning.

> **Privacy boundary:** all authorized app viewers can read and download the entire bundled snapshot. Sign-in is not per-workspace or per-person row-level isolation. Import only data those viewers may see; use separate, appropriately restricted deployments for different clients.
>
> **Git warning:** the bundled JSON is intentionally **tracked** so new users receive a demo. After import, that same tracked file contains your tenant data. `.gitignore` does not protect changes to tracked files. Do not commit tenant snapshots to this public repository.

Before sharing source again:

```powershell
npm run demo:reset
npm run validate:share
```

`demo:reset` overwrites the bundled JSON with the deterministic fictional fixture; keep any needed private report elsewhere first. The sharing check inspects the current working copy, **not Git's staging area or history**. Re-stage only reviewed synthetic content and inspect staged changes before committing. Also exclude downloaded audit files, environment values, credentials, deployment state, and private screenshots.

If you deployed from this checkout, Rayfin may have added a hosting redirect to the tracked `rayfin/rayfin.yml`. For redistribution, prepare a clean source copy with the localhost-only allowlist; keep deployment-specific origins in your private deployment source. `validate:share` deliberately rejects a committed hosting origin. Do not remove and sync an existing deployment's approved sign-in configuration just to pass a source-sharing check.

## 7. Build and validation commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | Type-check all workspace projects; run before build because the frontend's build uses `--noCheck`. |
| `npm run lint` | Frontend ESLint checks. |
| `npm test` | Snapshot/import contract tests and frontend/dashboard/auth tests. |
| `npm run test:snapshot` | Focused snapshot/import contract tests. |
| `npm run build` | Build data/shared contracts and the production frontend; prebuild generates local Vite environment configuration. |
| `npm run build:fabric` | Fabric packaging build. |
| `npm run validate:visual` | Validate the authored Vega-Lite spec against the installed schema. |
| `npm run validate:share` | Check synthetic fixture invariants, registry-neutral lockfile, and protected non-targeted config before redistributing. Not a comprehensive secret scanner. |
| `npm run demo:reset` | Replace the bundled data with the fictional sample. |

The source distribution was independently restored and checked under Node 24. Its UI/auth suite has 58 tests, with additional Node snapshot/import tests. A successful build or visual-schema check is not proof of deployed authentication, permissions, or visual layout: validate those in your own Fabric deployment.

Non-blocking known messages: jsdom can report missing canvas context during tests, and Vite reports a large chart/grid bundle. Do not hide actual test failures behind those warnings.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Package install E404/E401 | Approved registry access and exact package entitlement; public npm alone cannot supply this pinned release. |
| TLS failure | Organizational certificate/proxy configuration. Do not disable certificate verification. |
| Engine warning | Use Node 24 LTS rather than an unsupported Node major. |
| Deployment or sign-in fails | Correct account/tenant, workspace create/deploy rights, capacity state, app availability/tenant settings, and the CLI's actual error. |
| Local auth/config error | Complete your own initial deployment; rerun `rayfin login`, confirm the generated environment and exact localhost redirect. Never copy another user's backend settings or remove the auth gate. |
| Hosted app not accessible to a client | Verify approved Fabric permissions and that client's tenant/guest access. Use the Fabric item entry point first; separately test standalone sign-in. |
| Import fails | Match the documented shape; reconcile counts, eligible populations, dates, full pagination, and requested/returned scanner totals. Do not weaken validation to accept a partial audit as complete. |
| Changes do not appear in Fabric | Import/edit locally, validate, redeploy to the same explicit workspace/item, verify status, then reload the hosted app. This is not a live-data application. |

## Project layout and licensing

```text
FabricGovernance/
  rayfin/rayfin.yml                  Protected services, no committed target
  packages/frontend/src/
    GovernanceDashboard.tsx         Dashboard and interactions
    data/governance-snapshot.json    Tracked synthetic fixture
    lib/governance-snapshot.ts       Filters, UTC formatting, safe CSV cells
    Root.tsx                        Theme/auth/error boundaries
  packages/data/                    Template schema build; data service disabled
  packages/shared/                  Shared workspace contracts
  scripts/                         Import, synthetic reset, tests, validation
```

This is a focused application distribution, not the original template's capability-pack scaffolder; `pack:add`, template contract tooling, local editor integrations, and installed SDK files are deliberately omitted.

Application adaptations follow the repository's [MIT license](../LICENSE). The retained Rayfin template code carries Microsoft's MIT notice in [LICENSE](LICENSE); preserve those notices when redistributing. This community example is provided **AS IS**, is not an official supported Microsoft product, and does not include a license or entitlement to restricted SDK services/packages. Validate recommendations and permissions before acting. No automatic remediation is performed.
