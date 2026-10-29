# Fabric Governance Health - Rayfin App

A protected Microsoft Fabric app for explaining governance health, protection, and trust to clients and platform teams.

> **The bundled data is entirely synthetic.** No tenant was scanned to create this sample. Its names, contacts, IDs, counts, dates, source ledger, and findings are fictional. It is a static snapshot demonstration, not live monitoring or a compliance attestation.

## Start here: complete client workflow

**Update Fabric Skills -> run the review prompt -> save HTML + validated JSON -> import the JSON into the app.**

There are two roles:

- **Client/reviewer:** needs Fabric audit permissions, an AI host with Fabric Skills, Node.js for the export check, and access to an already deployed copy of this app. **No Rayfin SDK install or redeployment is needed to visualize each new review.**
- **Hosting owner/developer:** deploys this version of the protected app once using the hosting instructions below. Rayfin package access is required for that build/deployment, not for a client's browser import.

### Step 1 - Install or update the official Fabric Skills

Use the Microsoft-owned [skills-for-fabric repository](https://github.com/microsoft/skills-for-fabric), not a similarly named third-party bundle. Installation does not grant Fabric permissions.

**GitHub Copilot CLI (recommended):**

1. Install/update [GitHub Copilot CLI](https://github.com/github/copilot-cli) using its official instructions and sign in. Use an account/plan and organization policy that permit it.
2. Start the interactive CLI with `copilot`.
3. Enter these commands **inside Copilot**, not in PowerShell:

   ```text
   /plugin marketplace add microsoft/skills-for-fabric
   /plugin install fabric-skills@fabric-collection
   ```

4. For an existing installation, update the Fabric bundle:

   ```text
   /plugin update fabric-skills@fabric-collection
   ```

   The upstream alternative for updating **all** installed plugins, from a terminal, is `copilot plugin update --all`. Use the narrower command when only Fabric needs updating.

5. Start a fresh Copilot conversation after updating. Verify that `onelake-catalog-cli` appears in the available Fabric Skills. It is the current consolidated governance/curation skill; the requested older `onelake-catalog-govern-cli` name is not listed in the current bundle.

**VS Code:**

1. Update VS Code and the GitHub Copilot integration permitted by your organization; select the intended agent harness.
2. Run **Chat: Open Customizations** from the Command Palette, then open **Plugins**. VS Code discovers Copilot CLI-installed plugins; verify **fabric-skills** is listed and enabled for the intended workspace/harness.
3. Alternatively, configure the trusted `microsoft/skills-for-fabric` marketplace in the Customizations editor, refresh it, and install the **fabric-skills** bundle.
4. Complete any host trust/MCP approval prompts after inspecting their source. Start a fresh chat and inspect the plugin's **Skills** list for `onelake-catalog-cli`.
5. Update through the same source used to install the bundle. For a CLI-managed installation, use the update command above, then start a fresh VS Code chat. A marketplace refresh alone is not proof that an installed plugin was updated.

Do not install duplicate old/new bundles to fix discovery. Check the selected harness, plugin enablement, source, organizational restrictions, and a fresh conversation first.

Verified against the [official Fabric Skills installation/update guide](https://github.com/microsoft/skills-for-fabric#install-with-github-copilot-cli) and [VS Code plugin documentation](https://code.visualstudio.com/docs/agent-customization/agent-plugins) on October 29, 2026. Consult those sources if the host UI changes.

### Step 2 - Prepare the review account and checkout

Install **Node.js 24 LTS**, Git, and [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli). Sign into the intended tenant with an identity authorized for the tenant-wide admin audit:

```powershell
$TenantId = Read-Host 'Tenant GUID to review'
az login --tenant $TenantId --allow-no-subscriptions
az account show --query tenantId -o tsv

git clone --depth 1 https://github.com/SoomroFarhanH/SemanticModelBPforAI.git
Set-Location .\SemanticModelBPforAI\FabricGovernance
node --version
```

For an existing checkout, obtain the latest repository changes without overwriting private work. Do not reclone over an existing directory.

The audit requires Fabric/Power BI **tenant-admin API access**, required settings/consents, and scanner access. Workspace/capacity/domain admin rights alone are not tenant-admin rights. If admin APIs reject the account, stop: a caller-scoped inventory is not a tenant-wide audit. The skill acquires the appropriate API audiences; never paste tokens into prompts or files. Audit Azure CLI authentication and Rayfin deployment sign-in are separate.

### Step 3 - Run the supplied health-review prompt

Open **this folder** in Copilot CLI or VS Code so the agent can read the local export schema. Use the complete [copy-ready review prompt](docs/health-review-prompt.txt), not only the short request below.

On Windows, copy it with:

```powershell
Get-Content -Raw .\docs\health-review-prompt.txt | Set-Clipboard
```

Paste it into the configured Copilot conversation. Its opening request is:

> Run a health review of my Fabric tenant with the Fabric governance skill and show me the results visually. Save an import-ready JSON review as well as a visual HTML report.

The full prompt selects **`fabric-skills:onelake-catalog-cli` in `admin-audit` mode**, checks scope/permissions, preserves read-only behavior, and requests:

| Private deliverable | Purpose |
|---|---|
| `private\<run-id>\fabric-health-review.html` | Visual findings you can open locally. |
| `private\<run-id>\fabric-health-results.json` | Version 1 review for this app. |
| Evidence/calculation notes in the same run folder | Traceability, source/page counts, scanner coverage, exclusions and limitations; no credentials. |

These are **agent-generated review deliverables**, not a universal built-in Fabric JSON export. The prompt makes the agent read the app's [JSON schema](packages/shared/src/governance-review.schema.json) and [shared semantic validator](packages/shared/src/governance-snapshot.mjs), then validate its export. The example snapshot is a shape reference, never evidence for a client's tenant.

The agent should ask about production/business-critical versus demo/development context when it affects priorities. It must not manufacture values to satisfy the schema. If required source coverage is unavailable, the correct outcome is a blocker/partial-evidence explanation, **not an import-ready success**.

### Step 4 - Confirm the saved JSON passes validation

The prompt asks the agent to execute this; you can also run it yourself, replacing the path with the actual saved run:

```powershell
npm run snapshot:validate -- '.\private\<actual-run-id>\fabric-health-results.json'
```

This command uses Node's built-ins and the checked-in shared validator. **It does not require `npm ci`, any Rayfin packages, a backend, or package-feed access.** It does not modify the bundled sample. A passing result means format/count/coverage consistency, not independent proof of the audit's truthfulness or compliance.

Do not upload an HTML file, Markdown answer, raw API dump, or arbitrary scanner response into the app. For malformed JSON, unsupported versions, missing fields, incomplete sources, or mismatched totals, have the agent correct the export **from evidence** and rerun validation.

### Step 5 - Visualize your review without rebuilding

1. Obtain the link to an up-to-date protected deployment of this app from its hosting owner. Sign in with an account granted appropriate Fabric access.
2. Choose **Import review** in navigation or find **Import review JSON** at the top.
3. Select `fabric-health-results.json` (maximum **25 MB**).
4. Review the validated preview: **tenant identifier, classification, collection date, workspace/item totals, and findings count**.
5. Select **Show this review**. KPIs, chart, findings, workspace grid, owners, refresh records, scope, and downloads all switch to that review; previous filters/selections are cleared.
6. If it is the wrong tenant/file, choose **Cancel import**. If validation fails, the current report remains unchanged and an error is shown; the app never silently substitutes demo data.
7. Use **Report JSON** or **Export filtered CSV** for an intentional local handoff.
8. Select **Restore bundled snapshot**, refresh, or close the tab to discard the session import. Restoring shows the deployment's bundled snapshot, which is synthetic in this repository.

For a new review, rerun the audit prompt and import the new validated file. This is snapshot visualization, not scheduled monitoring. The **First time?** panel also exposes the full prompt and lets users download the prompt and formal schema.

**Privacy:** browser import is in memory only. This feature does not post the JSON to the hosting service, write it to local/session storage, modify the deployed app, or share it with another viewer. Authentication and ordinary app assets still use the network. The audit agent/host, browser extensions, screen-sharing, and files explicitly downloaded have separate data-handling implications. Do not load data you are not allowed to view or screen-share.

Keep actual exports/evidence under the ignored `private` folder or another approved private location. Never commit tenant data or screenshots to this public repository.

## What you get

- Four scoped KPIs: suspended-capacity placement, single-admin workspaces, missing sensitivity labels, and failed last-recorded refreshes.
- Capacity placement, domain accountability, and a dependency-ordered action plan.
- Interactive label chart and coverage indicators for domains, descriptions, tags, and endorsements.
- Seventeen illustrative findings, searchable and filterable by pillar and priority.
- Searchable/filterable workspace grid and owner drill-down. Synthetic IDs deliberately have no real Fabric portal links.
- Failed-refresh evidence, source/pagination ledger, explicit exclusions, and unassessed areas.
- JSON and filtered, formula-safe CSV downloads; light/dark themes and responsive layout.
- Private browser import with validation/preview, clear errors, reset, and a downloadable prompt/export schema.
- Microsoft sign-in and protected static hosting. Database, storage, functions, and password authentication are disabled.

| Synthetic demo metric | Value |
|---|---:|
| Active standard workspaces / inventory items | 8 / 24 |
| Workspaces on suspended capacity | 3 / 8 (37.5%) |
| Workspaces with one direct human admin | 5 / 8 (62.5%) |
| Unlabeled supported Power BI artifacts | 8 / 12 (66.7%) |
| Failed last-recorded refreshes | 2 / 5 (40%) |

These are different populations: **do not divide scanner label findings by all Fabric items, or refresh failures by all inventoried semantic models**.

## Hosting owner / developer prerequisites

1. **Node.js 24 LTS**, npm, and Git. The app was validated with Node 24.22.1. A `.nvmrc` is included. Do not use Node 26 for this pinned Rayfin release; its declared engine range excludes it.
2. **Access to the pinned Rayfin/visuals packages through an approved npm registry.** Rayfin packages are pinned to **1.36.2** and Fabric visual packages to **1.3.0**. At publication, `@microsoft/rayfin-cli@1.36.2` was not found on the public npm registry; installed Rayfin guide metadata also marks its distribution restricted. This repository shares application source, not a public SDK distribution. A plain public-npm-only environment is **not** a supported installation path for these locked versions.
   - Obtain package access and registry/authentication instructions through your Rayfin onboarding channel.
   - Configure that approved registry outside this repository, at user or organizational level.
   - Registry tarball URLs were deliberately omitted from the lockfile. Versions and integrity hashes remain locked; npm resolves them using your configured registry.
   - Do not copy another developer's feed settings, commit `.npmrc` or tokens, disable TLS validation, or arbitrarily substitute SDK versions.
3. **A Fabric-enabled account and a workspace where you can create/deploy Fabric apps**, on an active supported capacity. App availability, preview enablement, tenant settings, licensing, and permissions must be checked in your own environment. Deploying can consume capacity and incur costs.
4. **For collecting actual tenant-wide audit data only:** an appropriately authorized Fabric tenant-admin/auditor identity, required tenant settings/consents, and access to the Fabric/Power BI admin APIs and metadata scanning. App viewers do not need tenant-admin permissions merely to view an authorized bundled snapshot.

## Hosting owner - install the app dependencies

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

## Hosting owner - publish your protected Fabric app

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

Deploy this version once; clients can then load different tenant reviews in their own tabs without access to the build tools or package registry. Existing deployments of an older version must be updated before they offer the import feature.

The CLI creates local deployment/environment files such as `rayfin/.deployments.json`, `rayfin/.env`, and `packages/frontend/.env.local`. They are deliberately ignored by Git. Never publish them or copy another tenant's versions.

**Keep the protections intact:** `assetAccess: protected`, Fabric authentication, `externalEntraExchange`, and the root `AuthGate`. Do not bypass sign-in to make a demonstration work.

## Local development

After the initial deployment has established **your own** backend configuration:

```powershell
npx rayfin login
npm run dev
```

Open the localhost URL printed by the CLI/Vite. The committed redirect allowlist contains `http://localhost:5173`; if you intentionally use another origin, add that exact development origin through the documented Rayfin configuration workflow and sync the approved settings. Do not use wildcard redirects.

`npm run dev:frontend` runs only Vite when your environment is already configured. Local authentication uses the Rayfin CLI-backed development flow; it does not exercise hosted standalone sign-in. Missing authentication/configuration must produce an actionable error, not reveal the dashboard.

## Synthetic client demonstration walkthrough

1. Explain the synthetic-data banner and snapshot dates before discussing risk.
2. Use the four KPIs to distinguish availability, administration, classification, and refresh coverage.
3. Show the paused-capacity example, then domain ownership and the dependency-ordered action plan.
4. Filter **Findings** to `Protect`, then to `Critical`; expand evidence, owner, effort, and recommended action.
5. Search for `Demo Finance`, then filter workspaces by suspended capacity or zero items. Show an owner record; explain that `example.invalid` contacts are deliberately fictional.
6. Show refresh errors and the source ledger. Explain that empty workspaces are not automatically unused, capacity counts are not CU utilization, and label presence is not DLP compliance.
7. Export filtered CSV or the full JSON to demonstrate the handoff. No remediation runs from this app.

## Export contract and optional shared bundling

### Collect and review outside the app

The app **does not collect tenant telemetry, call governance APIs, poll refreshes, or perform automatic remediation**. It starts with a bundled snapshot and can replace it in memory with a validated local JSON file.

Collect a read-only audit using your approved process, for example the Fabric **OneLake Catalog** governance skill (`fabric-skills:onelake-catalog-cli` in environments that provide it). Use the tenant-admin audit workflow, retrieve all pages, complete metadata scans, retain timestamps and source-specific denominators, and review the evidence before import.

There is **no universal Fabric admin JSON export** that can be dropped in unmodified. The supplied [review prompt](docs/health-review-prompt.txt) is the guided collector/export workflow using the installed Fabric Skill. Custom exporters must follow the [version 1 JSON schema](packages/shared/src/governance-review.schema.json) and [shared validation contract](packages/shared/src/governance-snapshot.mjs). No unattended tenant collector is included.

### Required report shape

| Group | Required content |
|---|---|
| Identity and timing | `schemaVersion: 1`, `dataClassification: "tenant"`, `readOnly: true`, `tenantId`, `purpose`, `skill`, `status`, `interpretation`, and valid `collectedFrom` / `collectedTo` timestamps. |
| `scope` | Governable/raw workspace and inventory totals, exclusions, domain/capacity counts, personal/scanned workspace totals, label/endorsement denominators, unmatched scanner count, and freshness caveat. |
| `metrics` | `suspended`, `singleAdmin`, `unlabeled`, `failedRefresh`, `domainAssigned`, `described`, `tagged`, `labeled`, `endorsed`; each includes `numerator`, `denominator`, one-decimal `percent`, `scope`, and `source`. For denominator zero use percentage zero. |
| Objects | `workspaces` with explicit admin records and coverage counts; `capacities` with placements; `domains` with membership/accountability; `itemTypes`, `labelTypes`, and `refreshFailures`. Include observed workspace `domainId` (empty when unassigned); display names can be duplicated. Legacy name-only membership is accepted only when unambiguous. Use `"Unassigned"` for no domain and `"Not resolvable"` for an unresolved capacity display value. Blank workspace `url` is allowed; otherwise supply a verified HTTPS URL. |
| Findings and actions | `findings` with unique key, `Health` / `Protect` / `Trust` pillar, `Critical` / `High` / `Medium` / `Low` priority, evidence metric, title, why, action, owner, effort, examples, and `detail` string (empty when not applicable); dependency-ordered `remediation`. |
| Evidence and limits | Fully paginated `sources`, completed `scanner` results, `clean`, `blindSpots`, and HTTPS `docs` links. Keep personal-workspace classification gaps separate from governable-workspace percentages. |

Counts must reconcile across workspace, type, capacity, and scope records. Label totals cover the supported Power BI subset; endorsement eligibility excludes dashboards. Native Fabric metadata that was not verified must remain unassessed. Refresh coverage cannot be treated as all semantic models. Incomplete source/scanner coverage is rejected rather than displayed as a successful complete audit.

### Advanced: bundle one reviewed snapshot for all authorized viewers

**Not needed for the normal client workflow.** Use this only when you intentionally want the deployed bundle itself to contain a shared, reviewed tenant report rather than the synthetic default. This changes the privacy/sharing boundary: every permitted app viewer receives that bundled data.

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

The CLI importer validates before replacing the bundled file, rejects recognizable credential fields and non-HTTPS links, and does **not** anonymize data. Legacy exports without `schemaVersion` / `dataClassification` are normalized to version 1 / `"tenant"`; unknown explicit versions are rejected. The command prints a confidentiality warning. Browser import uses exactly the same parser and semantic checks but never writes this file.

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

## Build and validation commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | Type-check all workspace projects; run before build because the frontend's build uses `--noCheck`. |
| `npm run lint` | Frontend ESLint checks. |
| `npm test` | Snapshot/import contract tests and frontend/dashboard/auth tests. |
| `npm run test:snapshot` | Focused snapshot/import contract tests. |
| `npm run snapshot:validate -- <file>` | Validate a review without installing SDK packages, modifying the sample, uploading data, or deploying. |
| `npm run build` | Build data/shared contracts and the production frontend; prebuild generates local Vite environment configuration. |
| `npm run build:fabric` | Fabric packaging build. |
| `npm run validate:visual` | Validate the authored Vega-Lite spec against the installed schema. |
| `npm run validate:share` | Check synthetic fixture invariants, registry-neutral lockfile, and protected non-targeted config before redistributing. Not a comprehensive secret scanner. |
| `npm run demo:reset` | Replace the bundled data with the fictional sample. |

The source distribution is checked under Node 24, including shared parser/schema contracts, import-preview/cancel/error/reset/export behavior, browser privacy boundaries, and existing dashboard/auth tests. A successful build or visual-schema check is not proof of deployed authentication, permissions, or visual layout: validate those in your own Fabric deployment.

Non-blocking known messages: jsdom can report missing canvas context during tests, and Vite reports a large chart/grid bundle. Do not hide actual test failures behind those warnings.

## Troubleshooting

| Symptom | Check |
|---|---|
| Package install E404/E401 | Approved registry access and exact package entitlement; public npm alone cannot supply this pinned release. |
| TLS failure | Organizational certificate/proxy configuration. Do not disable certificate verification. |
| Engine warning | Use Node 24 LTS rather than an unsupported Node major. |
| Deployment or sign-in fails | Correct account/tenant, workspace create/deploy rights, capacity state, app availability/tenant settings, and the CLI's actual error. |
| Local auth/config error | Complete your own initial deployment; rerun `rayfin login`, confirm the generated environment and exact localhost redirect. Never copy another user's backend settings or remove the auth gate. |
| CLI cache warning or a device sign-in prompt | Complete a fresh `rayfin login` using the supported Node runtime and your own account; follow the CLI's actual Microsoft sign-in flow. Do not edit/decrypt another user's credential cache or bypass the app's auth gate. |
| Hosted app not accessible to a client | Verify approved Fabric permissions and that client's tenant/guest access. Use the Fabric item entry point first; separately test standalone sign-in. |
| Import fails | Match the documented shape; reconcile counts, eligible populations, dates, full pagination, and requested/returned scanner totals. Do not weaken validation to accept a partial audit as complete. |
| The skill name is missing | Update the official Fabric bundle, verify plugin/harness enablement, then start a fresh conversation. The current name is `onelake-catalog-cli`, not `onelake-catalog-govern-cli`. |
| Imported JSON disappears after refresh | Expected: session imports are not persisted. Re-import the file; do not assume it was uploaded or saved. |
| There is no import button | The hosting owner must deploy this newer app version. A fresh audit file does not update old application code. |
| New data does not appear | Browser mode: select the new JSON, review its preview, and select **Show this review**. Advanced bundled mode: validate and redeploy to the same explicit workspace/item, verify status, then reload. |

## Project layout and licensing

```text
FabricGovernance/
  rayfin/rayfin.yml                  Protected services, no committed target
  docs/health-review-prompt.txt      Copy-ready read-only audit/export prompt
  packages/frontend/src/
    GovernanceDashboard.tsx         Dashboard and interactions
    data/governance-snapshot.json    Tracked synthetic fixture
    lib/governance-snapshot.ts       Filters, UTC formatting, safe CSV cells
    Root.tsx                        Theme/auth/error boundaries
  packages/data/                    Template schema build; data service disabled
  packages/shared/src/
    governance-types.ts            Typed report contract
    governance-snapshot.mjs        Browser/CLI parser and semantic validation
    governance-review.schema.json  Machine-readable version 1 export schema
  scripts/                         Import, synthetic reset, tests, validation
```

This is a focused application distribution, not the original template's capability-pack scaffolder; `pack:add`, template contract tooling, local editor integrations, and installed SDK files are deliberately omitted.

Application adaptations follow the repository's [MIT license](../LICENSE). The retained Rayfin template code carries Microsoft's MIT notice in [LICENSE](LICENSE); preserve those notices when redistributing. This community example is provided **AS IS**, is not an official supported Microsoft product, and does not include a license or entitlement to restricted SDK services/packages. Validate recommendations and permissions before acting. No automatic remediation is performed.
