---
name: analytics
description: >
  Use when the app reads an existing Power BI semantic model — a dashboard,
  report, KPI, or any view over data the app does not own. Turns on the Fabric
  data client and the semantic-model query hook, then covers the whole workflow:
  pick a model, discover its schema, write and test DAX, and render it. A chart
  over data the app already has needs the visuals skill instead, not this one.
  Triggers: semantic model, dataset, Power BI, DAX, measure, "our sales data",
  "from the model", "the existing report".
---

# Analytics — reading a semantic model

## Turn it on first

```sh
npm run pack:add -- connectors
npm run pack:add -- analytics
```

The connectors pack installs the composable client in
`packages/frontend/src/lib/rayfin-client.ts`.
The analytics pack installs the semantic-model connector packages and the
`useSemanticModelQuery` hook.
It also turns the `connectors` service on in `rayfin/rayfin.yml`, which unlocks
the `rayfin connector` commands.
Run both before writing any code.

To chart what the queries return, add the visuals pack as well:

```sh
npm run pack:add -- visuals
```

That brings `VegaVisual`, `DataGrid`, `toDataTable`, and `validate:visual`.
Analytics does not pull it in, because reading a model and drawing one are
separate jobs — an app that shows a handful of figures needs no chart library.
Most dashboards want both.

Re-applying either is safe: an existing file is preserved, not overwritten, so a
`connectors.ts` you have registered models in survives.

> If `npm run dev` re-optimizes dependencies on first load, add the visual
> packages to `optimizeDeps.include` in `packages/frontend/vite.config.ts`. They are left out of
> the base because a bare app does not install them.

Read [`schema-discovery`](../schema-discovery/SKILL.md) next — you cannot write a
correct query against a model you have not looked at. After that, pull in what
the job actually needs rather than all of it up front. Each row is a sibling
skill:

| Read | When |
|---|---|
| [`dax-authoring`](../dax-authoring/SKILL.md) | You are writing a measure or a non-trivial DAX expression |
| [`query-design`](../query-design/SKILL.md) | The dashboard needs more than one grain, or you are shaping a query for several visuals |
| [`visuals`](../visuals/SKILL.md) | You are building any chart, or configuring `DataGrid` |
| [`app-design`](../app-design/SKILL.md) | You are deciding layout and theming |
| [`fabric-sdk`](../fabric-sdk/SKILL.md) | Reference material for the CLI and the runtime client |

Each of those has a `references/` folder that is deliberately not required
reading; open a reference when the SKILL.md points you at it for the specific
thing you are doing.

## Recommended workflow

Use these steps unless the user asks for a different sequence.

The source contract and consuming UI have one hard ordering rule: run each real query before writing code that depends on its columns or values.
That does not require leaving the starter/welcome view untouched during all schema discovery.

- **Foundation:** Apply the packs, identify and attach the intended model, and preserve the authentication gate.
- **Runnable shell:** Establish the app's layout, final content regions, and honest loading states while independent schema and query discovery continues.
- **Data integration:** Validate each query through `npx rayfin connector invoke`, then bind the exact returned shape into the corresponding component.
- **Completion:** Add interactions and polish, then run the final validation sequence once.

Do not put invented business values into the shell.
Loading content should reserve the real layout without pretending the source has returned.

### 1. Ask the user for a semantic model

**Local `.pbix` files are not supported.** This app connects to semantic models published to the Power BI Service (cloud), not to local `.pbix` files on disk. If the user provides a local file path (e.g., `C:\...\Model.pbix`), **do not** attempt to open, upload, or search for it. Instead:
1. Inform the user that local `.pbix` files are not supported — only models published to the Power BI Service can be used.
2. Ask the user whether they would like to:
   - **Search the Power BI Service** for a semantic model by name — run `npx rayfin connector search` on their behalf, or
   - **Provide a specific online model** directly (workspace ID + dataset ID, or a Power BI / Fabric URL).

Once the user confirms a published semantic model, read the [schema-discovery](../schema-discovery/SKILL.md) skill to progressively discover schema metadata as needed — do not fetch the full schema upfront.

Once the model is identified, attach it as a connector. Choose the path that matches the input the user gave you:

