# Data Agent Readiness

A Fabric App that turns the output of the **Fabric Data Agent Analyzer** notebook into something anyone can act on: a readiness score, release gates, a prioritized fix list, and progress across runs.

## How it works

1. Run `Analyzer/FabricDataAgentAnalyzer/FabricDataAgentAnalyzer.ipynb` in Fabric. It is read-only and writes `readiness_<agent>_evidence.json` under `Files/DataAgentReadiness/<agent>/<timestamp>/` in the attached lakehouse.
2. In the app, choose **Import results** and drop that JSON file (or paste it). The export is validated, previewed, and saved as one run plus one record per check. If any write fails, the partial import is removed.
3. Review the **Overview** (score, release gates, checks by scope, open work, what to fix first), the **Findings** list (filter by view, severity or source; expand a card for the fix; copy the list as a checklist), and the **Sources** inventory. Re-import after each change to see progress.

Nothing in the app is invented: every number comes from an imported export. `samples/SAMPLE_analyzer_evidence.json` is a clearly labeled **sample** in the exact export shape, for trying the import flow.

Data is owner-scoped on the server: each signed-in user only sees the runs they imported. Widen the `@role` policy in `packages/data/src/AnalysisRun.ts` and `Finding.ts` to share a history with a team.

| Area | Where |
| --- | --- |
| Export parsing and validation | `packages/frontend/src/lib/analyzer-bundle.ts` |
| Persistence (import, list, delete) | `packages/frontend/src/lib/runs-api.ts`, `packages/frontend/src/hooks/use-runs.ts` |
| Entities | `packages/data/src/AnalysisRun.ts`, `packages/data/src/Finding.ts` |
| Screens | `packages/frontend/src/AppView.tsx`, `packages/frontend/src/components/` |

The rest of this file describes the workspace the app was scaffolded from.

## Workspace template

This is the workspace template the Rayfin Copilot plugin uses to build Fabric Apps.
The base is small on purpose: dynamic authentication, theming, and an error boundary that work inside or outside the Fabric portal after sign-in.
Capabilities such as Power BI analytics and trusted server-side functions are added on demand with `npm run pack:add -- <pack>`.

## Workspace layout

The application is an npm workspace with one control root and three base packages:

```text
.
├── package.json                 # Root commands, workspace members, and applied packs
├── rayfin/
│   └── rayfin.yml               # Rayfin services and package paths
├── packages/
│   ├── frontend/                # React, Vite, UI, and static output
│   ├── data/                    # Entity registration and data schema exports
│   └── shared/                  # Isomorphic contracts shared across runtimes
└── scripts/                     # Capability-pack tooling and template checks
```

The packages have stable internal names: `@rayfin-app/frontend`, `@rayfin-app/data`, and `@rayfin-app/shared`.
Scaffolding personalizes only the root package name; it does not rename member packages, local dependency keys, or import specifiers.
The root coordinates the workspace but is not another application package.

The base does not include `packages/functions`.
That package is created only when the functions capability is applied.

## Root and package commands

Run the normal workflow from the workspace root:

| Command                      | What it does                                                          |
| ---------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                | Starts Rayfin local services and the frontend development server.     |
| `npm run dev:frontend`       | Starts only the frontend development server.                          |
| `npm run build`              | Builds shared contracts, data definitions, and the frontend in order. |
| `npm run build:fabric`       | Builds the workspace with the frontend's Fabric packaging behavior.   |
| `npm run typecheck`          | Type-checks the referenced workspace projects.                        |
| `npm run lint`               | Lints the frontend package.                                           |
| `npm test`                   | Runs the frontend test suite.                                         |
| `npm run preview`            | Previews the built frontend.                                          |
| `npm run pack:add -- <pack>` | Applies a capability pack and installs its dependencies.              |
| `npm run rayfin:up`          | Provisions or updates the app's Fabric resources.                     |
| `npm run test:template`      | Runs template and capability-pack contract tests.                     |

Root commands are the supported day-to-day interface and are also used by plugin validation.
For focused work, npm workspace commands remain available:

```sh
npm run -w @rayfin-app/frontend test
npm run -w @rayfin-app/data build
npm run -w @rayfin-app/shared build
```

Rayfin service commands run from each configured service path, so service build commands are package-local:

- Data uses `packages/data` and runs `npm run build` there.
- Static hosting uses `packages/frontend`, runs `npm run build:fabric` there, and packages `packages/frontend/dist`.
- Functions remains disabled until its pack configures `packages/functions`.

## Authentication and theme

`packages/frontend/src/App.tsx` renders the app only after an authenticated session exists.
The app defaults to light regardless of the operating-system theme, while explicit host appearance and user theme choices remain supported.

Hosted assets are protected by default and standalone sign-in is enabled in `rayfin/rayfin.yml`.
The dynamic auth service lets the SDK establish the current embedded identity before restoring a standalone session or falling back to Rayfin CLI sign-in during local development.
When automatic authentication is unavailable, the gate offers Microsoft sign-in from a user gesture instead of rejecting an outside-portal browser.
Configuration or authentication failures never expose app content.
Features use `await getRayfinClient()` for authorized service operations; keep the root authentication boundary intact.