```bash
# Path A — user wants you to search by name.
#   --all-workspaces is required here: this step runs before the app is
#   deployed, so there is no deployment to infer a workspace scope from and
#   the command would otherwise exit with "workspace scope is required".
#   --json is recommended so you can reason over displayName, workspaceName
#   and ids without parsing tables. If more than one could match, confirm the
#   right one with the user (e.g. two same-named models in different workspaces).
npx rayfin connector search "<name>" --type fabric-semanticmodel --all-workspaces --json

# Path B / C — user gave a URL or explicit IDs. Take workspaceId + itemId from
# whichever they provided and declare the connector:
npx rayfin connector add --type fabric-semanticmodel \
  --workspace-id <workspaceId> --item-id <itemId> --name <alias>
```

`connector add` writes the entry into `rayfin/rayfin.yml`, scaffolds
`rayfin/connectors/<alias>/`, and prints version-pinned package specifications.
Install those exact versions into the frontend workspace from the app root:

```sh
npm install -w @rayfin-app/frontend <printed-packages-and-versions>
```

Do not install them at the workspace root or create a nested lockfile.

`connector add` also regenerates
`packages/frontend/src/lib/connectors.ts` with the connector config, schema, and
runtime.
Do not hand-write those maps or replace the client installed by the connectors
pack.
That client composes connectors through `ExtendableRayfinClient`, and the pack
selects the functions-aware variant automatically when functions are present.
If the CLI reports that the wiring file is app-owned, apply the exact manual
snippet it prints instead of inventing a second client recipe.

### 2. Prove the connector returns data before wiring source values

`fabric-semanticmodel` is the one connector type whose `invoke` runs under your
own identity, so it works **without** a deploy. That makes this check nearly
free, and it is the difference between finding a dead connector now or after
building a dashboard on top of it:

```bash
npx rayfin connector invoke <alias> executeQuery --file ./inspection/smoke.query.json
```

Where `smoke.query.json` is the operation's input envelope, not the bare query:

```json
{ "query": "EVALUATE TOPN(1, Sales)" }
```

Do not wire source-backed values if this fails.
A connector, permission, or enablement failure must remain an error rather than an endless loading state.
A standalone-capable layout shell may already exist, but no amount of presentation work fixes the source contract.

**Pass DAX in a `--file` payload, not with `--input`.** A DAX query is full of
quotes and brackets, and an inline `--input` string goes through a shell that
treats them as syntax — `EVALUATE ROW("it's", 1)` breaks on the apostrophe
alone. `--file` is `JSON.parse`d, so it must be JSON: a raw `.dax` file fails
before the connector is reached. The path resolves against the project root and
must stay inside it.

### 3. Write and test DAX queries

Follow the [dax-authoring](../dax-authoring/SKILL.md) skill to write and test DAX queries. The skill covers DAX syntax rules, query patterns, time intelligence, and an iterative test workflow. Use the [schema-discovery](../schema-discovery/SKILL.md) skill to progressively discover model metadata as needed.

Use `npx rayfin connector invoke <alias> executeQuery --file <query>.query.json` to test queries. This runs the query through the same connector the app uses at runtime, so the results (column names, data types, row structure) are identical to what the app will produce.

Iterate on queries until they return the expected columns and data shape.

Delegate query exploration only when it is a substantial independent body of work with a clear result contract.
For a small dashboard or one tightly coupled query flow, keep discovery and component integration together.