## Capability packs

Apply a capability before customizing the app:

```sh
npm run pack:add -- analytics
npm run pack:add -- functions
```

Packs install dependencies with one root npm workspace install.
They do not create nested lockfiles or a separate nested installation.

The functions pack creates `packages/functions` as `@rayfin-app/functions`, enables the service at that path, and wires its generated schema into the frontend client.
It composes the functions build into the root build, Fabric build, and type-check commands.
Reapplying the pack preserves authored files.

If an install fails, the runner rolls back pack-owned file changes and reports any concurrent edits it cannot safely restore.
It preserves the install error and leaves the pack retryable.
Installed dependencies and installer-written lockfiles are not rolled back.
Follow the [failure recovery guidance](scripts/pack-manifest.md#failure-recovery) before continuing.

Template tests validate the pack structure and wiring.
With app dependencies installed, they also check the starter and analytics seed against the generated frontend lint rules.
They do not validate deployed secrets, app-identity permissions, downstream endpoints, or the maximum duration supported by the hosted functions path.

## Distribution and repository validation

The CLI and VS Code display this workspace as **✨ Use default template**, using the existing `blankapp` template ID.
Its canonical `universal-app` name remains hidden to avoid a duplicate listing, but it stays selectable explicitly for plugin automation.

Inside the Project Rayfin repository, the parent `samples/universal-app/` directory is a contributor-only Rush validation harness.
The harness generates an ephemeral `target/`, replaces published Rayfin ranges only in that target with repository-local package links, installs it, and runs the root validation commands.
The outer harness, local links, generated target, and target install output are not part of a generated app.
The committed inner template keeps published Rayfin ranges and uses `*` for local workspace members, so it remains distributable without repository-relative dependencies.

## Prerequisites

Install a [supported Node.js release](https://nodejs.org/en/download): Node.js 20, 22, or 24.
Docker Desktop or Docker Engine is required only when using the Docker development provider.
Rayfin handles Fabric sign-in when needed.
Protected sites sign in automatically when hosted, while public sites show a Microsoft sign-in screen.
Local development auto-signs in for both site types (`autoLogin: true` is set in `vite.config.ts`) using the Rayfin CLI session.
Run `npx rayfin login` before starting the app if you need to sign in or switch accounts.
GitHub Copilot CLI is not required to scaffold or run this app.

## Instructions for building a new web app

1. **Open the generated app**: Open a terminal in the project created by the Rayfin CLI, VS Code, or the Rayfin Copilot plugin.
2. **Install dependencies if needed**: Run `npm install` from the workspace root.
3. **Build the app**: Use your preferred editor or coding agent.
   If you use GitHub Copilot CLI, run `copilot`, then describe what you want to build.
   If the app should read an existing Power BI semantic model, include its name or dataset ID.
   If it should own its own records, or you want a mock-up, say so instead.
4. **Deploy it**: Ask Copilot to deploy, or run `npm run rayfin:up`, then open the Fabric URL it returns.
   Both the direct static-hosting URL and the Fabric portal URL support authenticated use.
   App content remains protected until sign-in succeeds.

## Seeing your changes

The recommended loop runs both Rayfin services and the frontend:

```sh
npm run dev
```

To run only Vite while working on frontend code:

```sh
npm run dev:frontend
```

To update the deployed app:

```sh
npm run rayfin:up
```

Open the direct hosting URL to use the app standalone, or the [Fabric portal](https://app.fabric.microsoft.com) to see it inside the Fabric shell.

<details>
<summary><strong>💡 Tips</strong></summary>

- Use **Shift + Tab** in Copilot to switch to **Plan mode**, where Copilot will present a plan and ask for confirmation before writing any code.

</details>

<details>
<summary><strong>📝 Example prompts</strong></summary>

- `Create a sales performance dashboard using the "Contoso Sales" semantic model. Include revenue KPIs, a monthly trend line chart, top 10 stores by profit, and a regional breakdown bar chart.`
- `Build an executive summary app for the "HR Analytics" model with headcount by department, attrition rate trends over the past 3 years, and a data grid of open positions sorted by days-to-fill.`
- `I want a customer insights app using dataset ID 4053a155-34a9-4b74-9bc2-e162f1b27fc7. Show customer lifetime value distribution, churn risk segmentation, and a filterable table of top accounts.`
- `Create a supply chain monitoring dashboard from the "Logistics Ops" model. I need inventory levels by warehouse, on-time delivery rate KPIs, and a heatmap of shipping delays by region and month.`
- `Build a financial reporting app using the "GL Financials" semantic model with a P&L summary, expense breakdown by cost center, and quarter-over-quarter variance charts. Add a date range filter across all visuals.`
- `Build an app where my team can log onboarding tasks and tick them off, where each person only sees their own.`
- `Build me a mock-up dashboard of support ticket volume — I don't have a data source yet, use sample data.`
- `Build a workflow that submits approved requests to our third-party fulfillment API without exposing its API key.`
- `Build an app that asks our published Fabric data agent a question and shows the answer.`

</details>

## Need help?

If you have any questions or run into any problems, please [file a Project Rayfin issue](https://github.com/microsoft/project-rayfin/issues/new/choose).