Once queries are validated, **promote them to the app** following the [Query and spec organization](#query-and-spec-organization) conventions above.

**Does this app draw a chart or a grid?** The answer decides what to build, and
it is worth settling before writing files rather than after. `ColumnMetadataMap`,
Vega-Lite specs and `vegaLiteSpec` all come from the `visuals` pack: in an app
that never applied it those imports do not resolve and `typecheck` fails.

*If it charts* — the usual case, and the rest of this skill assumes it:

1. Save each query as a `.dax` file in `packages/frontend/src/queries/` following the naming and grouping conventions.
2. **Capture column metadata** — copy the exact column names from the query output as dictionary keys in a `columnMetadata: ColumnMetadataMap` constant. See the conventions above for the full format and rules.
3. Create the corresponding `.json` Vega-Lite spec — refer to [visuals](../visuals/SKILL.md). Use the cleaned `name` values from the metadata for Vega-Lite field encodings (they are already free of characters that require escaping). Use `displayName` values for axis titles, legend labels, and tooltip headers. Use `format` values for axis/tooltip formatting.
4. Create the barrel `.ts` file with a **factory function** that returns `{ connection, query, columnMetadata, vegaLiteSpec }`.

*If it does not* — figures in custom components, a summary, an export:

1. Save each query as a `.dax` file exactly as above.
2. Create the barrel `.ts` file with a factory returning `{ connection, query }`.
   Nothing else: there is no spec and no metadata constant.

Read the result off `data.table` — `columns` and `rows` — and render it however
the app renders anything else.

### 4. UX Design for the app

Principles for overall aesthetics, theming, layout, and accessibility requirements are outlined in [app-design](../app-design/SKILL.md) skill - refer to it before creating or modifying any UI component, layout, page, or style.

### 5. Build components with data (app code phase)

Use the `useSemanticModelQuery` hook from `packages/frontend/src/hooks/use-semantic-model-query.ts`. Components call the factory functions from `packages/frontend/src/queries/` and destructure what those factories return.

**Without the `visuals` pack**, that is `{ connection, query }`, and `data.table`
is the whole rendering API:

```tsx
const { data } = useSemanticModelQuery(revenueByRegion());
if (data?.status === "success") {
  const [row] = data.table.rows;          // columns and rows, nothing else
  return <p>Revenue this quarter: {String(row?.[0])}</p>;
}
```

Everything below is the charting path and needs `visuals` applied.

Factories there return `{ connection, query, columnMetadata, vegaLiteSpec }`.

Use `toDataTable()` from `packages/frontend/src/lib/to-data-table.ts` to convert the SDK's `QueryTable` (from `data.table`) into a `DataTable` by merging it with the `columnMetadata` from the factory function result. It ships with the `visuals` pack. This applies everywhere the data is consumed like rendering in `VegaVisual` or `DataGrid` (pass the `DataTable` via their `data` prop), displaying values in custom components, or any other usage.

`VegaVisual` and `DataGrid` should consume factory-produced query, spec, and column metadata together so static specs remain checkable. Runtime-built specs are allowed but require browser validation. Partial static coverage exits normally; use the preview command only when coverage is zero. Follow the [visuals](../visuals/SKILL.md) validation guidance before completion.

`App.tsx` ships with the starter/welcome view behind the
`packages/frontend/src/EmptyStatePreview.tsx` module.
Replace what the app renders for the real dashboard, but preserve that module and its existing named `EmptyStatePreview` export so the starter view can evolve independently.
Do not couple application guidance to the view's artwork, animation, or other internal implementation.

#### Example

Charting path — this one needs `visuals`:

```tsx
import { revenueByRegion } from "@/queries/sales/revenue-by-region";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { toDataTable } from "@/lib/to-data-table";
import { VegaVisual, useCssTheme } from "@microsoft/fabric-visuals";
import { DataGrid } from "@microsoft/fabric-datagrid";

function RevenueByRegionChart() {
  const theme = useCssTheme();
  const { connection, query, columnMetadata, vegaLiteSpec } = revenueByRegion({
    categories: ["Category A"],
  });

  const { data, isLoading, error } = useSemanticModelQuery({
    connection,
    query,
  });

  if (isLoading) return <LoadingSpinner />;

  // Two disjoint channels, so both are checked. `error` is what the connector
  // threw — a wiring mistake, transport, or auth — and it clears `data`, so
  // skipping it renders nothing at all for those failures.
  if (error) return <ErrorMessage message={error.message} />;

  // `data.status === "error"` is a failure Power BI reported inside a successful
  // response: invalid DAX, a permission refusal, an overflow.
  if (data?.status === "error") {
    return <ErrorMessage message={data.error.message} />;
  }

  if (data?.status !== "success") return null;

  // Convert the SDK's QueryTable into a DataTable enriched with column metadata.
  // toDataTable merges data.table with columnMetadata so that display names,
  // format strings, and cleaned field names are available to visuals.
  const dataTable = toDataTable(data.table, columnMetadata);

  // Pass the DataTable to VegaVisual (chart) or DataGrid (table) via the data prop.
  return (
    <div>
      <VegaVisual spec={vegaLiteSpec} data={dataTable} theme={theme} />
      <DataGrid data={dataTable} theme={theme} />
    </div>
  );
}
```

**Caching:** There is none. Every call to `useSemanticModelQuery` reaches Power BI.
If a screen re-queries more than you want, hold the result in state or memoize at
the call site — do not reintroduce a shared cache here without a per-principal key
and a TTL, because a process-global one serves another user's rows after a sign-in
change and stale rows after a model refresh.

**Error handling:** Two channels, and they are **disjoint** — a component that
reads only one renders nothing for half its failures.

- `error` carries what the connector **threw** — a wiring mistake, transport, or
  auth. It is the original error, so its status and service code survive. `data`
  is cleared when this is set.
- `data.status === "error"` carries what Power BI **returned**, already
  categorised by the connector as `"query"` (bad DAX), `"overflow"` (row/byte cap
  — the rows are truncated), `"api"` (dataset-level or auth), or `"network"`.
  `error` stays `undefined` for these, so the category is always reachable.

Check both, in either order; they never both apply. Then check `data.status`
before reading `data.table`.

Retry only a known transient network or service-starting condition, and cap the attempts.
Authentication, permission, connector configuration, and query errors are permanent until something changes, so surface them immediately.

For the connector client, the response shapes, and advanced query options, refer to
the [fabric-sdk](../fabric-sdk/SKILL.md) skill.

### 6. Final validation

Follow the [app-validation](../app-validation/SKILL.md) skill to
run targeted checks during implementation and the required final sequence once.
Rerun only a failed gate and later checks invalidated by its fix.
Complete the browser check through the Fabric portal embed.

---

## Query and spec organization

This section describes an app that charts its results, so it assumes the
`visuals` pack. Without it there are no specs: keep the `.dax` files and the
factory, and drop the `.json` and `vegaLiteSpec` from both.

DAX queries and Vega-Lite specs live in `packages/frontend/src/queries/`, grouped by dashboard page or domain. Each visualization gets files sharing the same kebab-case base name: one or more `.dax` files for queries, a `.json` file for the Vega-Lite spec, and a `.ts` factory file that imports them and exports `{ connection, query, columnMetadata, vegaLiteSpec }`. The factory function accepts optional parameters to select between query variants or modify the spec:

```text
packages/frontend/src/queries/
├── index.ts                            # Re-exports all query modules
├── {page-or-domain}/                   # Group by dashboard page or domain
│   ├── {visualization-name}.dax        # DAX query (plain text)
│   ├── {visualization-name}-{variant}.dax  # Additional query variants (optional)
│   ├── {visualization-name}.json       # Vega-Lite spec (JSON)
│   ├── {visualization-name}.ts         # Factory function: imports .dax + .json, exports { connection, query, vegaLiteSpec, columnMetadata }
│   └── index.ts                        # Re-exports all visualizations in this group
```

### Example TS File

**`revenue-by-region.ts`** — the factory function accepts use-case-specific parameters and uses them to modify the DAX query and/or Vega-Lite spec as appropriate:

```ts
import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import baseQuery from "./revenue-by-region.dax?raw";
import spec from "./revenue-by-region.json";

const connection = "{connection-alias}";  // from rayfin/rayfin.yml

/** Column metadata keyed by original DAX column name. */
const columnMetadata: ColumnMetadataMap = {
  "Products[Region]": { name: "ProductsRegion", displayName: "Region" },
  "[Total Revenue]": { name: "Total Revenue", displayName: "Total Revenue", format: "$#,0.00" },
};

interface RevenueByRegionParams {
  /** Filter to specific product categories (modifies the DAX query). */
  categories?: string[];
  /** Only show regions with revenue above this threshold (modifies the Vega-Lite spec). */
  minRevenue?: number;
}

export function revenueByRegion(params?: RevenueByRegionParams) {
  let query = baseQuery;
  let vegaLiteSpec = spec; // Should clone if modifying

  if (params?.categories?.length) {
    // make changes to the DAX query to filter by the specified categories and update the query variable
  }

  if (params?.minRevenue != null) {
    // Clone spec and append a client-side filter transform to the Vega-Lite spec
  }

  return { connection, query, columnMetadata, vegaLiteSpec };
}
```

The parameters, their types, and how they modify the query or spec are **entirely use-case-specific**. Some visualizations may need no parameters at all; others may accept date ranges, top-N limits, grouping dimensions, or string search terms. The factory function is the single place that translates caller intent into DAX and/or Vega-Lite modifications.

#### Query variants with multiple `.dax` files

When a parameter changes the **structure** of the query (e.g. different GROUP BY columns, different aggregations), use separate `.dax` files for each variant. The factory function selects the right one:

```text
revenue-trend/
  revenue-trend-yearly.dax
  revenue-trend-quarterly.dax
  revenue-trend-monthly.dax
  revenue-trend.json
  revenue-trend.ts
```

```ts
import yearlyQuery from "./revenue-trend-yearly.dax?raw";
import quarterlyQuery from "./revenue-trend-quarterly.dax?raw";
import monthlyQuery from "./revenue-trend-monthly.dax?raw";

type Granularity = "yearly" | "quarterly" | "monthly";

const queryByGranularity: Record<Granularity, string> = {
  yearly: yearlyQuery,
  quarterly: quarterlyQuery,
  monthly: monthlyQuery,
};

export function revenueTrend(params?: { granularity?: Granularity }) {
  const query = queryByGranularity[params?.granularity ?? "monthly"];
  return { connection, query, columnMetadata, vegaLiteSpec };
}
```

#### Column Metadata

Metadata is part of the charting path — it exists to feed `toDataTable`, and both `ColumnMetadataMap` and `ColumnDef` come from the `visuals` pack. An app with no chart in it skips this section.

Capture column metadata in the barrel `.ts` file as a `columnMetadata: ColumnMetadataMap` constant (import `ColumnMetadataMap` from `@/lib/to-data-table`). The dictionary **must be keyed by the exact column name from the CLI query output** (the `name` field in `table.columns`). Do not guess or clean these keys — copy them verbatim from the query result. Each value is a `ColumnDef` (from `@microsoft/fabric-visuals-core`) containing:
  - `name` — a cleaned-up identifier derived from the original column name by removing `.`, `[`, `]`, `\`, `"`, and `'` characters. E.g., `"Products[Region]"` → `"ProductsRegion"`, `"[Total Revenue]"` → `"Total Revenue"` — to be used when building visual specs.
  - `displayName` — a human-readable label sourced from the semantic model schema (e.g., `"Region"`, `"Total Revenue"`). Used for axis titles, grid headers, and tooltips.
  - `format` — a VBA/ECMA-376 format string for number/date formatting (e.g., `#,##0.00`, `0.00%`, and `mm/dd/yyyy`). Omit for text type columns.

**Example workflow:** Run `npx rayfin connector invoke myModel executeQuery --file ./inspection/probe.query.json`, observe the output columns are `[SalesPersonID]` and `[Name]`, then use those exact strings as metadata keys:

```ts
export const columnMetadata: ColumnMetadataMap = {
  "[SalesPersonID]": { name: "SalesPersonID", displayName: "Sales Person ID" },
  "[Name]": { name: "Name", displayName: "Name" },
};
```

#### Key rules

- **All DAX lives in `.dax` files.** Never inline full DAX query strings in `.ts` factory files. If a parameter changes the query structure, create a separate `.dax` file for each variant and select the right one in the factory function. Small modifications — such as replacing filter value placeholders, wrapping the query with `CALCULATETABLE` to apply filters, or substituting a column reference — are acceptable in `.ts`, but the base query must always come from a `.dax` import.
- **Name files after the visualization they drive.** Use kebab-case base names (e.g., `revenue-by-region.dax`, `revenue-by-region.json`, `revenue-by-region.ts`). Variant `.dax` files append a suffix (e.g., `revenue-trend-yearly.dax`, `revenue-trend-quarterly.dax`).
- **Use `.dax` for queries.** Plain-text DAX files keep queries readable and diff-friendly. Import them with Vite's `?raw` suffix.
- **Use `.json` for specs.** JSON files get free schema validation in editors and are importable as modules by default in Vite.
- **Barrel `.ts` exports a factory function.** The function name is the camelCase version of the kebab-case file name (e.g., `revenueByRegion` for `revenue-by-region.ts`). It accepts optional parameters (typed per use case) and returns `{ connection, query, columnMetadata, vegaLiteSpec }` — or just `{ connection, query }` when the app draws no charts.
- **Group by page/domain.** Use subfolders when the dashboard has multiple pages or logical sections. For simple single-page dashboards, a flat structure under `packages/frontend/src/queries/` is fine.
- **Re-export via `index.ts`.** Each subfolder and the root `packages/frontend/src/queries/index.ts` should re-export all modules for clean imports.
